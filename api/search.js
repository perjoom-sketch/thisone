// api/search.js
const crypto = require('crypto');
const { applyUniversalAIFilter } = require('../lib/universalFilter');
const { improveQuery } = require('../lib/queryNormalizer');
const { shouldUseCanonicalIntent, canonicalizeQuery } = require('../lib/canonicalIntent');
const { enrichYoutubeReputation } = require('../lib/youtubeReputation');

let kv = null;
try {
  ({ kv } = require('@vercel/kv'));
} catch (e) {
  kv = null;
}

const SEARCH_CACHE_TTL_SECONDS = 3600;
const YOUTUBE_REPUTATION_TIMEOUT_MS = Number(process.env.YOUTUBE_REPUTATION_TIMEOUT_MS || 3500);

function stripTags(text){return String(text||'').replace(/<[^>]*>/g,'').trim();}
function isTrue(value){return value === true || String(value).toLowerCase() === 'true';}
function parsePositiveNumber(value){
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function stableStringify(value){
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function sha1Short(value){
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 8);
}
function normalizeSearchCacheQuery(query){
  return String(improveQuery(query) || '').trim().toLowerCase();
}
function buildExpertSettingsHashSource(query, { start, display, sort }){
  return {
    excludeRental: isTrue(query.excludeRental),
    excludeUsed: isTrue(query.excludeUsed),
    excludeOverseas: isTrue(query.excludeOverseas),
    excludeAgent: isTrue(query.excludeAgent),
    freeShipping: isTrue(query.freeShipping),
    minPrice: parsePositiveNumber(query.minPrice),
    maxPrice: parsePositiveNumber(query.maxPrice),
    start,
    display,
    sort: String(sort || 'sim')
  };
}
function buildSearchCacheKey(normalizedQuery, settingsHashSource){
  return `search:v1:${encodeURIComponent(normalizedQuery)}:${sha1Short(stableStringify(settingsHashSource))}`;
}
async function readSearchCache(key){
  if (!kv || !key) return null;
  try {
    return await kv.get(key);
  } catch (e) {
    return null;
  }
}
async function writeSearchCache(key, value){
  if (!kv || !key || !value) return;
  try {
    await kv.set(key, value, { ex: SEARCH_CACHE_TTL_SECONDS });
  } catch (e) {
    // fail-open: 캐시 저장 실패는 검색 응답에 영향 주지 않는다.
  }
}
async function readYoutubeCache(key){
  if (!kv || !key) return null;
  try {
    return await kv.get(key);
  } catch (e) {
    return null;
  }
}
async function writeYoutubeCache(key, value, ttlSeconds){
  if (!kv || !key || !value) return;
  try {
    await kv.set(key, value, { ex: ttlSeconds });
  } catch (e) {
    // fail-open: YouTube 평판 캐시 저장 실패는 검색 응답에 영향 주지 않는다.
  }
}
function isYoutubeReputationEnabled(){
  if (!process.env.YOUTUBE_API_KEY) return false;
  return String(process.env.YOUTUBE_REPUTATION_ENABLED || 'true').toLowerCase() !== 'false';
}

function buildYoutubeDebugInfo(youtubeResult, durationMs){
  const debug = youtubeResult?.debug || {};
  const enabled = debug.enabled === true;
  const cached = debug.cached === true;
  const error = debug.error || null;
  return {
    youtube_api: {
      enabled,
      called: enabled && !cached,
      success: enabled ? !error : false,
      durationMs: Number(durationMs || 0),
      cached,
      videoCount: Number(debug.videoCount || 0),
      matchedCount: Number(debug.matchedCount || 0),
      timeoutMs: Number(debug.timeoutMs || YOUTUBE_REPUTATION_TIMEOUT_MS),
      error
    }
  };
}

function isRentalLikeItem(item){
  const text = `${item?.name || ''} ${item?.store || ''} ${item?.priceText || ''} ${item?.delivery || ''}`;
  return /렌탈|대여|구독|약정|약정\s*\d+\s*년|월납|월\s*납입|의무사용|의무\s*\d+|방문관리|직접관리|자가관리|방문주기\s*\d*|코디관리|관리형|월\s*[0-9,]+\s*원|\d+\s*개월/i.test(text);
}
function isRentalCapableQuery(query){
  const q = String(query || '').toLowerCase();
  return /음식물처리기|음쓰처리기|정수기|비데|안마의자|공기청정기|공청기|로보락|roborock|로봇청소기|로봇\s*청소기/i.test(q);
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
function formatDeliveryFromItem(item){
  const rawDelivery = stripTags(item.delivery || item.deliveryInfo || item.shipping || item.shippingInfo || item.deliveryFeeText || item.shippingFeeText || '');
  if (rawDelivery) return rawDelivery;

  const feeValue = item.shippingFee ?? item.deliveryFee ?? item.shippingCost ?? item.deliveryCost;
  if (feeValue === undefined || feeValue === null || feeValue === '') return '';

  const fee = Number(String(feeValue).replace(/[^\d]/g, ''));
  if (Number.isFinite(fee) && fee === 0) return '무료배송';
  if (Number.isFinite(fee) && fee > 0) return `배송비 ${fee.toLocaleString('ko-KR')}원`;
  return '';
}
function mapNaverItems(rawItems){
  return (rawItems || []).map((item,idx)=>({
    id:String(idx+1),
    name:stripTags(item.title),
    link:item.link||'',
    image:item.image||'',
    lprice:Number(item.lprice||0),
    hprice:Number(item.hprice||0),
    priceText:item.lprice?`${Number(item.lprice).toLocaleString('ko-KR')}원`:'',
    store:stripTags(item.mallName||''),
    productId:item.productId||'',
    productType:item.productType||'',
    brand:stripTags(item.brand||''),
    maker:stripTags(item.maker||''),
    category1:stripTags(item.category1||''),
    category2:stripTags(item.category2||''),
    category3:stripTags(item.category3||''),
    category4:stripTags(item.category4||''),
    delivery:formatDeliveryFromItem(item)
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

  const existingRentalCount = (items || []).filter(isRentalLikeItem).length;
  if (existingRentalCount >= 3) {
    return { items, addedCount: 0, query: null, existingRentalCount };
  }

  const rentalQuery = `${query} 렌탈`;
  try {
    const data = await fetchNaverShopItems(rentalQuery, { display: 10, start: 1, sort: 'sim' });
    const rentalItems = mapNaverItems(data.items).filter(isRentalLikeItem);
    const merged = appendUniqueItems(items, rentalItems);
    return {
      items: merged,
      addedCount: merged.length - items.length,
      query: rentalQuery,
      existingRentalCount,
      fetchedRentalCount: rentalItems.length
    };
  } catch (e) {
    return { items, addedCount: 0, query: rentalQuery, existingRentalCount, error: e.message };
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

    const start=parseInt(req.query.start||'1');
    const display=parseInt(req.query.display||'30');
    const sort=req.query.sort||'sim';
    const normalizedCacheQuery = normalizeSearchCacheQuery(q);
    const settingsHashSource = buildExpertSettingsHashSource(req.query, { start, display, sort });
    const searchCacheKey = buildSearchCacheKey(normalizedCacheQuery, settingsHashSource);
    const cachedResponse = await readSearchCache(searchCacheKey);

    if (cachedResponse && typeof cachedResponse === 'object') {
      return res.status(200).json({
        ...cachedResponse,
        debug_info: cachedResponse.debug_info || {
          youtube_api: {
            enabled: cachedResponse.youtubeReputationDebug?.enabled === true,
            called: false,
            success: cachedResponse.youtubeReputationDebug?.enabled === true ? !cachedResponse.youtubeReputationDebug?.error : false,
            durationMs: 0,
            cached: true,
            videoCount: Number(cachedResponse.youtubeReputationDebug?.videoCount || 0),
            matchedCount: Number(cachedResponse.youtubeReputationDebug?.matchedCount || 0),
            timeoutMs: Number(cachedResponse.youtubeReputationDebug?.timeoutMs || YOUTUBE_REPUTATION_TIMEOUT_MS),
            error: cachedResponse.youtubeReputationDebug?.error || null
          }
        },
        _cached: true,
        searchCacheDebug: {
          ...(cachedResponse.searchCacheDebug || {}),
          key: searchCacheKey,
          hit: true,
          ttlSeconds: SEARCH_CACHE_TTL_SECONDS
        }
      });
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
    const restoredItems=restoreRentalItemsIfAllowed(universalItems, itemsBeforeUniversalFilter, settingsResult.settings);

    const youtubeStartAt = Date.now();
    const youtubeReputation = await enrichYoutubeReputation({
      query: improvedQ,
      items: restoredItems,
      apiKey: process.env.YOUTUBE_API_KEY,
      enabled: isYoutubeReputationEnabled() && start === 1,
      timeoutMs: YOUTUBE_REPUTATION_TIMEOUT_MS,
      readCache: readYoutubeCache,
      writeCache: writeYoutubeCache
    });
    const youtubeDurationMs = Date.now() - youtubeStartAt;
    const finalItems = youtubeReputation.items;
    const debugInfo = buildYoutubeDebugInfo(youtubeReputation, youtubeDurationMs);

    const responseBody = {
      debug_info: debugInfo,
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
      universalFilterDebug:universalResult.debug||null,
      youtubeReputationDebug:youtubeReputation.debug||null,
      _cached: false,
      searchCacheDebug: {
        key: searchCacheKey,
        normalizedQuery: normalizedCacheQuery,
        settingsHash: sha1Short(stableStringify(settingsHashSource)),
        hit: false,
        ttlSeconds: SEARCH_CACHE_TTL_SECONDS
      }
    };

    await writeSearchCache(searchCacheKey, responseBody);
    return res.status(200).json(responseBody);

  }catch(err){
    return res.status(500).json({error:err.message||'Server error'});
  }
}

module.exports=handler;
module.exports.config={maxDuration:60};
