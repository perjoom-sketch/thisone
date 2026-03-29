const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function callGemini(prompt) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite",
    generationConfig: { responseMimeType: "application/json" }
  });
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text(); 
    const cleanText = text.replace(/```json|```/g, '').trim();
    return safeJsonParse(cleanText);
  } catch (err) {
    return { results: [] };
  }
}

function safeJsonParse(text) {
  try {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch (e) { return { results: [] }; }
}

function stripHtml(text) { return String(text || '').replace(/<[^>]*>/g, '').trim(); }

/**
 * 메인 필터 함수
 */
async function applyUniversalAIFilter({ query, items }) {
  if (!items || items.length === 0) return { filteredItems: [], debug: { count: 0 } };

  // AI에게 보낼 데이터 (가격 정보를 명시하여 저가형 액세서리 구분 유도)
  const sliced = items.slice(0, 20).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    lprice: item.lprice,
    priceFormatted: Number(item.lprice).toLocaleString() + "원"
  }));

  const prompt = `쇼핑 큐레이터 AI입니다. 질문: "${query}"
  
[필터링 절대 규칙]
1. 사용자는 "본체 제품"을 찾고 있습니다. 
2. **액세서리(컵홀더, 커버, 필터, 케이스, 스트랩, 부품)**는 무조건 'keep: false' 처리하세요.
3. 특히 가격이 다른 제품들에 비해 현저히 낮은 것(예: 유모차인데 1~2만원대)은 99% 액세서리이므로 제외하세요.
4. "유모차", "공기청정기", "에어팟" 등 핵심 단어가 들어간 "완제품"만 'keep: true'로 만드세요.
5. 결과는 반드시 JSON {"results": [{"id": "상품ID", "keep": true/false}]} 형식으로만 출력하세요.

상품 목록:
${JSON.stringify(sliced)}`;

  try {
    const parsed = await callGemini(prompt);
    
    let filteredItems = items.filter(item => {
      const r = (parsed.results || []).find(res => String(res.id) === String(item.id));
      return r ? r.keep === true : false;
    });

    // 만약 AI가 너무 다 쳐내서 2개 미만이라면, 최소한의 검색 결과 보장 (fallback)
    if (!filteredItems || filteredItems.length < 2) {
      filteredItems = items.slice(0, 8);
    }

    return {
      filteredItems,
      debug: { count: filteredItems.length, mode: filteredItems.length < 2 ? 'fallback' : 'ai' }
    };
  } catch (err) {
    return { filteredItems: items.slice(0, 8) };
  }
}

module.exports = { applyUniversalAIFilter };
