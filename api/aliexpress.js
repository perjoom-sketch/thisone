import crypto from 'crypto';

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

function buildAliExpressSignatureBaseString(params) {
  const keys = Object.keys(params)
    .filter(key => key !== 'sign' && params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort();

  let baseString = '';
  keys.forEach(key => {
    baseString += key + String(params[key]);
  });

  return baseString;
}

function generateAliExpressSignature(params, secret, variant) {
  const baseString = buildAliExpressSignatureBaseString(params);

  if (variant === 'current') {
    return generateSignature(params, secret);
  }

  if (variant === 'method_prefix_sha256') {
    return crypto.createHmac('sha256', secret)
      .update(`${params.method || ''}${baseString}`, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  if (variant === 'md5_top_style') {
    return crypto.createHash('md5')
      .update(`${secret}${baseString}${secret}`, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  return generateSignature(params, secret);
}


function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function isFalseLike(value) {
  return value === false || String(value).toLowerCase() === 'false';
}

function sanitizeAliExpressDiagnosticValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/[?&]sign=[^&\s]+/gi, '[SIGN_REDACTED]')
    .replace(/[?&]access_token=[^&\s]+/gi, '[ACCESS_TOKEN_REDACTED]')
    .replace(/[?&]tracking_id=[^&\s]+/gi, '[TRACKING_ID_REDACTED]')
    .replace(/thisone/g, '[TRACKING_ID_REDACTED]');
}

function getAliExpressProducts(data) {
  const products = data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products;

  if (Array.isArray(products)) {
    return products;
  }

  if (Array.isArray(products?.product)) {
    return products.product;
  }

  return [];
}

function buildBaseAliExpressParams(appKey, searchQuery) {
  return {
    app_key: appKey,
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
}

function signAliExpressParams(params, appSecret) {
  const signedParams = { ...params };
  signedParams.sign = generateSignature(signedParams, appSecret);
  return signedParams;
}

function signAliExpressParamsForProbe(params, appSecret, signatureVariant) {
  const signedParams = { ...params };
  signedParams.sign = generateAliExpressSignature(signedParams, appSecret, signatureVariant);
  return signedParams;
}

async function requestAliExpress(params) {
  const response = await fetch('https://api-sg.aliexpress.com/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
    },
    body: new URLSearchParams(params).toString()
  });

  const data = await response.json();
  return { response, data };
}

async function requestAliExpressWithTransport(params, transport) {
  if (transport === 'GET') {
    const response = await fetch(`https://api-sg.aliexpress.com/sync?${new URLSearchParams(params).toString()}`, {
      method: 'GET'
    });

    const data = await response.json();
    return { response, data };
  }

  return requestAliExpress(params);
}

function buildAliExpressProbeSummary(name, data, params, response) {
  const debug = buildAliExpressDebug(data, params, response);
  const products = getAliExpressProducts(data);

  return {
    name,
    httpStatus: debug.httpStatus,
    status: firstDefined(data?.status, data?.error_response?.status, response.ok ? 'HTTP_OK' : 'HTTP_ERROR'),
    code: debug.code,
    msg: debug.msg,
    subCode: debug.subCode,
    subMsg: debug.subMsg,
    errorCode: debug.errorCode,
    errorMessage: debug.errorMessage,
    bizSuccess: debug.bizSuccess,
    itemCount: products.length,
    responseKeys: debug.responseKeys
  };
}

function buildAliExpressProbeError(name, error) {
  return {
    name,
    httpStatus: undefined,
    status: 'RequestError',
    code: undefined,
    msg: undefined,
    subCode: undefined,
    subMsg: undefined,
    errorCode: error.name || 'AliExpressProbeRequestError',
    errorMessage: error.message || 'AliExpress probe request failed',
    bizSuccess: false,
    itemCount: 0,
    responseKeys: []
  };
}

function buildAliExpressProbeCases(baseParams) {
  return [
    {
      name: 'baseline_current',
      params: { ...baseParams }
    },
    {
      name: 'tracking_default',
      params: { ...baseParams, tracking_id: 'default' }
    },
    {
      name: 'english_usd',
      params: {
        ...baseParams,
        keywords: 'air purifier',
        target_language: 'EN',
        target_currency: 'USD'
      }
    },
    {
      name: 'no_sort',
      params: Object.fromEntries(
        Object.entries(baseParams).filter(([key]) => key !== 'sort')
      )
    },
    {
      name: 'page_size_5',
      params: { ...baseParams, page_size: '5' }
    },
    {
      name: 'ship_to_kr',
      params: { ...baseParams, ship_to_country: 'KR' }
    },
    {
      name: 'platform_all',
      params: { ...baseParams, platform_product_type: 'ALL' }
    },
    {
      name: 'minimal',
      params: {
        app_key: baseParams.app_key,
        method: baseParams.method,
        keywords: baseParams.keywords,
        page_no: baseParams.page_no,
        page_size: baseParams.page_size,
        sign_method: baseParams.sign_method,
        timestamp: baseParams.timestamp,
        tracking_id: baseParams.tracking_id,
        v: baseParams.v
      }
    },
    {
      name: 'no_app_signature',
      params: Object.fromEntries(
        Object.entries(baseParams).filter(([key]) => key !== 'app_signature')
      )
    },
    {
      name: 'blank_app_signature',
      params: { ...baseParams, app_signature: '' }
    }
  ];
}

async function runAliExpressProbe(baseParams, appSecret) {
  const results = [];

  for (const probeCase of buildAliExpressProbeCases(baseParams)) {
    try {
      const signedParams = signAliExpressParams(probeCase.params, appSecret);
      const { response, data } = await requestAliExpress(signedParams);
      results.push(buildAliExpressProbeSummary(probeCase.name, data, signedParams, response));
    } catch (error) {
      results.push(buildAliExpressProbeError(probeCase.name, error));
    }
  }

  return results;
}

function buildMinimalAliExpressParams(params) {
  return {
    app_key: params.app_key,
    method: params.method,
    keywords: params.keywords,
    page_no: params.page_no,
    page_size: params.page_size,
    sign_method: params.sign_method,
    timestamp: params.timestamp,
    tracking_id: params.tracking_id,
    v: params.v
  };
}

function buildAliExpressSignatureProbeSummary(probeCase, data, params, response) {
  const debug = buildAliExpressDebug(data, params, response);
  const products = getAliExpressProducts(data);

  return {
    name: probeCase.name,
    httpStatus: debug.httpStatus,
    transport: probeCase.transport,
    signMethod: probeCase.signMethod,
    timestampFormat: probeCase.timestampFormat,
    signatureVariant: probeCase.signatureVariant,
    code: debug.code,
    msg: sanitizeAliExpressDiagnosticValue(debug.msg),
    subCode: sanitizeAliExpressDiagnosticValue(debug.subCode),
    subMsg: sanitizeAliExpressDiagnosticValue(debug.subMsg),
    errorCode: sanitizeAliExpressDiagnosticValue(debug.errorCode),
    errorMessage: sanitizeAliExpressDiagnosticValue(debug.errorMessage),
    bizSuccess: debug.bizSuccess,
    itemCount: products.length,
    responseKeys: debug.responseKeys
  };
}

function buildAliExpressSignatureProbeError(probeCase, error) {
  return {
    name: probeCase.name,
    httpStatus: undefined,
    transport: probeCase.transport,
    signMethod: probeCase.signMethod,
    timestampFormat: probeCase.timestampFormat,
    signatureVariant: probeCase.signatureVariant,
    status: 'RequestError',
    code: undefined,
    msg: undefined,
    subCode: undefined,
    subMsg: undefined,
    errorCode: sanitizeAliExpressDiagnosticValue(error.name) || 'AliExpressSignatureProbeRequestError',
    errorMessage: sanitizeAliExpressDiagnosticValue(error.message) || 'AliExpress signature probe request failed',
    bizSuccess: false,
    itemCount: 0,
    responseKeys: []
  };
}

function buildAliExpressSignatureProbeCases(baseParams) {
  const aliDateTimeParams = { ...baseParams, timestamp: getAliTimestamp() };
  const millisParams = { ...baseParams, timestamp: Date.now().toString() };

  return [
    {
      name: 'current_post_sha256',
      transport: 'POST',
      signMethod: 'sha256',
      timestampFormat: 'ali_datetime',
      signatureVariant: 'current',
      params: { ...aliDateTimeParams, sign_method: 'sha256' }
    },
    {
      name: 'get_sha256_current',
      transport: 'GET',
      signMethod: 'sha256',
      timestampFormat: 'ali_datetime',
      signatureVariant: 'current',
      params: { ...aliDateTimeParams, sign_method: 'sha256' }
    },
    {
      name: 'post_sha256_with_method_prefix',
      transport: 'POST',
      signMethod: 'sha256',
      timestampFormat: 'ali_datetime',
      signatureVariant: 'method_prefix_sha256',
      params: { ...aliDateTimeParams, sign_method: 'sha256' }
    },
    {
      name: 'get_sha256_with_method_prefix',
      transport: 'GET',
      signMethod: 'sha256',
      timestampFormat: 'ali_datetime',
      signatureVariant: 'method_prefix_sha256',
      params: { ...aliDateTimeParams, sign_method: 'sha256' }
    },
    {
      name: 'post_md5_top_style',
      transport: 'POST',
      signMethod: 'md5',
      timestampFormat: 'ali_datetime',
      signatureVariant: 'md5_top_style',
      params: { ...aliDateTimeParams, sign_method: 'md5' }
    },
    {
      name: 'get_md5_top_style',
      transport: 'GET',
      signMethod: 'md5',
      timestampFormat: 'ali_datetime',
      signatureVariant: 'md5_top_style',
      params: { ...aliDateTimeParams, sign_method: 'md5' }
    },
    {
      name: 'post_timestamp_millis_sha256',
      transport: 'POST',
      signMethod: 'sha256',
      timestampFormat: 'millis',
      signatureVariant: 'current',
      params: { ...millisParams, sign_method: 'sha256' }
    },
    {
      name: 'get_timestamp_millis_sha256',
      transport: 'GET',
      signMethod: 'sha256',
      timestampFormat: 'millis',
      signatureVariant: 'current',
      params: { ...millisParams, sign_method: 'sha256' }
    },
    {
      name: 'post_timestamp_millis_with_method_prefix',
      transport: 'POST',
      signMethod: 'sha256',
      timestampFormat: 'millis',
      signatureVariant: 'method_prefix_sha256',
      params: { ...millisParams, sign_method: 'sha256' }
    },
    {
      name: 'minimal_get_md5',
      transport: 'GET',
      signMethod: 'md5',
      timestampFormat: 'ali_datetime',
      signatureVariant: 'md5_top_style',
      params: buildMinimalAliExpressParams({ ...aliDateTimeParams, sign_method: 'md5' })
    }
  ];
}

async function runAliExpressSignatureProbe(baseParams, appSecret) {
  const results = [];

  for (const probeCase of buildAliExpressSignatureProbeCases(baseParams)) {
    try {
      const signedParams = signAliExpressParamsForProbe(probeCase.params, appSecret, probeCase.signatureVariant);
      const { response, data } = await requestAliExpressWithTransport(signedParams, probeCase.transport);
      results.push(buildAliExpressSignatureProbeSummary(probeCase, data, signedParams, response));
    } catch (error) {
      results.push(buildAliExpressSignatureProbeError(probeCase, error));
    }
  }

  return results;
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
    const baseParams = buildBaseAliExpressParams(APP_KEY, searchQuery);

    if (req.query?.probe === '1') {
      const results = await runAliExpressProbe(baseParams, APP_SECRET);

      return res.status(200).json({
        status: 'ProbeComplete',
        search_query: searchQuery,
        results
      });
    }

    if (req.query?.sigprobe === '1') {
      const results = await runAliExpressSignatureProbe(baseParams, APP_SECRET);

      return res.status(200).json({
        status: 'SignatureProbeComplete',
        search_query: searchQuery,
        results
      });
    }

    // 서명 생성 및 파라미터 합체
    const params = signAliExpressParams(baseParams, APP_SECRET);

    // 알리익스프레스 데이터 요청 (POST + URLSearchParams 조합으로 한글 인코딩 보호)
    const { response, data } = await requestAliExpress(params);
    const debug = buildAliExpressDebug(data, params, response);
    const products = getAliExpressProducts(data);
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
