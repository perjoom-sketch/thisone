const fs = require('fs');
const rankingCode = fs.readFileSync('./js/ranking.js', 'utf-8');
const window = {};
const localStorage = { getItem: () => null, setItem: () => {} };
eval(rankingCode);

async function run() {
  const q = "로보락 S8 MaxV Ultra";
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(q)}&display=60&sort=sim`;
  
  // Use user's env vars if they have NAVER_CLIENT_ID, or we can just mock the response if we don't have the API key.
  // Wait, I can just require dotenv if they use it.
  require('dotenv').config();
  
  const response = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
    }
  });
  
  if (!response.ok) {
    console.error("Naver API failed", await response.text());
    return;
  }
  const data = await response.json();
  const items = (data.items || []).map((item, idx) => ({
      id: String(idx + 1),
      name: String(item.title || '').replace(/<[^>]*>/g, '').trim(),
      link: item.link || '',
      image: item.image || '',
      lprice: Number(item.lprice || 0),
      priceText: item.lprice ? `${Number(item.lprice).toLocaleString('ko-KR')}원` : '',
      store: String(item.mallName || '').replace(/<[^>]*>/g, '').trim(),
      delivery: '상세페이지 확인', // simplified
      productId: item.productId || ''
  }));
  
  console.log(`Fetched ${items.length} raw items from Naver`);
  
  const candidates = buildCandidates(items, q, null);
  console.log(`After buildCandidates: ${candidates.length} candidates remain`);
  
  candidates.slice(0, 5).forEach(c => {
    console.log(`- [${c.priceNum}원] ${c.name} (finalScore: ${c.finalScore})`);
  });
}

run();
