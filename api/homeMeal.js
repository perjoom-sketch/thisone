const SERPER_SEARCH_URL = 'https://google.serper.dev/search';
const SERPER_TIMEOUT_MS = 4000;
const MAX_INGREDIENT_LENGTH = 800;
const MAX_SOURCE_COUNT = 3;

const MENU_CANDIDATES = [
  {
    name: '김치볶음밥',
    ingredients: ['김치', '밥', '계란', '대파'],
    optional: ['햄', '참기름', '김가루'],
    note: '김치와 밥이 있으면 가장 빠르게 한 끼가 됩니다.'
  },
  {
    name: '돼지고기 김치찌개',
    ingredients: ['돼지고기', '김치', '두부', '대파'],
    optional: ['양파', '고춧가루', '마늘'],
    note: '돼지고기와 김치 조합이면 국물 메뉴로 안정적입니다.'
  },
  {
    name: '계란볶음밥',
    ingredients: ['계란', '밥', '대파'],
    optional: ['당근', '양파', '햄'],
    note: '재료가 적을 때 실패 확률이 낮은 기본 메뉴입니다.'
  },
  {
    name: '감자채볶음',
    ingredients: ['감자', '양파'],
    optional: ['당근', '햄', '대파'],
    note: '반찬이 필요할 때 냉장고 재료로 맞추기 쉽습니다.'
  },
  {
    name: '두부조림',
    ingredients: ['두부', '대파', '양파'],
    optional: ['고춧가루', '간장', '마늘'],
    note: '두부만 있어도 양념장을 더해 밥반찬으로 만들기 좋습니다.'
  },
  {
    name: '참치마요 덮밥',
    ingredients: ['참치', '밥', '계란'],
    optional: ['마요네즈', '김가루', '양파'],
    note: '캔참치가 있으면 조리 부담이 낮습니다.'
  },
  {
    name: '소고기 미역국',
    ingredients: ['소고기', '미역'],
    optional: ['마늘', '국간장', '참기름'],
    note: '미역과 소고기가 있으면 오래 끓이지 않아도 든든합니다.'
  },
  {
    name: '닭가슴살 샐러드',
    ingredients: ['닭가슴살', '상추', '토마토'],
    optional: ['오이', '계란', '드레싱'],
    note: '가볍게 먹고 싶을 때 조합이 깔끔합니다.'
  },
  {
    name: '된장찌개',
    ingredients: ['된장', '두부', '애호박', '양파'],
    optional: ['감자', '버섯', '대파'],
    note: '냉장고 채소를 넣어 정리하기 좋은 찌개입니다.'
  },
  {
    name: '토마토 계란볶음',
    ingredients: ['토마토', '계란', '대파'],
    optional: ['양파', '굴소스', '마늘'],
    note: '재료는 단순하지만 맛 방향이 확실합니다.'
  }
];

const INGREDIENT_ALIASES = new Map([
  ['돼지', '돼지고기'],
  ['삼겹살', '돼지고기'],
  ['목살', '돼지고기'],
  ['소고기', '소고기'],
  ['쇠고기', '소고기'],
  ['닭', '닭가슴살'],
  ['치킨', '닭가슴살'],
  ['달걀', '계란'],
  ['계란', '계란'],
  ['달걀후라이', '계란'],
  ['밥', '밥'],
  ['햇반', '밥'],
  ['즉석밥', '밥'],
  ['김치', '김치'],
  ['두부', '두부'],
  ['파', '대파'],
  ['대파', '대파'],
  ['쪽파', '대파'],
  ['양파', '양파'],
  ['감자', '감자'],
  ['당근', '당근'],
  ['햄', '햄'],
  ['스팸', '햄'],
  ['참치캔', '참치'],
  ['참치', '참치'],
  ['미역', '미역'],
  ['상추', '상추'],
  ['토마토', '토마토'],
  ['오이', '오이'],
  ['된장', '된장'],
  ['애호박', '애호박'],
  ['호박', '애호박'],
  ['버섯', '버섯'],
  ['마늘', '마늘'],
  ['간장', '간장'],
  ['고춧가루', '고춧가루'],
  ['고추가루', '고춧가루'],
  ['참기름', '참기름'],
  ['마요네즈', '마요네즈'],
  ['마요', '마요네즈'],
  ['김가루', '김가루']
]);

function normalizeInputText(value, maxLength = MAX_INGREDIENT_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function validateIngredients(value) {
  const normalized = normalizeInputText(value);
  if (!normalized || normalized.length < 2) {
    return { error: 'ingredients must be a non-empty text value.' };
  }
  return { value: normalized };
}

function parseIngredients(text) {
  const source = normalizeInputText(text).toLowerCase();
  const found = new Set();

  INGREDIENT_ALIASES.forEach((canonical, alias) => {
    if (source.includes(alias.toLowerCase())) found.add(canonical);
  });

  source
    .split(/(?:\s+|[,，、/·+&]+|와|과|랑|및|하고)/)
    .map((item) => item.replace(/[^가-힣a-z0-9]/gi, '').trim())
    .filter(Boolean)
    .forEach((item) => {
      const canonical = INGREDIENT_ALIASES.get(item) || item;
      if (canonical.length >= 1) found.add(canonical);
    });

  return Array.from(found).slice(0, 24);
}

function scoreCandidate(candidate, availableIngredients) {
  const available = new Set(availableIngredients);
  const matched = candidate.ingredients.filter((ingredient) => available.has(ingredient));
  const missing = candidate.ingredients.filter((ingredient) => !available.has(ingredient));
  const optionalMatched = candidate.optional.filter((ingredient) => available.has(ingredient));
  const score = matched.length * 3 + optionalMatched.length - missing.length * 2;

  return {
    name: candidate.name,
    available: matched,
    missing,
    optionalMatched,
    note: candidate.note,
    score
  };
}

function buildMenuCandidates(ingredients) {
  return MENU_CANDIDATES
    .map((candidate) => scoreCandidate(candidate, ingredients))
    .filter((candidate) => candidate.available.length > 0 || candidate.optionalMatched.length > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
      return a.name.localeCompare(b.name, 'ko');
    })
    .slice(0, 4);
}

function getSourceDomain(link) {
  try {
    return new URL(String(link || '')).hostname.replace(/^www\./i, '');
  } catch (error) {
    return '';
  }
}

function normalizeSource(item) {
  const link = normalizeInputText(item?.link, 240);
  const title = normalizeInputText(item?.title, 140);
  const snippet = normalizeInputText(item?.snippet, 180);
  const domain = getSourceDomain(link);
  if (!title || !link || !domain || !/^https?:\/\//i.test(link)) return null;
  if (/\.(?:pdf|zip|png|jpe?g|gif|webp)(?:$|[?#])/i.test(link)) return null;
  return { title, link, snippet, domain };
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

async function searchRecipeSource(menuName, apiKey) {
  if (!apiKey || !menuName) return null;

  const response = await fetchWithTimeout(SERPER_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey
    },
    body: JSON.stringify({ q: `${menuName} 레시피`, gl: 'kr', hl: 'ko', num: 3 })
  }, SERPER_TIMEOUT_MS);

  if (!response.ok) throw new Error(`Serper request failed with status ${response.status}`);
  const data = await response.json();
  const sources = (Array.isArray(data?.organic) ? data.organic : [])
    .map(normalizeSource)
    .filter(Boolean);
  return sources[0] || null;
}

async function attachRecipeSources(candidates) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey || !candidates.length) return { candidates, usedSearch: false };

  const enriched = [];
  let usedSearch = false;

  for (const candidate of candidates.slice(0, MAX_SOURCE_COUNT)) {
    try {
      const source = await searchRecipeSource(candidate.name, apiKey);
      enriched.push(source ? { ...candidate, source } : candidate);
      if (source) usedSearch = true;
    } catch (error) {
      console.warn('[api/homeMeal] Serper recipe source failed:', error.message);
      enriched.push(candidate);
    }
  }

  return {
    candidates: enriched.concat(candidates.slice(MAX_SOURCE_COUNT)),
    usedSearch
  };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const validation = validateIngredients(req.body?.ingredients);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const input = validation.value;
  const ingredients = parseIngredients(input);
  const candidates = buildMenuCandidates(ingredients);

  if (!candidates.length) {
    return res.status(200).json({
      ingredients,
      candidates: [],
      usedSearch: false,
      message: '입력한 재료와 바로 맞는 집밥 후보를 찾지 못했습니다. 재료명을 조금 더 구체적으로 적어주세요.'
    });
  }

  const result = await attachRecipeSources(candidates);
  return res.status(200).json({
    ingredients,
    candidates: result.candidates,
    usedSearch: result.usedSearch,
    message: '쇼핑 연결 없이, 입력한 재료 기준으로 가능한 메뉴만 정리했습니다.'
  });
}

module.exports = handler;
module.exports.config = { maxDuration: 20 };
module.exports._private = {
  parseIngredients,
  buildMenuCandidates,
  validateIngredients,
  normalizeSource
};
