const {
  getCategoryRole
} = require('./categoryRole');

const {
  detectIntent
} = require('./intentDetector');

const LOW_PRICE_FLOOR = 5000;
const LOW_PRICE_PENALTY = 12;
const CATEGORY_ROLE_MATCH_BONUS = 15;
const CATEGORY_ROLE_MISMATCH_PENALTY = 8;

function normalize(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parsePriceNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function parseCount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value || '').replace(/,/g, '');
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return 0;

  const base = Number(match[0]);
  if (!Number.isFinite(base)) return 0;
  if (/만/.test(text)) return Math.round(base * 10000);
  if (/천/.test(text)) return Math.round(base * 1000);
  return Math.round(base);
}

function getPrice(item) {
  return parsePriceNumber(item?.lprice ?? item?.priceNum ?? item?.priceText ?? item?.price);
}

function getReviewCount(item) {
  return parseCount(item?.reviewCount ?? item?.review ?? item?.reviewText);
}

function getSalesCount(item) {
  return parseCount(item?.salesCount ?? item?.sales ?? item?.purchaseCount ?? item?.purchaseText);
}

function getQueryTokens(query) {
  return normalize(query)
    .split(/[^\p{L}\p{N}]+/u)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

function getTextMatchScore(item, query) {
  const tokens = getQueryTokens(query);
  if (!tokens.length) return 0;

  const searchable = normalize([
    item?.name,
    item?.title,
    item?.brand,
    item?.maker,
    item?.category1,
    item?.category2,
    item?.category3,
    item?.category4
  ].filter(Boolean).join(' '));

  const matched = tokens.filter(token => searchable.includes(token)).length;
  return Math.min(30, Math.round((matched / tokens.length) * 30));
}

function getReviewScore(item) {
  const reviews = getReviewCount(item);
  if (reviews >= 10000) return 10;
  if (reviews >= 3000) return 8;
  if (reviews >= 1000) return 6;
  if (reviews >= 100) return 4;
  if (reviews > 0) return 2;
  return 0;
}

function getSalesScore(item) {
  const sales = getSalesCount(item);
  if (sales >= 10000) return 8;
  if (sales >= 3000) return 6;
  if (sales >= 1000) return 4;
  if (sales >= 100) return 2;
  if (sales > 0) return 1;
  return 0;
}

function getPriceFloorPenalty(item) {
  const price = getPrice(item);
  if (price > 0 && price < LOW_PRICE_FLOOR) return LOW_PRICE_PENALTY;
  return 0;
}

function getCategoryBonus(userIntent, role) {
  let categoryBonus = 0;

  if (userIntent === 'main') {
    if (role === 'main') {
      categoryBonus += CATEGORY_ROLE_MATCH_BONUS;
    }

    if (role === 'accessory') {
      categoryBonus -= CATEGORY_ROLE_MISMATCH_PENALTY;
    }
  }

  if (userIntent === 'accessory') {
    if (role === 'accessory') {
      categoryBonus += CATEGORY_ROLE_MATCH_BONUS;
    }

    if (role === 'main') {
      categoryBonus -= CATEGORY_ROLE_MISMATCH_PENALTY;
    }
  }

  return categoryBonus;
}

function calculateScore(item, query, options = {}) {
  const userIntent = options.userIntent || detectIntent(query);
  const role = getCategoryRole(item);

  let score = 0;
  score += getTextMatchScore(item, query);
  score += getReviewScore(item);
  score += getSalesScore(item);
  score -= getPriceFloorPenalty(item);

  const categoryBonus = getCategoryBonus(userIntent, role);
  score += categoryBonus;

  return {
    score,
    categoryRole: role,
    categoryBonus
  };
}

function rankCandidates(items = [], query = '') {
  const userIntent = detectIntent(query);

  return (items || [])
    .map((item, index) => {
      const ranking = calculateScore(item, query, { userIntent });
      return {
        ...item,
        score: ranking.score,
        finalScore: ranking.score,
        categoryRole: ranking.categoryRole,
        categoryBonus: ranking.categoryBonus,
        originalIndex: item?.originalIndex ?? index
      };
    })
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;

      const ap = getPrice(a);
      const bp = getPrice(b);
      if (ap && bp && ap !== bp) return ap - bp;

      return a.originalIndex - b.originalIndex;
    });
}

function buildCandidates(items = [], query = '') {
  return rankCandidates(items, query);
}

module.exports = {
  buildCandidates,
  calculateScore,
  getCategoryBonus,
  parsePriceNumber,
  rankCandidates,
  rankItems: rankCandidates,
  scoreItem: calculateScore
};
