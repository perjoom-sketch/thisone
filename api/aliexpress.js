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

    // 테스트를 위한 최소 스펙 파라미터 구성
    const params = {
      app_key: APP_KEY,
      format: 'json',
      // 한글 인코딩 문제 배제를 위해 무조건 영문 검색어로 고정
      keywords: 'usb', 
      method: 'aliexpress.affiliate.product.query',
      page_no: '1',
      page_size: '10', // 사이즈 최소화
      sign_method: 'sha256',
      timestamp: getAliTimestamp(),
      tracking_id: 'thisone', // 정상 등록 확인 완료
      v: '2.0'
      // 에러 유발 가능성이 있는 sort, target_currency, target_language는 모두 제외
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
    
    // 백엔드 404 시스템 에러 응답 처리
    if (data.aliexpress_affiliate_product_query_response?.resp_result?.resp_code === 404) {
      return res.status(400).json({ 
        error: '알리익스프레스 백엔드 처리 에러 (System Error)', 
        suggestion: '최소 파라미터로도 404가 뜬다면, 알리 측 서버의 앱 계정 동기화 지연 문제입니다.',
        detail: data 
      });
    }

    // 정상 결과 출력
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
