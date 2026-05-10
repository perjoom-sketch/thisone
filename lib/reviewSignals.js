const { fetchSearchSignals } = require('./searchAdapter');

const DEFAULT_TTL_SECONDS = Number(process.env.REVIEW_SIGNALS_CACHE_TTL_SECONDS || 86400);
const NEGATIVE_TTL_SECONDS = 900;
const DEFAULT_TIMEOUT_MS = Number(process.env.REVIEW_SIGNALS_TIMEOUT_MS || 3000);

const POSITIVE_KEYWORDS = [
  '인생템', '만족', '추천', '강추', '잘 샀', '좋다', '편하다', '조용', '성능 좋', '가성비',
  '재구매', '깔끔', '간편', '튼튼', '관리 편', '후회없'
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

function itemTokens(item) {
  const fields = [item?.name, item?.brand, item?.maker, item?.store, item?.category2, item?.category3]
    .map(compactText)
    .filter(Boolean);
  const name = compactText(item?.name || '');
  const chunks = name.match(/[a-z0-9가-힣]{2,}/gi) || [];
  return Array.from(new Set([...fields, ...chunks].filter((token) => token.length >= 2)));
}

function getResultRelevance(result, item) {
  const haystack = compactText(`${result?.title || ''} ${result?.snippet || ''} ${result?.displayLink || ''}`);
  if (!haystack) return 0;
  const tokens = itemTokens(item);
  if (!tokens.length) return 0;
  const name = compactText(item?.name || '');
  if (name && haystack.includes(name.slice(0, Math.min(name.length, 20)))) return 1;
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  return clamp(matches / Math.min(tokens.length, 5), 0, 1);
}

function summarizeItemSignals(item, results) {
  let matchedCount = 0;
  let positiveHits = 0;
  let negativeHits = 0;

  (results || []).forEach((result) => {
    const relevance = getResultRelevance(result, item);
    if (relevance < 0.2) return;
    matchedCount += 1;
    const text = `${result.title || ''} ${result.snippet || ''}`;
    positiveHits += relevance * countKeywordHits(text, POSITIVE_KEYWORDS);
    negativeHits += relevance * countKeywordHits(text, NEGATIVE_KEYWORDS);
  });

  const signalTotal = positiveHits + negativeHits;
  const confidence = clamp((matchedCount / 3) * (signalTotal > 0 ? 1 : 0.4), 0, 1);
  const sentiment = signalTotal > 0 ? (positiveHits - negativeHits) / (signalTotal + 1) : 0;
  const bonus = clamp(Math.round(confidence * (3 * sentiment + Math.min(2, positiveHits / 2))), 0, 4);
  const valueBonus = clamp(Math.round(confidence * (2 * sentiment + Math.min(1.5, positiveHits / 3))), 0, 3);

  const publicReasons = [];
  if (matchedCount > 0) publicReasons.push(`외부 리뷰 신호 ${matchedCount}건 확인`);
  if (positiveHits >= 1) publicReasons.push('긍정 키워드 감지');
  if (positiveHits >= 2) publicReasons.push('만족/추천 계열 언급 확인');

  return {
    matchedCount,
    positiveHits: Number(positiveHits.toFixed(2)),
    negativeHits: Number(negativeHits.toFixed(2)),
    confidence: Number(confidence.toFixed(4)),
    bonus,
    valueBonus,
    publicSummary: matchedCount > 0 && positiveHits > 0 ? '외부 리뷰 신호에서 긍정 언급 확인' : '외부 리뷰 신호 중립',
    publicReasons
  };
}

function enrichItems(items, results) {
  return (items || []).map((item) => {
    const reviewSignals = summarizeItemSignals(item, results);
    return {
      ...item,
      reviewSignals,
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

module.exports = {
  enrichReviewSignals,
  buildCacheKey,
  DEFAULT_TTL_SECONDS,
  NEGATIVE_TTL_SECONDS
};
