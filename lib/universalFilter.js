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

  const sliced = items.slice(0, 20).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    lprice: item.lprice
  }));

  const prompt = `쇼핑 큐레이터 AI입니다. 질문: "${query}"
  
[필터링 지침]
1. 사용자가 찾는 '완제품(본체)'을 최대한 많이 'keep: true'로 분류하세요.
2. 부품, 액세서리(컵홀더, 커버 등), 소모품은 제외하되, **판단이 모호하거나 여러 모델을 추천할 수 있다면 사용자가 선택할 수 있게 포함(true)하세요.**
3. 사용자가 다양한 종류의 본체를 비교해볼 수 있도록 최소 5개 이상의 상품을 선택하세요.
4. 결과는 반드시 JSON {"results": [{"id": "1", "keep": true}, ...]} 형식으로만 답하세요.

상품 목록:
${JSON.stringify(sliced)}`;

  try {
    const parsed = await callGemini(prompt);
    
    // AI 판단 결과 적용
    let filteredItems = items.filter(item => {
      const r = (parsed.results || []).find(res => String(res.id) === String(item.id));
      return r ? r.keep === true : false;
    });

    // [중요 수정] 결과가 너무 적으면(3개 미만) '?' 방지를 위해 원본 리스트 상위 10개를 강제로 노출
    if (!filteredItems || filteredItems.length < 3) {
      filteredItems = items.slice(0, 10);
    }

    return {
      filteredItems,
      rejectedItems: [],
      debug: { count: filteredItems.length, mode: filteredItems.length < 3 ? 'fallback' : 'ai' }
    };
  } catch (err) {
    return { filteredItems: items.slice(0, 10) };
  }
}

module.exports = { applyUniversalAIFilter };
