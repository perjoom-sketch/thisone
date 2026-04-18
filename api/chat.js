import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req) {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // OPTIONS 요청 처리 (CORS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { messages = [], system = "" } = body;

    // API 키 확인
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY가 설정되지 않았습니다.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // 성능 최적화: 모델을 gemini-1.5-flash로 변경
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

    // AI 실행
    const result = await model.generateContent(userContent);
    const responseText = result.response.text();

    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (e) {
      console.error("JSON 파싱 실패:", responseText.substring(0, 300));
      // 구조가 깨진 경우를 위한 최소한의 대응
      parsedData = { error: "AI 응답 형식이 올바르지 않습니다.", raw: responseText };
    }

    // 프론트엔드 호환성을 위해 기존 포맷 유지
    return new Response(JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(parsedData) }],
      role: "assistant"
    }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error("Gemini Edge Error:", err.message);
    return new Response(JSON.stringify({
      error: 'Gemini API 오류',
      detail: err.message || '서버에서 문제가 발생했습니다.'
    }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}
