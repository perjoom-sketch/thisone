// api/search.js - 유모차 같은 자연어 검색 개선 버전

const { applyUniversalAIFilter } = require('../lib/universalFilter');

function stripTags(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function normalizeSpaces(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeUnits(text) {
  return normalizeSpaces(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[㎏]/g, 'kg')
    .replace(/[Ｋｋ][Ｇｇ]/g, 'kg')
    .replace(/(\d+)\s*(kg|g|ml|l|m)\b/gi, '$1$2')
    .replace(/(\d+)\s*겹/g, '$1겹')
    .replace(/(\d+)\s*롤/g, '$1롤')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHouseholdQuery(query) {
  let q = normalizeUnits(query);

  q = q.replace(/김\s*서방\s*마스크/g, '김서방 마스크');
  q = q.replace(/김서방마스크/g, '김서방 마스크');

  if (/(화장지|휴지|두루마리)/.test(q)) {
    q = q.replace(/두루마리\s*휴지|두루마리휴지|휴지/g, '화장지');

    const hasThreePly = /3겹/.test(q);
    const hasThirtyMeter = /30m/i.test(q);
    const hasThirtyRoll = /30롤/.test(q);

    if (hasThreePly && hasThirtyMeter && hasThirtyRoll) {
      q = '3겹 화장지 30m 30롤';
    }
  }

  if (/로얄\s*캐닌|로얄캐닌|royal\s*canin/i.test(q)) {
    q = q
      .replace(/로얄\s*캐닌/gi, '로얄캐닌')
      .replace(/하이포\s*알러제닉/gi, '하이포알러제닉')
      .replace(/hypoallergenic/gi, '하이포알러제닉');

    if (/로얄캐닌/.test(q) && /하이포알러제닉/.test(q) && /2kg/i.test(q)) {
      q = '로얄캐닌 하이포알러제닉 2kg';
    }
  }

  return normalizeSpaces(q);
}

function shouldUseUniversalFilter(query) {
  const q = String(query || '').toLowerCase();

  // UniversalFilter는 본품/액세서리/렌탈/소모품이 섞이기 쉬운 검색어에만 사용한다.
  // 안전화, 화장지, 사료처럼 기본 키워드 검색까지 AI 필터를 태우면 결과가 과하게 사라질 수 있다.
  const ambiguousMainProductWords = [
    '마스크', '김서방', 'kf94', 'kf80', '비말',
    '유모차', '카시트',
    '로보락', '로봇청소기', '청소기',
    '공기청정기', '정수기', '프린터', '복합기',
    '에어랩', '다이슨', '면도기', '밥솥'
  ];

  const explicitRiskWords = [
    '필터', '토너', '잉크', '리필', '교체', '교체용', '호환',
    '부품', '부속', '소모품', '렌탈', '대여', '약정', '가입',
    '판촉', '주문제작', '인쇄'
  ];

  return ambiguousMainProductWords.some(word => q.includes(word)) ||
    explicitRiskWords.some(word => q.includes(word));
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

    let finalItems = items;
    let rejectedItems = [];
    let universalFilterDebug = {
      mode: 'skipped',
      reason: 'basic_keyword_search'
    };

    if (shouldUseUniversalFilter(q)) {
      const universalResult = await applyUniversalAIFilter({
        query: q,
        items
      });

      if (Array.isArray(universalResult.filteredItems) && universalResult.filteredItems.length > 0) {
        finalItems = universalResult.filteredItems;
      }

      rejectedItems = universalResult.rejectedItems || [];
      universalFilterDebug = universalResult.debug || null;

      // 필터가 전부 날려버리면 검색 실패로 보이므로 원본 결과를 살린다.
      if ((!finalItems || finalItems.length === 0) && items.length > 0) {
        finalItems = items;
        universalFilterDebug = {
          ...(universalFilterDebug || {}),
          mode: `${universalFilterDebug?.mode || 'unknown'}_fail_open`,
          reason: 'filter_returned_empty_restore_raw_items'
        };
      }
    }

    return res.status(200).json({
      query: q,
      improvedQuery: improvedQ,
      total: data.total || 0,
      items: finalItems,
      rejectedItems,
      universalFilterDebug
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
