const crypto = require('crypto');

// 1. 알리익스프레스 기준 시간(GMT+8) 타임스탬프 생성 함수
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
    // 2. 환경 변수 로드 및 공백 제거 (Vercel 환경 변수 복사 시 발생할 수 있는 보이지 않는 개행/공백 에러 방지)
    const APP_KEY = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const APP_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();

    if (!APP_KEY || !APP_SECRET) {
      return res.status(500).json({ error: '환경 변수 오류: APP_KEY 또는 APP_SECRET이 설정되지 않았습니다.' });
    }

    // 3. 필수 시스템 파라미터 및 비즈니스 파라미터 구성
    const params = {
      app_key: APP_KEY,
      format: 'json', // 필수
      keywords: req.query.q || '마우스', // URL에서 ?q= 검색어 받기 (기본값: 마우스)
      method: 'aliexpress.affiliate.product.query',
      page_size: '20',
      sign_method: 'sha256',
      target_currency: 'KRW',
      target_language: 'KO',
      timestamp: getAliTimestamp(), // yyyy-MM-dd HH:mm:ss (GMT+8) 포맷
      tracking_id: 'thisone', // 알리 어필리에이트 콘솔에 등록된 실제 Tracking ID
      v: '2.0' // 필수
    };

    // 4. 서명(Sign) 로직: 빈 값 제외 -> ASCII 오름차순 정렬 -> 결합
    const keys = Object.keys(params).filter(
      (key) => key !== 'sign' && params[key] !== undefined && params[key] !== null && params[key] !== ''
    ).sort();
    
    // 주의: 최신 IOP 규격에 맞춰 baseString 맨 앞에 '/sync' 등의 경로를 절대 붙이지 않습니다.
    let baseString = ''; 
    keys.forEach(key => {
      baseString += key + String(params[key]);
    });

    // 5. HMAC-SHA256 서명 생성 및 대문자 변환
    params.sign = crypto.createHmac('sha256', APP_SECRET)
      .update(baseString, 'utf8')
      .digest('hex')
      .toUpperCase();

    // 6. 알리익스프레스 API 호출 (POST 방식 권장)
    const response = await fetch('https://api-sg.aliexpress.com/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      // URLSearchParams가 한글(마우스)과 타임스탬프의 공백을 가장 안전하게 URL 인코딩 처리함
      body: new URLSearchParams(params).toString()
    });

    const data = await response.json();
    
    // 에러 발생 시 디버깅을 위해 상세 정보 반환
    if (data.error_response) {
      return res.status(400).json({ 
        error: 'AliExpress API 요청 실패', 
        detail: data.error_response 
      });
    }

    // 성공 시 데이터 반환
    return res.status(200).json(data);

  } catch (error) {
    console.error('서버 내부 에러:', error);
    return res.status(500).json({ error: error.message });
  }
}
