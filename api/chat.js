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
    // 1. Gemini 초기화 (Vercel 환경변수 사용)
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-lite" 
    });

    // 2. 클라이언트에서 보낸 메시지 추출
    // Anthropic 형식의 body를 Gemini 형식으로 변환합니다.
    const messages = req.body.messages || [];
    const lastMessage = messages[messages.length - 1]?.content || "";
    const systemPrompt = req.body.system || "";

    // 3. Gemini 대화 생성
    // 시스템 프롬프트가 있다면 앞에 붙여서 보냅니다.
    const prompt = systemPrompt 
      ? `System: ${systemPrompt}\n\nUser: ${lastMessage}` 
      : lastMessage;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    // 4. Anthropic과 유사한 응답 구조로 맞춰서 반환 (프론트엔드 수정 최소화)
    const data = {
      content: [
        {
          type: "text",
          text: responseText
        }
      ],
      role: "assistant"
    };

    return res.status(200).json(data);

  } catch (err) {
    console.error("Gemini Chat API Error:", err);
    return res.status(500).json({
      error: 'Gemini API error',
      detail: err.message || 'Server error',
    });
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 60,
};
