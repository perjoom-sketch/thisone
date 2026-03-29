// api/chat.js - Gemini 2.5 Flash-Lite 최적화 버전
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages = [], system = "", model: requestedModel } = req.body;

    // Gemini 초기화
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",   // 또는 "gemini-2.5-flash" 추천
      systemInstruction: system,        // ← 시스템 프롬프트 제대로 전달
      generationConfig: {
        responseMimeType: "application/json",   // ← 핵심!
        temperature: 0.2,                       // JSON 안정성을 위해 낮춤
        // thinkingBudget: 0,                   // 비용 더 아끼고 싶을 때 주석 해제
      }
    });

    // 마지막 메시지 (후보 상품 목록 포함)
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      throw new Error("Invalid message format");
    }

    // Gemini에 전달할 contents 배열 (멀티모달 대비 구조 유지)
    const contents = [{
      role: "user",
      parts: Array.isArray(lastMessage.content) 
        ? lastMessage.content 
        : [{ text: lastMessage.content }]
    }];

    // Structured Output Schema 정의 (JSON 강제력 대폭 상승)
    const responseSchema = {
      type: "object",
      properties: {
        aiPickSourceType: {
          type: "string",
          enum: ["price", "review", "popular", "trust"],
          description: "AI가 최종적으로 가장 추천하는 카테고리"
        },
        cards: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["price", "review", "popular", "trust"] },
              label: { type: "string" },
              sourceId: { type: "string" },
              reason: { type: "string", minLength: 10 }
            },
            required: ["type", "label", "sourceId", "reason"]
          }
        },
        rejects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              reason: { type: "string" }
            }
          }
        }
      },
      required: ["aiPickSourceType", "cards"]
    };

    const result = await model.generateContent({
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,   // ← 가장 강력한 JSON 강제
        temperature: 0.2
      }
    });

    const responseText = result.response.text();
    
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("JSON Parse Failed:", responseText);
      throw new Error("Failed to parse Gemini JSON response");
    }

    // 프론트엔드와 호환되도록 Anthropic-like 구조로 반환
    return res.status(200).json({
      content: [{ type: "text", text: JSON.stringify(parsed) }], // 안전하게 stringify
      role: "assistant"
    });

  } catch (err) {
    console.error("Gemini Chat API Error:", err);
    
    return res.status(500).json({
      error: 'Gemini API error',
      detail: err.message || 'Internal server error',
      // 디버깅용으로 원문 추가 (개발 중에만)
      // raw: err.response?.text ? await err.response.text() : null
    });
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 60,
};
