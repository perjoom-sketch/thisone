/**
 * api/intentInfer.js
 * 사용자 검색 궤적(Trajectory)을 분석하여 최종 의도를 추론하는 엔드포인트.
 *
 * POST /api/intentInfer
 * Body: {
 *   query: string,         // 현재 검색어
 *   trajectory: {          // trajectoryLogger.getSession() 반환값
 *     queries: string[],
 *     dwellTimes: number[],
 *     clickEvents: (string|null)[],
 *     refinements: number,
 *     durationMs: number
 *   }
 * }
 *
 * Response: {
 *   intentTag: "spec_refine" | "price_focus" | "brand_seek" | "explore",
 *   confidence: number,       // 0~1
 *   suggestedWeights: {       // ranking.js 가중치 힌트
 *     price: number,
 *     review: number,
 *     trust: number
 *   },
 *   categoryHint: string,     // 감지된 카테고리 (optional)
 *   source: "ai" | "fallback" // 추론 출처
 * }
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── 로컬 폴백 규칙 ────────────────────────────────────────────────
function localInfer(query, trajectory) {
  const queries = trajectory?.queries || [];
  const ref = trajectory?.refinements || 0;
  const last = query || queries[queries.length - 1] || '';
  const first = queries[0] || last;

  const priceKw = /가격|저렴|싼|최저|할인|만원|원이하|비교|최저가/;
  if (priceKw.test(last)) {
    return {
      intentTag: 'price_focus',
      confidence: 0.8,
      suggestedWeights: { price: 0.6, review: 0.25, trust: 0.15 },
      source: 'fallback',
    };
  }

  const brandKw = /[A-Z]{2,}|삼성|LG|애플|다이슨|필립스|보쉬|다이콘/i;
  if (brandKw.test(last) && !brandKw.test(first)) {
    return {
      intentTag: 'brand_seek',
      confidence: 0.75,
      suggestedWeights: { price: 0.2, review: 0.3, trust: 0.5 },
      source: 'fallback',
    };
  }

  const firstWords = first.trim().split(/\s+/).length;
  const lastWords = last.trim().split(/\s+/).length;
  if (ref >= 2 && lastWords > firstWords) {
    return {
      intentTag: 'spec_refine',
      confidence: 0.82,
      suggestedWeights: { price: 0.25, review: 0.5, trust: 0.25 },
      source: 'fallback',
    };
  }

  return {
    intentTag: 'explore',
    confidence: 0.55,
    suggestedWeights: { price: 0.33, review: 0.34, trust: 0.33 },
    source: 'fallback',
  };
}

// ─── Gemini AI 추론 (전문가급 분석) ────────────────────────────────
async function aiInfer(query, trajectory, image = null) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY 미설정');

  const genAI = new GoogleGenerativeAI(apiKey);
  // AGENTS.md 지침에 따라 v1 버전 사용 강제
  const MODEL_NAME = process.env.MODEL_NAME || 'gemini-2.5-flash';

  const prompt = `
당신은 10년 차 쇼핑 큐레이션 전문가이자 구매 데이터 분석가입니다.
사용자의 검색 궤적과 현재 검색어, 그리고 제공된 이미지를 분석하여 전문가급 의도를 추출하세요.
답변은 반드시 순수 JSON 형식으로만 출력하세요. 마크다운이나 설명 없이 오직 { ... } 블록만 반환해야 합니다.

사용자 정보:
- 검색 히스토리: ${JSON.stringify(trajectory?.queries || [])}
- 현재 검색어: "${query}"

[최우선 규칙 - 위반 금지]
1. 이미지가 제공되면 이미지가 사용자 의도의 주인입니다. 텍스트는 보조 정보일 뿐, 절대 이미지보다 우선하지 않습니다.
2. 이미지 속 상품과 텍스트가 충돌하면 반드시 이미지를 선택하세요.
   - 예: 이미지=맥미니, 텍스트="아이패드 에어 M2" -> refinedSearchTerm = "맥미니 M2"
3. 텍스트는 이미지와 같은 카테고리이면서 사양/옵션 정보를 보강할 때만 사용하세요. (예: 이미지=아이패드, 텍스트="512GB")
4. 입력창 텍스트가 이전 검색 잔여물로 의심될 때(카테고리 전혀 다름)는 텍스트를 완전히 무시하고 이미지만으로 판단하세요.

이미지 분석 지침:
1. 이미지 속 제품을 네이버 쇼핑에서 검색할 수 있는 가장 적합한 한국어 키워드 3~5단어로 refinedSearchTerm에 담으세요.
2. 브랜드명 + 제품 종류 형식을 우선하되, 명확한 시리즈가 있다면 포함하세요.
3. 자기 검증: "이 검색어를 네이버에 넣으면 이미지 속 상품이 나올까?"를 자문하고, 나오지 않을 것 같으면 키워드를 다시 생성하세요.

[표준 카테고리 체계]
반드시 다음 카테고리 중 하나를 categoryHint로 선택하세요:
- 컴퓨터, 가전, 모바일/디카, 스포츠/골프, 자동차용품, 생활/주방

분석 지침:
1. 전문가가 해당 카테고리에서 가장 중요하게 보는 3가지 요소(expertFactors)를 정의하세요.
2. 랭킹 시스템을 위한 정밀 가중치(suggestedWeights)를 0~1 사이로 산출하세요.
3. 왜 해당 검색어를 선택했는지에 대한 전문가적 근거를 reasoning 필드에 한 줄로 기술하세요.

출력 형식 (JSON):
{
  "intentTag": "spec_refine" | "price_focus" | "brand_seek" | "explore",
  "confidence": 0.85,
  "expertFactors": {
    "key_priority": "사양 대조 및 확장성",
    "rationale": "사진 속 제품의 세부 특징 분석...",
    "focus_specs": ["M2 칩셋", "포트 구성", "발열 제어"]
  },
  "suggestedWeights": { "price": 0.3, "review": 0.4, "trust": 0.3 },
  "categoryHint": "컴퓨터",
  "refinedSearchTerm": "애플 맥미니 M2",
  "reasoning": "텍스트(아이패드)와 이미지(맥미니)가 충돌하여, 최우선 규칙에 따라 이미지를 기준으로 검색어를 생성함"
}
`;

  const parts = [{ text: prompt }];
  if (image && image.data) {
    parts.push({
      inlineData: {
        data: image.data,
        mimeType: image.type || 'image/jpeg'
      }
    });
  }

  // 전체 55초 타임아웃 제한 내에서, 각 모델당 최소 10초 보장
  const startTime = Date.now();
  const getRemainingTime = () => Math.max(10000, 55000 - (Date.now() - startTime));

  let result;
  const modelsToTry = [MODEL_NAME, 'gemini-2.5-flash'].filter(m => m && m !== 'undefined');
  let lastError;

  for (const m of modelsToTry) {
    let retryCount = 0;
    const maxRetries = 1; // 503 에러 대비 1회 재시도

    while (retryCount <= maxRetries) {
      try {
        const model = genAI.getGenerativeModel({
          model: m,
          systemInstruction: "당신은 쇼핑 의도 분석 전문가입니다. 반드시 JSON만 출력하세요.",
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }, { apiVersion: 'v1' });

        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('intentInfer 타임아웃')), getRemainingTime())
        );
        result = await Promise.race([model.generateContent(parts), timeout]);
        break; // 성공 시 루프 탈출
      } catch (e) {
        lastError = e;
        const is503 = e.message?.includes('503') || e.message?.includes('high demand');
        
        if (is503 && retryCount < maxRetries) {
          console.warn(`[intentInfer] 503 감지, ${retryCount + 1}차 재시도 중...`);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1500)); // 대기 시간 1.5초로 증설
          continue;
        }
        
        console.warn(`Fallback failed for model ${m}: ${e.message}`);
        break; // 다른 에러거나 재시도 횟수 초과 시 다음 모델로
      }
    }
    if (result) break; // 성공한 모델이 있으면 전체 루프 탈출
  }

  if (!result || !result.response) {
    console.error("[intentInfer] AI 결과가 없거나 응답 객체가 유효하지 않음. 마지막 에러:", lastError?.message);
    throw lastError || new Error('No AI response received');
  }

  try {
    const text = result.response.text();
    if (!text) throw new Error('Empty AI response');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[intentInfer] JSON 패턴 매칭 실패. 응답 전문:", text);
      throw new Error('Valid JSON block not found');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[intentInfer] 분석/파싱 중 치명적 오류:", e.message);
    throw e;
  }
}

// ─── OpenAI GPT 추론 (고가용성 폴백) ──────────────────────────────
async function openaiInfer(query, trajectory, image = null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY 미설정');

  const systemPrompt = "당신은 쇼핑 의도 분석 전문가입니다. 반드시 JSON으로만 응답하세요.";
  const userPrompt = `다음 검색 정보를 바탕으로 전문가급 쇼핑 의도를 분석하세요.
${query ? `현재 검색어: "${query}"` : ""}
검색 히스토리: ${JSON.stringify(trajectory?.queries || [])}

이미지 분석이 포함되어 있다면 가장 적합한 한국어 검색 키워드(브랜드+모델)를 refinedSearchTerm에 담으세요.
반드시 { "intentTag": ..., "refinedSearchTerm": ..., "suggestedWeights": { "price": ..., "review": ..., "trust": ... } } 형식을 지키세요.`;

  const content = [{ type: "text", text: userPrompt }];
  if (image && image.data) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${image.type || 'image/jpeg'};base64,${image.data}` }
    });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini", // 최신 고효율 모델 사용
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: content }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

// ─── 핸들러 ────────────────────────────────────────────────────────
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  console.log("[Intent] input:", { hasImage: !!image, textInput: query });

  try {
    const result = await aiInfer(query, trajectory, image);
    console.log("[Intent] output (Gemini):", { 
      refinedSearchTerm: result.refinedSearchTerm, 
      reasoning: result.reasoning 
    });
    return res.status(200).json({ ...result, source: 'ai' });
  } catch (err) {
    console.warn('[intentInfer] Gemini 실패, OpenAI 폴백 시도:', err.message);
    
    try {
      const gptResult = await openaiInfer(query, trajectory, image);
      console.log("[Intent] output (GPT):", { 
        refinedSearchTerm: gptResult.refinedSearchTerm, 
        reasoning: gptResult.reasoning 
      });
      return res.status(200).json({ ...gptResult, source: 'ai_gpt' });
    } catch (gptErr) {
      console.error('[intentInfer] 모든 AI 실패, 로컬 폴백 사용:', gptErr.message);
      const fallback = localInfer(query, trajectory);
      return res.status(200).json({ 
        ...fallback, 
        aiError: gptErr.message 
      });
    }
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 60 };
