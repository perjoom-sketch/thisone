const { GoogleGenerativeAI } = require("@google/generative-ai");
const AI_CONFIG = { MODEL_NAME: process.env.MODEL_NAME || 'gemini-2.5-flash' };
const OPENAI_MODEL = 'gpt-5.4-mini';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_FIRST_RESPONSE_TIMEOUT_MS = 15000;

// ─── OpenAI GPT 리포트 생성 (폴백) ──────────────────────────────
async function openaiChatFallback(messages, system, timeoutMs = 30000) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY 미설정');

  const formattedMessages = [
    { role: "system", content: system || '' },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: Array.isArray(m.content) ? m.content.map(c => {
        if (c.type === 'text') return { type: 'text', text: c.text };
        if (c.type === 'image_url') return { type: 'image_url', image_url: { url: c.image_url.url } };
        return null;
      }).filter(Boolean) : String(m.content || '')
    }))
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: formattedMessages,
        temperature: 0.1
      }),
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      let detail = text;
      try {
        const errorData = JSON.parse(text);
        detail = errorData.error?.message || response.statusText;
      } catch (e) {}
      throw new Error(`OpenAI Error: ${detail}`);
    }

    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('OpenAI returned empty content');
    return content;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`OpenAI fallback timeout (${timeoutMs / 1000}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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

  const { messages = [], system = "" } = req.body;

  try {
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

    // AI 실행 및 15초 타임아웃/폴백 처리
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
          setTimeout(() => reject(Object.assign(new Error(`Gemini first response timeout (${GEMINI_FIRST_RESPONSE_TIMEOUT_MS / 1000}s)`), { code: 'TIMEOUT' })), GEMINI_FIRST_RESPONSE_TIMEOUT_MS)
        );
        
        result = await Promise.race([model.generateContentStream(userParts), timeoutPromise]);
        console.log(`[api/chat] Gemini success with model: ${m}`);
        break;
      } catch (e) {
        lastError = e;
        console.warn(`[api/chat] Gemini failed for model ${m}: ${e.message}`);
        break;
      }
    }

    if (!result) {
      console.log(`[api/chat] Gemini failed or timed out, OpenAI fallback start: ${lastError?.message || 'unknown error'}`);
      const gptText = await openaiChatFallback(messages, system);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(gptText);
      res.end();
      return;
    }
    
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
    console.error("[api/chat] AI Error:", msg);

    // Gemini 또는 기타 오류 발생 시 OpenAI를 한 번 더 시도한다.
    if (!res.headersSent) {
      try {
        console.log("[api/chat] OpenAI fallback retry after catch...");
        const gptText = await openaiChatFallback(messages, system);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(gptText);
        res.end();
        return;
      } catch (gptErr) {
        console.error("[api/chat] OpenAI fallback failed:", gptErr.message);
        return res.status(503).json({
          error: 'AI_SERVER_BUSY',
          detail: `Gemini failed: ${msg}; OpenAI failed: ${gptErr.message}`
        });
      }
    }

    try { res.end(); } catch (e) {}
    return;
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
