// api/chat.js - 수정된 버전 (에러 해결)
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function handler(req, res) {
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

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction: system,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    // 마지막 메시지 (후보 상품 목록이 들어있는 부분)
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      throw new Error("메시지가 올바르지 않습니다.");
    }

    // Gemini가 기대하는 정확한 형식으로 수정
    let parts = [];
    if (typeof lastMessage.content === "string") {
      parts = [{ text: lastMessage.content }];
    } else if (Array.isArray(lastMessage.content)) {
      parts = lastMessage.content;
    }

    const contents = [{ parts: parts }];

    // JSON Schema (AI가 정확한 답변 형식으로 주도록 강제)
    const responseSchema = {
      type: "object",
      properties: {
        aiPickSourceType: { type: "string", enum: ["price", "review", "popular", "trust"] },
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

    const result = await model.generateContent({
      contents: contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.1
      }
    });

    const responseText = result.response.text();

    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (e) {
      console.error("JSON 파싱 실패:", responseText);
      throw new Error("AI 응답을 읽을 수 없습니다.");
    }

    return res.status(200).json({
      content: [{ type: "text", text: JSON.stringify(parsedData) }],
      role: "assistant"
    });

  } catch (err) {
    console.error("Gemini Chat Error:", err.message);
    return res.status(500).json({
      error: 'Gemini API 오류',
      detail: err.message || '서버 오류'
    });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
