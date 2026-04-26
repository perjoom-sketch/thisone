function normalizeString(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

function collectCandidates(node, bucket) {
  if (!node) return;

  if (typeof node === 'string') {
    const cleaned = normalizeString(node);
    if (cleaned) bucket.push(cleaned);
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectCandidates(item, bucket));
    return;
  }

  if (typeof node === 'object') {
    ['keyword', 'text', 'value', 'name', 'title'].forEach((key) => {
      if (typeof node[key] === 'string') {
        const cleaned = normalizeString(node[key]);
        if (cleaned) bucket.push(cleaned);
      }
    });

    Object.values(node).forEach((item) => collectCandidates(item, bucket));
  }
}

function extractAutocompleteItems(payload, query) {
  const raw = [];
  collectCandidates(payload, raw);

  const normalizedQuery = normalizeString(query);
  const filtered = raw
    .filter((item) => item.length >= 2)
    .filter((item) => (normalizedQuery ? item.includes(normalizedQuery) : true));

  return [...new Set(filtered)].slice(0, 10);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ items: [] });

  const q = normalizeString(req.query.q);
  if (q.length < 2) {
    return res.status(200).json({ items: [] });
  }

  try {
    const endpoint = `https://ac.shopping.naver.com/ac?frm=nv&query=${encodeURIComponent(q)}`;
    const response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*'
      }
    }, 4000);

    if (!response.ok) {
      return res.status(200).json({ items: [] });
    }

    const payload = await response.json();
    const items = extractAutocompleteItems(payload, q);
    return res.status(200).json({ items });
  } catch (_) {
    return res.status(200).json({ items: [] });
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.config = {
  maxDuration: 10
};
