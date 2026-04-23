
async function getSample(query) {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=10&start=1&sort=sim`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID || '',
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET || ''
    }
  });
  const data = await res.json();
  console.log(`\n=== RAW DATA FOR: ${query} ===`);
  if (data.items) {
    console.log(JSON.stringify(data.items.slice(0, 5), null, 2));
  } else {
    console.log("Error or No items:", data);
  }
}

async function run() {
  if (!process.env.NAVER_CLIENT_ID) {
    console.error("Error: NAVER_CLIENT_ID not found in environment.");
    return;
  }
  await getSample('로보락 S8 MaxV Ultra');
  await getSample('비스포크 AI 콤보');
}

run();
