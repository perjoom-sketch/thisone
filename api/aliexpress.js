// api/aliexpress.js
const crypto = require('crypto');

function generateSign(params, appSecret) {
  const sortedKeys = Object.keys(params).sort();
  let str = appSecret;
  for (const key of sortedKeys) {
    str += key + params[key];
  }
  str += appSecret;
  return crypto.createHmac('sha256', appSecret)
    .update(str)
    .digest('hex')
    .toUpperCase();
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const q = String(req.query.q || req.query.query || '').trim();
    if (!q) return res.status(400).json({ error: '검색어가 없습니다.' });

    const appKey = process.env.ALIEXPRESS_APP_KEY;
    const appSecret = process.env.ALIEXPRESS_APP_SECRET;

    if (!appKey || !appSecret) {
      return res.status(500).json({ error: 'AliExpress API 키가 설정되지 않았습니다.' });
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const params = {
      method: 'aliexpress.affiliate.product.query',
      app_key: appKey,
      timestamp,
      sign_method: 'hmac-sha256',
      format: 'json',
      v: '2.0',
      keywords: q,
      page_no: '1',
      page_size: '20',
      sort: 'SALE_PRICE_ASC',
      target_currency: 'KRW',
      target_language: 'KO',
      tracking_id: 'thisone',
    };

    params.sign = generateSign(params, appSecret);

    const urlParams = new URLSearchParams(params);
    const apiUrl = `https://api-sg.aliexpress.com/sync?${urlParams.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(apiUrl, { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') throw new Error('AliExpress API timeout');
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'AliExpress API error', detail: text });
    }

    let data;
    try { data = JSON.parse(text); } catch (e) {
      return res.status(500).json({ error: 'AliExpress 응답 JSON 파싱 실패' });
    }

    // 응답 구조 파싱
    const result = data?.aliexpress_affiliate_product_query_response?.resp_result;
    if (!result || result.resp_code !== 200) {
      return res.status(500).json({ error: result?.resp_msg || 'AliExpress API 오류', raw: data });
    }

    const products = result.result?.products?.product || [];

    const items = products.map((p, idx) => ({
      id: String(idx + 1),
      name: p.product_title || '',
      link: p.product_detail_url || '',
      image: p.product_main_image_url || '',
      lprice: Math.round(Number(p.target_sale_price || p.sale_price || 0)),
      priceText: p.target_sale_price
        ? `${Math.round(Number(p.target_sale_price)).toLocaleString('ko-KR')}원`
        : '',
      store: 'AliExpress',
      productId: String(p.product_id || ''),
      source: 'aliexpress',
      originalPrice: p.target_original_price || null,
      rating: p.evaluate_rate || null,
      orders: p.lastest_volume || null,
    }));

    return res.status(200).json({
      query: q,
      total: items.length,
      items,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 30 };
