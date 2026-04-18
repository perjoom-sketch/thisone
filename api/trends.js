/**
 * api/trends.js
 * 실시간 쇼핑 트렌드 및 인기 검색어 데이터를 제공하는 엔드포인트.
 * 향후 네이버 데이터랩 API 혹은 크롤링 엔진과 연동 가능.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // [알고리즘] 현재는 리서치 기반의 트렌드 데이터를 반환하며, 
    // 향후 외부 API 연동 시 자동으로 업데이트되는 구조입니다.
    const trendingChips = [
      { id: "t1", label: "🤖 AI 로봇청소기", query: "AI 로봇청소기 렌탈 구매 비교 추천" },
      { id: "t2", label: "📺 2026년형 AI TV", query: "2026년 신제품 AI TV 추천" },
      { id: "t3", label: "💆 효도용 안마의자", query: "부모님 선물용 안마의자 렌탈 비교" },
      { id: "t4", label: "🗑️ 음식물처리기", query: "음식물처리기 설치형 vs 프리스탠딩 비교" },
      { id: "t5", label: "❄️ 에어컨 사전점검", query: "2in1 에어컨 신제품 가격 비교" },
      { id: "t6", label: "⌚ 스마트 헬스케어", query: "스마트워치 건강관리 기능 비교" }
    ];

    return res.status(200).json({
      status: "success",
      timestamp: new Date().toISOString(),
      chips: trendingChips
    });
  } catch (err) {
    console.error("Trend API Error:", err);
    return res.status(500).json({ error: "트렌드 데이터를 가져오지 못했습니다." });
  }
}
