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
    // 퀵칩은 사용자가 클릭했을 때 검색창에 들어가는 값이므로 임의 확장하지 않는다.
    // 세부 비교/렌탈/보정은 검색엔진과 랭킹 로직에서 처리한다.
    const trendingChips = [
      { id: "t1", label: "🤖 AI 로봇청소기", query: "로봇청소기" },
      { id: "t2", label: "🌀 산업용 선풍기", query: "산업용 선풍기" },
      { id: "t3", label: "💆 안마의자", query: "안마의자" },
      { id: "t4", label: "🗑️ 음식물처리기", query: "음식물처리기" },
      { id: "t5", label: "📺 AI TV", query: "AI TV" },
      { id: "t6", label: "❄️ 창문형 에어컨", query: "창문형 에어컨" }
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
