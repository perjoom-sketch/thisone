// api/search.js
const { applyUniversalAIFilter } = require('../lib/universalFilter');

function stripTags(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

async function handler(req, res) {
  // CORS 설정
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

    // 네이버 쇼핑 API 호출
const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(q)}&display=50&start=1&sort=sim`;

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

    // 기본 아이템 리스트 생성
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

    // AI 필터 적용
    const filterResult = await applyUniversalAIFilter({
      query: q,
      items
    });

    // [핵심 수정] 결과값 안전장치 강화
    let finalItems = [];
    if (filterResult && filterResult.filteredItems && filterResult.filteredItems.length > 0) {
      // AI가 성공적으로 필터링한 경우
      finalItems = filterResult.filteredItems;
    } else {
      // AI 필터 결과가 없거나 오류 시, 원본 데이터 상위 10개를 안전하게 보여줌
      finalItems = items.slice(0, 10);
    }

    return res.status(200).json({
      query: q,
      total: data.total || 0,
      items: finalItems, // 확정된 리스트 반환
      filterDebug: filterResult ? filterResult.debug : 'no_debug',
      rejectedItems: filterResult ? filterResult.rejectedItems : []
    });

  } catch (err) {
    console.error("Search Handler Error:", err);
    return res.status(500).json({
      error: err.message || 'Server error'
    });
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 30
};
