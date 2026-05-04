const crypto = require('crypto');

// 알리익스프레스 기준 시간(GMT+8) 타임스탬프 생성 함수
function getAliTimestamp() {
  const now = new Date();
  // 현재 시간의 UTC 기준 밀리초 도출
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  // 베이징 시간(GMT+8)으로 강제 변환
  const aliTime = new Date(utc + (8 * 60 * 60 * 1000));
  
  const pad = (n) => String(n).padStart(2, '0');
  return `${aliTime.getFullYear()}-${pad(aliTime.getMonth() + 1)}-${pad(aliTime.getDate())} ${pad(aliTime.getHours())}:${pad(aliTime.getMinutes())}:${pad(aliTime.getSeconds())}`;
}

export default async function handler(req, res) {
  try {
    const APP_KEY = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const APP_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();

    if (!APP_KEY || !APP_SECRET) {
      return res.status(500).json({ error: '환경 변수 오류' });
    }

    const params = {
      app_key: APP_KEY,
      format: 'json',
      keywords: req.query.q || '마우스',
      method: 'aliexpress.affiliate.product.query',
      page_size: '20',
      sign_method: 'sha256',
      target_currency: 'KRW',
      target_language: 'KO',
      // 🚨 백엔드가 정상적으로 읽을 수 있는 포맷으로 복구
      timestamp: getAliTimestamp(), 
      // 🚨 주의: 알리 어필리에이트 콘솔에 등록된 실제 Tracking ID여야 합니다.
      tracking_id: 'thisone', 
      v: '2.0'
    };

    // 서명 로직 (검증 완료된 완벽한 로직)
    const keys = Object.keys(params).sort();
    let baseString = ''; 
    keys.forEach(key => {
      baseString += key + String(params[key]);
    });

    const sign = crypto.createHmac('sha256', APP_SECRET)
      .update(baseString, 'utf8')
      .digest('hex')
      .toUpperCase();

    params.sign = sign;

    const response = await fetch('https://api-sg.aliexpress.com/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: new URLSearchParams(params).toString()
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
