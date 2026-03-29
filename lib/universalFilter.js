// lib/universalFilter.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

/**
 * Gemini API 호출 함수
 */
async function callGemini(prompt) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite",
    generationConfig: { 
      responseMimeType: "application/json"
    }
  });

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    const text = response.text();
    // 머리말/꼬리말 제거 로직 강화
    const cleanText = text.replace(/```json|```/g, '').trim();
    
    return safeJsonParse(cleanText);
    
  } catch (err) {
    console.error("Gemini API Error:", err);
    throw err;
  }
}

/**
 * 도우미 함수들
 */
function safeJsonParse(text) {
  try {
    const clean = String(text || '').replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : clean);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return { results: [] };
  }
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function numericPrice(item) {
  if (typeof item?.lprice === 'number' && !Number.isNaN(item.lprice)) {
    return item.lprice;
  }
  const text = String(item?.priceText || item?.price || '').replace(/[^\d]/g, '');
  return text ? Number(text) : 0;
}

function getMedianPrice(items) {
  const prices = (items || [])
    .map(numericPrice)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  if (!prices.length) return 0;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
}

function detectTargetCategory(query) {
  const q = String(query || '').toLowerCase();
  if (q.includes('유모차') || q.includes('stroller')) return 'stroller';
  if (q.includes('공기청정기') || q.includes('air purifier')) return 'air_purifier';
  if (q.includes('프린터') || q.includes('printer')) return 'printer';
  if (q.includes('이어폰') || q.includes('헤드폰') || q.includes('에어팟')) return 'audio';
  if (q.includes('선풍기') || q.includes('fan')) return 'fan';
  return 'generic';
}

function detectTargetRole(query) {
  const q = String(query || '').toLowerCase();
  const accessoryWords = ['액세서리', '악세사리', '부품', '케이스', '커버', '컵홀더', '거치대', '필터', '이어팁'];
  return accessoryWords.some(word => q.includes(word)) ? 'accessory' : 'main_product';
}

function getMergedSignals(category, name) {
  const text = String(name || '').toLowerCase();
  const accessoryWords = ['컵홀더', '홀더', '커버', '필터', '케이스', '이어팁', '부품', '부속', '스트랩'];
  const decorWords = ['모형', '미니어처', '장난감', '피규어', '인형', '소품'];
  return {
    looksAccessory: accessoryWords.some(word => text.includes(word)),
    looksDecorToy: decorWords.some(word => text.includes(word)),
    looksSibling: false,
    looksBundle: text.includes('세트') || text.includes('묶음'),
    looksToyLike: text.includes('장난감') || text.includes('토이')
  };
}

function getReferenceMedianPrice(items, category) {
  const plausibleMainPrices = (items || [])
    .filter(item => {
      const s = getMergedSignals(category, item.name);
      return !s.looksAccessory && !s.looksDecorToy;
    })
    .map(numericPrice)
    .filter(v => v > 0);
  return getMedianPrice(plausibleMainPrices.length ? plausibleMainPrices : items);
}

function getPriceSuspicion(item, medianPrice, targetRole) {
  if (targetRole !== 'main_product' || !medianPrice) return { suspicious: false, hardReject: false, ratio: 1 };
  const price = numericPrice(item);
  const ratio = price / medianPrice;
  return { suspicious: ratio < 0.25, hardReject: ratio < 0.15, ratio };
}

/**
 * 프롬프트 빌더 (수정됨)
 */
function buildPrompt(query, items, category, medianPrice) {
  return `쇼핑 검색 필터 AI입니다. 

사용자 질문: "${query}"
카테고리: ${category}
본품 참고 가격: ${medianPrice}원

[판단 지침]
1. 본품 요청 시 확실한 액세서리(컵홀더, 필터, 케이스 등)만 제외하세요.
2. "맘카페 반응 좋은", "추천" 등의 키워드가 있다면 리뷰가 많거나 유명 브랜드 제품을 우선적으로 포함(keep: true)하세요.
3. 확실한 장난감이나 모형이 아니라면, 가급적 사용자에게 결과를 보여줄 수 있도록 긍정적으로 판단하세요.
4. 출력은 반드시 아래 JSON 형식을 따르세요.

[출력 형식]
{
  "results": [
    { "id": "상품ID", "keep": true, "reason": "이유" }
  ]
}

후보 목록:
${JSON.stringify(items, null, 2)}
`;
}

/**
 * 메인 필터 함수
 */
async function applyUniversalAIFilter({ query, items }) {
  const category = detectTargetCategory(query);
  const targetRole = detectTargetRole(query);
  
  const sliced = (items || []).slice(0, 16).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    lprice: numericPrice(item),
    store: stripHtml(item.store || '')
  }));

  const medianPrice = getReferenceMedianPrice(sliced, category);

  try {
    const prompt = buildPrompt(query, sliced, category, medianPrice);
    const parsed = await callGemini(prompt);
    
    // 결과가 비어있을 경우 대비
    if (!parsed.results || parsed.results.length === 0) {
      return { filteredItems: items.slice(0, 10), rejectedItems: [], debug: { mode: 'fallback_empty' } };
    }

       // 1. AI가 골라준 아이템 필터링
    let filteredItems = (items || []).filter(item => {
      const r = (parsed.results || []).find(res => String(res.id) === String(item.id));
      if (!r) return false;
      
      const priceCheck = getPriceSuspicion(item, medianPrice, targetRole);
      if (priceCheck.hardReject) return false;
      
      return r.keep === true;
    });

    // 2. [핵심 수정] 만약 결과가 0개라면 '?' 방지를 위해 강제로 5개 추출
    if (!filteredItems || filteredItems.length === 0) {
      filteredItems = (items || []).slice(0, 5); 
    }

    const rejectedItems = (items || []).filter(item => !filteredItems.some(f => f.id === item.id))
      .map(item => ({ id: item.id, name: item.name, reason: 'AI 판단 제외' }));

    return {
      filteredItems: filteredItems,
      rejectedItems,
      debug: { mode: 'gemini', targetRole, medianPrice }
    };

  } catch (err) {
    console.error("Filter Error, using fallback:", err);
    return { filteredItems: items.slice(0, 10), rejectedItems: [], debug: { mode: 'error_fallback' } };
  }
}

module.exports = { applyUniversalAIFilter };
