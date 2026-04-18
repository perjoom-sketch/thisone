const { GoogleGenerativeAI } = require("@google/generative-ai");

async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리 (CORS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages = [], system = "" } = req.body;

    // API 키 확인 및 로깅 (디버깅용)
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_API_KEY가 설정되지 않았습니다.");
      throw new Error("API 키가 설정되지 않았습니다. Vercel 환경 변수를 확인해주세요.");
    }

    console.log("Gemini API 호출 시작 (Model: gemini-1.5-flash)");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: system,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      }
    });

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      throw new Error("메시지가 없습니다.");
    }

    const userContent = typeof lastMessage.content === "string" 
      ? lastMessage.content 
      : JSON.stringify(lastMessage.content);

    // 7초 타임아웃 설정 (Vercel 10초 제한 대비)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI 분석 시간 초과 (10초 제한)")), 7000)
    );

    // AI 실행
    const resultPromise = model.generateContent(userContent);
    const result = await Promise.race([resultPromise, timeoutPromise]);
    const responseText = result.response.text();


    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (e) {
      console.error("JSON 파싱 실패:", responseText.substring(0, 300));
      throw new Error("AI 응답 형식이 올바르지 않습니다.");
    }

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
