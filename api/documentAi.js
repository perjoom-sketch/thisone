const { GoogleGenerativeAI } = require('@google/generative-ai');
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const GEMINI_MODEL = process.env.MODEL_NAME || 'gemini-2.5-flash';
const OPENAI_MODEL = 'gpt-5.4-mini';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const GEMINI_TIMEOUT_MS = 20000;
const OPENAI_TIMEOUT_MS = 20000;
const SERPER_TIMEOUT_MS = 4000;
const MAX_QUESTION_LENGTH = 4000;
const MAX_SUMMARY_LENGTH = 1800;
const MAX_SOURCE_COUNT = 5;
const MAX_LEGACY_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_R2_UPLOAD_BYTES = 30 * 1024 * 1024;
const PDF_FAILURE_MESSAGES = {
  file_too_large: '파일 용량이 커서 자동 해석하지 못했습니다. 필요한 페이지만 나누어 올려주세요.',
  timeout: 'PDF 해석 시간이 초과되었습니다. 페이지 수가 많거나 내용이 복잡할 수 있습니다. 필요한 페이지만 나누어 올려주세요.',
  password_or_protected: '암호가 걸렸거나 보호된 PDF라 내용을 읽지 못했습니다. 암호를 해제한 파일이나 캡처 이미지를 올려주세요.',
  scanned_or_image_only: '스캔본 PDF라 글자를 안정적으로 읽지 못했습니다. 필요한 페이지를 이미지로 캡처하거나 텍스트를 복사해 올려주세요.',
  unsupported_pdf_structure: '이 PDF 구조를 자동 해석하지 못했습니다. 텍스트를 복사하거나 필요한 페이지만 이미지로 올려주세요.',
  model_read_failed: 'PDF 읽기 과정에서 AI 응답이 실패했습니다. 다시 시도하거나 필요한 페이지만 나누어 올려주세요.',
  unknown: 'PDF 내용을 자동으로 읽지 못했습니다. 필요한 페이지를 이미지로 캡처하거나 텍스트를 복사해 올려주세요.'
};
const FILE_TOO_LARGE_MESSAGE = '파일이 너무 큽니다. 용량을 줄이거나 필요한 페이지만 캡처해서 올려주세요.';
const SUPPORTED_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'text/plain'
]);

const PUBLIC_DOCUMENT_TERMS = [
  '기본증명서', '가족관계증명서', '혼인관계증명서', '입양관계증명서', '친양자입양관계증명서',
  '주민등록등본', '주민등록초본', '인감증명서', '본인서명사실확인서', '등기부등본', '건축물대장',
  '토지대장', '지적도', '계약서', '임대차계약서', '전세계약서', '월세계약서', '근로계약서',
  '고지서', '납부서', '청구서', '영수증', '통지서', '안내문', '설명서', '진단서', '처방전',
  '보험금 청구', '실손보험', '연말정산', '원천징수영수증', '소득금액증명', '건강보험', '국민연금',
  '자동차등록증', '운전면허', '여권', '비자', '출입국사실증명', '위임장', '내용증명', '지급명령',
  '소장', '판결문', '결정문', '공문', '민원', '정부24', '대법원', '전자가족관계등록시스템'
];

const GENERIC_PUBLIC_TERMS = [
  '뜻', '발급', '신청', '방법', '필요서류', '주의사항', '절차', '수수료', '기한', '제출', '확인', '해석'
];

function normalizeText(value, maxLength = MAX_QUESTION_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function stripTags(value) {
  return normalizeText(String(value || '').replace(/<[^>]*>/g, ' '), 500);
}

function parseHostname(link) {
  try {
    return new URL(String(link || '').trim()).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function redactSensitive(value) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 비공개]')
    .replace(/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[전화번호 비공개]')
    .replace(/\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[전화번호 비공개]')
    .replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[주민등록번호 비공개]')
    .replace(/\b\d{2,6}[-\s]?\d{2,6}[-\s]?\d{2,8}\b/g, '[번호 비공개]')
    .replace(/(계좌|카드|여권|면허|사업자|법인|접수|사건)\s*(?:번호|No\.?|ID)?\s*[:：]?\s*[A-Za-z0-9-]{4,}/gi, '$1번호 [비공개]')
    .replace(/(?:주소|거주지|소재지)\s*[:：]?\s*[^\n.。]{6,80}/g, '주소 [비공개]')
    .replace(/(성명|이름|예금주|신청인|청구인|피청구인|계약자|임차인|임대인)\s*[:：]?\s*[가-힣A-Za-z]{2,20}/g, '$1 [비공개]');
}

function removeSensitiveForSearch(value) {
  return redactSensitive(value)
    .replace(/\[[^\]]*비공개\]/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/["'`<>()[\]{}]/g, ' ')
    .replace(/[?？!！.,;:|\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMimeType(type) {
  const mimeType = String(type || '').toLowerCase();
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

function estimateBase64DecodedBytes(data) {
  const base64 = String(data || '').replace(/\s/g, '');
  if (!base64) return 0;

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

async function downloadFromR2(fileKey) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileKey
  });
  const response = await s3Client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return {
    data: buffer.toString('base64'),
    size: buffer.length
  };
}

async function deleteFromR2(fileKey) {
  if (!fileKey) return;
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey
    });
    await s3Client.send(command);
  } catch (error) {
    console.error(`[Document AI] R2 cleanup failed for ${fileKey}:`, error);
  }
}

function parseDataUrl(dataUrl, fallbackType = '') {
  const match = String(dataUrl || '').match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
  if (!match) return null;

  const mimeType = normalizeMimeType(match[1] || fallbackType);
  if (!SUPPORTED_FILE_TYPES.has(mimeType)) return null;

  return { mimeType, data: match[2], decodedBytes: estimateBase64DecodedBytes(match[2]) };
}

async function parseUploadedFile(file, legacyImageDataUrl = '') {
  if (file && typeof file === 'object') {
    const mimeType = normalizeMimeType(file.type);
    
    if (file.fileKey) {
      const { data, size } = await downloadFromR2(file.fileKey);
      return {
        name: normalizeText(file.name || '업로드 파일', 160),
        mimeType,
        data,
        decodedBytes: size
      };
    }

    const parsed = parseDataUrl(file.dataUrl, mimeType);
    if (!parsed || !SUPPORTED_FILE_TYPES.has(parsed.mimeType)) return null;
    return {
      name: normalizeText(file.name || '업로드 파일', 160),
      mimeType: parsed.mimeType,
      data: parsed.data,
      decodedBytes: parsed.decodedBytes
    };
  }

  const legacyImage = parseDataUrl(legacyImageDataUrl);
  if (!legacyImage || !/^image\//.test(legacyImage.mimeType)) return null;
  return {
    name: '업로드 이미지',
    mimeType: legacyImage.mimeType,
    data: legacyImage.data,
    decodedBytes: legacyImage.decodedBytes
  };
}

async function parseUploadedFiles(filesArray) {
  if (!Array.isArray(filesArray)) return [];
  const parsedPromises = filesArray.map((file) => parseUploadedFile(file, ''));
  return Promise.all(parsedPromises);
}

async function parseUploadedFileBundle(filesArray) {
  if (!Array.isArray(filesArray) || !filesArray.length) {
    return { files: [], hasInvalidFile: false };
  }

  const parsedFiles = await parseUploadedFiles(filesArray);
  return {
    files: parsedFiles.filter(Boolean),
    hasInvalidFile: parsedFiles.some((file) => !file)
  };
}

function buildErrorPayload(error, answer = error) {
  return {
    error,
    answer,
    sources: [],
    usedSearch: false
  };
}

function decodeBase64Text(data) {
  try {
    return Buffer.from(String(data || ''), 'base64').toString('utf8');
  } catch (error) {
    return '';
  }
}

function decodeBase64Buffer(data) {
  try {
    return Buffer.from(String(data || ''), 'base64');
  } catch (error) {
    return Buffer.alloc(0);
  }
}

function buildPdfReadFailure(reason = 'unknown') {
  const safeReason = Object.prototype.hasOwnProperty.call(PDF_FAILURE_MESSAGES, reason) ? reason : 'unknown';
  return {
    pdfReadStatus: 'failed',
    pdfReadFailureReason: safeReason,
    pdfReadFailureMessage: PDF_FAILURE_MESSAGES[safeReason]
  };
}

function buildPdfReadSuccess() {
  return {
    pdfReadStatus: 'read',
    pdfReadFailureReason: '',
    pdfReadFailureMessage: ''
  };
}

function inspectPdfStructure(file) {
  const buffer = decodeBase64Buffer(file?.data);
  if (!buffer.length) return { hasPdfHeader: false, isProtected: false, isLikelyScanned: false };

  const sampleStart = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('latin1');
  const sample = buffer.subarray(0, Math.min(buffer.length, 250000)).toString('latin1');
  const isProtected = /\/Encrypt\b|\/StdCF\b|\/Perms\b|\/Filter\s*\/Standard\b/.test(sample);
  const imageCount = (sample.match(/\/Subtype\s*\/Image\b/g) || []).length;
  const textSignalCount = (sample.match(/\b(?:Tj|TJ|BT|ET)\b|\/ToUnicode\b|\/Font\b/g) || []).length;
  const hasPdfHeader = /^%PDF-/.test(sampleStart);

  return {
    hasPdfHeader,
    isProtected,
    isLikelyScanned: imageCount >= 2 && textSignalCount === 0
  };
}

function classifyPdfReadFailure(error, file) {
  if (file?.decodedBytes > MAX_R2_UPLOAD_BYTES) return 'file_too_large';

  const structure = inspectPdfStructure(file);
  if (structure.isProtected) return 'password_or_protected';
  if (structure.isLikelyScanned) return 'scanned_or_image_only';
  if (structure.hasPdfHeader === false) return 'unsupported_pdf_structure';

  const message = String(error?.message || error || '').toLowerCase();
  if (error?.status === 504 || /timeout|timed out|abort/.test(message)) return 'timeout';
  if (/password|protected|encrypted|permission|security|decrypt|암호|보호/.test(message)) return 'password_or_protected';
  if (/scan|scanned|image-only|image only|ocr|no text|스캔/.test(message)) return 'scanned_or_image_only';
  if (/pdf|parse|parser|malformed|invalid|unsupported|structure|구조|지원/.test(message)) return 'unsupported_pdf_structure';
  if (/gemini|google|model|candidate|finish|response|503|429|ai|openai/.test(message)) return 'model_read_failed';

  return 'unknown';
}

function buildPdfFailureAnswer(pdfFailure) {
  const message = pdfFailure?.pdfReadFailureMessage || PDF_FAILURE_MESSAGES.unknown;
  return `${message}\n\nPDF 내용을 읽은 것처럼 답변하지 않겠습니다. 필요한 페이지만 나누어 올리거나, 해당 페이지를 이미지로 캡처하거나, 텍스트를 복사해 올려주세요.`;
}

function buildTimeoutError(label) {
  const error = new Error(`${label} timeout`);
  error.status = 504;
  return error;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  if (!req || typeof req[Symbol.asyncIterator] !== 'function') return {};

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function extractJsonObject(text) {
  const source = String(text || '').trim();
  try {
    return JSON.parse(source);
  } catch (e) {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(source.slice(start, end + 1));
      } catch (ignore) {}
    }
  }
  return null;
}

async function callGemini(parts, timeoutMs = GEMINI_TIMEOUT_MS) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  let timeoutId;
  try {
    const result = await Promise.race([
      model.generateContent(parts),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(buildTimeoutError('Gemini')), timeoutMs);
      })
    ]);
    return result?.response?.text?.() || '';
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAI(messages, timeoutMs = OPENAI_TIMEOUT_MS) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.2
      }),
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}: ${text}`);
    const data = text ? JSON.parse(text) : {};
    return data?.choices?.[0]?.message?.content || '';
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('OpenAI timeout');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function summarizeUploadedFile(file, question) {
  if (!file) {
    return {
      documentType: '문서/사진',
      safeSummary: '지원되는 파일 형식이 아니어서 업로드 내용을 확인하지 못했습니다.',
      publicKeywords: []
    };
  }

  if (file.mimeType === 'text/plain') {
    const text = redactSensitive(normalizeText(decodeBase64Text(file.data), MAX_SUMMARY_LENGTH));
    return {
      documentType: '텍스트 문서',
      safeSummary: text || '텍스트 파일 내용을 읽지 못했습니다.',
      publicKeywords: findPublicTerms(`${question} ${text}`)
    };
  }

  const prompt = `업로드된 문서/사진을 개인정보 보호 기준으로 안전하게 요약하세요.

규칙:
- 이름, 주민등록번호, 전화번호, 주소, 계좌번호, 카드번호, 개인 ID, 사건번호 같은 민감정보는 쓰지 마세요.
- 원문 전체를 옮기지 마세요.
- 문서/사진 종류, 공개 검색에 써도 되는 일반 키워드만 추출하세요.
- 답은 JSON만 반환하세요.

JSON 형식:
{
  "documentType": "문서/사진 종류",
  "safeSummary": "민감정보를 제외한 짧은 요약",
  "publicKeywords": ["공개 검색에 안전한 키워드"]
}

사용자 질문: ${redactSensitive(normalizeText(question, 500)) || '없음'}`;

  const text = await callGemini([
    { text: prompt },
    { inlineData: { mimeType: file.mimeType, data: file.data } }
  ]);
  if (!String(text || '').trim()) throw new Error('Gemini model response was empty');
  const parsed = extractJsonObject(text) || {};
  return {
    documentType: normalizeText(parsed.documentType || (file.mimeType === 'application/pdf' ? 'PDF 문서' : '문서/사진'), 80),
    safeSummary: redactSensitive(normalizeText(parsed.safeSummary || text, MAX_SUMMARY_LENGTH)),
    publicKeywords: (Array.isArray(parsed.publicKeywords) ? parsed.publicKeywords : [])
      .map((item) => removeSensitiveForSearch(item).slice(0, 80))
      .filter(Boolean)
      .slice(0, 6)
  };
}

async function summarizeUploadedBundle(files, question) {
  if (!Array.isArray(files) || !files.length) {
    return {
      documentType: '문서/사진',
      safeSummary: '지원되는 파일 형식이 아니어서 업로드 내용을 확인하지 못했습니다.',
      publicKeywords: []
    };
  }

  const summaries = [];
  for (const file of files) {
    try {
      const summary = await summarizeUploadedFile(file, question);
      summaries.push(summary);
    } catch (error) {
      if (file.decodedBytes > MAX_UPLOAD_BYTES) {
        throw error;
      }
      if (file.mimeType === 'application/pdf') {
        const pdfFailure = buildPdfReadFailure(classifyPdfReadFailure(error, file));
        throw Object.assign(new Error(pdfFailure.pdfReadFailureMessage), { pdfFailure });
      }
      throw error;
    }
  }

  if (summaries.length === 1) {
    return summaries[0];
  }

  const documentTypes = summaries.map((s) => s.documentType).filter(Boolean);
  const allSafeSummaries = summaries.map((s) => s.safeSummary).filter(Boolean);
  const allKeywords = summaries.flatMap((s) => s.publicKeywords || []);

  const uniqueKeywords = Array.from(new Set(allKeywords)).slice(0, 6);

  return {
    documentType: documentTypes.join(', ') || '문서/사진 묶음',
    safeSummary: allSafeSummaries.join('\n\n---\n\n') || '업로드 내용을 확인하지 못했습니다.',
    publicKeywords: uniqueKeywords
  };
}

function findPublicTerms(text) {
  const source = removeSensitiveForSearch(text);
  const terms = PUBLIC_DOCUMENT_TERMS.filter((term) => source.includes(term));
  if (terms.length) return terms.slice(0, 5);

  return source
    .split(/\s+/)
    .map((token) => token.replace(/[^가-힣A-Za-z]/g, ''))
    .filter((token) => token.length >= 2 && token.length <= 20)
    .filter((token) => !/비공개|내가|이거|뭐야|해주세요|알려줘|정리|문서|사진/.test(token))
    .slice(0, 5);
}

function buildSerperQuery({ question, imageSummary }) {
  const candidateText = [
    question,
    imageSummary?.documentType,
    imageSummary?.safeSummary,
    ...(imageSummary?.publicKeywords || [])
  ].join(' ');

  const publicTerms = [
    ...(imageSummary?.publicKeywords || []),
    ...findPublicTerms(candidateText)
  ]
    .map(removeSensitiveForSearch)
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const term of publicTerms) {
    const normalized = term.replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
    if (unique.length >= 4) break;
  }

  if (!unique.length) return '';
  const suffix = GENERIC_PUBLIC_TERMS.filter((term) => candidateText.includes(term)).slice(0, 2);
  return removeSensitiveForSearch([...unique, ...(suffix.length ? suffix : ['뜻', '주의사항'])].join(' ')).slice(0, 120);
}

async function fetchSerper(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey || !query) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);
  try {
    const response = await fetch(SERPER_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({ q: query, gl: 'kr', hl: 'ko', num: 8 }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Serper request failed with status ${response.status}`);
    const data = await response.json();
    return normalizeSources(data?.organic || []);
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeSources(items) {
  const sources = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const link = normalizeText(item?.link, 500);
    const domain = parseHostname(link);
    const key = link || `${item?.title}:${domain}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const source = {
      title: stripTags(item?.title || domain || '공개 출처'),
      link,
      snippet: stripTags(item?.snippet || ''),
      domain
    };
    if (source.title || source.snippet || source.link) sources.push(source);
    if (sources.length >= MAX_SOURCE_COUNT) break;
  }
  return sources;
}

function buildSourceContext(sources) {
  return sources.map((source, index) => [
    `${index + 1}. ${source.title}`,
    source.domain ? `도메인: ${source.domain}` : '',
    source.snippet ? `요약: ${source.snippet}` : '',
    source.link ? `링크: ${source.link}` : ''
  ].filter(Boolean).join('\n')).join('\n\n');
}

function buildFinalPrompt({ question, imageSummary, sources }) {
  const safeQuestion = redactSensitive(normalizeText(question));
  const safeSummary = imageSummary?.safeSummary ? redactSensitive(imageSummary.safeSummary) : '';
  const sourceContext = buildSourceContext(sources);

  return `당신은 ThisOne 해석 모드입니다. ThisOne은 근거(source)에 기반한 AI 서비스입니다.
업로드된 문서/사진의 원문과 공개 출처를 바탕으로 답변하세요.

답변 규칙:
- 평범하고 실용적인 한국어로 답하세요.
- 질문이 구체적이더라도, 문서/사진이 첨부되었다면 먼저 내용을 읽어주는 것이 기본입니다.
- 아래 5단계 구조를 엄격히 지켜서 답변을 시작하세요.

[필수 출력 구조]
1. 읽은 내용: 
   - 문서/사진의 텍스트를 보이는 그대로 옮깁니다. 
   - 손글씨(handwriting)라면 최대한 줄바꿈을 살려 한 줄씩 받아쓰기 하세요.
   - 숫자, 단위, 공식, 화살표, 라벨 등을 정확히 보존하세요. (예: 17%, 감면비율, 계산식 등)
   - 질문이 "읽어줘", "원문으로 옮겨줘" 등인 경우 이 부분에 가장 집중하세요.
2. 잘 안 보이는 부분: 
   - 글씨가 뭉개졌거나 흐릿해서 확신할 수 없는 부분은 여기서 언급하세요.
   - 본문에서는 (불확실), (잘 안 보임), (아마 ...) 등으로 표시하고 여기서 이유를 설명하세요.
3. 쉬운 말로 설명: 
   - 위 내용을 누구나 이해할 수 있게 쉬운 용어로 요약/설명하세요.
4. 숫자/계산/도면에서 중요한 점: 
   - 문서 내의 수치, 계산 결과, 도면의 핵심 기호 등 놓치지 말아야 할 포인트를 짚어주세요.
5. 다음에 물어볼 만한 것: 
   - 사용자가 이 문서와 관련해 추가로 궁금해할 법한 질문 3가지를 제안하세요.

[주의사항]
- 개인정보(이름, 주민번호, 전화번호, 주소, 계좌/카드번호, 개인 ID, 사건번호)는 반복하지 마세요. 텍스트를 옮길 때 필요한 경우 [비공개] 또는 성명 [비공개] 등으로 처리하세요.
- 공개 출처로 확인하지 못한 내용을 단정하지 마세요.
- 법률/의료/금융 등 고위험 내용은 일반 설명으로 제한하고 필요 시 기관/전문가 확인을 권하세요.

사용자 질문/입력:
${safeQuestion || '(질문 없음)'}

업로드 문서/사진 안전 요약:
${safeSummary || '업로드 요약 없음'}

공개 출처 검색 결과:
${sourceContext || '공개 출처 없음'}

위 근거와 첨부된 이미지를 직접 대조하며 답변하세요.`;
}

async function generateAnswer(payload, uploadedFiles = []) {
  const prompt = buildFinalPrompt(payload);
  const parts = [{ text: prompt }];

  for (const file of uploadedFiles) {
    if (file?.data && file?.mimeType && /^image\/|application\/pdf/.test(file.mimeType)) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      });
    }
  }

  try {
    const text = await callGemini(parts);
    if (text.trim()) return redactSensitive(text.trim());
  } catch (geminiError) {
    try {
      const text = await callOpenAI([
        { role: 'system', content: 'You are ThisOne Document AI. Answer in practical Korean, source-backed, privacy-safe.' },
        { role: 'user', content: prompt }
      ]);
      if (text.trim()) return redactSensitive(text.trim());
    } catch (openAiError) {
      // Fall through to deterministic fail-open response.
    }
  }

  const lines = [];
  lines.push('1. 읽은 내용');
  lines.push(payload.imageSummary?.safeSummary || '업로드된 내용을 읽는 중에 오류가 발생했습니다.');
  lines.push('');
  lines.push('2. 잘 안 보이는 부분');
  lines.push('이미지 상태나 보안 설정으로 인해 일부 내용을 정확히 확인하지 못했습니다.');
  lines.push('');
  lines.push('3. 쉬운 말로 설명');
  lines.push(payload.imageSummary?.documentType ? `${payload.imageSummary.documentType}에 대한 내용입니다.` : '입력하신 내용을 바탕으로 정리했습니다.');
  lines.push('');
  lines.push('4. 숫자/계산/도면에서 중요한 점');
  lines.push('수치나 계산식 등은 원본 문서와 대조하여 다시 한번 확인하시기 바랍니다.');
  lines.push('');
  lines.push('5. 다음에 물어볼 만한 것');
  lines.push('- 이 문서의 주요 마감 기한은 언제인가요?\n- 제가 추가로 제출해야 할 서류가 있나요?\n- 이 내용의 법적 효력은 어떻게 되나요?');
  return lines.join('\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(buildErrorPayload('Method not allowed'));
  }

  try {
    const body = await readBody(req);
    const question = normalizeText(body?.question || '');

    // Prefer the new multi-file bundle format (files[]) and preserve its order.
    const uploadedBundle = await parseUploadedFileBundle(body?.files);
    
    // Collect all received fileKeys for cleanup regardless of processing success
    const fileKeysToCleanup = (body?.files || [])
      .map(f => f?.fileKey)
      .filter(Boolean);

    if (uploadedBundle.hasInvalidFile) {
      // Trigger cleanup even on invalid request
      await Promise.all(fileKeysToCleanup.map(deleteFromR2));
      return res.status(400).json(buildErrorPayload('현재는 PDF, JPG, PNG, WebP, 텍스트만 해석할 수 있습니다.'));
    }

    let uploadedFiles = uploadedBundle.files;

    // Fall back to legacy single-file format (file/imageDataUrl) for backward compatibility.
    if (!uploadedFiles.length && body?.file) {
      const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';
      const singleFile = await parseUploadedFile(body?.file, imageDataUrl);
      uploadedFiles = singleFile ? [singleFile] : [];
    }

    if (!question && !uploadedFiles.length) {
      await Promise.all(fileKeysToCleanup.map(deleteFromR2));
      return res.status(400).json(buildErrorPayload('문서나 사진, 질문을 입력해주세요.'));
    }

    // Check file size limits and PDF-specific failures
    let pdfReadInfo = null;
    for (const file of uploadedFiles) {
      const limit = MAX_R2_UPLOAD_BYTES; // Use the larger R2 limit for all processed files now
      if (file.decodedBytes > limit) {
        await Promise.all(fileKeysToCleanup.map(deleteFromR2));
        const isPdf = file.mimeType === 'application/pdf';
        const errorPayload = buildErrorPayload(isPdf ? PDF_FAILURE_MESSAGES.file_too_large : FILE_TOO_LARGE_MESSAGE);
        if (isPdf) Object.assign(errorPayload, buildPdfReadFailure('file_too_large'));
        return res.status(413).json(errorPayload);
      }
    }

    try {
      let imageSummary = null;
      try {
        imageSummary = await summarizeUploadedBundle(uploadedFiles, question);
      } catch (error) {
        // Check if error has pdfFailure info (from summarizeUploadedFile)
        if (error.pdfFailure) {
          pdfReadInfo = error.pdfFailure;
          imageSummary = {
            documentType: 'PDF 문서',
            safeSummary: error.pdfFailure.pdfReadFailureMessage,
            publicKeywords: findPublicTerms(question),
            pdfReadFailed: true,
            pdfReadFailureReason: error.pdfFailure.pdfReadFailureReason || '',
            pdfReadFailureMessage: error.pdfFailure.pdfReadFailureMessage || ''
          };
        } else {
          // Generic error for file summaries
          imageSummary = {
            documentType: uploadedFiles.length > 1 ? '문서/사진 묶음' : '이미지/문서',
            safeSummary: '업로드 내용을 자동으로 확인하지 못했습니다. 질문에 적힌 내용 기준으로 해석합니다.',
            publicKeywords: findPublicTerms(question),
            pdfReadFailed: false,
            pdfReadFailureReason: '',
            pdfReadFailureMessage: ''
          };
        }
      }

      const serperQuery = buildSerperQuery({ question, imageSummary });
      let sources = [];
      let usedSearch = false;
      if (serperQuery) {
        try {
          sources = await fetchSerper(serperQuery);
          usedSearch = sources.length > 0;
        } catch (error) {
          sources = [];
          usedSearch = false;
        }
      }

      let answer = '';
      if (pdfReadInfo?.pdfReadStatus === 'failed') {
        answer = buildPdfFailureAnswer(pdfReadInfo);
      } else {
        answer = await generateAnswer({ question, imageSummary, sources }, uploadedFiles);
      }

      const attachmentContext = imageSummary ? {
        documentType: imageSummary.documentType || '',
        safeSummary: imageSummary.safeSummary || '',
        publicKeywords: imageSummary.publicKeywords || [],
        fileCount: uploadedFiles.length
      } : null;

      // Ensure cleanup before returning successful response
      await Promise.all(fileKeysToCleanup.map(deleteFromR2));

      return res.status(200).json({
        answer,
        sources,
        usedSearch,
        attachmentContext,
        ...(pdfReadInfo || {})
      });

    } catch (error) {
      // Ensure cleanup on processing error
      await Promise.all(fileKeysToCleanup.map(deleteFromR2));
      throw error; // Rethrow to existing outer catch
    }
  } catch (error) {
    const reason = error?.status === 504 ? 'timeout' : 'unknown';
    const pdfFailure = buildPdfReadFailure(reason);
    return res.status(error?.status === 504 ? 504 : 500).json({
      ...buildErrorPayload(pdfFailure.pdfReadFailureMessage),
      ...pdfFailure
    });
  }
};
