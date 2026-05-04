const crypto = require('crypto');

function generateSign(params, appSecret) {
  // 파라미터 알파벳순 정렬 후 key+value 연결
  const sortedKeys = Object.keys(params).sort();
  let str = appSecret;
  for (const key of sortedKeys) {
    str += key + params[key];
  }
  str += appSecret;
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
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
    // timestamp: "2026-05-04 08:00:00" 형식
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);

    const params = {
      method: 'aliexpress.affiliate.product.query',
      app_key: appKey,
      timestamp,
      sign_method: 'md5',
      format: 'json',
      v: '2.0',
      keywords: q,
      page_no: '1',
      page_size: '20',
      sort: 'SALE_PRICE_ASC',
      target_currency: 'KRW',
      target_language: 'KO',
      tracking_id: trackingId,
    };

    params.sign = generateSign(params, appSecret);

    // URLSearchParams는 공백을 '+'로 인코딩 → AliExpress 오류 원인
    // 수동으로 %20으로 인코딩
    const queryString = Object.keys(params)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');
    const apiUrl = `https://api-sg.aliexpress.com/sync?${queryString}`;

    console.log('[AliExpress] URL:', apiUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let response;
    try {
      response = await fetch(apiUrl, { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') throw new Error('AliExpress API timeout (20s)');
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const text = await response.text();
    console.log('[AliExpress] raw response:', text.substring(0, 500));

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({ error: 'AliExpress 응답 파싱 실패', raw: text.substring(0, 300) });
    }

    const result = data?.aliexpress_affiliate_product_query_response?.resp_result;

    if (!result) {
      return res.status(500).json({ error: 'AliExpress 응답 구조 오류', raw: data });
    }

    if (result.resp_code !== 200) {
      return res.status(500).json({
        error: `AliExpress API 오류 (code: ${result.resp_code})`,
        message: result.resp_msg,
        raw: data,
      });
    }

    const products = result.result?.products?.product || [];

    if (products.length === 0) {
      return res.status(200).json({ query: q, total: 0, items: [] });
    }

    const items = products.map((p, idx) => {
      const salePrice = Number(p.target_sale_price || p.sale_price || 0);
      const origPrice = Number(p.target_original_price || 0);
      const discount = origPrice > salePrice
        ? Math.round(((origPrice - salePrice) / origPrice) * 100)
        : 0;

      return {
        id: String(idx + 1),
        productId: String(p.product_id || ''),
        name: p.product_title || '',
        link: p.product_detail_url || '',
        image: p.product_main_image_url || '',
        lprice: Math.round(salePrice),
        priceText: salePrice > 0
          ? `${Math.round(salePrice).toLocaleString('ko-KR')}원`
          : '가격 미정',
        originalPrice: origPrice > 0 ? Math.round(origPrice) : null,
        discount,
        store: 'AliExpress',
        source: 'aliexpress',
        rating: p.evaluate_rate ? parseFloat(p.evaluate_rate) : null,
        orders: p.lastest_volume || null,
        commissionRate: p.commission_rate || null,
      };
    });

    return res.status(200).json({
      query: q,
      total: items.length,
      items,
    });

  } catch (err) {
    console.error('[AliExpress] error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

module.exports.config = { maxDuration: 30 };
