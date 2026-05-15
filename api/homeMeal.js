const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_MODEL = process.env.MODEL_NAME || 'gemini-2.5-flash';
const OPENAI_MODEL = 'gpt-5.4-mini';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const MAX_INPUT_LENGTH = 800;
const MAX_QUERY_LENGTH = 120;
const MAX_INGREDIENT_COUNT = 10;
const MAX_SOURCE_COUNT = 5;
const SERPER_TIMEOUT_MS = 4000;
const GEMINI_TIMEOUT_MS = 20000;
const OPENAI_TIMEOUT_MS = 20000;

const INGREDIENT_ALIASES = new Map([
  ['계란', '계란'],
  ['달걀', '계란'],
  ['대파', '대파'],
  ['파', '대파'],
  ['쪽파', '대파'],
  ['김치', '김치'],
  ['두부', '두부'],
  ['양파', '양파'],
  ['애호박', '애호박'],
  ['호박', '애호박'],
  ['닭가슴살', '닭가슴살'],
  ['닭', '닭고기'],
  ['닭고기', '닭고기'],
  ['양배추', '양배추'],
  ['고추장', '고추장'],
  ['밥', '밥'],
  ['햇반', '밥'],
  ['즉석밥', '밥'],
  ['참치캔', '참치캔'],
  ['참치', '참치캔'],
  ['돼지고기', '돼지고기'],
  ['삼겹살', '돼지고기'],
  ['목살', '돼지고기'],
  ['소고기', '소고기'],
  ['쇠고기', '소고기'],
  ['감자', '감자'],
  ['당근', '당근'],
  ['버섯', '버섯'],
  ['마늘', '마늘'],
  ['간장', '간장'],
  ['된장', '된장'],
  ['고춧가루', '고춧가루'],
  ['고추가루', '고춧가루'],
  ['참기름', '참기름'],
  ['마요네즈', '마요네즈'],
  ['마요', '마요네즈'],
  ['김가루', '김가루'],
  ['김', '김'],
  ['스팸', '햄'],
  ['햄', '햄']
]);

const FALLBACK_MENUS = [
  {
    name: '김치계란볶음밥',
    required: ['밥', '김치', '계란'],
    nice: ['대파', '참기름', '김가루'],
    direction: '김치를 먼저 볶고 밥을 넣은 뒤, 계란은 한쪽에서 익혀 섞으면 됩니다.'
  },
  {
    name: '대파계란볶음',
    required: ['계란', '대파'],
    nice: ['밥', '간장', '참기름'],
    direction: '대파를 기름에 살짝 볶아 향을 내고 계란을 넣어 부드럽게 익히면 됩니다.'
  },
  {
    name: '두부애호박찌개',
    required: ['두부', '애호박'],
    nice: ['양파', '된장', '고추장', '대파'],
    direction: '애호박과 양파를 먼저 끓이고 두부는 마지막에 넣어 무너지지 않게 끓이면 됩니다.'
  },
  {
    name: '두부양파조림',
    required: ['두부', '양파'],
    nice: ['대파', '간장', '고춧가루', '마늘'],
    direction: '두부를 굽거나 바로 깔고 양파와 간장 양념을 넣어 짧게 조리면 됩니다.'
  },
  {
    name: '닭가슴살양배추고추장볶음',
    required: ['닭가슴살', '양배추', '고추장'],
    nice: ['양파', '대파', '마늘'],
    direction: '닭가슴살을 먼저 데우거나 볶고, 양배추와 고추장을 넣어 숨이 죽을 정도로만 볶으면 됩니다.'
  },
  {
    name: '참치마요덮밥',
    required: ['밥', '참치캔'],
    nice: ['마요네즈', '김', '계란', '양파'],
    direction: '밥 위에 기름 뺀 참치를 올리고, 있으면 마요네즈나 김을 더해 간단히 덮밥으로 먹으면 됩니다.'
  },
  {
    name: '참치김치덮밥',
    required: ['밥', '참치캔', '김치'],
    nice: ['대파', '계란', '참기름'],
    direction: '김치와 참치를 같이 볶은 뒤 밥 위에 올리면 빠르게 한 그릇이 됩니다.'
  }
];

function normalizeText(value, maxLength = MAX_INPUT_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function stripTags(value, maxLength = 500) {
  return normalizeText(String(value || '').replace(/<[^>]*>/g, ' '), maxLength);
}

function validateRequest(body) {
  const mode = normalizeText(body?.mode, 20);
  const input = normalizeText(body?.input);

  if (mode !== 'human') return { error: 'mode must be human.' };
  if (!input) return { error: 'input must be a non-empty string.' };
  return { mode, input };
}

function tokenizeIngredientText(text) {
  return normalizeText(text)
    .replace(/["'`<>()[\]{}]/g, ' ')
    .split(/(?:\s+|[,，、/·+&]+|와|과|랑|및|하고|있어|있음|있습니다|요)/)
    .map((item) => item.replace(/[^가-힣a-z0-9]/gi, '').replace(/[은는이가을를]$/, '').trim())
    .filter((item) => item.length >= 1);
}

function extractIngredients(input) {
  const lowered = normalizeText(input).toLowerCase();
  const ingredients = new Set();

  INGREDIENT_ALIASES.forEach((canonical, alias) => {
    const safeAlias = alias.toLowerCase();
    if (safeAlias.length >= 2 && lowered.includes(safeAlias)) ingredients.add(canonical);
  });

  tokenizeIngredientText(input).forEach((token) => {
    const canonical = INGREDIENT_ALIASES.get(token) || token;
    if (canonical.length >= 1 && !/^(재료|냉장고|메뉴|추천|집밥|오늘|가능|만들|먹고|싶)/.test(canonical)) {
      ingredients.add(canonical);
    }
  });

  return Array.from(ingredients).slice(0, MAX_INGREDIENT_COUNT);
}

function buildSafeSerperQuery(ingredients) {
  const cleanIngredients = ingredients
    .map((item) => normalizeText(item, 24).replace(/[^가-힣a-z0-9\s]/gi, '').trim())
    .filter(Boolean)
    .slice(0, 6);

  if (!cleanIngredients.length) return '';
  const suffix = cleanIngredients.length <= 3 ? '집밥 레시피' : '집밥 메뉴';
  return `${cleanIngredients.join(' ')} ${suffix}`.slice(0, MAX_QUERY_LENGTH).trim();
}

function getDomain(link) {
  try {
    return new URL(String(link || '').trim()).hostname.replace(/^www\./i, '');
  } catch (error) {
    return '';
  }
}

function normalizeSource(item) {
  const link = normalizeText(item?.link, 500);
  const title = stripTags(item?.title, 140);
  const snippet = stripTags(item?.snippet, 260);
  const domain = getDomain(link);
  if (!/^https?:\/\//i.test(link) || !domain || (!title && !snippet)) return null;
  if (/\.(?:pdf|zip|png|jpe?g|gif|webp)(?:$|[?#])/i.test(link)) return null;
  return { title: title || domain, link, snippet, domain };
}

function pickSources(items) {
  const seen = new Set();
  const sources = [];

  for (const item of Array.isArray(items) ? items : []) {
    const source = normalizeSource(item);
    if (!source) continue;
    const key = source.link.replace(/[?#].*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
    if (sources.length >= MAX_SOURCE_COUNT) break;
  }

  return sources;
}

async function fetchJsonWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`${label} failed with status ${response.status}`);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`${label} returned invalid JSON`);
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`${label} timeout`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchSerper(query) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey || !query) return [];

  const data = await fetchJsonWithTimeout(SERPER_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey
    },
    body: JSON.stringify({ q: query, gl: 'kr', hl: 'ko', num: 7 })
  }, SERPER_TIMEOUT_MS, 'Serper');

  return pickSources(data?.organic || []);
}

function buildSourceContext(sources) {
  if (!sources.length) return '사용한 공개 출처 없음.';
  return sources.map((source, index) => [
    `[${index + 1}] ${source.title}`,
    `도메인: ${source.domain}`,
    `요약: ${source.snippet || '요약 없음'}`
  ].join('\n')).join('\n\n');
}

function buildSystemPrompt({ usedSearch }) {
  return `너는 ThisOne 집밥 도우미다. 한국어로 짧고 실용적인 집밥 메뉴를 제안한다.
ThisOne은 source-backed AI 원칙을 따른다. AI는 진실의 출처가 아니라 사용자 재료와 공개 레시피 맥락을 정리하는 역할이다.

규칙:
- 집밥/사람용 메뉴만 답한다. 반려동물 식단 조언은 하지 않는다.
- 식당식 고급 메뉴가 아니라 집에서 바로 할 수 있는 말투로 쓴다.
- 사용자가 가진 재료를 먼저 쓴다.
- 없는 재료를 있는 것처럼 말하지 않는다.
- "있는 재료"와 "있으면 좋은 재료"를 명확히 나눈다.
- 의학/다이어트/질병 효능 주장을 하지 않는다.
- 공개 출처에 없는 사실을 지어내지 않는다.
- ${usedSearch ? '제공된 공개 레시피 검색 맥락을 참고하되, 사용자 재료와 맞지 않으면 무리하게 따르지 않는다.' : '공개 검색을 쓰지 못했으므로 사용자 재료 기준의 조심스러운 일반 제안으로 답한다.'}

반드시 아래 구조로 답한다:
1. 오늘 바로 가능한 메뉴
2. 가장 추천하는 하나
3. 간단한 조리 방향
4. 부족하면 있으면 좋은 재료
5. 참고한 공개 출처`;
}

function buildUserPrompt({ input, ingredients, sources }) {
  return `사용자 입력:
${input}

추출한 재료:
${ingredients.length ? ingredients.join(', ') : '명확히 추출된 재료 없음'}

공개 레시피/맥락 검색 요약:
${buildSourceContext(sources)}

답변은 짧게, 실용적으로 작성해줘. 링크 목록은 프론트에서 따로 보여주므로 본문에는 긴 URL을 쓰지 마. 공개 출처가 없으면 5번에 "공개 출처는 확인하지 못했습니다"라고 말해줘.`;
}

async function callGemini(payload, usedSearch) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: buildSystemPrompt({ usedSearch }),
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ],
    generationConfig: { temperature: 0.25, topP: 0.9 }
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Gemini timeout (${GEMINI_TIMEOUT_MS / 1000}s)`)), GEMINI_TIMEOUT_MS);
  });

  const result = await Promise.race([
    model.generateContent(buildUserPrompt(payload)),
    timeoutPromise
  ]).finally(() => clearTimeout(timeoutId));

  const answer = result?.response?.text?.() || '';
  if (!answer.trim()) throw new Error('Gemini returned empty answer');
  return answer.trim();
}

async function callOpenAI(payload, usedSearch) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const data = await fetchJsonWithTimeout(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt({ usedSearch }) },
        { role: 'user', content: buildUserPrompt(payload) }
      ],
      temperature: 0.25
    })
  }, OPENAI_TIMEOUT_MS, 'OpenAI');

  const answer = data?.choices?.[0]?.message?.content || '';
  if (!answer.trim()) throw new Error('OpenAI returned empty answer');
  return answer.trim();
}

function scoreMenu(menu, ingredients) {
  const available = new Set(ingredients);
  const matchedRequired = menu.required.filter((item) => available.has(item));
  const missingRequired = menu.required.filter((item) => !available.has(item));
  const matchedNice = menu.nice.filter((item) => available.has(item));
  return {
    menu,
    matchedRequired,
    missingRequired,
    matchedNice,
    score: matchedRequired.length * 4 + matchedNice.length - missingRequired.length * 3
  };
}

function buildFallbackAnswer(input, ingredients, sources, usedSearch) {
  const scored = FALLBACK_MENUS
    .map((menu) => scoreMenu(menu, ingredients))
    .filter((item) => item.matchedRequired.length || item.matchedNice.length)
    .sort((a, b) => b.score - a.score || a.missingRequired.length - b.missingRequired.length)
    .slice(0, 3);

  if (!scored.length) {
    return `1. 오늘 바로 가능한 메뉴
입력에서 재료를 충분히 특정하지 못했어요. 예: "계란, 대파, 김치 있어"처럼 재료명을 쉼표로 적어주세요.

2. 가장 추천하는 하나
재료를 더 확인한 뒤 고르는 것이 안전합니다.

3. 간단한 조리 방향
가진 재료가 확인되면 볶음밥, 찌개, 덮밥처럼 단순한 집밥부터 맞춰볼게요.

4. 부족하면 있으면 좋은 재료
밥, 계란, 대파, 양파처럼 기본 재료가 있으면 선택지가 늘어납니다.

5. 참고한 공개 출처
${usedSearch ? '공개 검색 결과를 일부 참고했습니다.' : '공개 출처는 확인하지 못했습니다.'}`;
  }

  const recommended = scored[0];
  const possibleMenus = scored.map((item) => {
    const missingText = item.missingRequired.length ? ` / 부족: ${item.missingRequired.join(', ')}` : '';
    return `- ${item.menu.name}: 있는 재료 ${item.matchedRequired.concat(item.matchedNice).join(', ') || '추가 확인 필요'}${missingText}`;
  }).join('\n');
  const niceIngredients = Array.from(new Set(recommended.menu.nice.filter((item) => !ingredients.includes(item))));
  const sourceText = usedSearch && sources.length
    ? sources.map((source, index) => `- [${index + 1}] ${source.title} (${source.domain})`).join('\n')
    : '공개 출처는 확인하지 못했습니다. 그래서 입력 재료 기준으로 조심스럽게 정리했습니다.';

  return `1. 오늘 바로 가능한 메뉴
있는 재료: ${ingredients.length ? ingredients.join(', ') : normalizeText(input, 80)}
${possibleMenus}

2. 가장 추천하는 하나
${recommended.menu.name}를 가장 추천해요. 있는 재료를 많이 쓰고, 집에서 바로 만들기 쉬운 편입니다.

3. 간단한 조리 방향
${recommended.menu.direction}

4. 부족하면 있으면 좋은 재료
${niceIngredients.length ? niceIngredients.join(', ') : '추가 재료 없이 먼저 만들어도 됩니다.'}

5. 참고한 공개 출처
${sourceText}`;
}

async function buildAiAnswer(payload, usedSearch) {
  try {
    return await callGemini(payload, usedSearch);
  } catch (geminiError) {
    console.warn('[api/homeMeal] Gemini failed:', geminiError.message);
  }

  try {
    return await callOpenAI(payload, usedSearch);
  } catch (openaiError) {
    console.warn('[api/homeMeal] OpenAI failed:', openaiError.message);
  }

  return buildFallbackAnswer(payload.input, payload.ingredients, payload.sources, usedSearch);
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const validation = validateRequest(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const ingredients = extractIngredients(validation.input);
  const query = buildSafeSerperQuery(ingredients);
  let sources = [];
  let usedSearch = false;

  try {
    sources = await searchSerper(query);
    usedSearch = sources.length > 0;
  } catch (searchError) {
    console.warn('[api/homeMeal] Serper failed:', searchError.message);
    sources = [];
    usedSearch = false;
  }

  const answer = await buildAiAnswer({
    input: validation.input,
    ingredients,
    sources
  }, usedSearch);

  return res.status(200).json({
    answer,
    sources: usedSearch ? sources : [],
    usedSearch
  });
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
module.exports._private = {
  validateRequest,
  extractIngredients,
  buildSafeSerperQuery,
  pickSources,
  buildFallbackAnswer
};
