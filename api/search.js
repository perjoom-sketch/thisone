// api/search.js

const { applyUniversalAIFilter } = require('../lib/universalFilter');

function stripTags(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const q = String(req.query.q || req.query.query || '').trim();

    if (!q) {
      return res.status(400).json({ error: '검색어가 없습니다.' });
    }

    const url =
      `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(q)}&display=20&start=1&sort=sim`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Naver Shopping API error',
        detail: text
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({
        error: '네이버 응답 JSON 파싱 실패',
        detail: text
      });
    }

    let items = (data.items || []).map((item, idx) => ({
      id: String(idx + 1),
      name: stripTags(item.title),
      link: item.link || '',
      image: item.image || '',
      lprice: Number(item.lprice || 0),
      priceText: item.lprice ? `${Number(item.lprice).toLocaleString('ko-KR')}원` : '',
      store: stripTags(item.mallName || ''),
      productId: item.productId || ''
    }));

    const filterResult = await applyUniversalAIFilter({
      query: q,
      items
    });

    items = filterResult.filteredItems.length
      ? filterResult.filteredItems
      : items.slice(0, 10);

    return res.status(200).json({
      query: q,
      total: data.total || 0,
      items,
      filterDebug: filterResult.debug,
      rejectedItems: filterResult.rejectedItems
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Server error'
    });
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 30
};
