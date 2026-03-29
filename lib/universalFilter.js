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
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (err) { return { results: [] }; }
}

function stripHtml(text) { return String(text || '').replace(/<[^>]*>/g, '').trim(); }

async function applyUniversalAIFilter({ query, items }) {
  if (!items || items.length === 0) return { filteredItems: [], debug: { count: 0 } };

  // 상위 40개를 분석하여 중복 모델을 피하고 본체만 추출
  const sliced = items.slice(0, 40).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    lprice: item.lprice
  }));

  const prompt = `쇼핑 큐레이터 AI입니다. 질문: "${query}"
  
[필터 규칙]
1. 반드시 '완제품(본체)'만 선택하세요. (컵홀더, 한쪽 유닛, 케이스, 필터 등 소모품/부품 절대 금지)
2. 사용자가 비교할 수 있게 **서로 다른 브랜드나 모델명을 가진 상품을 최소 10개** 선정하세요.
3. 동일한 모델이 여러 개 있다면 가장 적절한 가격의 하나만 남기세요.
4. 결과 JSON: {"results": [{"id": "1", "keep": true}, ...]} `;

  try {
    const parsed = await callGemini(prompt);
    
    let filteredItems = items.filter(item => {
      const r = (parsed.results || []).find(res => String(res.id) === String(item.id));
      return r ? r.keep === true : false;
    });

    // [안전장치] AI 결과가 4개 미만이면 '?' 방지를 위해 본체급 가격 상품 강제 노출
    if (filteredItems.length < 4) {
      filteredItems = items.filter(item => {
        const price = Number(item.lprice);
        // 유모차/청정기 등은 최소 5만원 이상, 에어팟 등은 10만원 이상인 것만 본체로 간주
        return price > 50000; 
      }).slice(0, 12);
    }

    return { filteredItems, debug: { count: filteredItems.length } };
  } catch (err) {
    return { filteredItems: items.slice(0, 10) };
  }
}

module.exports = { applyUniversalAIFilter };
