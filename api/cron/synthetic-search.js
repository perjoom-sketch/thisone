const { queries } = require('../../data/synthetic-queries.json');

const SEARCH_COUNT = 5;
const SEARCH_INTERVAL_MS = 1000;
const RAW_PATH = '/api/search/raw';
const FULL_PATH = '/api/search/full';
const TRACK_PATH = '/api/track';
const DEFAULT_BASE_URL = 'https://thisone-rho.vercel.app';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function normalizeBaseUrl(value) {
  const baseUrl = String(value || '').trim();
  if (!baseUrl) return DEFAULT_BASE_URL;
  return /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
}

function getBaseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || (String(host || '').includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

function getTrackBaseUrl() {
  return normalizeBaseUrl(process.env.VERCEL_URL || DEFAULT_BASE_URL);
}

function buildSearchUrl(baseUrl, path, query) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('q', query);
  return url.toString();
}

function buildTrackUrl() {
  return new URL(TRACK_PATH, getTrackBaseUrl()).toString();
}

function getItemsCount(result) {
  return Array.isArray(result?.items) ? result.items.length : 0;
}

function buildTrackPayload(payload) {
  return {
    type: payload.type,
    q: payload.q,
    mode: 'normal',
    rawCount: Number.isFinite(payload.rawCount) ? payload.rawCount : 0,
    fullCount: Number.isFinite(payload.fullCount) ? payload.fullCount : 0,
    resultCount: Number.isFinite(payload.resultCount) ? payload.resultCount : 0,
    hasError: payload.hasError === true,
    errorMessage: String(payload.errorMessage || '').slice(0, 160),
    elapsedMs: Number.isFinite(payload.elapsedMs) ? payload.elapsedMs : 0
  };
}

async function trackSearchEvent(payload) {
  try {
    const response = await fetch(buildTrackUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTrackPayload(payload))
    });

    if (!response.ok) {
      console.warn(`[synthetic-search] track event failed: ${response.status}`);
    }
  } catch (err) {
    console.warn('[synthetic-search] track event failed:', err?.message || err);
  }
}

async function callSearchEndpoint(baseUrl, path, query) {
  const url = buildSearchUrl(baseUrl, path, query);
  const startedAt = Date.now();
  const response = await fetch(url, { method: 'GET' });
  const text = await response.text();

  if (!response.ok) {
    const error = new Error(`${path} returned ${response.status}`);
    error.status = response.status;
    error.path = path;
    error.detail = text.slice(0, 500);
    throw error;
  }

  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      const error = new Error(`${path} returned invalid JSON`);
      error.status = response.status;
      error.path = path;
      error.detail = text.slice(0, 500);
      throw error;
    }
  }

  return {
    path,
    status: response.status,
    durationMs: Date.now() - startedAt,
    items: Array.isArray(data?.items) ? data.items : []
  };
}

function formatError(query, path, error) {
  return {
    q: query,
    path: path || error.path || null,
    status: error.status || null,
    message: error.message || 'Synthetic search failed',
    detail: error.detail || ''
  };
}

async function runSyntheticSearch(baseUrl, query) {
  const startTime = Date.now();

  await trackSearchEvent({
    type: 'search_start',
    q: query,
    rawCount: 0,
    fullCount: 0,
    resultCount: 0,
    hasError: false,
    errorMessage: '',
    elapsedMs: 0
  });

  try {
    const rawResult = await callSearchEndpoint(baseUrl, RAW_PATH, query);
    const rawElapsed = Date.now() - startTime;
    const rawCount = getItemsCount(rawResult);

    await trackSearchEvent({
      type: 'search_raw_done',
      q: query,
      rawCount,
      fullCount: 0,
      resultCount: rawCount,
      hasError: false,
      errorMessage: '',
      elapsedMs: rawElapsed
    });

    const fullStart = Date.now();
    const fullResult = await callSearchEndpoint(baseUrl, FULL_PATH, query);
    const fullElapsed = Date.now() - fullStart;
    const fullCount = getItemsCount(fullResult);

    await trackSearchEvent({
      type: 'search_full_done',
      q: query,
      rawCount,
      fullCount,
      resultCount: fullCount,
      hasError: false,
      errorMessage: '',
      elapsedMs: fullElapsed
    });

    return {
      q: query,
      results: [rawResult, fullResult],
      errors: []
    };
  } catch (err) {
    await trackSearchEvent({
      type: 'search_error',
      q: query,
      rawCount: 0,
      fullCount: 0,
      resultCount: 0,
      hasError: true,
      errorMessage: String(err?.message || err).slice(0, 160),
      elapsedMs: Date.now() - startTime
    });

    return {
      q: query,
      results: [],
      errors: [formatError(query, err?.path || null, err)]
    };
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const startedAt = Date.now();
  const queryPool = Array.isArray(queries) ? queries.filter(Boolean) : [];
  const selectedQueries = shuffle(queryPool).slice(0, SEARCH_COUNT);
  const baseUrl = getBaseUrl(req);
  const executed = [];
  const errors = [];

  for (let i = 0; i < selectedQueries.length; i += 1) {
    const query = selectedQueries[i];
    executed.push(query);

    const result = await runSyntheticSearch(baseUrl, query);
    errors.push(...result.errors);

    if (i < selectedQueries.length - 1) {
      await sleep(SEARCH_INTERVAL_MS);
    }
  }

  return res.status(200).json({
    ok: true,
    executed,
    totalDuration: `${Date.now() - startedAt}ms`,
    errors
  });
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
