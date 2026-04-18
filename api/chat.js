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

    console.log("Gemini API 호출 시작 (Model: gemini-3-flash)");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash",
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

    // 55초 타임아웃 설정 (Vercel 60초 제한 대비)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error("AI 분석 시간 초과"), { code: 'TIMEOUT' })), 55000)
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
      throw Object.assign(new Error("AI 응답 형식이 올바르지 않습니다."), { code: 'PARSE_ERROR' });
    }

    return res.status(200).json({
      content: [{ type: "text", text: JSON.stringify(parsedData) }],
      role: "assistant"
    });

  } catch (err) {
    const msg = err.message || '';
    console.error("Gemini Error:", msg);

    // 실제 서버 과부하 / 503
    if (err.code === 503 || /503|overloaded|Service Unavailable|high demand/i.test(msg)) {
      return res.status(503).json({
        error: 'AI_SERVER_BUSY',
        detail: 'AI 서버가 일시적으로 혼잡합니다.'
      });
    }

    // 타임아웃
    if (err.code === 'TIMEOUT' || /시간 초과|timeout/i.test(msg)) {
      return res.status(408).json({
        error: 'AI_TIMEOUT',
        detail: '응답 시간이 초과되었습니다.'
      });
    }

    // 그 외 일반 오류
    return res.status(500).json({
      error: 'AI_ERROR',
      detail: msg || '서버에서 문제가 발생했습니다.'
    });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
