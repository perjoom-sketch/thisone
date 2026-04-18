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

// ─── Gemini AI 추론 ────────────────────────────────────────────────
async function aiInfer(query, trajectory) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY 미설정');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-preview-04-17',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  });

  const prompt = `
당신은 쇼핑 검색 의도 분류 AI입니다. 반드시 JSON만 출력하세요.

사용자 검색 궤적:
- 검색어 순서: ${JSON.stringify(trajectory?.queries || [])}
- 수정 횟수: ${trajectory?.refinements ?? 0}
- 클릭한 상품: ${JSON.stringify(trajectory?.clickEvents || [])}
- 세션 시간(ms): ${trajectory?.durationMs ?? 0}
- 현재 검색어: "${query}"

의도 분류 규칙:
- spec_refine: 검색어를 점점 구체화하는 패턴 (단어 추가, 수정 2회 이상)
- price_focus: 가격/할인 키워드 등장, 또는 저가 상품 클릭 패턴
- brand_seek: 특정 브랜드명이 중간에 등장
- explore: 초기 탐색 단계, 방향이 불명확

출력 형식:
{
  "intentTag": "spec_refine",
  "confidence": 0.87,
  "suggestedWeights": { "price": 0.25, "review": 0.5, "trust": 0.25 },
  "categoryHint": "stroller"
}`;

  // 4초 타임아웃 (intentInfer는 빠르게 응답해야 함)
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('intentInfer 타임아웃')), 4000)
  );

  const result = await Promise.race([model.generateContent(prompt), timeout]);
  const text = result.response.text();
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ─── 핸들러 ────────────────────────────────────────────────────────
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { query = '', trajectory = {} } = req.body || {};

  try {
    const result = await aiInfer(query, trajectory);
    return res.status(200).json({ ...result, source: 'ai' });
  } catch (err) {
    console.warn('[intentInfer] AI 실패, 로컬 폴백 사용:', err.message);
    const fallback = localInfer(query, trajectory);
    return res.status(200).json(fallback);
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 10 };
