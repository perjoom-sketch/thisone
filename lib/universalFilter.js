const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

/**
 * Gemini API 호출 함수 (비동기 처리 수정)
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
    
    // [핵심 수정] .text()는 비동기 함수이므로 await가 반드시 필요합니다.
    const text = await response.text(); 
    
    const cleanText = text.replace(/```json|```/g, '').trim();
    return safeJsonParse(cleanText);
  } catch (err) {
    console.error("Gemini Error:", err);
    return { results: [] };
  }
}

function safeJsonParse(text) {
  try {
    const clean = String(text || '').trim();
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

/**
 * 메인 필터 함수
 */
async function applyUniversalAIFilter({ query, items }) {
  // 입력값이 없을 때 대비
  if (!items || items.length === 0) return { filteredItems: [], debug: { count: 0 } };

  const sliced = items.slice(0, 20).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    lprice: item.lprice
  }));

  const prompt = `쇼핑 필터 AI입니다. 질문: "${query}"
  
[지침]
1. 사용자가 찾는 '본체' 상품을 최대한 많이 'keep: true'로 분류하세요.
2. 부품, 액세서리, 소모품은 제외하되, 판단이 모호하면 사용자가 선택할 수 있게 포함(true)하세요.
3. 결과는 반드시 {"results": [{"id": "1", "keep": true}, ...]} 형식의 JSON으로만 답하세요.

상품 목록:
${JSON.stringify(sliced)}`;

  try {
    const parsed = await callGemini(prompt);
    
    // AI 판단 결과 적용
    let filteredItems = items.filter(item => {
      const r = (parsed.results || []).find(res => String(res.id) === String(item.id));
      return r ? r.keep === true : false;
    });

    // [안전장치] AI 필터 결과가 5개 미만이면 '?' 방지를 위해 원본 상위 10개를 노출
    if (!filteredItems || filteredItems.length < 5) {
      filteredItems = items.slice(0, 10);
    }

    return {
      filteredItems,
      debug: { count: filteredItems.length, mode: filteredItems.length < 5 ? 'fallback' : 'ai' }
    };
  } catch (err) {
    console.error("Filter process error:", err);
    return { filteredItems: items.slice(0, 10) };
  }
}

module.exports = { applyUniversalAIFilter };
