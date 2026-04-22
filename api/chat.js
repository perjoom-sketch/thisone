const { GoogleGenerativeAI } = require("@google/generative-ai");
const AI_CONFIG = { MODEL_NAME: process.env.MODEL_NAME || 'gemini-2.5-flash' };

// ─── OpenAI GPT 리포트 생성 (폴백) ──────────────────────────────
async function openaiChatFallback(messages, system) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY 미설정');

  const formattedMessages = [
    { role: "system", content: system },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: Array.isArray(m.content) ? m.content.map(c => {
        if (c.type === 'text') return { type: 'text', text: c.text };
        if (c.type === 'image_url') return { type: 'image_url', image_url: { url: c.image_url.url } };
        return null;
      }).filter(Boolean) : m.content
    }))
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: formattedMessages,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

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

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 안전 설정 완화 (쇼핑 정보 오탐 방지)
    const safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ];

    const targetModel = req.body.model || AI_CONFIG.MODEL_NAME;
    console.log(`Gemini API 스트리밍 호출 시작 (Model: ${targetModel})`);
    const model = genAI.getGenerativeModel({
      model: targetModel,
      systemInstruction: system,
      safetySettings,
      generationConfig: {
        temperature: 0.1,
      }
    });

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) throw new Error("메시지가 없습니다.");

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

    // 55초 타임아웃 설정 (Vercel 60초 제한 대비), 최소 10초 보장
    const startTime = Date.now();
    const getRemainingTime = () => Math.max(10000, 55000 - (Date.now() - startTime));

    // AI 실행 (스트리밍 방식 도입) 및 타임아웃/폴백 처리
    let result;
    const modelsToTry = [...new Set([targetModel, 'gemini-2.5-flash'])];
    let lastError;

    for (const m of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: m,
          systemInstruction: system,
          safetySettings,
          generationConfig: { temperature: 0.1 }
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error("AI 분석 시간 초과"), { code: 'TIMEOUT' })), getRemainingTime())
        );
        
        result = await Promise.race([model.generateContentStream(userParts), timeoutPromise]);
        console.log(`Success with model: ${m}`);
        break;
      } catch (e) {
        lastError = e;
        console.warn(`Fallback failed for model ${m}: ${e.message}`);
      }
    }

    if (!result) throw lastError;
    
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

    // [OpenAI 폴백] Gemini 실패 시 즉시 GPT 시도
    if (msg.includes('503') || /overloaded|Service Unavailable|high demand/i.test(msg)) {
      console.log("[api/chat] Gemini 혼잡 감지, OpenAI 폴백 시작...");
      try {
        const { messages = [], system = "" } = req.body;
        const gptText = await openaiChatFallback(messages, system);
        
        // SSE 포맷으로 결과 전송 (호환성 유지)
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(gptText);
        res.end();
        return;
      } catch (gptErr) {
        console.error("[api/chat] OpenAI 폴백마저 실패:", gptErr.message);
        return res.status(503).json({
          error: 'AI_SERVER_BUSY',
          detail: '모든 AI 서버가 일시적으로 혼잡합니다.'
        });
      }
    }

    // 그 외 일반 오류 처리...
    return res.status(500).json({
      error: 'AI_ERROR',
      detail: msg || '서버에서 문제가 발생했습니다.'
    });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
