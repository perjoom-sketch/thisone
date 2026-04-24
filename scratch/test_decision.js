const fetch = require('node-fetch');
require('dotenv').config();

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

async function runTest() {
  const query = "청소기";
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=20&sort=sim`;

  const response = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
    }
  });

  const data = await response.json();
  const items = data.items || [];

  // 1. 필터링 (Negative Keywords)
  const negativeKeywords = ['필터', '브러시', '배터리', '거치대', '헤드', '키트', '부품', '청소포', '물걸레패드', '먼지봉투'];
  const filtered = items.filter(item => {
    const title = item.title.replace(/<b>|<\/b>/g, '');
    return !negativeKeywords.some(kw => title.includes(kw));
  });

  // 2. Baseline 산출
  const prices = filtered.map(item => Number(item.lprice)).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];

  // 3. 우수 상품 선정 (베이스라인 근처의 인기 상품 - 여기선 첫번째 filtered 상품)
  const target = filtered[0];
  const targetPrice = Number(target.lprice);
  const priceDiff = Math.round(((median - targetPrice) / median) * 100);

  console.log(JSON.stringify({
    total_fetched: items.length,
    filtered_count: filtered.length,
    median_price: median,
    target: {
      name: target.title.replace(/<b>|<\/b>/g, ''),
      price: targetPrice,
      priceDiff: priceDiff
    }
  }, null, 2));
}

runTest();
