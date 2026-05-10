const GOOGLE_CSE_URL = 'https://www.googleapis.com/customsearch/v1';
const DEFAULT_PROVIDER = 'google_cse';
const SERPER_PROVIDER = 'serper';
const GOOGLE_CSE_NUM_RESULTS = 10;
const SERPER_URL = 'https://google.serper.dev/search';
const SERPER_NUM_RESULTS = 10;

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
  if (normalizedProvider === DEFAULT_PROVIDER) return Boolean(apiKey && cx);
  if (normalizedProvider === SERPER_PROVIDER) return Boolean(apiKey || process.env.SERPER_API_KEY);
  return false;
}

function buildSearchQuery(query) {
  const base = stripTags(query).replace(/\s+/g, ' ').trim();
  return `${base} 후기 리뷰 사용기 장단점 실사용`.trim();
}

function parseHostname(link) {
  try {
    return new URL(String(link || '').trim()).hostname;
  } catch (e) {
    return '';
  }
}

function normalizeSearchResults(rawResults) {
  return (rawResults || [])
    .map((item) => {
      const link = String(item?.link || '').trim();
      return {
        title: stripTags(item?.title),
        snippet: stripTags(item?.snippet),
        link,
        displayLink: String(item?.displayLink || '').trim() || parseHostname(link)
      };
    })
    .filter((item) => item.title || item.snippet || item.link || item.displayLink);
}

async function fetchJsonWithTimeout(url, timeoutMs, options = {}, errorLabel = 'Search signals API') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const err = new Error(`${errorLabel} error`);
      err.status = response.status;
      err.detail = text;
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`${errorLabel} JSON parse failed`);
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${errorLabel} timeout`);
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
  const data = await fetchJsonWithTimeout(`${GOOGLE_CSE_URL}?${params.toString()}`, timeoutMs, { method: 'GET' }, 'Google CSE API');
  return normalizeSearchResults(data?.items || []);
}

async function fetchSerperSignals({ query, apiKey, timeoutMs } = {}) {
  const serperApiKey = apiKey || process.env.SERPER_API_KEY;
  const data = await fetchJsonWithTimeout(SERPER_URL, timeoutMs, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': serperApiKey
    },
    body: JSON.stringify({
      q: buildSearchQuery(query),
      num: SERPER_NUM_RESULTS,
      gl: 'kr',
      hl: 'ko'
    })
  }, 'Serper API');
  return normalizeSearchResults(data?.organic || []);
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
    let results;
    if (normalizedProvider === SERPER_PROVIDER) {
      results = await fetchSerperSignals({ query, apiKey, timeoutMs: debug.timeoutMs });
    } else if (normalizedProvider === DEFAULT_PROVIDER) {
      results = await fetchGoogleCseSignals({ query, apiKey, cx, timeoutMs: debug.timeoutMs });
    } else {
      throw new Error(`Unsupported search signals provider: ${normalizedProvider}`);
    }
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
        reason: err.message && err.message.toLowerCase().includes('timeout') ? 'timeout' : 'provider_error'
      }
    };
  }
}

module.exports = {
  fetchSearchSignals,
  isSearchSignalEnabled,
  buildSearchQuery,
  normalizeSearchResults,
  parseHostname
};
