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


function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function isFalseLike(value) {
  return value === false || String(value).toLowerCase() === 'false';
}

function buildAliExpressDebug(data, params, response) {
  const responseRoot = data && typeof data === 'object' ? data : {};
  const aliResponse = responseRoot.aliexpress_affiliate_product_query_response || {};
  const respResult = aliResponse.resp_result || {};
  const result = respResult.result || {};
  const errorResponse = responseRoot.error_response || {};

  const debug = {
    method: params.method,
    httpStatus: response.status,
    bizSuccess: firstDefined(
      responseRoot.bizSuccess,
      responseRoot.biz_success,
      aliResponse.bizSuccess,
      aliResponse.biz_success,
      respResult.bizSuccess,
      respResult.biz_success,
      result.bizSuccess,
      result.biz_success
    ),
    code: firstDefined(
      responseRoot.code,
      aliResponse.code,
      respResult.code,
      respResult.resp_code,
      result.code,
      errorResponse.code
    ),
    msg: firstDefined(
      responseRoot.msg,
      aliResponse.msg,
      respResult.msg,
      respResult.resp_msg,
      result.msg,
      errorResponse.msg
    ),
    subCode: firstDefined(
      responseRoot.subCode,
      responseRoot.sub_code,
      aliResponse.subCode,
      aliResponse.sub_code,
      respResult.subCode,
      respResult.sub_code,
      result.subCode,
      result.sub_code,
      errorResponse.sub_code,
      errorResponse.subCode
    ),
    subMsg: firstDefined(
      responseRoot.subMsg,
      responseRoot.sub_msg,
      aliResponse.subMsg,
      aliResponse.sub_msg,
      respResult.subMsg,
      respResult.sub_msg,
      result.subMsg,
      result.sub_msg,
      errorResponse.sub_msg,
      errorResponse.subMsg
    ),
    errorCode: firstDefined(
      responseRoot.errorCode,
      responseRoot.error_code,
      aliResponse.errorCode,
      aliResponse.error_code,
      respResult.errorCode,
      respResult.error_code,
      result.errorCode,
      result.error_code,
      errorResponse.code
    ),
    errorMessage: firstDefined(
      responseRoot.errorMessage,
      responseRoot.error_message,
      aliResponse.errorMessage,
      aliResponse.error_message,
      respResult.errorMessage,
      respResult.error_message,
      result.errorMessage,
      result.error_message,
      errorResponse.msg
    ),
    requestId: firstDefined(
      responseRoot.requestId,
      responseRoot.request_id,
      aliResponse.requestId,
      aliResponse.request_id,
      respResult.requestId,
      respResult.request_id,
      result.requestId,
      result.request_id,
      errorResponse.request_id,
      errorResponse.requestId
    ),
    responseKeys: Object.keys(responseRoot)
  };

  if (debug.code === 404 || String(debug.code) === '404' || debug.subCode) {
    debug.possibleReason = 'AliExpress Advanced API 권한, 메서드 권한, 파라미터, 또는 계정 상태 문제일 수 있습니다. App Management의 Active 여부는 서버 코드에서 확정할 수 없습니다.';
  }

  return debug;
}

function getAliExpressMessage(debug, fallback) {
  return firstDefined(
    debug.subMsg,
    debug.errorMessage,
    debug.msg,
    fallback
  );
}

/**
 * 3. 메인 핸들러 (Vercel Serverless Function)
 */
export default async function handler(req, res) {
  const searchQuery = req.query?.q || '마우스';

  try {
    // 환경변수 공백 제거 및 로드
    const APP_KEY = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const APP_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();

    if (!APP_KEY || !APP_SECRET) {
      return res.status(200).json({
        status: 'AliExpressError',
        message: '서버 환경 변수(API Key/Secret) 누락',
        search_query: searchQuery,
        debug: {
          method: 'aliexpress.affiliate.product.query',
          errorCode: 'MissingAliExpressConfig'
        }
      });
    }

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
    const debug = buildAliExpressDebug(data, params, response);
    const products = data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products || [];
    const hasAliExpressError = !response.ok ||
      data?.error_response ||
      isFalseLike(debug.bizSuccess) ||
      (debug.code !== undefined && debug.code !== 0 && debug.code !== '0' && products.length === 0);
    
    // ----------------------------------------------------------------
    // 응답 상태 분류 (AliExpress 실패도 전체 검색 흐름을 중단시키지 않도록 200으로 반환)
    // ----------------------------------------------------------------
    if (hasAliExpressError) {
      return res.status(200).json({
        status: 'AliExpressError',
        message: getAliExpressMessage(debug, 'AliExpress API returned bizSuccess=false'),
        search_query: searchQuery,
        debug
      });
    }

    return res.status(200).json({
      status: 'Success',
      message: '상품 데이터를 성공적으로 불러왔습니다.',
      search_query: searchQuery,
      items: products,
      debug
    });

  } catch (error) {
    console.error('ThisOne API Handler Error:', error);
    return res.status(200).json({
      status: 'AliExpressError',
      message: error.message || 'AliExpress API request failed',
      search_query: searchQuery,
      debug: {
        method: 'aliexpress.affiliate.product.query',
        errorName: error.name,
        errorMessage: error.message
      }
    });
  }
}
