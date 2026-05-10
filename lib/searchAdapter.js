const GOOGLE_CSE_URL = 'https://www.googleapis.com/customsearch/v1';
const DEFAULT_PROVIDER = 'google_cse';
const GOOGLE_CSE_NUM_RESULTS = 10;

function stripTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function isExplicitlyDisabled(value) {
  return String(value || '').toLowerCase() === 'false';
}

function normalizeProvider(provider) {
  return String(provider || DEFAULT_PROVIDER).trim().toLowerCase() || DEFAULT_PROVIDER;
}

function isSearchSignalEnabled({ provider, apiKey, cx, enabled } = {}) {
  const normalizedProvider = normalizeProvider(provider);
  if (enabled === false || isExplicitlyDisabled(process.env.REVIEW_SIGNALS_ENABLED)) return false;
  if (normalizedProvider !== DEFAULT_PROVIDER) return false;
  if (!apiKey || !cx) return false;
  return true;
}

function buildSearchQuery(query) {
  const base = stripTags(query).replace(/\s+/g, ' ').trim();
  return `${base} 후기 리뷰 사용기 장단점 실사용`.trim();
}

function normalizeSearchResults(rawResults) {
  return (rawResults || [])
    .map((item) => ({
      title: stripTags(item?.title),
      snippet: stripTags(item?.snippet),
      link: String(item?.link || '').trim(),
      displayLink: String(item?.displayLink || '').trim()
    }))
    .filter((item) => item.title || item.snippet || item.link || item.displayLink);
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const err = new Error('Google CSE API error');
      err.status = response.status;
      err.detail = text;
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('Google CSE JSON parse failed');
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Google CSE API timeout');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchGoogleCseSignals({ query, apiKey, cx, timeoutMs } = {}) {
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: buildSearchQuery(query),
    num: String(GOOGLE_CSE_NUM_RESULTS),
    lr: 'lang_ko',
    gl: 'kr',
    safe: 'active'
  });
  const data = await fetchJsonWithTimeout(`${GOOGLE_CSE_URL}?${params.toString()}`, timeoutMs);
  return normalizeSearchResults(data?.items || []);
}

async function fetchSearchSignals({ query, provider, apiKey, cx, enabled = true, timeoutMs = 3000 } = {}) {
  const startedAt = Date.now();
  const normalizedProvider = normalizeProvider(provider);
  const debug = {
    enabled: false,
    provider: normalizedProvider,
    called: false,
    success: false,
    cached: false,
    durationMs: 0,
    resultCount: 0,
    matchedCount: 0,
    timeoutMs: Number(timeoutMs || 3000),
    error: null,
    reason: null
  };

  if (!isSearchSignalEnabled({ provider: normalizedProvider, apiKey, cx, enabled }) || !query) {
    return {
      results: [],
      debug: {
        ...debug,
        durationMs: Date.now() - startedAt,
        reason: 'missing_credentials_or_disabled'
      }
    };
  }

  debug.enabled = true;
  debug.called = true;

  try {
    if (normalizedProvider !== DEFAULT_PROVIDER) {
      throw new Error(`Unsupported search signals provider: ${normalizedProvider}`);
    }
    const results = await fetchGoogleCseSignals({ query, apiKey, cx, timeoutMs: debug.timeoutMs });
    return {
      results,
      debug: {
        ...debug,
        success: true,
        durationMs: Date.now() - startedAt,
        resultCount: results.length
      }
    };
  } catch (err) {
    return {
      results: [],
      debug: {
        ...debug,
        durationMs: Date.now() - startedAt,
        error: err.message || 'search signals provider failed',
        reason: 'provider_error'
      }
    };
  }
}

module.exports = {
  fetchSearchSignals,
  isSearchSignalEnabled,
  buildSearchQuery,
  normalizeSearchResults
};
