async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ items: [] });

  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) return res.status(200).json({ items: [] });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const url = `https://ac.shopping.naver.com/ac?q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'accept': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(200).json({ items: [] });
    }

    const data = await response.json().catch(() => null);
    const rawItems = data?.items?.[0];
    if (!Array.isArray(rawItems)) {
      return res.status(200).json({ items: [] });
    }

    const seen = new Set();
    const items = rawItems
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (Array.isArray(item)) return String(item[0] || '').trim();
        if (item && typeof item === 'object') return String(item[0] || item.keyword || item.text || '').trim();
        return '';
      })
      .filter((keyword) => {
        if (!keyword) return false;
        const key = keyword.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10);

    return res.status(200).json({ items });
  } catch (_) {
    return res.status(200).json({ items: [] });
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 10
};
