// api/chat.js
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
    const { messages = [], system = "" } = req.body;

    // Gemini 초기화
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction: system,                    // 시스템 프롬프트 제대로 전달
      generationConfig: {
        responseMimeType: "application/json",       // JSON 강제
        temperature: 0.1,                           // JSON 안정성을 위해 낮춤
      }
    });

    // 마지막 메시지 가져오기 (후보 상품 목록이 여기 들어있음)
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      throw new Error("메시지 형식이 잘못되었습니다.");
    }

    // Gemini에 보낼 내용
    const contents = [{
      role: "user",
      parts: [{ text: lastMessage.content }]
    }];

    // JSON Schema (강력하게 JSON 형식 강제)
    const responseSchema = {
      type: "object",
      properties: {
        aiPickSourceType: { 
          type: "string", 
          enum: ["price", "review", "popular", "trust"] 
        },
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              label: { type: "string" },
              sourceId: { type: "string" },
              reason: { type: "string" }
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

    // 실제 API 호출
    const result = await model.generateContent({
      contents: contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1
      }
    });

    const responseText = result.response.text();

    // JSON 파싱
    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSON 파싱 실패:", responseText);
      throw new Error("AI가 올바른 JSON을 반환하지 않았습니다.");
    }

    // 프론트엔드가 기존처럼 사용할 수 있도록 반환
    return res.status(200).json({
      content: [
        {
          type: "text",
          text: JSON.stringify(parsedData)   // 안전하게 문자열로 변환
        }
      ],
      role: "assistant"
    });

  } catch (err) {
    console.error("Gemini Chat Error:", err.message);
    
    return res.status(500).json({
      error: 'Gemini API 오류',
      detail: err.message || '서버 오류가 발생했습니다.'
    });
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 60,
};
