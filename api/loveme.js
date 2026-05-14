const { GoogleGenerativeAI } = require('@google/generative-ai');

const AI_CONFIG = { MODEL_NAME: process.env.MODEL_NAME || 'gemini-2.5-flash' };
const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const SERPER_TIMEOUT_MS = 4000;
const GEMINI_TIMEOUT_MS = 20000;
const MAX_CONCERN_LENGTH = 1000;
const MAX_SYSTEM_LENGTH = 12000;
const MAX_CONTEXT_RESULTS = 5;
const MAX_SOURCE_COUNT = 5;

const STYLING_CONTEXT_TERMS = [
  '스타일', '스타일링', '코디', '패션', '옷', '의상', '핏', '색상', '컬러', '퍼스널컬러',
  '헤어', '머리', '컷', '펌', '앞머리', '가르마', '염색', '메이크업', '화장', '안경',
  '액세서리', '악세서리', '모자', '신발', '가방', '주얼리', '비율', '체형', '얼굴', '얼굴형',
  '키', '어깨', '하체', '상체', '허리', '목선', '커버', '보완', '연출', '콤플렉스', '작아',
  '커', '넓', '좁', '둥근', '긴', '짧', '각진', '통통', '마른',
  'style', 'styling', 'fashion', 'outfit', 'hair', 'makeup', 'glasses', 'accessory', 'color', 'fit'
];

const NON_STYLING_TERMS = [
  '수술', '성형', '시술', '보톡스', '필러', '지방흡입', '양악', '윤곽', '리프팅', '레이저',
  '병원', '의사', '진단', '치료', '약', '처방', '주사', 'surgery', 'procedure', 'clinic', 'doctor',
  'diagnosis', 'treatment', 'medicine', 'injection'
];

const KOREAN_PARTICLES = /[은는이가을를에의와과도만으로로처럼보다부터까지께서]|(?:입니다)|(?:해요)|(?:어요)|(?:아요)/g;

function getTextFromContent(content) {
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === 'text' ? String(part.text || '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  return String(content || '');
}

function normalizeInputText(value, maxLength = MAX_CONCERN_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function validateConcern(concern) {
  const normalized = normalizeInputText(concern);
  if (!normalized || normalized.length < 2) {
    return { error: 'concern must be a non-empty text value.' };
  }
  return { value: normalized };
}

function sanitizeMessages(messages, fallbackConcern) {
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .slice(-8)
    .map((message) => {
      const role = message?.role === 'assistant' ? 'assistant' : 'user';
      const content = normalizeInputText(getTextFromContent(message?.content), 2000);
      return content ? { role, content } : null;
    })
    .filter(Boolean);

  if (!safeMessages.length) {
    safeMessages.push({ role: 'user', content: fallbackConcern });
  }
  return safeMessages;
}

function includesAnyTerm(text, terms) {
  const source = String(text || '').toLowerCase();
  return terms.some((term) => source.includes(term.toLowerCase()));
}

function isStylingRelated(concern) {
  const source = String(concern || '').toLowerCase();
  if (!source) return false;

  const hasNonStylingIntent = includesAnyTerm(source, NON_STYLING_TERMS);
  const hasStylingIntent = includesAnyTerm(source, STYLING_CONTEXT_TERMS);
  if (hasNonStylingIntent && !hasStylingIntent) return false;
  return hasStylingIntent;
}

function buildSafeSearchSeed(concern) {
  return normalizeInputText(concern, 160)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/["'`<>()[\]{}]/g, ' ')
    .replace(/[?？!！.,;:|\\/]+/g, ' ')
    .replace(KOREAN_PARTICLES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSourceDomain(link) {
  try {
    const hostname = new URL(String(link || '')).hostname.replace(/^www\./i, '');
    return normalizeInputText(hostname, 80);
  } catch (error) {
    return '';
  }
}

function isUsefulSerperSource(item) {
  const title = normalizeInputText(item?.title, 140);
  const snippet = normalizeInputText(item?.snippet, 240);
  const link = normalizeInputText(item?.link, 240);
  const domain = getSourceDomain(link);
  if (!title || !link || !domain) return false;
  if (!/^https?:\/\//i.test(link)) return false;
  if (/^(accounts\.|login\.|m\.)/i.test(domain)) return false;
  if (/\.(?:pdf|zip|png|jpe?g|gif|webp)(?:$|[?#])/i.test(link)) return false;
  if (/로그인|회원가입|이미지|동영상|광고/i.test(title) && !snippet) return false;
  return true;
}

function normalizeSerperSource(item) {
  const link = normalizeInputText(item?.link, 240);
  return {
    title: normalizeInputText(item?.title, 140),
    link,
    snippet: normalizeInputText(item?.snippet, 240),
    domain: getSourceDomain(link)
  };
}

function dedupeSerperSources(results, limit = MAX_SOURCE_COUNT) {
  const unique = [];
  const seenLinks = new Set();
  const seenTitles = new Set();

  for (const rawItem of Array.isArray(results) ? results : []) {
    const item = normalizeSerperSource(rawItem);
    if (!isUsefulSerperSource(item)) continue;

    const linkKey = item.link.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    const titleKey = item.title.toLowerCase();
    if (seenLinks.has(linkKey) || seenTitles.has(titleKey)) continue;

    seenLinks.add(linkKey);
    seenTitles.add(titleKey);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

function buildStylingSearchQueries(concern) {
  const seed = buildSafeSearchSeed(concern);
  if (!seed || !isStylingRelated(seed)) return [];

  const queryBase = seed.slice(0, 80);
  return [
    `${queryBase} 스타일링 추천`,
    `${queryBase} 코디 헤어 메이크업 팁`,
    `${queryBase} 체형 얼굴형 보완 연출`
  ];
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchSerper(query, apiKey) {
  const response = await fetchWithTimeout(SERPER_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey
    },
    body: JSON.stringify({ q: query, gl: 'kr', hl: 'ko', num: 5 })
  }, SERPER_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Serper request failed with status ${response.status}`);
  }

  const data = await response.json();
  return (Array.isArray(data?.organic) ? data.organic : [])
    .slice(0, MAX_CONTEXT_RESULTS)
    .map(normalizeSerperSource)
    .filter(isUsefulSerperSource);
}

async function getStylingSearchContext(concern) {
  const apiKey = process.env.SERPER_API_KEY;
  const queries = buildStylingSearchQueries(concern);
  if (!apiKey || !queries.length) {
    return { usedSearch: false, context: '', sources: [] };
  }

  const results = [];
  for (const query of queries.slice(0, 2)) {
    const items = await searchSerper(query, apiKey);
    results.push(...items.map((item) => ({ ...item, query })));
    if (results.length >= MAX_CONTEXT_RESULTS) break;
  }

  const unique = dedupeSerperSources(results, MAX_SOURCE_COUNT);

  if (!unique.length) return { usedSearch: false, context: '', sources: [] };

  const context = unique
    .map((item, index) => [
      `${index + 1}. ${item.title}`,
      item.snippet ? `요약: ${item.snippet}` : '',
      item.domain ? `사이트: ${item.domain}` : '',
      item.link ? `출처: ${item.link}` : ''
    ].filter(Boolean).join('\n'))
    .join('\n\n');

  return {
    usedSearch: true,
    context,
    sources: unique
  };
}

function buildGeminiParts(messages, concern, searchContext) {
  const conversation = messages
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n\n');

  const contextBlock = searchContext
    ? `\n\nStyling search context for reference only. Use it only when it helps practical styling advice. Naturally distinguish the user's concern, public styling context, and your practical interpretation when useful. Do not cite sources that are not in this context.\n${searchContext}`
    : '';

  return [{ text: `Concern: ${concern}\n\nConversation:\n${conversation}${contextBlock}` }];
}

async function generateGeminiAnswer({ messages, system, concern, searchContext }) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured.');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: AI_CONFIG.MODEL_NAME,
    systemInstruction: system,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ],
    generationConfig: { temperature: 0.4, topP: 0.9 }
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(Object.assign(new Error(`Gemini timeout (${GEMINI_TIMEOUT_MS / 1000}s)`), { code: 'TIMEOUT' }));
    }, GEMINI_TIMEOUT_MS);
  });

  const result = await Promise.race([
    model.generateContent(buildGeminiParts(messages, concern, searchContext)),
    timeoutPromise
  ]).finally(() => clearTimeout(timeoutId));

  const answer = result?.response?.text?.() || '';
  if (!answer.trim()) throw new Error('Gemini returned empty LoveMe answer.');
  return answer;
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const validation = validateConcern(req.body?.concern);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const concern = validation.value;
  const messages = sanitizeMessages(req.body?.messages, concern);
  const system = normalizeInputText(req.body?.system, MAX_SYSTEM_LENGTH);

  let usedSearch = false;
  let searchContext = '';
  let sources = [];

  try {
    const searchResult = await getStylingSearchContext(concern);
    usedSearch = searchResult.usedSearch;
    searchContext = searchResult.context;
    sources = Array.isArray(searchResult.sources) ? searchResult.sources : [];
  } catch (error) {
    console.warn('[api/loveme] Serper failed; falling back to Gemini-only answer:', error.message);
    usedSearch = false;
    searchContext = '';
    sources = [];
  }

  try {
    const answer = await generateGeminiAnswer({ messages, system, concern, searchContext });
    return res.status(200).json({
      answer,
      sources: usedSearch ? sources.slice(0, MAX_SOURCE_COUNT) : [],
      usedSearch
    });
  } catch (error) {
    console.error('[api/loveme] Gemini answer failed:', error.message);
    return res.status(503).json({ error: 'LOVEME_ANSWER_FAILED', sources: [], usedSearch: false });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
module.exports._private = {
  buildStylingSearchQueries,
  isStylingRelated,
  validateConcern,
  sanitizeMessages,
  getSourceDomain,
  dedupeSerperSources
};
