const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_TTL_SECONDS = 43200;
const NEGATIVE_TTL_SECONDS = 600;
const MAX_RESULTS = 20;

const POSITIVE_KEYWORDS = [
  '추천', '만족', '좋다', '가성비', '장점', '최고', '잘 샀', '강추', '후회없', '편하다', '성능 좋',
  '인생템', '종결', '갓성비', '꿀템', '비교우위'
];
const NEGATIVE_KEYWORDS = [
  '비추', '후회', '단점', '고장', '불량', 'as', '소음', '별로', '문제', '환불', '실망', '주의',
  '사지마세요', '쓰레기', '아쉬운'
];
const REVIEW_KEYWORDS = /리뷰|후기|사용기|비교|언박싱|개봉기|장단점|실사용|review|comparison|unboxing/i;

function stripTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function normalizeText(text) {
  return stripTags(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function compactText(text) {
  return normalizeText(text).replace(/[\s\-_/()[\]{}.,:;|+]+/g, '');
}

function parseCount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function logNorm(value, maxValue) {
  const x = Number(value || 0);
  const max = Number(maxValue || 0);
  if (!Number.isFinite(x) || !Number.isFinite(max) || x <= 0 || max <= 0) return 0;
  return Math.log1p(x) / Math.log1p(max);
}

function buildCacheKey(query, items = []) {
  const normalizedQuery = normalizeText(query);
  const itemSignature = items
    .slice(0, 20)
    .map((item) => compactText(item?.name || item?.title || '').slice(0, 40))
    .filter(Boolean)
    .join('|');
  const hashSource = `${normalizedQuery}:${itemSignature}`;
  let hash = 0;
  for (let i = 0; i < hashSource.length; i += 1) {
    hash = ((hash << 5) - hash) + hashSource.charCodeAt(i);
    hash |= 0;
  }
  return `youtube:rep:v1:${encodeURIComponent(normalizedQuery)}:${Math.abs(hash).toString(36)}`;
}

function buildSearchQuery(query) {
  const base = stripTags(query).replace(/\s+/g, ' ').trim();
  return `${base} 리뷰 후기 비교 사용기`.trim();
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const err = new Error('YouTube API error');
      err.status = response.status;
      err.detail = text;
      throw err;
    }
    return JSON.parse(text);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('YouTube API timeout');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractVideoIds(searchData) {
  return (searchData?.items || [])
    .map((item) => item?.id?.videoId)
    .filter(Boolean)
    .slice(0, MAX_RESULTS);
}

async function fetchYoutubeVideos(query, apiKey, timeoutMs) {
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: String(MAX_RESULTS),
    q: buildSearchQuery(query),
    key: apiKey,
    relevanceLanguage: 'ko',
    regionCode: 'KR',
    safeSearch: 'none'
  });
  const searchData = await fetchJsonWithTimeout(`${YOUTUBE_SEARCH_URL}?${searchParams.toString()}`, timeoutMs);
  const ids = extractVideoIds(searchData);
  if (!ids.length) return [];

  const videosParams = new URLSearchParams({
    part: 'snippet,statistics',
    id: ids.join(','),
    key: apiKey
  });
  const videosData = await fetchJsonWithTimeout(`${YOUTUBE_VIDEOS_URL}?${videosParams.toString()}`, timeoutMs);
  return (videosData?.items || []).map((video) => ({
    id: video.id,
    title: stripTags(video.snippet?.title || ''),
    description: stripTags(video.snippet?.description || ''),
    channelTitle: stripTags(video.snippet?.channelTitle || ''),
    publishedAt: video.snippet?.publishedAt || '',
    viewCount: parseCount(video.statistics?.viewCount),
    likeCount: parseCount(video.statistics?.likeCount),
    commentCount: parseCount(video.statistics?.commentCount)
  }));
}

function extractModelTokens(name) {
  const text = stripTags(name).toUpperCase();
  const compact = text.replace(/[\s\-_/]+/g, '');
  const codeMatches = text.match(/\b[A-Z]{1,10}[\s\-]?\d{1,4}[A-Z0-9\-]*\b/g) || [];
  const words = text
    .replace(/[^A-Z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .filter((word) => !/^(정품|공식|무료배송|국내|해외|리뷰|후기)$/.test(word))
    .slice(0, 8);
  return {
    compact,
    codes: [...new Set(codeMatches.map((code) => code.replace(/[\s\-]/g, '')))],
    words: [...new Set(words)]
  };
}

function getVideoRelevance(video, item) {
  const title = `${video.title || ''} ${video.description || ''}`;
  const haystack = compactText(title).toUpperCase();
  const itemTokens = extractModelTokens(item?.name || item?.title || '');
  if (!itemTokens.compact) return 0;

  let exactModelBoost = 0;
  if (itemTokens.codes.some((code) => code && haystack.includes(code))) {
    exactModelBoost = 1;
  } else {
    const matchedWords = itemTokens.words.filter((word) => haystack.includes(word.replace(/[\s\-]/g, '')));
    const ratio = itemTokens.words.length ? matchedWords.length / itemTokens.words.length : 0;
    if (ratio >= 0.6) exactModelBoost = 0.7;
    else if (ratio >= 0.35 || matchedWords.length >= 2) exactModelBoost = 0.4;
  }

  if (exactModelBoost <= 0) return 0;
  const reviewIntentBoost = REVIEW_KEYWORDS.test(title) ? 1.2 : 1;
  const languageBoost = /[가-힣]/.test(video.title || '') ? 1 : 0.85;
  return clamp(exactModelBoost * reviewIntentBoost * languageBoost, 0, 1.2);
}

function countKeywordHits(text, keywords) {
  const normalized = normalizeText(text);
  return keywords.reduce((count, keyword) => count + (normalized.includes(keyword) ? 1 : 0), 0);
}

function extractConsensusKeywords(titles) {
  const counts = new Map();
  const keywords = [...POSITIVE_KEYWORDS, ...NEGATIVE_KEYWORDS];
  titles.forEach((title) => {
    const normalized = normalizeText(title);
    keywords.forEach((keyword) => {
      if (!normalized.includes(keyword)) return;
      counts.set(keyword, (counts.get(keyword) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([keyword]) => keyword);
}

function summarizeItemReputation(item, videos) {
  const matched = [];
  let weightedViews = 0;
  let weightedLikes = 0;
  let weightedComments = 0;
  let mentionCount = 0;
  let positiveHits = 0;
  let negativeHits = 0;
  const matchedTitles = [];

  videos.forEach((video) => {
    const relevance = getVideoRelevance(video, item);
    if (relevance < 0.35) return;
    matched.push({ video, relevance });
    matchedTitles.push(video.title || '');
    mentionCount += relevance;
    weightedViews += relevance * video.viewCount;
    weightedLikes += relevance * video.likeCount;
    weightedComments += relevance * video.commentCount;
    const text = `${video.title || ''} ${video.description || ''}`;
    positiveHits += relevance * countKeywordHits(text, POSITIVE_KEYWORDS);
    negativeHits += relevance * countKeywordHits(text, NEGATIVE_KEYWORDS);
    if (video.commentCount === 0) negativeHits += relevance * 0.5;
  });

  return {
    mentionCount,
    matchedVideoCount: matched.length,
    weightedViews,
    weightedLikes,
    weightedComments,
    positiveHits,
    negativeHits,
    consensusKeywords: extractConsensusKeywords(matchedTitles)
  };
}

function finalizeReputations(items, summaries) {
  const maxViews = Math.max(0, ...summaries.map((summary) => summary.weightedViews));
  const maxLikes = Math.max(0, ...summaries.map((summary) => summary.weightedLikes));
  const maxComments = Math.max(0, ...summaries.map((summary) => summary.weightedComments));

  return items.map((item, index) => {
    const summary = summaries[index] || {};
    const popularityIndex =
      0.45 * logNorm(summary.weightedViews, maxViews) +
      0.25 * logNorm(summary.weightedLikes, maxLikes) +
      0.15 * logNorm(summary.weightedComments, maxComments) +
      0.15 * Math.min(1, Number(summary.matchedVideoCount || 0) / 5);
    const sentimentIndex = clamp(
      (Number(summary.positiveHits || 0) - Number(summary.negativeHits || 0)) /
      (Number(summary.positiveHits || 0) + Number(summary.negativeHits || 0) + 2),
      -1,
      1
    );
    const confidence = Math.min(1, Number(summary.matchedVideoCount || 0) / 3) *
      Math.min(1, Number(summary.weightedViews || 0) / 10000);
    const bonus = clamp(Math.round(confidence * ((5 * popularityIndex) + (2 * sentimentIndex))), -3, 5);
    const valueBonus = clamp(Math.round(confidence * ((2.5 * popularityIndex) + (1.5 * sentimentIndex))), -2, 3);
    const finalBonus = bonus;
    const negativeHits = Number(summary.negativeHits || 0);
    const sentimentSummary = finalBonus > 1 && negativeHits > 0
      ? '긍정적이나 일부 단점 존재'
      : finalBonus > 1
        ? '긍정적 키워드 위주'
        : finalBonus < 0
          ? '부정적 키워드/단점 감지됨'
          : '평형 유지';
    const reasons = [];
    if (summary.matchedVideoCount > 0) reasons.push(`YouTube 리뷰 언급 ${summary.matchedVideoCount}건`);
    if (popularityIndex >= 0.6) reasons.push('YouTube 반응 높음');
    if (sentimentIndex < -0.25) reasons.push('YouTube 부정 키워드 감점');

    const youtubeReputation = {
      mentionCount: Number(summary.mentionCount || 0),
      matchedVideoCount: Number(summary.matchedVideoCount || 0),
      weightedViews: Math.round(Number(summary.weightedViews || 0)),
      weightedLikes: Math.round(Number(summary.weightedLikes || 0)),
      weightedComments: Math.round(Number(summary.weightedComments || 0)),
      popularityIndex: Number(popularityIndex.toFixed(4)),
      sentimentIndex: Number(sentimentIndex.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      bonus,
      valueBonus,
      sentimentSummary,
      consensusKeywords: Array.isArray(summary.consensusKeywords) ? summary.consensusKeywords : [],
      reasons
    };

    return {
      ...item,
      youtubeReputation,
      youtubeScore: bonus,
      youtubeReasons: reasons.join(', ')
    };
  });
}

async function enrichYoutubeReputation({ query, items, apiKey, readCache, writeCache, enabled, timeoutMs } = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const debug = {
    enabled: enabled === true,
    cached: false,
    matchedCount: 0,
    videoCount: 0,
    error: null,
    timeoutMs: timeoutMs || DEFAULT_TIMEOUT_MS
  };

  if (!debug.enabled || !apiKey || !query || sourceItems.length === 0) {
    return { items: sourceItems, debug: { ...debug, enabled: false } };
  }

  const cacheKey = buildCacheKey(query, sourceItems);
  const safeReadCache = typeof readCache === 'function' ? readCache : async () => null;
  const safeWriteCache = typeof writeCache === 'function' ? writeCache : async () => {};

  const cached = await safeReadCache(cacheKey);
  if (cached && Array.isArray(cached.items)) {
    return {
      items: cached.items,
      debug: {
        ...debug,
        cached: true,
        matchedCount: cached.debug?.matchedCount || 0,
        videoCount: cached.debug?.videoCount || 0,
        cacheKey
      }
    };
  }

  if (cached?.negative) {
    return { items: sourceItems, debug: { ...debug, cached: true, error: cached.error || 'cached negative', cacheKey } };
  }

  try {
    const videos = await fetchYoutubeVideos(query, apiKey, timeoutMs || DEFAULT_TIMEOUT_MS);
    const summaries = sourceItems.map((item) => summarizeItemReputation(item, videos));
    const enrichedItems = finalizeReputations(sourceItems, summaries);
    const matchedCount = enrichedItems.filter((item) => item.youtubeReputation?.matchedVideoCount > 0).length;
    const payloadDebug = { ...debug, matchedCount, videoCount: videos.length, cacheKey };
    await safeWriteCache(cacheKey, { items: enrichedItems, debug: payloadDebug }, DEFAULT_TTL_SECONDS);
    return { items: enrichedItems, debug: payloadDebug };
  } catch (err) {
    const error = err.message || 'YouTube reputation failed';
    await safeWriteCache(cacheKey, { negative: true, error }, NEGATIVE_TTL_SECONDS);
    return { items: sourceItems, debug: { ...debug, error, cacheKey } };
  }
}

module.exports = {
  enrichYoutubeReputation,
  buildCacheKey,
  DEFAULT_TTL_SECONDS,
  NEGATIVE_TTL_SECONDS
};
