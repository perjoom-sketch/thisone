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
async function aiInfer(query, trajectory) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY 미설정');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  });

  const prompt = `
당신은 10년 차 쇼핑 큐레이션 전문가이자 구매 데이터 분석가입니다.
사용자의 검색 궤적과 현재 검색어를 분석하여, 전문가가 제안할 법한 심층 의도를 추출하세요.
반드시 JSON만 출력하세요.

사용자 정보:
- 검색 히스토리: ${JSON.stringify(trajectory?.queries || [])}
- 클릭 이력: ${JSON.stringify(trajectory?.clickEvents || [])}
- 검색 수정 횟수: ${trajectory?.refinements ?? 0}
- 현재 검색어: "${query}"

분석 지침:
1. 사용자가 숨기고 있는 '진짜 니즈'를 파악하세요. (예: "프린터" -> 단순 구매 vs "회사 프린터 유지비" -> 운영 효율성 중시)
2. 최신 트렌드 반영: 특히 한국 가전 시장의 경우, 공기청정기/정수기/의류관리기 등은 '구매'보다 '구독/렌탈' 서비스가 대세임을 인지하고, 관리 효율성을 분석에 포함하세요.
3. 전문가가 해당 카테고리에서 가장 중요하게 보는 3가지 요소(expertFactors)를 정의하세요.
4. 랭킹 시스템을 위한 정밀 가중치(suggestedWeights)를 0~1 사이로 산출하세요.

출력 형식 (JSON):
{
  "intentTag": "spec_refine" | "price_focus" | "brand_seek" | "explore",
  "confidence": 0.85,
  "expertFactors": {
    "key_priority": "유지비 및 내구성",
    "rationale": "반복되는 검색어에서 운영 효율성에 대한 높은 민감도가 관찰됨",
    "focus_specs": ["출력 속도", "토너 가격", "네트워크 지원"]
  },
  "suggestedWeights": {
    "price": 0.3,
    "review": 0.4,
    "trust": 0.3
  },
  "categoryHint": "가전/프린터"
}`;

  // 5초 타임아웃
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('intentInfer 타임아웃')), 5000)
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
