const { queries } = require('../../data/synthetic-queries.json');

const SEARCH_COUNT = 5;
const SEARCH_INTERVAL_MS = 1000;
const RAW_PATH = '/api/search/raw';
const FULL_PATH = '/api/search/full';

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

function getBaseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || (String(host || '').includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

function buildSearchUrl(baseUrl, path, query) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('q', query);
  return url.toString();
}

async function callSearchEndpoint(baseUrl, path, query) {
  const url = buildSearchUrl(baseUrl, path, query);
  const startedAt = Date.now();
  const response = await fetch(url, { method: 'GET' });
  const text = await response.text();

  if (!response.ok) {
    const error = new Error(`${path} returned ${response.status}`);
    error.status = response.status;
    error.detail = text.slice(0, 500);
    throw error;
  }

  return {
    path,
    status: response.status,
    durationMs: Date.now() - startedAt
  };
}

function formatError(query, path, error) {
  return {
    q: query,
    path,
    status: error.status || null,
    message: error.message || 'Synthetic search failed',
    detail: error.detail || ''
  };
}

async function runSyntheticSearch(baseUrl, query) {
  const [rawResult, fullResult] = await Promise.allSettled([
    callSearchEndpoint(baseUrl, RAW_PATH, query),
    callSearchEndpoint(baseUrl, FULL_PATH, query)
  ]);

  const errors = [];
  if (rawResult.status === 'rejected') errors.push(formatError(query, RAW_PATH, rawResult.reason));
  if (fullResult.status === 'rejected') errors.push(formatError(query, FULL_PATH, fullResult.reason));

  return {
    q: query,
    results: [rawResult, fullResult]
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value),
    errors
  };
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
