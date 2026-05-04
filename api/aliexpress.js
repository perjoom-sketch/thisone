const crypto = require('crypto');

// AliExpress 기준 시간(GMT+8) 타임스탬프 생성
function getAliTimestamp() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const aliTime = new Date(utc + (8 * 60 * 60 * 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${aliTime.getFullYear()}-${pad(aliTime.getMonth() + 1)}-${pad(aliTime.getDate())} ${pad(aliTime.getHours())}:${pad(aliTime.getMinutes())}:${pad(aliTime.getSeconds())}`;
}

function buildSign(params, appSecret) {
  const keys = Object.keys(params).filter(
    (key) => key !== 'sign' && params[key] !== undefined && params[key] !== null && params[key] !== ''
  );
  keys.sort(); // ASCII 기준 정렬

  let baseString = '';
  keys.forEach((key) => {
    baseString += key + String(params[key]);
  });

  const sign = crypto.createHmac('sha256', appSecret)
    .update(baseString, 'utf8')
    .digest('hex')
    .toUpperCase();

  return { sign, baseString };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const APP_KEY = (process.env.ALIEXPRESS_APP_KEY || '').trim();
    const APP_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();
    const TRACKING_ID = (process.env.ALIEXPRESS_TRACKING_ID || 'thisone').trim();

    if (!APP_KEY || !APP_SECRET) {
      return res.status(500).json({ error: '환경 변수 오류: ALIEXPRESS_APP_KEY 또는 ALIEXPRESS_APP_SECRET 누락' });
    }

    const q = String(req.query.q || req.query.query || '마우스').trim();

    const params = {
      app_key: APP_KEY,
      format: 'json',
      keywords: q,
      method: 'aliexpress.affiliate.product.query',
      page_size: '20',
      sign_method: 'sha256',
      target_currency: 'KRW',
      target_language: 'KO',
      timestamp: getAliTimestamp(),
      tracking_id: TRACKING_ID,
      v: '2.0'
    };

    const { sign, baseString } = buildSign(params, APP_SECRET);
    params.sign = sign;

    console.log('[AliExpress] debug:', {
      timestamp: params.timestamp,
      appKey: APP_KEY,
      trackingId: TRACKING_ID,
      baseString,
      sign,
    });

    const response = await fetch('https://api-sg.aliexpress.com/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: new URLSearchParams(params).toString()
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return res.status(500).json({
        error: 'AliExpress 응답 파싱 실패',
        raw: text.substring(0, 500),
        debug_baseString: baseString
      });
    }

    if (data.error_response) {
      return res.status(400).json({
        error: 'AliExpress API 에러',
        detail: data.error_response,
        debug_baseString: baseString
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('[AliExpress] server error:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
}
