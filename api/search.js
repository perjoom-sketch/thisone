// api/search.js
const { applyUniversalAIFilter } = require('../lib/universalFilter');
const { improveQuery } = require('../lib/queryNormalizer');
const { shouldUseCanonicalIntent, canonicalizeQuery } = require('../lib/canonicalIntent');

function stripTags(text){return String(text||'').replace(/<[^>]*>/g,'').trim();}
function isTrue(value){return value === true || String(value).toLowerCase() === 'true';}
function parsePositiveNumber(value){
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function isRentalLikeItem(item){
  const text = `${item?.name || ''} ${item?.store || ''}`;
  return /렌탈|대여|구독|약정|월납/i.test(text);
}
function isRentalCapableQuery(query){
  const q = String(query || '').toLowerCase();
  return /음식물처리기|음쓰처리기|정수기|비데|안마의자|공기청정기|공청기/i.test(q);
}
function buildNaverShopUrl(query, { display = 10, start = 1, sort = 'sim' } = {}){
  return `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=${sort}`;
}
async function fetchNaverShopItems(query, { display = 10, start = 1, sort = 'sim' } = {}){
  const url = buildNaverShopUrl(query, { display, start, sort });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
      },
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      const err = new Error('Naver Shopping API error');
      err.status = response.status;
      err.detail = text;
      throw err;
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('네이버 응답 JSON 파싱 실패');
    }
  } catch (fetchErr) {
    if (fetchErr.name === 'AbortError') {
      throw new Error('Naver Shopping API timeout');
    }
    throw fetchErr;
  } finally {
    clearTimeout(timeoutId);
  }
}
function mapNaverItems(rawItems){
  return (rawItems || []).map((item,idx)=>({
    id:String(idx+1),
    name:stripTags(item.title),
    link:item.link||'',
    image:item.image||'',
    lprice:Number(item.lprice||0),
    priceText:item.lprice?`${Number(item.lprice).toLocaleString('ko-KR')}원`:'',
    store:stripTags(item.mallName||''),
    productId:item.productId||'',
    delivery:stripTags(item.delivery||item.deliveryInfo||'')
  }));
}
function appendUniqueItems(baseItems, extraItems){
  const base = Array.isArray(baseItems) ? baseItems : [];
  const extra = Array.isArray(extraItems) ? extraItems : [];
  const seen = new Set(base.map(item => String(item?.productId || item?.link || item?.name || '')));
  const merged = [...base];

  extra.forEach((item) => {
    const key = String(item?.productId || item?.link || item?.name || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({ ...item, id: String(merged.length + 1), rentalEnriched: true });
  });

  return merged;
}
async function enrichRentalCapableItems(query, items, settings){
  if (settings?.excludeRental) return { items, addedCount: 0, query: null };
  if (!isRentalCapableQuery(query)) return { items, addedCount: 0, query: null };
  if ((items || []).some(isRentalLikeItem)) return { items, addedCount: 0, query: null };

  const rentalQuery = `${query} 렌탈`;
  try {
    const data = await fetchNaverShopItems(rentalQuery, { display: 10, start: 1, sort: 'sim' });
    const rentalItems = mapNaverItems(data.items).filter(isRentalLikeItem);
    const merged = appendUniqueItems(items, rentalItems);
    return { items: merged, addedCount: merged.length - items.length, query: rentalQuery };
  } catch (e) {
    return { items, addedCount: 0, query: rentalQuery, error: e.message };
  }
}
function restoreRentalItemsIfAllowed(filteredItems, sourceItems, settings){
  if (settings?.excludeRental) return filteredItems;
  const base = Array.isArray(filteredItems) ? filteredItems : [];
  const source = Array.isArray(sourceItems) ? sourceItems : [];
  const existingIds = new Set(base.map(item => String(item?.id || '')));
  const restored = source.filter(item => isRentalLikeItem(item) && !existingIds.has(String(item?.id || '')));
  return restored.length ? [...base, ...restored] : base;
}

function applySearchSettings(items, query) {
  const excludeRental = isTrue(query.excludeRental);
  const excludeUsed = isTrue(query.excludeUsed);
  const excludeOverseas = isTrue(query.excludeOverseas);
  const excludeAgent = isTrue(query.excludeAgent);
  const freeShipping = isTrue(query.freeShipping);
  const minPrice = parsePositiveNumber(query.minPrice);
  const maxPrice = parsePositiveNumber(query.maxPrice);

  const filtersActive = excludeRental || excludeUsed || excludeOverseas || excludeAgent || freeShipping || minPrice > 0 || maxPrice > 0;
  if (!filtersActive) return { items, rejected: [], settings: { excludeRental, excludeUsed, excludeOverseas, excludeAgent, freeShipping, minPrice, maxPrice } };

  const rejected = [];
  const filtered = items.filter(item => {
    const name = String(item.name || '').toLowerCase();
    const store = String(item.store || '').toLowerCase();
    const delivery = String(item.delivery || '').toLowerCase();
    const combined = `${name} ${store} ${delivery}`;
    const price = Number(item.lprice || 0);

    let reason = '';
    if (excludeRental && isRentalLikeItem(item)) reason = '설정: 렌탈 제외';
    else if (excludeUsed && /중고|리퍼|반품|전시|개봉/i.test(name)) reason = '설정: 중고/리퍼 제외';
    else if (excludeOverseas && /해외|직구|구매대행/i.test(combined)) reason = '설정: 직구 제외';
    else if (excludeAgent && /구매대행|대행/i.test(`${name} ${store}`)) reason = '설정: 대행 제외';
    else if (freeShipping && delivery && !/무료/i.test(delivery)) reason = '설정: 무료배송만 표시';
    else if (minPrice > 0 && price > 0 && price < minPrice) reason = '설정: 최소가격 미만';
    else if (maxPrice > 0 && price > 0 && price > maxPrice) reason = '설정: 최대가격 초과';

    if (reason) {
      rejected.push({
        id: item.id,
        name: item.name,
        reason,
        lprice: item.lprice,
        store: item.store
      });
      return false;
    }

    return true;
  });

  return {
    items: filtered,
    rejected,
    settings: { excludeRental, excludeUsed, excludeOverseas, excludeAgent, freeShipping, minPrice, maxPrice }
  };
}

async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='GET')return res.status(405).json({error:'Method Not Allowed'});

  try{
    let q=String(req.query.q||req.query.query||'').trim();
    if(!q){
      return res.status(400).json({error:'검색어가 없습니다.'});
    }

    let improvedQ = improveQuery(q);
    let canonicalDebug = null;

    if (process.env.USE_CANONICAL_QUERY === 'true' && shouldUseCanonicalIntent(q)) {
      try {
        const canonical = await canonicalizeQuery(q);
        if (canonical && canonical.query) {
          improvedQ = canonical.query;
          canonicalDebug = canonical;
        }
      } catch (e) {
        // fail-open: ignore and keep improveQuery result
      }
    }

    const start=parseInt(req.query.start||'1');
    const display=parseInt(req.query.display||'30');
    const sort=req.query.sort||'sim';

    let data;
    try {
      data = await fetchNaverShopItems(improvedQ, { display, start, sort });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({error:'Naver Shopping API error',detail:err.detail});
      }
      throw err;
    }

    let items=mapNaverItems(data.items);

    const settingsResult = applySearchSettings(items, req.query);
    items = settingsResult.items;

    const rentalEnrichment = await enrichRentalCapableItems(improvedQ, items, settingsResult.settings);
    items = rentalEnrichment.items;

    const itemsBeforeUniversalFilter = items;

    const universalResult=await applyUniversalAIFilter({query:q,items});
    const universalItems=Array.isArray(universalResult.filteredItems)?universalResult.filteredItems:items;
    const finalItems=restoreRentalItemsIfAllowed(universalItems, itemsBeforeUniversalFilter, settingsResult.settings);

    return res.status(200).json({
      query:q,
      improvedQuery:improvedQ,
      canonicalDebug,
      total:data.total||0,
      items:finalItems,
      rejectedItems:[
        ...(settingsResult.rejected||[]),
        ...(universalResult.rejectedItems||[]).filter(item => settingsResult.settings.excludeRental || !isRentalLikeItem(item))
      ],
      searchSettingsDebug:{
        applied: settingsResult.settings,
        rejectedCount: settingsResult.rejected.length,
        restoredRentalCount: Math.max(0, finalItems.length - universalItems.length),
        rentalEnrichment,
        note: 'freeShipping only applies when upstream delivery text is available'
      },
      universalFilterDebug:universalResult.debug||null
    });

  }catch(err){
    return res.status(500).json({error:err.message||'Server error'});
  }
}

module.exports=handler;
module.exports.config={maxDuration:30};