const crypto = require('crypto');

/**
 * 1. 알리익스프레스 표준 타임스탬프 생성기 (GMT+8 베이징 시간 고정)
 * Vercel 서버리스 환경의 타임존 이슈를 원천 차단합니다.
 */
function getAliTimestamp() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const aliTime = new Date(utc + (8 * 60 * 60 * 1000));
  
  const pad = (n) => String(n).padStart(2, '0');
  return `${aliTime.getFullYear()}-${pad(aliTime.getMonth() + 1)}-${pad(aliTime.getDate())} ${pad(aliTime.getHours())}:${pad(aliTime.getMinutes())}:${pad(aliTime.getSeconds())}`;
}

/**
 * 2. IOP API 서명(Signature) 생성기
 * 빈 값 제외, ASCII 오름차순 정렬, HMAC-SHA256 해싱의 규격을 따릅니다.
 */
function generateSignature(params, secret) {
  const keys = Object.keys(params)
    .filter(key => key !== 'sign' && params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort();
    
  let baseString = ''; 
  keys.forEach(key => {
    baseString += key + String(params[key]);
  });

  return crypto.createHmac('sha256', secret)
    .update(baseString, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/**
 * 3. 메인 핸들러 (Vercel Serverless Function)
 */
export default async function handler(req, res) {
  try {
    // 환경변수 공백 제거 및 로드
    const APP_KEY = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const APP_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();

    if (!APP_KEY || !APP_SECRET) {
      return res.status(500).json({ error: '서버 환경 변수(API Key/Secret) 누락' });
    }

    // 클라이언트 검색어 추출 (기본값: 마우스)
    const searchQuery = req.query.q || '마우스';

    // ThisOne 엔진용 알리익스프레스 파라미터 세팅
    const params = {
      app_key: APP_KEY,
      format: 'json',
      keywords: searchQuery,
      method: 'aliexpress.affiliate.product.query',
      page_no: '1',
      page_size: '20',           // 한 번에 불러올 상품 수
      sign_method: 'sha256',
      sort: 'SALE_PRICE_ASC',    // 가격 비교 엔진에 맞춘 최저가 오름차순 정렬
      target_currency: 'KRW',    // 원화
      target_language: 'KO',     // 한국어
      timestamp: getAliTimestamp(),
      tracking_id: 'thisone',    // 어필리에이트 포털에 등록된 실제 Tracking ID
      v: '2.0'
    };

    // 서명 생성 및 파라미터 합체
    params.sign = generateSignature(params, APP_SECRET);

    // 알리익스프레스 데이터 요청 (POST + URLSearchParams 조합으로 한글 인코딩 보호)
    const response = await fetch('https://api-sg.aliexpress.com/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: new URLSearchParams(params).toString()
    });

    const data = await response.json();
    
    // ----------------------------------------------------------------
    // 응답 상태 분류 (Pending 권한 처리 포함)
    // ----------------------------------------------------------------
    
    // 1. 권한 미승인 (현재 겪고 있는 404 에러를 우아하게 예외 처리)
    if (data.aliexpress_affiliate_product_query_response?.resp_result?.resp_code === 404) {
      return res.status(202).json({ 
        status: 'Pending',
        message: 'Advanced API 권한 심사가 진행 중입니다. 알리 측 승인을 기다려주세요.',
        search_query: searchQuery
      });
    }

    // 2. 기타 서명 오류나 시스템 오류
    if (data.error_response) {
      return res.status(400).json({ 
        status: 'Error',
        message: '알리익스프레스 API 호출 실패',
        detail: data.error_response 
      });
    }

    // 3. 권한 승인 완료 후 데이터 정상 수신
    return res.status(200).json({
      status: 'Success',
      message: '상품 데이터를 성공적으로 불러왔습니다.',
      items: data.aliexpress_affiliate_product_query_response?.resp_result?.result?.products || []
    });

  } catch (error) {
    console.error('ThisOne API Handler Error:', error);
    return res.status(500).json({ error: '서버 내부 오류', detail: error.message });
  }
}
