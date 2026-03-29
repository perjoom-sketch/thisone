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

  // 50개 중 상위 40개를 분석 대상으로 확대
  const sliced = items.slice(0, 40).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    lprice: item.lprice
  }));

  const prompt = `쇼핑 전문가 AI입니다. 질문: "${query}"
  
[지침]
1. 사용자가 다양한 선택을 할 수 있도록 **서로 다른 브랜드나 모델의 '본체' 상품을 최소 10개 이상** 선정하세요.
2. 특정 모델 하나가 도배되지 않도록 모델명이 중복되면 가장 적절한 하나만 남기세요.
3. 컵홀더, 비닐커버, 바퀴 등 '액세서리'는 무조건 배제하세요. (가격이 너무 싼 것은 의심하세요)
4. 결과는 반드시 JSON {"results": [{"id": "1", "keep": true}, ...]} 형식으로 답하세요.

상품 목록:
${JSON.stringify(sliced)}`;

  try {
    const parsed = await callGemini(prompt);
    
    // AI 판단 적용
    let filteredItems = items.filter(item => {
      const r = (parsed.results || []).find(res => String(res.id) === String(item.id));
      return r ? r.keep === true : false;
    });

    // 만약 필터 결과가 5개 미만이면, 원본에서 이름에 '유모차'가 들어간 본체급 가격 상품들을 강제로 끼워넣음
    if (filteredItems.length < 5) {
      filteredItems = items.filter(item => 
        (item.name.includes('유모차') || item.name.includes('에어팟')) && item.lprice > 50000
      ).slice(0, 15);
    }

    return { filteredItems, debug: { count: filteredItems.length } };
  } catch (err) {
    return { filteredItems: items.slice(0, 10) };
  }
}

module.exports = { applyUniversalAIFilter };
