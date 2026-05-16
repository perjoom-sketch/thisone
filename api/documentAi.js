const { GoogleGenerativeAI } = require('@google/generative-ai');

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

function parseDataUrl(dataUrl, fallbackType = '') {
  const match = String(dataUrl || '').match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
  if (!match) return null;

  const mimeType = normalizeMimeType(match[1] || fallbackType);
  if (!SUPPORTED_FILE_TYPES.has(mimeType)) return null;

  return { mimeType, data: match[2] };
}

function parseUploadedFile(file, legacyImageDataUrl = '') {
  if (file && typeof file === 'object') {
    const mimeType = normalizeMimeType(file.type);
    const parsed = parseDataUrl(file.dataUrl, mimeType);
    if (!parsed || !SUPPORTED_FILE_TYPES.has(parsed.mimeType)) return null;
    return {
      name: normalizeText(file.name || '업로드 파일', 160),
      mimeType: parsed.mimeType,
      data: parsed.data
    };
  }

  const legacyImage = parseDataUrl(legacyImageDataUrl);
  if (!legacyImage || !/^image\//.test(legacyImage.mimeType)) return null;
  return { name: '업로드 이미지', mimeType: legacyImage.mimeType, data: legacyImage.data };
}

function decodeBase64Text(data) {
  try {
    return Buffer.from(String(data || ''), 'base64').toString('utf8');
  } catch (error) {
    return '';
  }
}

function buildTimeoutPromise(timeoutMs, label) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error(`${label} timeout`);
      error.status = 504;
      reject(error);
    }, timeoutMs);
  });
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
  const result = await Promise.race([
    model.generateContent(parts),
    buildTimeoutPromise(timeoutMs, 'Gemini')
  ]);
  return result?.response?.text?.() || '';
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

  return `당신은 ThisOne 해석 모드입니다. ThisOne은 source-backed AI 서비스입니다.
AI는 진실의 출처가 아니며, 업로드된 내용과 공개 출처가 근거입니다.

답변 규칙:
- 평범한 한국어로, 실용적으로, 너무 길지 않게 답하세요.
- 개인정보(이름, 주민번호, 전화번호, 주소, 계좌/카드번호, 개인 ID, 사건번호)는 반복하지 마세요.
- 공개 출처가 있는 내용과 업로드 내용에서 보이는 내용을 구분하세요.
- 공개 출처로 확인하지 못한 내용을 단정하지 마세요.
- 법률/의료/금융 등 고위험 내용은 일반 설명으로 제한하고 필요 시 기관/전문가 확인을 권하세요.
- 가능하면 아래 구조를 쓰되, 불필요한 항목은 짧게 처리하세요.
  1. 이게 무엇인지
  2. 문서/사진에서 보이는 핵심
  3. 공개 출처로 확인한 내용
  4. 지금 해야 할 일
  5. 주의할 점

사용자 질문/입력:
${safeQuestion || '(질문 없음)'}

업로드 문서/사진 안전 요약:
문서/사진 종류: ${imageSummary?.documentType || '없음'}
요약: ${safeSummary || '업로드 요약 없음'}

공개 출처 검색 결과:
${sourceContext || '공개 출처 없음'}

위 근거만 사용해 답변하세요.`;
}

async function generateAnswer(payload) {
  const prompt = buildFinalPrompt(payload);
  try {
    const text = await callGemini([{ text: prompt }]);
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
  lines.push('1. 이게 무엇인지');
  lines.push(payload.imageSummary?.documentType ? `${payload.imageSummary.documentType}로 보입니다.` : '입력하신 내용을 기준으로 해석했습니다.');
  lines.push('');
  lines.push('2. 문서/사진에서 보이는 핵심');
  lines.push(payload.imageSummary?.safeSummary || redactSensitive(normalizeText(payload.question, 700)) || '확인할 수 있는 내용이 많지 않습니다.');
  lines.push('');
  lines.push('3. 공개 출처로 확인한 내용');
  lines.push(payload.sources?.length ? '아래 공개 출처의 요약을 함께 참고했습니다.' : '공개 출처는 확인하지 못했고, 업로드된 내용 기준으로 정리했습니다.');
  lines.push('');
  lines.push('4. 지금 해야 할 일');
  lines.push('민감정보는 가린 상태로 원문을 다시 확인하고, 제출/신청/납부처럼 마감이 있는 항목이 있는지 먼저 확인하세요.');
  lines.push('');
  lines.push('5. 주의할 점');
  lines.push('중요한 법률·의료·금융 판단은 해당 기관이나 전문가에게 최종 확인하세요.');
  return lines.join('\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await readBody(req);
    const question = normalizeText(body?.question || '');
    const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';
    const uploadedFile = parseUploadedFile(body?.file, imageDataUrl);

    if (body?.file && !uploadedFile) {
      return res.status(400).json({ error: '현재는 PDF, JPG, PNG, WebP, 텍스트만 해석할 수 있습니다.' });
    }

    if (!question && !uploadedFile) {
      return res.status(400).json({ error: '문서나 사진, 질문을 입력해주세요.' });
    }

    let imageSummary = null;
    if (uploadedFile) {
      try {
        imageSummary = await summarizeUploadedFile(uploadedFile, question);
      } catch (error) {
        imageSummary = {
          documentType: uploadedFile.mimeType === 'application/pdf' ? 'PDF 문서' : '이미지/문서',
          safeSummary: '업로드 내용을 자동으로 확인하지 못했습니다. 질문에 적힌 내용 기준으로 해석합니다.',
          publicKeywords: findPublicTerms(question)
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

    const answer = await generateAnswer({ question, imageSummary, sources });
    return res.status(200).json({
      answer,
      sources,
      usedSearch
    });
  } catch (error) {
    return res.status(500).json({
      error: '문서 해석 중 오류가 발생했습니다.',
      answer: '문서 해석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      sources: [],
      usedSearch: false
    });
  }
};
