const { fetchSearchSignals } = require('./searchAdapter');

const DEFAULT_TTL_SECONDS = Number(process.env.REVIEW_SIGNALS_CACHE_TTL_SECONDS || 86400);
const NEGATIVE_TTL_SECONDS = 900;
const DEFAULT_TIMEOUT_MS = Number(process.env.REVIEW_SIGNALS_TIMEOUT_MS || 3000);

const POSITIVE_KEYWORDS = [
  '인생템', '만족', '추천', '강추', '잘 샀', '좋다', '편하다', '조용', '성능 좋', '가성비',
  '재구매', '깔끔', '간편', '튼튼', '관리 편', '후회없'
];
const POSITIVE_SIGNAL_CATEGORIES = [
  { id: 'quiet', label: '조용함', keywords: ['조용', '저소음', '소음 없음'] },
  { id: 'easy_care', label: '관리 편함', keywords: ['관리 편함', '관리 쉬움', '청소 편함'] },
  { id: 'satisfied', label: '만족도 높음', keywords: ['만족', '좋아', '추천', '추천해요', '강추'] },
  { id: 'compact', label: '컴팩트', keywords: ['컴팩트', '깔끔', '심플'] },
  { id: 'value', label: '가성비', keywords: ['가성비', '합리적'] }
];
const NEGATIVE_KEYWORDS = [
  '비추', '후회', '고장', '불량', '소음', 'AS 불만', '환불', '실망', '별로', '문제',
  '주의', '단점', '냄새', '누수', '유지비 부담'
];

function stripTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function normalizeText(text) {
  return stripTags(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function compactText(text) {
  return normalizeText(text).replace(/[\s\-_/()[\]{}.,:;|+]+/g, '');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function countKeywordHits(text, keywords) {
  const normalized = normalizeText(text);
  const compacted = compactText(text);
  return keywords.reduce((count, keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    const compactKeyword = compactText(keyword);
    if (!normalizedKeyword) return count;
    return count + (normalized.includes(normalizedKeyword) || compacted.includes(compactKeyword) ? 1 : 0);
  }, 0);
}

function hasKeyword(text, keyword) {
  const normalized = normalizeText(text);
  const compacted = compactText(text);
  const normalizedKeyword = normalizeText(keyword);
  const compactKeyword = compactText(keyword);
  return !!normalizedKeyword && (normalized.includes(normalizedKeyword) || compacted.includes(compactKeyword));
}


const KNOWN_BRAND_TOKENS = new Set([
  'roborock', '로보락', 'xiaomi', '샤오미', 'mijia', 'dyson', '다이슨', 'winix', '위닉스',
  'samsung', '삼성', 'bespoke', '비스포크', 'lg', '엘지', '엘지전자', '쿠쿠', 'cuckoo',
  '쿠첸', 'coway', '코웨이', '발뮤다', 'balmuda', '필립스', 'philips', '샤크', 'shark',
  '테팔', 'tefal', '신일', '한일', '캐리어', 'carrier', '위니아', 'winia'
]);

const GENERIC_PRODUCT_TOKENS = new Set([
  '청소기', '로봇청소기', '무선청소기', '공기청정기', '공청기', '선풍기', '서큘레이터',
  '에어컨', '냉장고', '세탁기', '건조기', '의류관리기', '스타일러', '정수기', '가습기',
  '제습기', '식기세척기', '전자레인지', '오븐', '밥솥', '드라이기', '헤어드라이어',
  '멀티', '스타일러', '콤보', 'ai', '무선', '유선', '자동', '스마트', '저소음', '초미세',
  '가정용', '업소용', '신형', '정품', '국내', '해외', '직구', '공식', '최신', '추천'
]);

function splitSearchTokens(text) {
  return normalizeText(text)
    .match(/[a-z]+\d+[a-z0-9]*|\d+[a-z]+[a-z0-9]*|[a-z]+|\d+|[가-힣]+/gi) || [];
}

function uniqueTokens(tokens) {
  return Array.from(new Set((tokens || []).map((token) => normalizeText(token)).filter(Boolean)));
}

function tokenInText(token, text, compactedText = compactText(text)) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) return false;
  if (/^[a-z0-9]$/i.test(normalizedToken)) {
    return splitSearchTokens(text).map(normalizeText).includes(normalizedToken);
  }
  const compactToken = compactText(normalizedToken);
  return !!compactToken && compactedText.includes(compactToken);
}

function extractBrandTokens(item) {
  const fields = [item?.brand, item?.maker, item?.manufacturer, item?.store]
    .flatMap(splitSearchTokens);
  const nameTokens = splitSearchTokens(item?.name || item?.title || '');
  const firstNameToken = normalizeText(nameTokens[0] || '');
  const brandTokens = uniqueTokens(fields).filter((token) => token.length >= 2 || token === 'lg');
  if (firstNameToken && (KNOWN_BRAND_TOKENS.has(firstNameToken) || brandTokens.includes(firstNameToken))) {
    brandTokens.push(firstNameToken);
  }
  return uniqueTokens(brandTokens).filter((token) => token.length >= 2 || token === 'lg');
}

function isModelLikeToken(token) {
  const normalized = normalizeText(token);
  if (!normalized) return false;
  const hasLetter = /[a-z가-힣]/i.test(normalized);
  const hasNumber = /\d/.test(normalized);
  if (hasLetter && hasNumber) return true;
  if (/^[a-z]$/.test(normalized)) return true;
  if (/^[a-z]{2,}$/.test(normalized)) return true;
  if (/^[가-힣]{2,}$/.test(normalized) && !GENERIC_PRODUCT_TOKENS.has(normalized)) return true;
  return false;
}

function extractProductMatchTokens(itemName, brandHints = []) {
  const tokens = splitSearchTokens(itemName);
  const normalizedBrandHints = new Set(uniqueTokens(brandHints));
  const firstToken = normalizeText(tokens[0] || '');
  if (firstToken && KNOWN_BRAND_TOKENS.has(firstToken)) normalizedBrandHints.add(firstToken);

  const modelTokens = [];
  tokens.forEach((token, index) => {
    const normalized = normalizeText(token);
    if (!normalized) return;
    if (normalizedBrandHints.has(normalized)) return;
    if (index === 0 && KNOWN_BRAND_TOKENS.has(normalized)) return;
    if (GENERIC_PRODUCT_TOKENS.has(normalized)) return;
    if (isModelLikeToken(normalized)) modelTokens.push(normalized);
  });

  return uniqueTokens(modelTokens);
}

function calculateProductSignalMatch(item, result) {
  const haystack = `${result?.title || ''} ${result?.snippet || ''} ${result?.displayLink || ''}`;
  const compactedHaystack = compactText(haystack);
  if (!compactedHaystack) {
    return { brandMatched: false, modelTokenMatches: 0, strongModelMatch: false, matchStrength: 'none', reason: '일치 없음' };
  }

  const brandTokens = extractBrandTokens(item);
  const fallbackBrandTokens = brandTokens.length ? brandTokens : uniqueTokens(splitSearchTokens(item?.name || item?.title || '').slice(0, 1))
    .filter((token) => KNOWN_BRAND_TOKENS.has(token));
  const brandMatched = fallbackBrandTokens.some((token) => tokenInText(token, haystack, compactedHaystack));
  const modelTokens = extractProductMatchTokens(item?.name || item?.title || '', fallbackBrandTokens);
  const matchedModelTokens = modelTokens.filter((token) => tokenInText(token, haystack, compactedHaystack));
  const modelTokenMatches = matchedModelTokens.length;
  const compactModelPhrase = modelTokens.length >= 2 ? modelTokens.map(compactText).join('') : '';
  const fullModelMatched = compactModelPhrase.length >= 4 && compactedHaystack.includes(compactModelPhrase);
  const strongModelMatch = modelTokenMatches >= 2 || fullModelMatched;

  let matchStrength = 'none';
  if (strongModelMatch) matchStrength = 'strong';
  else if (modelTokenMatches >= 1) matchStrength = 'medium';
  else if (brandMatched) matchStrength = 'weak';

  let reason = '일치 없음';
  if (matchStrength === 'strong') reason = fullModelMatched ? '핵심 모델명 전체 일치' : `모델 토큰 ${modelTokenMatches}개 일치`;
  else if (matchStrength === 'medium') reason = '모델 토큰 1개 일치';
  else if (matchStrength === 'weak') reason = '브랜드만 일치하여 가점 제한';

  return {
    brandMatched,
    modelTokenMatches,
    strongModelMatch,
    matchStrength,
    reason,
    matchedModelTokens
  };
}

function extractPositiveSignals(item) {
  const text = `${item?.title || ''} ${item?.snippet || ''}`;
  if (!normalizeText(text)) return [];

  return POSITIVE_SIGNAL_CATEGORIES
    .filter((category) => category.keywords.some((keyword) => hasKeyword(text, keyword)))
    .map((category) => category.label)
    .slice(0, 2);
}

function buildCacheKey(query, items = []) {
  const normalizedQuery = normalizeText(query);
  const itemSignature = (items || [])
    .slice(0, 30)
    .map((item) => compactText(item?.name || item?.title || '').slice(0, 48))
    .filter(Boolean)
    .join('|');
  const hashSource = `${normalizedQuery}:${itemSignature}`;
  let hash = 0;
  for (let i = 0; i < hashSource.length; i += 1) {
    hash = ((hash << 5) - hash) + hashSource.charCodeAt(i);
    hash |= 0;
  }
  return `review:signals:v1:${encodeURIComponent(normalizedQuery)}:${Math.abs(hash).toString(36)}`;
}

function getMatchWeight(matchStrength) {
  if (matchStrength === 'strong') return 1;
  if (matchStrength === 'medium') return 0.55;
  if (matchStrength === 'weak') return 0.15;
  return 0;
}

function summarizeItemSignals(item, results) {
  let matchedCount = 0;
  let weakMatchedCount = 0;
  let positiveHits = 0;
  let negativeHits = 0;
  let strongestMatch = 'none';
  let strongestReason = null;

  const positiveSignals = [];
  const matchRank = { none: 0, weak: 1, medium: 2, strong: 3 };

  (results || []).forEach((result) => {
    const match = calculateProductSignalMatch(item, result);
    const weight = getMatchWeight(match.matchStrength);
    if (weight <= 0) return;

    if (match.matchStrength === 'weak') weakMatchedCount += 1;
    else matchedCount += 1;

    if (matchRank[match.matchStrength] > matchRank[strongestMatch]) {
      strongestMatch = match.matchStrength;
      strongestReason = match.reason;
    }

    const text = `${result.title || ''} ${result.snippet || ''}`;
    positiveHits += weight * countKeywordHits(text, POSITIVE_KEYWORDS);
    negativeHits += weight * countKeywordHits(text, NEGATIVE_KEYWORDS);

    if (match.matchStrength === 'medium' || match.matchStrength === 'strong') {
      extractPositiveSignals(result).forEach((signal) => {
        if (positiveSignals.length < 2 && !positiveSignals.includes(signal)) positiveSignals.push(signal);
      });
    }
  });

  const signalTotal = positiveHits + negativeHits;
  const matchConfidenceBase = matchedCount > 0 ? matchedCount / 3 : Math.min(weakMatchedCount / 8, 0.25);
  const confidence = clamp(matchConfidenceBase * (signalTotal > 0 ? 1 : 0.4), 0, 1);
  const sentiment = signalTotal > 0 ? (positiveHits - negativeHits) / (signalTotal + 1) : 0;
  const positiveDominant = positiveHits > negativeHits;
  const eligibleForBonus = positiveDominant && (strongestMatch === 'medium' || strongestMatch === 'strong');
  const bonusScale = strongestMatch === 'strong' ? 1 : 0.5;
  const bonus = eligibleForBonus
    ? clamp(Math.round(confidence * bonusScale * (3 * sentiment + Math.min(2, positiveHits / 2))), 0, 4)
    : 0;
  const valueBonus = eligibleForBonus
    ? clamp(Math.round(confidence * bonusScale * (2 * sentiment + Math.min(1.5, positiveHits / 3))), 0, 3)
    : 0;

  const publicReasons = [];
  if (strongestReason) publicReasons.push(strongestReason);
  if (matchedCount > 0) publicReasons.push(`외부 리뷰 신호 ${matchedCount}건 확인`);
  else if (weakMatchedCount > 0) publicReasons.push('브랜드만 일치하여 가점 제한');
  if (positiveHits >= 1) publicReasons.push('긍정 키워드 감지');
  if (positiveHits >= 2) publicReasons.push('만족/추천 계열 언급 확인');

  return {
    matchedCount,
    weakMatchedCount,
    positiveHits: Number(positiveHits.toFixed(2)),
    negativeHits: Number(negativeHits.toFixed(2)),
    confidence: Number(confidence.toFixed(4)),
    bonus,
    valueBonus,
    positiveSignals,
    strongestMatch,
    publicSummary: matchedCount > 0 && positiveHits > negativeHits ? '외부 리뷰 신호에서 긍정 언급 확인' : '외부 리뷰 신호 중립',
    publicReasons
  };
}

function enrichItems(items, results) {
  return (items || []).map((item) => {
    const reviewSignals = summarizeItemSignals(item, results);
    return {
      ...item,
      reviewSignals,
      positiveSignals: reviewSignals.positiveSignals,
      searchSignalScore: reviewSignals.bonus,
      searchSignalReasons: reviewSignals.publicReasons.join(', ')
    };
  });
}

async function enrichReviewSignals({
  query,
  items,
  provider,
  apiKey,
  cx,
  enabled,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  readCache,
  writeCache
} = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const cacheKey = buildCacheKey(query, sourceItems);
  const safeReadCache = typeof readCache === 'function' ? readCache : async () => null;
  const safeWriteCache = typeof writeCache === 'function' ? writeCache : async () => {};
  const baseDebug = {
    enabled: enabled === true,
    provider: provider || 'google_cse',
    called: false,
    success: false,
    cached: false,
    durationMs: 0,
    resultCount: 0,
    matchedCount: 0,
    timeoutMs: Number(timeoutMs || DEFAULT_TIMEOUT_MS),
    error: null,
    reason: null
  };

  if (!baseDebug.enabled || !query || sourceItems.length === 0) {
    return {
      items: sourceItems.length ? enrichItems(sourceItems, []) : sourceItems,
      debug: {
        ...baseDebug,
        enabled: false,
        reason: 'missing_credentials_or_disabled'
      }
    };
  }

  const cached = await safeReadCache(cacheKey);
  if (cached && Array.isArray(cached.items)) {
    return {
      items: cached.items,
      debug: {
        ...baseDebug,
        ...(cached.debug || {}),
        cached: true,
        called: false,
        cacheKey
      }
    };
  }
  if (cached?.negative) {
    return {
      items: enrichItems(sourceItems, []),
      debug: {
        ...baseDebug,
        cached: true,
        error: cached.error || 'cached negative',
        reason: cached.reason || 'cached_negative',
        cacheKey
      }
    };
  }

  const signals = await fetchSearchSignals({ query, provider, apiKey, cx, enabled, timeoutMs });
  const results = signals.results || [];
  const enrichedItems = enrichItems(sourceItems, results);
  const matchedCount = enrichedItems.filter((item) => Number(item.reviewSignals?.matchedCount || 0) > 0).length;
  const debug = {
    ...baseDebug,
    ...(signals.debug || {}),
    matchedCount,
    cacheKey
  };

  if (signals.debug?.success) {
    await safeWriteCache(cacheKey, { items: enrichedItems, debug }, DEFAULT_TTL_SECONDS);
    return { items: enrichedItems, debug };
  }

  if (signals.debug?.error) {
    await safeWriteCache(cacheKey, { negative: true, error: signals.debug.error, reason: signals.debug.reason }, NEGATIVE_TTL_SECONDS);
  }
  return { items: enrichItems(sourceItems, []), debug };
}

async function diagnoseReviewSignals({
  query,
  items,
  provider,
  apiKey,
  cx,
  enabled,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const baseDebug = {
    enabled: enabled === true,
    provider: provider || 'google_cse',
    called: false,
    success: false,
    cached: false,
    durationMs: 0,
    resultCount: 0,
    matchedCount: 0,
    timeoutMs: Number(timeoutMs || DEFAULT_TIMEOUT_MS),
    error: null,
    reason: null
  };

  if (!baseDebug.enabled || !query || sourceItems.length === 0) {
    const itemsWithoutSignals = sourceItems.length ? enrichItems(sourceItems, []) : sourceItems;
    return {
      results: [],
      items: itemsWithoutSignals,
      debug: {
        ...baseDebug,
        enabled: false,
        reason: 'missing_credentials_or_disabled'
      }
    };
  }

  const signals = await fetchSearchSignals({ query, provider, apiKey, cx, enabled, timeoutMs });
  const results = signals.results || [];
  const enrichedItems = enrichItems(sourceItems, results);
  const matchedCount = enrichedItems.filter((item) => Number(item.reviewSignals?.matchedCount || 0) > 0).length;

  return {
    results,
    items: enrichedItems,
    debug: {
      ...baseDebug,
      ...(signals.debug || {}),
      cached: false,
      matchedCount
    }
  };
}

module.exports = {
  diagnoseReviewSignals,
  enrichReviewSignals,
  extractPositiveSignals,
  extractProductMatchTokens,
  calculateProductSignalMatch,
  buildCacheKey,
  DEFAULT_TTL_SECONDS,
  NEGATIVE_TTL_SECONDS
};
