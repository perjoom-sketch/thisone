const { diagnoseReviewSignals } = require('../lib/reviewSignals');
const searchApi = require('./search');

const REVIEW_SIGNALS_TIMEOUT_MS = Number(process.env.REVIEW_SIGNALS_TIMEOUT_MS || 3000);

function getReviewSignalsProvider(){
  return String(process.env.REVIEW_SIGNALS_PROVIDER || 'google_cse').trim().toLowerCase() || 'google_cse';
}

function getReviewSignalsApiKey(provider = getReviewSignalsProvider()){
  return provider === 'serper' ? process.env.SERPER_API_KEY : process.env.GOOGLE_CSE_API_KEY;
}

function isReviewSignalsEnabled(){
  const provider = getReviewSignalsProvider();
  if (String(process.env.REVIEW_SIGNALS_ENABLED || 'true').toLowerCase() === 'false') return false;
  if (provider === 'serper') return Boolean(process.env.SERPER_API_KEY);
  return Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX);
}

function safeNumber(value){
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function pickItemDiagnostics(item){
  const reviewSignals = item?.reviewSignals || {};
  return {
    name: item?.name || '',
    store: item?.store || '',
    price: safeNumber(item?.lprice),
    priceText: item?.priceText || '',
    reviewSignals: {
      matchedCount: safeNumber(reviewSignals.matchedCount)
    },
    positiveHits: safeNumber(reviewSignals.positiveHits),
    negativeHits: safeNumber(reviewSignals.negativeHits),
    confidence: safeNumber(reviewSignals.confidence),
    searchSignalScore: safeNumber(item?.searchSignalScore),
    positiveSignals: Array.isArray(item?.positiveSignals) ? item.positiveSignals : [],
    searchSignalReasons: item?.searchSignalReasons || ''
  };
}

async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const q = String(req.query.q || req.query.query || '').trim();
  if (!q) return res.status(400).json({ error: '검색어가 없습니다.' });

  try {
    const display = Math.min(Math.max(parseInt(req.query.display || '10', 10) || 10, 1), 30);
    const start = Math.max(parseInt(req.query.start || '1', 10) || 1, 1);
    const sort = req.query.sort || 'sim';
    const improvedQuery = searchApi._private.improveQuery(q);
    const naverResult = await searchApi._private.fetchNaverShopItemsExactFirst(q, improvedQuery, { display, start, sort });
    const candidates = searchApi._private.mapNaverItems(naverResult.data?.items || []);
    const provider = getReviewSignalsProvider();
    const diagnostics = await diagnoseReviewSignals({
      query: improvedQuery,
      items: candidates,
      provider,
      apiKey: getReviewSignalsApiKey(provider),
      cx: process.env.GOOGLE_CSE_CX,
      enabled: isReviewSignalsEnabled() && start === 1,
      timeoutMs: REVIEW_SIGNALS_TIMEOUT_MS
    });

    return res.status(200).json({
      ok: true,
      query: q,
      improvedQuery,
      naverQueryDebug: naverResult.debug || null,
      search_signals: diagnostics.debug || null,
      externalResults: diagnostics.results || [],
      products: (diagnostics.items || []).map(pickItemDiagnostics)
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'review signal diagnostics failed',
      detail: err.detail || null
    });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 30 };
