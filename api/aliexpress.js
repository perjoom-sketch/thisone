const crypto = require('crypto');

function getTimestamp() {
  const now = new Date();
  const offset = 8 * 60 * 60 * 1000;
  const beijingTime = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${beijingTime.getFullYear()}-${pad(beijingTime.getMonth() + 1)}-${pad(beijingTime.getDate())} ${pad(beijingTime.getHours())}:${pad(beijingTime.getMinutes())}:${pad(beijingTime.getSeconds())}`;
}

function generateSign(params, appSecret) {
  const keys = Object.keys(params).filter(
    (key) => key !== 'sign' && params[key] !== undefined && params[key] !== null && params[key] !== ''
  );
  keys.sort(); // ASCII 기준 정렬 (localeCompare 아님!)

  let baseString = '';
  keys.forEach((key) => { baseString += key + String(params[key]); });

  return crypto.createHmac('sha256', appSecret)
    .update(baseString, 'utf8')
    .digest('hex')
    .toUpperCase();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query.q;
  if (!q) return res.status(400).json({ error: '검색어를 입력하세요.' });

  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID || 'thisone';

  if (!appKey || !appSecret) {
    return res.status(500).json({ error: 'AliExpress API 키가 설정되지 않았습니다.' });
  }

  try {
    const params = {
      method: 'aliexpress.affiliate.product.query',
      app_key: appKey,
      sign_method: 'sha256',
      timestamp: getTimestamp(),
      format: 'json',
      v: '2.0',
      keywords: q,
      target_currency: 'KRW',
      target_language: 'KO',
      page_no: '1',
      page_size: '20',
      sort: 'SALE_PRICE_ASC',
      tracking_id: trackingId,
    };

    params.sign = generateSign(params, appSecret);

    console.log('[AliExpress] timestamp:', params.timestamp);
    console.log('[AliExpress] sign:', params.sign);

    // POST 방식 (GET보다 안정적)
    const response = await fetch('https://api-sg.aliexpress.com/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams(params).toString(),
    });

    const data = await response.json();
    console.log('[AliExpress] raw:', JSON.stringify(data).substring(0, 300));

    if (data.error_response) {
      return res.status(500).json({
        error: `AliExpress 오류: ${data.error_response.code}`,
        message: data.error_response.msg,
        raw: data,
      });
    }

    const result = data?.aliexpress_affiliate_product_query_response?.resp_result;
    if (!result) return res.status(500).json({ error: '응답 구조 오류', raw: data });

    if (String(result.resp_code) !== '200') {
      return res.status(500).json({
        error: `AliExpress API 오류 (code: ${result.resp_code})`,
        message: result.resp_msg,
        raw: data,
      });
    }

    const products = result.result?.products?.product || [];
    const items = products.map((p, idx) => {
      const salePrice = Number(p.target_sale_price || p.sale_price || 0);
      const origPrice = Number(p.target_original_price || 0);
      const discount = origPrice > salePrice ? Math.round(((origPrice - salePrice) / origPrice) * 100) : 0;
      return {
        id: String(idx + 1),
        productId: String(p.product_id || ''),
        name: p.product_title || '',
        link: p.product_detail_url || '',
        image: p.product_main_image_url || '',
        lprice: Math.round(salePrice),
        priceText: salePrice > 0 ? `${Math.round(salePrice).toLocaleString('ko-KR')}원` : '가격 미정',
        originalPrice: origPrice > 0 ? Math.round(origPrice) : null,
        discount,
        store: 'AliExpress',
        source: 'aliexpress',
        rating: p.evaluate_rate ? parseFloat(p.evaluate_rate) : null,
        orders: p.lastest_volume || null,
        commissionRate: p.commission_rate || null,
      };
    });

    return res.status(200).json({ query: q, total: items.length, items });

  } catch (err) {
    console.error('[AliExpress] error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

module.exports.config = { maxDuration: 30 };
