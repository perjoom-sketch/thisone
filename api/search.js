// api/search.js - 유모차 같은 자연어 검색 개선 버전

function stripTags(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function normalizeSpaces(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeHouseholdQuery(query) {
  let q = normalizeSpaces(query);

  // 진단기 PR #47에서 확인한 생활용품 검색어 보정.
  // 실제 검색 API에도 동일하게 적용해야 진단 결과와 검색 결과가 어긋나지 않는다.
  q = q.replace(/김\s*서방\s*마스크/g, '김서방 마스크');
  q = q.replace(/김서방마스크/g, '김서방 마스크');

  if (/(화장지|휴지)/.test(q)) {
    q = q.replace(/휴지/g, '화장지');
    q = q.replace(/(\d+)\s*겹/g, '$1겹');
    q = q.replace(/(\d+)\s*m/gi, '$1m');
    q = q.replace(/(\d+)\s*롤/g, '$1롤');

    const hasThreePly = /3겹/.test(q);
    const hasThirtyMeter = /30m/i.test(q);
    const hasThirtyRoll = /30롤/.test(q);

    if (hasThreePly && hasThirtyMeter && hasThirtyRoll) {
      q = '3겹 화장지 30m 30롤';
    }
  }

  return normalizeSpaces(q);
}

// 자연어 쿼리를 네이버 쇼핑에 잘 맞는 키워드로 변환
function improveQuery(originalQuery) {
  let q = normalizeHouseholdQuery(String(originalQuery || '').trim());

  // 유모차 관련 키워드 보강
  if (q.includes('유모차') || q.includes('맘카페') || q.includes('유아차')) {
    q = q.replace(/맘카페 반응 좋은|맘카페 추천|인기|좋은/g, '');
    q = '유모차 ' + q.trim();
    
    // 맘카페 추천 의도가 강할 때 추가 키워드
    if (originalQuery.includes('맘카페')) {
      q = '유모차 추천 ' + q.replace('유모차 ', '');
    }
  }

  // 검색어에서 제외 기호 제거 (API 검색용)
  q = q.replace(/-[^\s]+/g, '');

  // 공기청정기/정수기/로봇청소기 등 가전 구독 트렌드 반영
  if (q.includes('공기청정기') || q.includes('정수기') || q.includes('건조기') || q.includes('로봇청소기')) {
    if (originalQuery.includes('렌탈') || originalQuery.includes('구독')) {
      q = q + ' 렌탈 구독 서비스';
    }
  }

  // 기타 흔한 자연어 정리
  q = q.replace(/유지비 포함|배송비 포함|가장 나은|가장 좋은/g, '');

  return normalizeSpaces(q);
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

    const start = parseInt(req.query.start || '1');
    const display = parseInt(req.query.display || '30');
    const sort = req.query.sort || 'sim'; // 기본값: 관련도순(sim)

    // 네이버 쇼핑 API 호출
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(improvedQ)}&display=${display}&start=${start}&sort=${sort}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
        },
        signal: controller.signal
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        throw new Error('Naver Shopping API timeout');
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

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

    // 검색 결과 반환
    const finalItems = items;

    return res.status(200).json({
      query: q,
      improvedQuery: improvedQ,
      total: data.total || 0,
      items: finalItems
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
