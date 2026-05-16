const { GoogleGenerativeAI } = require('@google/generative-ai');
const { analyzeQuestion } = require('../lib/questionUnderstanding');
const { planResearch } = require('../lib/researchStrategy');

const AI_CONFIG = { MODEL_NAME: process.env.MODEL_NAME || 'gemini-2.5-flash' };
const OPENAI_MODEL = 'gpt-5.4-mini';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const MAX_QUESTION_LENGTH = 1200;
const MAX_SEARCH_QUERY_LENGTH = 120;
const MAX_SOURCE_COUNT = 5;
const SERPER_TIMEOUT_MS = 4000;
const GEMINI_TIMEOUT_MS = 20000;
const OPENAI_TIMEOUT_MS = 20000;

const PUBLIC_CONTEXT_KEYWORDS = [
  '기본증명서', '가족관계증명서', '등본', '초본', '서류', '증명서', '발급', '신청', '절차', '방법',
  '법', '법률', '소송', '내용증명', '보증금', '월세', '전세', '임대차', '계약', '신고', '분쟁', '기관',
  '폐기물', '스티커', '주민센터', '구청', '시청', '동사무소', '공공', '민원', '정부', '복지',
  '약', '약국', '병원', '의사', '증상', '아플', '아프', '통증', '열', '두통', '복통', '설사', '감기', '건강', '의학',
  '수리', 'as', '부품', '고장', '용어', '제품', '모델', '리콜', '가격', '최신', '최근', '오늘', '현재', '뉴스',
  '규칙', '규정', '과태료', '벌금', '자격', '면허', '보험', '세금', '연말정산', '환급'
];

const PERSONAL_SUPPORT_KEYWORDS = [
  '힘들어', '외로워', '우울', '슬퍼', '불안', '무서워', '화가', '짜증', '위로', '응원', '죽고 싶', '자살'
];

const OBJECTIVE_CONTEXT_OVERRIDE_KEYWORDS = [
  '법', '법률', '소송', '보증금', '월세', '전세', '계약', '신고', '증명서', '서류', '발급',
  '폐기물', '스티커', '약', '병원', '의사', '증상', '통증', '수리', '부품', '고장', '리콜'
];

const LOW_QUALITY_DOMAINS = [
  'pinterest.', 'facebook.', 'instagram.', 'tiktok.', 'x.com', 'twitter.', 'youtube.', 'dcinside.', 'fmkorea.', 'theqoo.'
];

const OFFICIAL_SOURCE_DOMAINS = [
  '.go.kr', 'gov.kr', 'epeople.go.kr', 'moel.go.kr', 'korea.kr', 'law.go.kr', 'easylaw.go.kr',
  'safety.or.kr', 'kosha.or.kr', 'nhis.or.kr', 'comwel.or.kr', 'nts.go.kr'
];

function normalizeText(value, maxLength = MAX_QUESTION_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function hasAnyKeyword(text, keywords) {
  const source = String(text || '').toLowerCase();
  return keywords.some((keyword) => source.includes(keyword.toLowerCase()));
}

function shouldUsePublicSearch(question, analysis) {
  if (analysis && analysis.needsSearch) return true;

  const text = normalizeText(question).toLowerCase();
  if (!text) return false;

  const isPersonalSupport = hasAnyKeyword(text, PERSONAL_SUPPORT_KEYWORDS);
  if (isPersonalSupport && !hasAnyKeyword(text, OBJECTIVE_CONTEXT_OVERRIDE_KEYWORDS)) return false;

  if (hasAnyKeyword(text, PUBLIC_CONTEXT_KEYWORDS)) return true;
  if (/[?？]$/.test(text) && /(뭐야|무엇|어디|어떻게|언제|얼마|가능|해야|되나|인가|차이|뜻|의미)/.test(text)) return true;
  if (/\b(what|where|how|when|law|rule|medicine|repair|document|certificate|current|recent)\b/i.test(text)) return true;
  return false;
}

function removePrivateDetails(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
    .replace(/\b\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, ' ')
    .replace(/\b\d{6}[-\s]?\d{7}\b/g, ' ')
    .replace(/\b\d{2,6}[-\s]?\d{2,6}[-\s]?\d{2,8}\b/g, ' ')
    .replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\s,]{0,20}(?:로|길)\s?\d{1,4}(?:-\d{1,4})?/g, ' ')
    .replace(/(?:제|내|본인|가족|친구|회사|상대방)\s*(?:이름|성명|실명)은?\s*[가-힣]{2,4}/g, ' ')
    .replace(/[가-힣]{2,4}\s*(?:씨|님|대표|과장|부장|팀장|변호사|의사)/g, ' ')
    .replace(/["'`<>()[\]{}]/g, ' ')
    .replace(/[?？!！.,;:|\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSafePublicQuery(question) {
  const stripped = removePrivateDetails(question);
  const compact = normalizeText(stripped, MAX_SEARCH_QUERY_LENGTH);
  if (!compact || compact.length < 2) return '';
  if (/(기본증명서|가족관계증명서|등본|초본|폐기물|스티커|보증금|월세|전세|약|복통|통증|수리|부품|고장|법|절차)/.test(compact)) {
    return compact;
  }
  return `${compact} 정보 절차`.slice(0, MAX_SEARCH_QUERY_LENGTH).trim();
}

function getDomain(link) {
  try {
    return new URL(String(link || '').trim()).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function stripTags(text) {
  return normalizeText(String(text || '').replace(/<[^>]*>/g, ' '), 500);
}

function isLowQualitySource(item) {
  const domain = getDomain(item?.link).toLowerCase();
  if (!domain) return true;
  return LOW_QUALITY_DOMAINS.some((blocked) => domain.includes(blocked));
}

function normalizeSource(item) {
  const link = normalizeText(item?.link, 500);
  return {
    title: stripTags(item?.title).slice(0, 140),
    link,
    snippet: stripTags(item?.snippet).slice(0, 260),
    domain: getDomain(link)
  };
}

function pickUsefulSources(rawItems) {
  const seen = new Set();
  const sources = [];
  const candidates = Array.isArray(rawItems) ? rawItems : [];

  for (const item of candidates) {
    const source = normalizeSource(item);
    if (!source.link || !source.domain || (!source.title && !source.snippet)) continue;
    const key = source.link.replace(/[?#].*$/, '');
    if (seen.has(key)) continue;
    if (isLowQualitySource(source) && sources.length >= 2) continue;
    seen.add(key);
    sources.push(source);
    if (sources.length >= MAX_SOURCE_COUNT) break;
  }
  return sources;
}

async function fetchWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`${label} failed with status ${response.status}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`${label} returned invalid JSON`);
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${label} timeout`);
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isOfficialSource(source) {
  const domain = String(source?.domain || getDomain(source?.link)).toLowerCase();
  return OFFICIAL_SOURCE_DOMAINS.some((officialDomain) => domain === officialDomain || domain.endsWith(officialDomain) || domain.includes(officialDomain));
}

function hasUsefulEvidence(sources, analysis) {
  if (!Array.isArray(sources) || sources.length === 0) return false;
  if (analysis?.needsOfficialSource) return sources.some(isOfficialSource);
  return sources.length >= 1;
}

function mergeSources(current, next) {
  const seen = new Set();
  const merged = [];
  for (const source of [...(current || []), ...(next || [])]) {
    const key = String(source?.link || '').replace(/[?#].*$/, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
    if (merged.length >= MAX_SOURCE_COUNT) break;
  }
  return merged;
}

async function searchSerper(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey || !query) return [];

  const data = await fetchWithTimeout(SERPER_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey
    },
    body: JSON.stringify({ q: query, gl: 'kr', hl: 'ko', num: 7 })
  }, SERPER_TIMEOUT_MS, 'Serper');

  return pickUsefulSources(data?.organic || []);
}

async function searchSerperQueries(queries, analysis) {
  let sources = [];
  for (const query of queries) {
    try {
      const nextSources = await searchSerper(query);
      sources = mergeSources(sources, nextSources);
      if (hasUsefulEvidence(sources, analysis)) break;
    } catch (searchError) {
      console.warn('[api/instantAnswer] Serper failed:', searchError.message);
    }
  }
  return sources;
}

function buildSourceContext(sources) {
  if (!sources.length) return '사용한 공개 출처 없음.';
  return sources.map((source, index) => [
    `[${index + 1}] ${source.title || source.domain}`,
    `도메인: ${source.domain}`,
    `링크: ${source.link}`,
    `요약: ${source.snippet || '요약 없음'}`
  ].join('\n')).join('\n\n');
}

function buildSystemPrompt({ usedSearch, researchPlan }) {
  return `너는 ThisOne 즉답이다. 한국어로 짧고 실용적으로 답한다.
ThisOne은 source-backed AI 서비스다. AI는 진실의 출처가 아니고, 공개 출처/사용자 질문을 해석해 정리한다.

답변 원칙:
- 평이한 한국어로 직접 답한다.
- 너무 길게 쓰지 않는다.
- 사용자가 다음에 무엇을 해야 하는지 말한다.
- 공개 정보가 부족하거나 출처가 없으면 불확실성을 말한다.
- 의료/법률/금융/안전 주제는 일반 안내로 제한하고 전문가/기관 확인과 긴급 상황을 안내한다.
- 출처에 없는 구체적 공개 사실을 지어내지 않는다.
- ${usedSearch ? '제공된 공개 출처 맥락을 우선 근거로 삼는다.' : '공개 출처 없이 질문 내용 기준으로 조심스럽게 정리한다.'}

가능하면 다음 구조로 답한다:
${(researchPlan?.answerSections?.length ? researchPlan.answerSections : ['결론', '이유', '지금 할 일', '주의할 점']).map((section, index) => `${index + 1}. ${section}`).join('\n')}`;
}

function buildUserPrompt(question, sources, analysis, researchPlan) {
  const questionContext = analysis ? [
    `사용자 원문 질문:\n${analysis.originalText}`,
    `내부 재작성 질문:\n${analysis.rewrittenQuestion}`,
    `필요 근거 유형: ${analysis.evidencePreference}`,
    `확인할 핵심어: ${analysis.keyPhrases.join(', ') || '없음'}`
  ].join('\n\n') : `사용자 질문:\n${question}`;

  const strategyContext = researchPlan ? `\n\n조사 전략:\n- 출처 품질: ${researchPlan.sourceQuality}\n- 판단: ${researchPlan.reason}\n- 권장 답변 섹션: ${researchPlan.answerSections.join(', ')}` : '';

  return `${questionContext}${strategyContext}\n\n공개 검색 맥락:\n${buildSourceContext(sources)}\n\n위 정보만으로 자연스럽게 즉답해줘. 출처 목록 자체는 프론트에서 따로 보여주므로, 답변 본문에는 링크를 길게 나열하지 마.`;
}

async function geminiAnswer(question, sources, usedSearch, analysis, researchPlan) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: AI_CONFIG.MODEL_NAME,
    systemInstruction: buildSystemPrompt({ usedSearch, researchPlan }),
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ],
    generationConfig: { temperature: 0.2, topP: 0.9 }
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Gemini timeout (${GEMINI_TIMEOUT_MS / 1000}s)`)), GEMINI_TIMEOUT_MS);
  });

  const result = await Promise.race([
    model.generateContent(buildUserPrompt(question, sources, analysis, researchPlan)),
    timeoutPromise
  ]).finally(() => clearTimeout(timeoutId));

  const answer = result?.response?.text?.() || '';
  if (!answer.trim()) throw new Error('Gemini returned empty answer');
  return answer.trim();
}

async function openaiAnswer(question, sources, usedSearch, analysis, researchPlan) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const data = await fetchWithTimeout(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt({ usedSearch, researchPlan }) },
        { role: 'user', content: buildUserPrompt(question, sources, analysis, researchPlan) }
      ],
      temperature: 0.2
    })
  }, OPENAI_TIMEOUT_MS, 'OpenAI');

  const answer = data?.choices?.[0]?.message?.content || '';
  if (!answer.trim()) throw new Error('OpenAI returned empty answer');
  return answer.trim();
}

function buildCarefulFallbackAnswer(question, usedSearch, analysis, hasEnoughEvidence = usedSearch, researchPlan) {
  const text = normalizeText(question, 160);
  if (hasAnyKeyword(text, PERSONAL_SUPPORT_KEYWORDS)) {
    return '1. 결론\n지금 많이 버거운 상태라면 혼자 견디려고만 하지 말고, 가까운 사람에게 “지금 너무 힘들다”고 바로 말해보세요.\n\n2. 이유\n감정이 심하게 올라올 때는 문제를 해결하기보다 안전하게 시간을 버티는 것이 먼저입니다.\n\n3. 지금 할 일\n물 한 잔 마시고, 숨을 천천히 쉬면서 믿을 만한 사람에게 연락하세요. 스스로를 해칠 생각이 있거나 위험하다고 느끼면 즉시 119 또는 가까운 응급실에 도움을 요청하세요.\n\n4. 주의할 점\n공개 출처 없이 질문 내용 기준으로 정리했습니다.';
  }

  if (!hasEnoughEvidence && analysis?.needsSearch) {
    const officialLine = analysis.needsOfficialSource
      ? '공식 기관·법령·지자체 안내에서 확인되어야 하는 부분은 아직 확정하지 못했습니다.'
      : '공개 출처에서 확인되어야 하는 부분은 아직 확정하지 못했습니다.';
    const checkTarget = analysis.institutionWords?.length ? `${analysis.institutionWords[0]} 공식 안내` : '관련 공식 안내 또는 최신 공지';
    const questionSummary = analysis.rewrittenQuestion || text;
    const confirmedLine = usedSearch
      ? '일부 공개 검색 결과는 확인했지만, 최종 판단에 필요한 근거 품질은 충분하지 않습니다.'
      : '현재 답변에 직접 인용할 만큼 충분한 공개 출처는 확인하지 못했습니다.';
    const interpretationLine = analysis.needsOfficialSource
      ? '공공기관·제도·소속 여부 질문은 명칭이 비슷해도 위촉, 민간 수행, 공무원 신분이 서로 다를 수 있으므로 공식 문서 기준으로만 단정해야 합니다.'
      : '상황·지역·시점에 따라 결론이 달라질 수 있으므로 일반 기준으로만 해석해야 합니다.';
    return `1. 결론\n공개 출처를 충분히 확인하지 못해 일반적인 기준으로 정리했습니다. 이 질문은 “${questionSummary}”라는 기준으로 확인해야 하며, 현재는 단정 답변보다 추가 확인이 필요합니다.\n\n2. 확인된 내용\n${confirmedLine} ${researchPlan?.reason || ''}\n\n3. 합리적 해석\n${interpretationLine}\n\n4. 확인되지 않은 부분\n${officialLine} 특히 명칭, 소속, 권한, 대상, 기한처럼 기관별로 달라질 수 있는 정보는 공개 근거가 필요합니다.\n\n5. 지금 확인할 것\n${checkTarget}에서 정확한 명칭으로 다시 검색하거나, 담당 부서 민원/문의 창구에 현재 기준을 확인하세요.`;
  }

  return `1. 결론\n지금 질문은 일반 정보 확인이 필요한 내용일 수 있습니다. ${usedSearch ? '확인된 공개 검색 요약을 바탕으로' : '공개 출처 없이 질문 내용 기준으로'} 조심스럽게 판단해야 합니다.\n\n2. 이유\n상황·지역·기관·시점에 따라 답이 달라질 수 있어 단정하기 어렵습니다.\n\n3. 지금 할 일\n관련 공식 기관, 전문가, 약사/의사/변호사 등 해당 분야 담당자에게 최신 기준을 확인하세요.\n\n4. 주의할 점\nAI 답변은 최종 근거가 아니며, 중요한 결정에는 공식 안내를 우선하세요.`;
}

async function buildAnswer(question, sources, usedSearch, analysis, hasEnoughEvidence = usedSearch, researchPlan) {
  if (analysis?.needsSearch && !hasEnoughEvidence) {
    return buildCarefulFallbackAnswer(question, usedSearch, analysis, hasEnoughEvidence, researchPlan);
  }

  try {
    return await geminiAnswer(question, sources, usedSearch, analysis, researchPlan);
  } catch (geminiError) {
    console.warn('[api/instantAnswer] Gemini failed:', geminiError.message);
  }

  try {
    return await openaiAnswer(question, sources, usedSearch, analysis, researchPlan);
  } catch (openaiError) {
    console.warn('[api/instantAnswer] OpenAI failed:', openaiError.message);
  }

  return buildCarefulFallbackAnswer(question, usedSearch, analysis, hasEnoughEvidence, researchPlan);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const question = normalizeText(req.body?.question);
  if (!question) {
    return res.status(400).json({ error: 'question must be a non-empty string' });
  }

  const analysis = analyzeQuestion({ text: question, mode: 'instant-answer' });
  let sources = [];
  let usedSearch = false;
  let fallback = false;
  let escalatedAnalysis = analysis;
  let researchPlan = planResearch(analysis, sources);
  const shouldSearch = shouldUsePublicSearch(question, analysis);

  if (shouldSearch) {
    const firstQueries = analysis.searchQueries.length ? analysis.searchQueries : [buildSafePublicQuery(question)];
    sources = await searchSerperQueries(firstQueries, analysis);
    usedSearch = sources.length > 0;

    researchPlan = planResearch(analysis, sources);

    if (researchPlan.shouldEscalate && researchPlan.nextQueries.length) {
      fallback = true;
      escalatedAnalysis = analyzeQuestion({ text: question, mode: 'instant-answer' }, { firstSearchWeak: true });
      const deeperSources = await searchSerperQueries(researchPlan.nextQueries, escalatedAnalysis);
      sources = mergeSources(sources, deeperSources);
      usedSearch = sources.length > 0;
      researchPlan = planResearch(escalatedAnalysis, sources);
    }
  }

  researchPlan = researchPlan || planResearch(escalatedAnalysis, sources);
  const hasEnoughEvidence = researchPlan.sourceQuality === 'good';
  if (escalatedAnalysis.needsSearch && !hasEnoughEvidence) fallback = true;
  const answerQuestion = escalatedAnalysis.rewrittenQuestion || question;
  const answer = await buildAnswer(answerQuestion, sources, usedSearch, escalatedAnalysis, hasEnoughEvidence, researchPlan);
  return res.status(200).json({
    answer,
    sources: usedSearch ? sources : [],
    usedSearch,
    fallback,
    statusMessages: fallback ? escalatedAnalysis.interimMessages : undefined
  });
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
module.exports._private = {
  shouldUsePublicSearch,
  buildSafePublicQuery,
  removePrivateDetails,
  pickUsefulSources,
  hasUsefulEvidence,
  searchSerperQueries,
  planResearch
};
