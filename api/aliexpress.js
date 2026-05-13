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
function buildAliExpressSignBaseString(params) {
  const keys = Object.keys(params)
    .filter(key => key !== 'sign' && params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort();

  let baseString = '';
  keys.forEach(key => {
    baseString += key + String(params[key]);
  });

  return baseString;
}

function generateSignature(params, secret) {
  return crypto.createHmac('sha256', secret)
    .update(buildAliExpressSignBaseString(params), 'utf8')
    .digest('hex')
    .toUpperCase();
}

function generateMethodPrefixedSha256Signature(params, secret) {
  return crypto.createHmac('sha256', secret)
    .update(`${params.method || ''}${buildAliExpressSignBaseString(params)}`, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function generatePrefixedSha256Signature(params, secret, prefix) {
  return crypto.createHmac('sha256', secret)
    .update(`${prefix}${buildAliExpressSignBaseString(params)}`, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function generateTopStyleMd5Signature(params, secret) {
  return crypto.createHash('md5')
    .update(`${secret}${buildAliExpressSignBaseString(params)}${secret}`, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function generateMethodPrefixedTopStyleMd5Signature(params, secret) {
  return crypto.createHash('md5')
    .update(`${secret}${params.method || ''}${buildAliExpressSignBaseString(params)}${secret}`, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function generateTopStyleHmacMd5Signature(params, secret) {
  return crypto.createHmac('md5', secret)
    .update(buildAliExpressSignBaseString(params), 'utf8')
    .digest('hex')
    .toUpperCase();
}


function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function isFalseLike(value) {
  return value === false || String(value).toLowerCase() === 'false';
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

async function requestAliExpress(params, transport = 'POST', endpoint = 'https://api-sg.aliexpress.com/sync') {
  const encodedParams = new URLSearchParams(params).toString();
  const isGet = transport === 'GET';
  const response = await fetch(`${endpoint}${isGet ? `?${encodedParams}` : ''}`, {
    method: isGet ? 'GET' : 'POST',
    headers: isGet ? undefined : {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
    },
    body: isGet ? undefined : encodedParams
  });

  const data = await response.json();
  return { response, data };
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

function buildAliExpressSignatureProbeSummary(probeCase, data, response) {
  const debug = buildAliExpressDebug(data, probeCase.params, response);
  const products = getAliExpressProducts(data);

  return {
    name: probeCase.name,
    httpStatus: debug.httpStatus,
    transport: probeCase.transport,
    signMethod: probeCase.signMethod,
    timestampFormat: probeCase.timestampFormat,
    signatureVariant: probeCase.signatureVariant,
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

function buildAliExpressSignatureProbeError(probeCase, error) {
  return {
    name: probeCase.name,
    httpStatus: undefined,
    transport: probeCase.transport,
    signMethod: probeCase.signMethod,
    timestampFormat: probeCase.timestampFormat,
    signatureVariant: probeCase.signatureVariant,
    code: undefined,
    msg: undefined,
    subCode: undefined,
    subMsg: undefined,
    errorCode: error.name || 'AliExpressSignatureProbeRequestError',
    errorMessage: error.message || 'AliExpress signature probe request failed',
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

function getAliTimestampMillis() {
  return String(Date.now());
}

function buildMinimalAliExpressParams(baseParams) {
  return {
    app_key: baseParams.app_key,
    method: baseParams.method,
    keywords: baseParams.keywords,
    page_no: baseParams.page_no,
    page_size: baseParams.page_size,
    sign_method: baseParams.sign_method,
    timestamp: baseParams.timestamp,
    tracking_id: baseParams.tracking_id,
    v: baseParams.v
  };
}

function signAliExpressSignatureProbeParams(params, appSecret, signatureVariant) {
  const signedParams = { ...params };

  if (signatureVariant === 'top_style_md5_with_method_prefix') {
    signedParams.sign = generateMethodPrefixedTopStyleMd5Signature(signedParams, appSecret);
  } else if (signatureVariant.includes('md5')) {
    signedParams.sign = generateTopStyleMd5Signature(signedParams, appSecret);
  } else if (signatureVariant.includes('with_method_prefix')) {
    signedParams.sign = generateMethodPrefixedSha256Signature(signedParams, appSecret);
  } else {
    signedParams.sign = generateSignature(signedParams, appSecret);
  }

  return signedParams;
}

function buildAliExpressSignatureProbeCases(baseParams) {
  const millisTimestamp = getAliTimestampMillis();
  const millisParams = { ...baseParams, timestamp: millisTimestamp };
  const md5Params = { ...baseParams, sign_method: 'md5' };
  const minimalMd5Params = { ...buildMinimalAliExpressParams(baseParams), sign_method: 'md5' };

  return [
    {
      name: 'current_post_sha256',
      transport: 'POST',
      signMethod: 'sha256',
      timestampFormat: 'standard',
      signatureVariant: 'current',
      params: { ...baseParams }
    },
    {
      name: 'get_sha256_current',
      transport: 'GET',
      signMethod: 'sha256',
      timestampFormat: 'standard',
      signatureVariant: 'current',
      params: { ...baseParams }
    },
    {
      name: 'post_sha256_with_method_prefix',
      transport: 'POST',
      signMethod: 'sha256',
      timestampFormat: 'standard',
      signatureVariant: 'with_method_prefix',
      params: { ...baseParams }
    },
    {
      name: 'get_sha256_with_method_prefix',
      transport: 'GET',
      signMethod: 'sha256',
      timestampFormat: 'standard',
      signatureVariant: 'with_method_prefix',
      params: { ...baseParams }
    },
    {
      name: 'post_md5_top_style',
      transport: 'POST',
      signMethod: 'md5',
      timestampFormat: 'standard',
      signatureVariant: 'top_style_md5',
      params: md5Params
    },
    {
      name: 'get_md5_top_style',
      transport: 'GET',
      signMethod: 'md5',
      timestampFormat: 'standard',
      signatureVariant: 'top_style_md5',
      params: md5Params
    },
    {
      name: 'post_timestamp_millis_sha256',
      transport: 'POST',
      signMethod: 'sha256',
      timestampFormat: 'millis',
      signatureVariant: 'current',
      params: { ...millisParams }
    },
    {
      name: 'get_timestamp_millis_sha256',
      transport: 'GET',
      signMethod: 'sha256',
      timestampFormat: 'millis',
      signatureVariant: 'current',
      params: { ...millisParams }
    },
    {
      name: 'post_timestamp_millis_with_method_prefix',
      transport: 'POST',
      signMethod: 'sha256',
      timestampFormat: 'millis',
      signatureVariant: 'with_method_prefix',
      params: { ...millisParams }
    },
    {
      name: 'minimal_get_md5',
      transport: 'GET',
      signMethod: 'md5',
      timestampFormat: 'standard',
      signatureVariant: 'top_style_md5',
      params: minimalMd5Params
    }
  ];
}

async function runAliExpressSignatureProbe(baseParams, appSecret) {
  const results = [];

  for (const probeCase of buildAliExpressSignatureProbeCases(baseParams)) {
    try {
      const signedParams = signAliExpressSignatureProbeParams(
        probeCase.params,
        appSecret,
        probeCase.signatureVariant
      );
      const { response, data } = await requestAliExpress(signedParams, probeCase.transport);
      results.push(buildAliExpressSignatureProbeSummary(
        { ...probeCase, params: signedParams },
        data,
        response
      ));
    } catch (error) {
      results.push(buildAliExpressSignatureProbeError(probeCase, error));
    }
  }

  return results;
}

function buildAliExpressSignatureProbeMode(sigprobe, baseParams) {
  const mode = String(sigprobe || '');

  if (mode === '1') {
    return {
      probe: 1,
      method: 'sha256 current',
      signatureVariant: 'current',
      params: { ...baseParams, sign_method: 'sha256' }
    };
  }

  if (mode === '2') {
    return {
      probe: 2,
      method: 'sha256+prefix',
      signatureVariant: 'with_method_prefix',
      params: { ...baseParams, sign_method: 'sha256' }
    };
  }

  if (mode === '3') {
    return {
      probe: 3,
      method: 'md5',
      signatureVariant: 'top_style_md5',
      params: { ...baseParams, sign_method: 'md5' }
    };
  }

  if (mode === '4') {
    return {
      probe: 4,
      method: 'md5+prefix',
      signatureVariant: 'top_style_md5_with_method_prefix',
      params: { ...baseParams, sign_method: 'md5' }
    };
  }

  return undefined;
}

function buildCompactAliExpressSignatureProbeResult(data, params, response) {
  const debug = buildAliExpressDebug(data, params, response);
  const products = getAliExpressProducts(data);

  return {
    bizSuccess: debug.bizSuccess,
    itemCount: products.length,
    code: debug.code,
    msg: debug.msg,
    subCode: debug.subCode,
    subMsg: debug.subMsg,
    errorCode: debug.errorCode,
    errorMessage: debug.errorMessage,
    requestId: debug.requestId
  };
}

function buildCompactAliExpressSignatureProbeError(error) {
  return {
    bizSuccess: false,
    itemCount: 0,
    code: undefined,
    msg: undefined,
    subCode: undefined,
    subMsg: undefined,
    errorCode: error.name || 'AliExpressSignatureProbeRequestError',
    errorMessage: error.message || 'AliExpress signature probe request failed',
    requestId: undefined
  };
}

async function runAliExpressSignatureProbeMode(probeCase, appSecret) {
  try {
    const signedParams = signAliExpressSignatureProbeParams(
      probeCase.params,
      appSecret,
      probeCase.signatureVariant
    );
    const { response, data } = await requestAliExpress(signedParams);

    return buildCompactAliExpressSignatureProbeResult(data, signedParams, response);
  } catch (error) {
    return buildCompactAliExpressSignatureProbeError(error);
  }
}


function buildTopProbeMinimalParams(appKey, signMethod) {
  return {
    app_key: appKey,
    format: 'json',
    keywords: 'iphone',
    method: 'aliexpress.affiliate.product.query',
    page_no: '1',
    page_size: '20',
    sign_method: signMethod,
    timestamp: getAliTimestamp(),
    v: '2.0'
  };
}

function buildAliExpressTopProbeMode(topprobe, appKey) {
  const mode = String(topprobe || '');

  if (mode === '1') {
    return {
      probe: 1,
      endpoint: 'https://api-sg.aliexpress.com/sync',
      signMethod: 'md5',
      signatureVariant: 'top_style_md5',
      params: buildTopProbeMinimalParams(appKey, 'md5')
    };
  }

  if (mode === '2') {
    return {
      probe: 2,
      endpoint: 'https://eco.taobao.com/router/rest',
      signMethod: 'md5',
      signatureVariant: 'top_style_md5',
      params: buildTopProbeMinimalParams(appKey, 'md5')
    };
  }

  if (mode === '3') {
    return {
      probe: 3,
      endpoint: 'https://eco.taobao.com/router/rest',
      signMethod: 'hmac',
      signatureVariant: 'top_style_hmac_md5',
      params: buildTopProbeMinimalParams(appKey, 'hmac')
    };
  }

  return undefined;
}

function signAliExpressTopProbeParams(params, appSecret, signatureVariant) {
  const signedParams = { ...params };

  if (signatureVariant === 'top_style_hmac_md5') {
    signedParams.sign = generateTopStyleHmacMd5Signature(signedParams, appSecret);
  } else {
    signedParams.sign = generateTopStyleMd5Signature(signedParams, appSecret);
  }

  return signedParams;
}

function buildAliExpressTopProbeResult(data, params, response) {
  const debug = buildAliExpressDebug(data, params, response);
  const products = getAliExpressProducts(data);

  return {
    httpStatus: debug.httpStatus,
    code: debug.code,
    msg: debug.msg,
    subCode: debug.subCode,
    subMsg: debug.subMsg,
    errorCode: debug.errorCode,
    errorMessage: debug.errorMessage,
    bizSuccess: debug.bizSuccess,
    itemCount: products.length,
    requestId: debug.requestId,
    responseKeys: debug.responseKeys
  };
}

function buildAliExpressTopProbeError(error) {
  return {
    httpStatus: undefined,
    code: undefined,
    msg: undefined,
    subCode: undefined,
    subMsg: undefined,
    errorCode: error.name || 'AliExpressTopProbeRequestError',
    errorMessage: error.message || 'AliExpress TOP probe request failed',
    bizSuccess: false,
    itemCount: 0,
    requestId: undefined,
    responseKeys: []
  };
}

async function requestAliExpressTopProbe(params, endpoint) {
  const encodedParams = new URLSearchParams(params).toString();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
    },
    body: encodedParams
  });
  const responseText = await response.text();

  try {
    return { response, data: JSON.parse(responseText) };
  } catch (error) {
    return {
      response,
      data: {
        error_response: {
          code: 'NonJsonTopProbeResponse',
          msg: responseText.slice(0, 500)
        }
      }
    };
  }
}

async function runAliExpressTopProbeMode(probeCase, appSecret) {
  try {
    const signedParams = signAliExpressTopProbeParams(
      probeCase.params,
      appSecret,
      probeCase.signatureVariant
    );
    const { response, data } = await requestAliExpressTopProbe(signedParams, probeCase.endpoint);

    return buildAliExpressTopProbeResult(data, signedParams, response);
  } catch (error) {
    return buildAliExpressTopProbeError(error);
  }
}

function buildAliExpressDocProbeBaseParams(appKey) {
  return {
    app_key: appKey,
    method: 'aliexpress.affiliate.product.query',
    format: 'json',
    v: '2.0',
    timestamp: getAliTimestamp(),
    sign_method: 'sha256',
    keywords: 'mp3',
    fields: 'commission_rate,sale_price',
    page_no: '1',
    page_size: '20',
    platform_product_type: 'ALL',
    sort: 'SALE_PRICE_ASC',
    target_currency: 'USD',
    target_language: 'EN',
    tracking_id: 'thisone',
    ship_to_country: 'US',
    delivery_days: '3',
    app_signature: 'thisone'
  };
}

function buildAliExpressDocProbeMode(docprobe, appKey) {
  const mode = String(docprobe || '');
  const baseParams = buildAliExpressDocProbeBaseParams(appKey);

  if (mode === '1') {
    return {
      probe: 1,
      endpoint: 'https://api-sg.aliexpress.com/sync',
      signMethod: 'sha256',
      signatureVariant: 'current',
      params: baseParams
    };
  }

  if (mode === '2') {
    return {
      probe: 2,
      endpoint: 'https://api-sg.aliexpress.com/sync',
      signMethod: 'md5',
      signatureVariant: 'top_style_md5',
      params: { ...baseParams, sign_method: 'md5' }
    };
  }

  if (mode === '3') {
    const { app_signature: _appSignature, ...params } = baseParams;

    return {
      probe: 3,
      endpoint: 'https://api-sg.aliexpress.com/sync',
      signMethod: 'sha256',
      signatureVariant: 'current',
      params
    };
  }

  if (mode === '4') {
    const { tracking_id: _trackingId, ...params } = baseParams;

    return {
      probe: 4,
      endpoint: 'https://api-sg.aliexpress.com/sync',
      signMethod: 'sha256',
      signatureVariant: 'current',
      params
    };
  }

  return undefined;
}

function signAliExpressDocProbeParams(params, appSecret, signatureVariant) {
  const signedParams = { ...params };

  if (signatureVariant === 'top_style_md5') {
    signedParams.sign = generateTopStyleMd5Signature(signedParams, appSecret);
  } else {
    signedParams.sign = generateSignature(signedParams, appSecret);
  }

  return signedParams;
}

function buildAliExpressDocProbeResult(data, params, response) {
  const debug = buildAliExpressDebug(data, params, response);
  const products = getAliExpressProducts(data);

  return {
    httpStatus: debug.httpStatus,
    code: debug.code,
    msg: debug.msg,
    subCode: debug.subCode,
    subMsg: debug.subMsg,
    errorCode: debug.errorCode,
    errorMessage: debug.errorMessage,
    bizSuccess: debug.bizSuccess,
    itemCount: products.length,
    requestId: debug.requestId,
    responseKeys: debug.responseKeys
  };
}

function buildAliExpressDocProbeError(error) {
  return {
    httpStatus: undefined,
    code: undefined,
    msg: undefined,
    subCode: undefined,
    subMsg: undefined,
    errorCode: error.name || 'AliExpressDocProbeRequestError',
    errorMessage: error.message || 'AliExpress documentation sample probe request failed',
    bizSuccess: false,
    itemCount: 0,
    requestId: undefined,
    responseKeys: []
  };
}

async function runAliExpressDocProbeMode(probeCase, appSecret) {
  try {
    const signedParams = signAliExpressDocProbeParams(
      probeCase.params,
      appSecret,
      probeCase.signatureVariant
    );
    const { response, data } = await requestAliExpressTopProbe(signedParams, probeCase.endpoint);

    return buildAliExpressDocProbeResult(data, signedParams, response);
  } catch (error) {
    return buildAliExpressDocProbeError(error);
  }
}


function getAliTimestampSeconds() {
  return String(Math.floor(Date.now() / 1000));
}

function buildAliExpressFinalProbeBaseParams(appKey, signMethod, timestamp) {
  return {
    app_key: appKey,
    method: 'aliexpress.affiliate.product.query',
    format: 'json',
    v: '2.0',
    timestamp,
    sign_method: signMethod,
    keywords: 'mp3',
    fields: 'commission_rate,sale_price',
    page_no: '1',
    page_size: '20',
    platform_product_type: 'ALL',
    sort: 'SALE_PRICE_ASC',
    target_currency: 'USD',
    target_language: 'EN',
    ship_to_country: 'US'
  };
}

function buildAliExpressFinalProbeMode(finalprobe, appKey) {
  const mode = String(finalprobe || '');
  const unixSeconds = getAliTimestampSeconds();

  if (mode === '1') {
    return {
      probe: 1,
      endpoint: 'https://api-sg.aliexpress.com/sync',
      signMethod: 'md5',
      timestampFormat: 'unix_seconds',
      signatureVariant: 'top_style_md5',
      params: buildAliExpressFinalProbeBaseParams(appKey, 'md5', unixSeconds)
    };
  }

  if (mode === '2') {
    return {
      probe: 2,
      endpoint: 'https://api-sg.aliexpress.com/sync',
      signMethod: 'sha256',
      timestampFormat: 'unix_seconds',
      signatureVariant: 'current',
      params: buildAliExpressFinalProbeBaseParams(appKey, 'sha256', unixSeconds)
    };
  }

  if (mode === '3') {
    return {
      probe: 3,
      endpoint: 'https://api-sg.aliexpress.com/sync',
      signMethod: 'md5',
      timestampFormat: 'unix_milliseconds',
      signatureVariant: 'top_style_md5',
      params: buildAliExpressFinalProbeBaseParams(appKey, 'md5', getAliTimestampMillis())
    };
  }

  if (mode === '4') {
    const { method: _method, ...params } = buildAliExpressFinalProbeBaseParams(appKey, 'sha256', unixSeconds);

    return {
      probe: 4,
      endpoint: 'https://api-sg.aliexpress.com/rest/aliexpress.affiliate.product.query',
      signMethod: 'sha256',
      timestampFormat: 'unix_seconds',
      signatureVariant: 'method_prefixed_sha256',
      signaturePrefix: 'aliexpress.affiliate.product.query',
      params
    };
  }

  if (mode === '5') {
    const { method: _method, ...params } = buildAliExpressFinalProbeBaseParams(appKey, 'sha256', unixSeconds);

    return {
      probe: 5,
      endpoint: 'https://api-sg.aliexpress.com/rest/aliexpress/affiliate/product/query',
      signMethod: 'sha256',
      timestampFormat: 'unix_seconds',
      signatureVariant: 'path_prefixed_sha256',
      signaturePrefix: '/aliexpress/affiliate/product/query',
      params
    };
  }

  return undefined;
}

function signAliExpressFinalProbeParams(params, appSecret, probeCase) {
  const signedParams = { ...params };

  if (probeCase.signatureVariant === 'top_style_md5') {
    signedParams.sign = generateTopStyleMd5Signature(signedParams, appSecret);
  } else if (probeCase.signatureVariant === 'method_prefixed_sha256' || probeCase.signatureVariant === 'path_prefixed_sha256') {
    signedParams.sign = generatePrefixedSha256Signature(signedParams, appSecret, probeCase.signaturePrefix);
  } else {
    signedParams.sign = generateSignature(signedParams, appSecret);
  }

  return signedParams;
}

function buildAliExpressFinalProbeResult(data, params, response) {
  const debug = buildAliExpressDebug(data, params, response);
  const products = getAliExpressProducts(data);

  return {
    httpStatus: debug.httpStatus,
    code: debug.code,
    msg: debug.msg,
    subCode: debug.subCode,
    subMsg: debug.subMsg,
    errorCode: debug.errorCode,
    errorMessage: debug.errorMessage,
    bizSuccess: debug.bizSuccess,
    itemCount: products.length,
    requestId: debug.requestId,
    responseKeys: debug.responseKeys
  };
}

function buildAliExpressFinalProbeError(error) {
  return {
    httpStatus: undefined,
    code: undefined,
    msg: undefined,
    subCode: undefined,
    subMsg: undefined,
    errorCode: error.name || 'AliExpressFinalProbeRequestError',
    errorMessage: error.message || 'AliExpress final probe request failed',
    bizSuccess: false,
    itemCount: 0,
    requestId: undefined,
    responseKeys: []
  };
}

async function runAliExpressFinalProbeMode(probeCase, appSecret) {
  try {
    const signedParams = signAliExpressFinalProbeParams(
      probeCase.params,
      appSecret,
      probeCase
    );
    const { response, data } = await requestAliExpressTopProbe(signedParams, probeCase.endpoint);

    return buildAliExpressFinalProbeResult(data, signedParams, response);
  } catch (error) {
    return buildAliExpressFinalProbeError(error);
  }
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

    if (req.query?.finalprobe !== undefined) {
      const finalProbeCase = buildAliExpressFinalProbeMode(req.query.finalprobe, APP_KEY);

      if (!finalProbeCase) {
        return res.status(200).json({
          status: 'FinalProbeError',
          message: 'Unsupported finalprobe mode. Use finalprobe=1, 2, 3, 4, or 5.',
          search_query: searchQuery
        });
      }

      const result = await runAliExpressFinalProbeMode(finalProbeCase, APP_SECRET);

      return res.status(200).json({
        status: 'FinalProbeComplete',
        probe: finalProbeCase.probe,
        endpoint: finalProbeCase.endpoint,
        signMethod: finalProbeCase.signMethod,
        timestampFormat: finalProbeCase.timestampFormat,
        result
      });
    }

    if (req.query?.docprobe !== undefined) {
      const docProbeCase = buildAliExpressDocProbeMode(req.query.docprobe, APP_KEY);

      if (!docProbeCase) {
        return res.status(200).json({
          status: 'DocProbeError',
          message: 'Unsupported docprobe mode. Use docprobe=1, 2, 3, or 4.',
          search_query: searchQuery
        });
      }

      const result = await runAliExpressDocProbeMode(docProbeCase, APP_SECRET);

      return res.status(200).json({
        status: 'DocProbeComplete',
        probe: docProbeCase.probe,
        endpoint: docProbeCase.endpoint,
        signMethod: docProbeCase.signMethod,
        result
      });
    }

    if (req.query?.topprobe !== undefined) {
      const topProbeCase = buildAliExpressTopProbeMode(req.query.topprobe, APP_KEY);

      if (!topProbeCase) {
        return res.status(200).json({
          status: 'TopProbeError',
          message: 'Unsupported topprobe mode. Use topprobe=1, 2, or 3.',
          search_query: searchQuery
        });
      }

      const result = await runAliExpressTopProbeMode(topProbeCase, APP_SECRET);

      return res.status(200).json({
        status: 'TopProbeComplete',
        probe: topProbeCase.probe,
        endpoint: topProbeCase.endpoint,
        signMethod: topProbeCase.signMethod,
        result
      });
    }

    if (req.query?.probe === '1') {
      const results = await runAliExpressProbe(baseParams, APP_SECRET);

      return res.status(200).json({
        status: 'ProbeComplete',
        search_query: searchQuery,
        results
      });
    }

    if (req.query?.sigprobe !== undefined) {
      const signatureProbeCase = buildAliExpressSignatureProbeMode(req.query.sigprobe, baseParams);

      if (!signatureProbeCase) {
        return res.status(200).json({
          status: 'SignatureProbeError',
          message: 'Unsupported sigprobe mode. Use sigprobe=1, 2, 3, or 4.',
          search_query: searchQuery
        });
      }

      const result = await runAliExpressSignatureProbeMode(signatureProbeCase, APP_SECRET);

      return res.status(200).json({
        status: 'SignatureProbeComplete',
        probe: signatureProbeCase.probe,
        method: signatureProbeCase.method,
        search_query: searchQuery,
        result
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
