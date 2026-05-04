const crypto = require('crypto');

// 알리익스프레스 기준 시간(GMT+8) 타임스탬프 생성
function getAliTimestamp() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const aliTime = new Date(utc + (8 * 60 * 60 * 1000));
  
  const pad = (n) => String(n).padStart(2, '0');
  return `${aliTime.getFullYear()}-${pad(aliTime.getMonth() + 1)}-${pad(aliTime.getDate())} ${pad(aliTime.getHours())}:${pad(aliTime.getMinutes())}:${pad(aliTime.getSeconds())}`;
}

export default async function handler(req, res) {
  try {
    const APP_KEY = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const APP_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();

    if (!APP_KEY || !APP_SECRET) {
      return res.status(500).json({ error: '환경 변수 누락' });
    }

    const params = {
      app_key: APP_KEY,
      format: 'json',
      keywords: req.query.q || '마우스',
      method: 'aliexpress.affiliate.product.query',
      page_no: '1',            // 백엔드 에러 방지를 위해 복구된 필수 파라미터
      page_size: '20',
      sign_method: 'sha256',
      sort: 'SALE_PRICE_ASC',  // 검색 정확도를 위해 초기 설정 복구
      target_currency: 'KRW',
      target_language: 'KO',
      timestamp: getAliTimestamp(),
      tracking_id: 'thisone',  // 반드시 알리 어필리에이트 대시보드에 등록된 Tracking ID를 사용해야 합니다.
      v: '2.0'
    };

    // 서명 생성 로직
    const keys = Object.keys(params).filter(
      (key) => key !== 'sign' && params[key] !== undefined && params[key] !== null && params[key] !== ''
    ).sort();
    
    let baseString = ''; 
    keys.forEach(key => {
      baseString += key + String(params[key]);
    });

    params.sign = crypto.createHmac('sha256', APP_SECRET)
      .update(baseString, 'utf8')
      .digest('hex')
      .toUpperCase();

    // API 호출
    const response = await fetch('https://api-sg.aliexpress.com/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: new URLSearchParams(params).toString()
    });

    const data = await response.json();
    
    // 알리 백엔드 404 시스템 에러에 대한 상세 디버깅 응답
    if (data.aliexpress_affiliate_product_query_response?.resp_result?.resp_code === 404) {
      return res.status(400).json({ 
        error: '알리익스프레스 백엔드 처리 에러 (System Error)', 
        suggestion: "tracking_id('thisone')가 알리 콘솔에 정식으로 등록된 ID인지 확인해주세요.",
        detail: data 
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
