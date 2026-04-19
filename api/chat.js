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

    const AI_CONFIG = require('../js/config');
    console.log(`Gemini API 호출 시작 (Model: ${AI_CONFIG.MODEL_NAME})`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: AI_CONFIG.MODEL_NAME,
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

    // 멀티모달 파츠 구성
    let userParts = [];
    if (Array.isArray(lastMessage.content)) {
      userParts = lastMessage.content.map(part => {
        if (part.type === 'text') return { text: part.text };
        if (part.type === 'image_url') {
          const base64Data = part.image_url.url.split(',')[1];
          return {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg'
            }
          };
        }
        return null;
      }).filter(Boolean);
    } else {
      userParts = [{ text: String(lastMessage.content) }];
    }

    // 55초 타임아웃 설정 (Vercel 60초 제한 대비)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error("AI 분석 시간 초과"), { code: 'TIMEOUT' })), 55000)
    );

    // AI 실행 (스트리밍 방식 도입)
    const result = await model.generateContentStream(userParts);
    
    // 스트리밍 응답 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullText = "";
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      // 브라우저로 즉시 전송 (SSE 포맷 유사)
      res.write(chunkText); 
    }

    res.end();
    return;

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
