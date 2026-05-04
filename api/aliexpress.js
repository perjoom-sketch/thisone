const crypto = require('crypto');

export default async function handler(req, res) {
  try {
    const APP_KEY = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const APP_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();

    if (!APP_KEY || !APP_SECRET) {
      return res.status(500).json({ error: '환경 변수 오류: APP_KEY 또는 APP_SECRET 누락' });
    }

    // 1. 필수 시스템 파라미터(v, format)를 모두 포함하여 재구성
    const params = {
      app_key: APP_KEY,
      format: 'json',
      keywords: req.query.q || '마우스',
      method: 'aliexpress.affiliate.product.query',
      page_size: '20',
      sign_method: 'sha256',
      target_currency: 'KRW',
      target_language: 'KO',
      timestamp: Date.now().toString(), // 밀리초 타임스탬프로 띄어쓰기 인코딩 에러 원천 차단
      tracking_id: 'thisone',
      v: '2.0'
    };

    // 2. '/sync' 완전 제거. 파라미터 키를 ASCII 오름차순으로 정렬 후 결합만 수행
    const keys = Object.keys(params).sort();
    let baseString = ''; 
    
    keys.forEach(key => {
      baseString += key + String(params[key]);
    });

    // 3. 서명 생성 (HMAC-SHA256)
    const sign = crypto.createHmac('sha256', APP_SECRET)
      .update(baseString, 'utf8')
      .digest('hex')
      .toUpperCase();

    params.sign = sign;

    // 4. API 호출
    const response = await fetch('https://api-sg.aliexpress.com/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      // URLSearchParams가 한글('마우스')을 안전하게 인코딩하여 Body로 전송
      body: new URLSearchParams(params).toString()
    });

    const data = await response.json();
    
    // 에러 발생 시 Vercel 콘솔이나 브라우저에서 Base String을 바로 확인할 수 있도록 유지
    if (data.error_response) {
      return res.status(400).json({ 
        error: 'AliExpress API 에러', 
        detail: data.error_response,
        debug_baseString: baseString 
      });
    }

    // 성공
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
