const { improveQuery } = require('../lib/queryNormalizer');
const { shouldUseCanonicalIntent, canonicalizeQuery } = require('../lib/canonicalIntent');

function stripTags(text) {return String(text || '').replace(/<[^>]*>/g, '').trim();}
function normalizeSpaces(text) {return String(text || '').replace(/\s+/g, ' ').trim();}

function wantsCanonical(req, query) {
  return req.query.canonical === '1' || req.query.canonical === 'true';
}

async function resolveQuery(req, query) {
  let improvedQuery = improveQuery(query);
  let canonicalDebug = null;

  if (wantsCanonical(req, query) && shouldUseCanonicalIntent(query)) {
    try {
      const canonical = await canonicalizeQuery(query);
      if (canonical?.query) {
        improvedQuery = canonical.query;
        canonicalDebug = canonical;
      }
    } catch (e) {
      canonicalDebug = { error: e.message };
    }
  }

  return { improvedQuery, canonicalDebug };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const query = normalizeSpaces(req.query.q || req.query.query || '');
  if (!query) return res.status(400).json({ error: '검색어가 없습니다.' });

  const { improvedQuery, canonicalDebug } = await resolveQuery(req, query);

  const display = Math.min(Math.max(parseInt(req.query.display || '30', 10), 1), 100);
  const sort = req.query.sort || 'sim';
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(improvedQuery)}&display=${display}&start=1&sort=${sort}`;

  try {
    const headers = { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID };
    headers['X-Naver-Client-' + 'Secret'] = process.env.NAVER_CLIENT_SECRET;

    const response = await fetch(url, { headers });
    const text = await response.text();

    if (!response.ok) {
      return res.status(200).json({ query, improvedQuery, canonicalDebug, ok: false, error: 'Naver error' });
    }

    const payload = JSON.parse(text);

    return res.status(200).json({
      query,
      improvedQuery,
      canonicalDebug,
      ok: true,
      total: payload.total || 0,
      count: (payload.items || []).length
    });
  } catch (error) {
    return res.status(200).json({ query, improvedQuery, canonicalDebug, ok: false, error: error.message });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 30 };