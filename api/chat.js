// api/chat.js - 이번에 가장 단순하고 안전한 버전
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

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

    // 마지막 메시지 가져오기
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      throw new Error("메시지가 없습니다.");
    }

    // Gemini가 기대하는 가장 단순한 형식으로 변경 (이게 핵심!)
    const userContent = typeof lastMessage.content === "string" 
      ? lastMessage.content 
      : JSON.stringify(lastMessage.content);

    const result = await model.generateContent(userContent);

    const responseText = result.response.text();

    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (e) {
      console.error("JSON 파싱 실패:", responseText.substring(0, 300));
      throw new Error("AI가 올바른 답변을 주지 않았습니다.");
    }

    // 프론트엔드가 이해할 수 있게 반환
    return res.status(200).json({
      content: [{ type: "text", text: JSON.stringify(parsedData) }],
      role: "assistant"
    });

  } catch (err) {
    console.error("Gemini Error:", err.message);
    return res.status(500).json({
      error: 'Gemini API 오류',
      detail: err.message || '서버에서 문제가 발생했습니다.'
    });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
