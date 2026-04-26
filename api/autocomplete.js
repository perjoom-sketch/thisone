function normalizeString(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

function extractFromItem(item) {
  if (Array.isArray(item)) {
    return extractFromItem(item[0]);
  }

  if (typeof item === 'string') {
    return normalizeString(item);
  }

  if (item && typeof item === 'object') {
    const keys = ['keyword', 'query', 'value', 'text'];
    for (const key of keys) {
      if (typeof item[key] === 'string') {
        return normalizeString(item[key]);
      }
    }
  }

  return '';
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractAutocompleteItems(payload) {
  const candidates = [];

  const itemRoots = [
    toArray(payload?.items?.[0]),
    toArray(payload?.items),
    toArray(payload?.result),
    toArray(payload?.suggestions)
  ];

  itemRoots.forEach((root) => {
    root.forEach((item) => {
      const extracted = extractFromItem(item);
      if (extracted) candidates.push(extracted);
    });
  });

  return [...new Set(candidates)].slice(0, 10);
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

function parseDebugFlag(value) {
  if (Array.isArray(value)) return value[0] === '1';
  return value === '1';
}

function buildResponse(items, debugEnabled, debugInfo) {
  if (!debugEnabled) {
    return { items };
  }

  return {
    items,
    source: debugInfo.source || null,
    status: debugInfo.status || null,
    rawType: debugInfo.rawType || null,
    itemCount: typeof debugInfo.itemCount === 'number' ? debugInfo.itemCount : 0,
    error: debugInfo.error || null
  };
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

  const debugEnabled = parseDebugFlag(req.query.debug);
  const endpoints = [
    {
      source: 'shopping',
      url: `https://ac.shopping.naver.com/ac?q=${encodeURIComponent(q)}&q_enc=UTF-8&st=11100&r_format=json&r_enc=UTF-8&r_unicode=0&r_lt=11100&rev=4&frm=NVSCNAS`
    },
    {
      source: 'search',
      url: `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(q)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100`
    }
  ];

  const baseHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    Accept: 'application/json,text/plain,*/*',
    Referer: 'https://search.shopping.naver.com/'
  };

  const debugInfo = {
    source: null,
    status: null,
    rawType: null,
    itemCount: 0,
    error: null
  };

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint.url, {
        method: 'GET',
        headers: baseHeaders
      }, 4000);

      debugInfo.source = endpoint.source;
      debugInfo.status = response.status;

      if (!response.ok) {
        debugInfo.error = `HTTP ${response.status}`;
        continue;
      }

      const payload = await response.json();
      const items = extractAutocompleteItems(payload);
      debugInfo.rawType = Array.isArray(payload) ? 'array' : typeof payload;
      debugInfo.itemCount = items.length;
      debugInfo.error = null;

      return res.status(200).json(buildResponse(items, debugEnabled, debugInfo));
    } catch (error) {
      debugInfo.source = endpoint.source;
      debugInfo.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  return res.status(200).json(buildResponse([], debugEnabled, debugInfo));
}

module.exports = handler;
module.exports.config = {
  maxDuration: 10
};
