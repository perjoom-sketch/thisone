const { improveQuery } = require('../lib/queryNormalizer');

function stripTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function normalizeSpaces(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function classifyTitle(title, query) {
  const name = String(title || '').toLowerCase();
  const q = String(query || '').toLowerCase();
  const accessoryWords = [
    '필터', '호환', '리필', '교체', '부품', '소모품', '브러시', '브러쉬',
    '패드', '먼지봉투', '더스트백', '케이스', '커버', '충전기', '배터리'
  ];
  const rentalWords = ['렌탈', '대여', '구독'];
  const usedWords = ['중고', '리퍼', '전시'];

  const hits = [];
  if (accessoryWords.some((word) => name.includes(word)) && !accessoryWords.some((word) => q.includes(word))) {
    hits.push('accessory_suspect');
  }
  if (rentalWords.some((word) => name.includes(word)) && !rentalWords.some((word) => q.includes(word))) {
    hits.push('rental_suspect');
  }
  if (usedWords.some((word) => name.includes(word)) && !usedWords.some((word) => q.includes(word))) {
    hits.push('used_suspect');
  }

  return hits;
}

function summarizeItems(items, query) {
  const sample = items.slice(0, 12).map((item, index) => {
    const title = stripTags(item.title);
    return {
      rank: index + 1,
      title,
      category1: stripTags(item.category1 || ''),
      category2: stripTags(item.category2 || ''),
      category3: stripTags(item.category3 || ''),
      category4: stripTags(item.category4 || ''),
      brand: stripTags(item.brand || ''),
      maker: stripTags(item.maker || ''),
      mallName: stripTags(item.mallName || ''),
      lprice: Number(item.lprice || 0),
      productType: item.productType || '',
      productId: item.productId || '',
      flags: classifyTitle(title, query)
    };
  });

  const flagCounts = sample.reduce((acc, item) => {
    item.flags.forEach((flag) => {
      acc[flag] = (acc[flag] || 0) + 1;
    });
    return acc;
  }, {});

  return { sample, flagCounts };
}

function makeDiagnosis({ query, improvedQuery, total, itemCount, sampleSummary }) {
  const suspects = [];
  let status = 'ok';
  let message = 'raw results returned';

  if (!itemCount || Number(total || 0) === 0) {
    status = 'no_raw_results';
    message = 'Naver Shopping API returned no usable raw items';
    suspects.push('query_rewrite_needed');
  }

  if (query !== improvedQuery) suspects.push('query_rewritten');

  if (sampleSummary.flagCounts.accessory_suspect >= Math.max(3, Math.ceil(sampleSummary.sample.length / 2))) {
    suspects.push('accessory_dominant_results');
  }
  if (sampleSummary.flagCounts.rental_suspect > 0) suspects.push('rental_results_present');
  if (sampleSummary.flagCounts.used_suspect > 0) suspects.push('used_results_present');

  return { status, message, suspects };
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

  const improvedQuery = improveQuery(query);
  const display = Math.min(Math.max(parseInt(req.query.display || '30', 10), 1), 100);
  const sort = req.query.sort || 'sim';
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(improvedQuery)}&display=${display}&start=1&sort=${sort}`;

  try {
    const headers = {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID
    };
    headers['X-Naver-Client-' + 'Secret'] = process.env.NAVER_CLIENT_SECRET;

    const response = await fetch(url, { headers });
    const text = await response.text();

    if (!response.ok) {
      return res.status(200).json({
        query,
        improvedQuery,
        ok: false,
        upstreamStatus: response.status,
        error: 'Naver Shopping API error',
        detail: text.slice(0, 500)
      });
    }

    const payload = JSON.parse(text);
    const items = Array.isArray(payload.items) ? payload.items : [];
    const sampleSummary = summarizeItems(items, improvedQuery);
    const diagnosis = makeDiagnosis({
      query,
      improvedQuery,
      total: payload.total || 0,
      itemCount: items.length,
      sampleSummary
    });

    return res.status(200).json({
      query,
      improvedQuery,
      ok: true,
      sort,
      naver: {
        total: payload.total || 0,
        returnedItems: items.length
      },
      diagnosis,
      sample: sampleSummary.sample,
      flagCounts: sampleSummary.flagCounts
    });
  } catch (error) {
    return res.status(200).json({
      query,
      improvedQuery,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 30
};
