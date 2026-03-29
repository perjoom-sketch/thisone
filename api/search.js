// api/search.js - 유모차 같은 자연어 검색 개선 버전
const { applyUniversalAIFilter } = require('../lib/universalFilter');

function stripTags(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

// 자연어 쿼리를 네이버 쇼핑에 잘 맞는 키워드로 변환
function improveQuery(originalQuery) {
  let q = String(originalQuery || '').trim();

  // 유모차 관련 키워드 보강
  if (q.includes('유모차') || q.includes('맘카페') || q.includes('유아차')) {
    q = q.replace(/맘카페 반응 좋은|맘카페 추천|인기|좋은/g, '');
    q = '유모차 ' + q.trim();
    
    // 맘카페 추천 의도가 강할 때 추가 키워드
    if (originalQuery.includes('맘카페')) {
      q = '유모차 추천 ' + q.replace('유모차 ', '');
    }
  }

  // 기타 흔한 자연어 정리 (예: 산업용 선풍기 등)
  q = q.replace(/유지비 포함|배송비 포함|가장 나은|가장 좋은/g, '');

  return q.trim();
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    let q = String(req.query.q || req.query.query || '').trim();

    if (!q) {
      return res.status(400).json({ error: '검색어가 없습니다.' });
    }

    // 쿼리 개선 (가장 중요한 부분)
    const improvedQ = improveQuery(q);
    console.log(`[Search] 원본: "${q}" → 개선: "${improvedQ}"`);

    // 네이버 쇼핑 API 호출 (display=30으로 줄여서 속도 향상)
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(improvedQ)}&display=30&start=1&sort=sim`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
      }
    });

    const text = await response.text();

    if (!response.ok) {
      console.error('Naver API Error:', text);
      return res.status(response.status).json({
        error: 'Naver Shopping API error',
        detail: text
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: '네이버 응답 JSON 파싱 실패' });
    }

    // 기본 아이템 리스트
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
      query: q,           // 원본 쿼리 (의도 파악용)
      items: items
    });

    let finalItems = [];
    if (filterResult && filterResult.filteredItems && filterResult.filteredItems.length > 0) {
      finalItems = filterResult.filteredItems.slice(0, 10); // 최대 10개
    } else {
      // 필터 실패 시 안전하게 상위 상품 사용
      finalItems = items.slice(0, 10);
    }

    return res.status(200).json({
      query: q,
      improvedQuery: improvedQ,
      total: data.total || 0,
      items: finalItems,
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
