const { diagnoseReviewSignals } = require('../lib/reviewSignals');
const searchApi = require('./search');

const REVIEW_SIGNALS_TIMEOUT_MS = Number(process.env.REVIEW_SIGNALS_TIMEOUT_MS || 3000);

function getReviewSignalsProvider(){
  return String(process.env.REVIEW_SIGNALS_PROVIDER || 'serper').trim().toLowerCase() || 'serper';
}

function getReviewSignalsApiKey(provider = getReviewSignalsProvider()){
  return provider === 'serper' ? process.env.SERPER_API_KEY : process.env.GOOGLE_CSE_API_KEY;
}

function isReviewSignalsEnabled(provider = getReviewSignalsProvider()){
  if (String(process.env.REVIEW_SIGNALS_ENABLED || 'true').toLowerCase() === 'false') return false;
  if (provider === 'serper') return Boolean(process.env.SERPER_API_KEY);
  return Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX);
}

function safeNumber(value){
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function buildFallbackCandidate(query){
  return [{
    id: 'diagnostic-query',
    name: query,
    link: '',
    image: '',
    lprice: 0,
    hprice: 0,
    priceText: '',
    store: 'query-only fallback',
    productId: '',
    productType: '',
    brand: '',
    maker: '',
    category1: '',
    category2: '',
    category3: '',
    category4: '',
    delivery: ''
  }];
}

async function buildDiagnosticCandidates(q, reqQuery){
  const display = Math.min(Math.max(parseInt(reqQuery.display || '10', 10) || 10, 1), 30);
  const start = Math.max(parseInt(reqQuery.start || '1', 10) || 1, 1);
  const sort = reqQuery.sort || 'sim';
  const improvedQuery = searchApi._private.improveQuery(q);

  try {
    const naverResult = await searchApi._private.fetchNaverShopItemsExactFirst(q, improvedQuery, { display, start, sort });
    return {
      improvedQuery,
      candidates: searchApi._private.mapNaverItems(naverResult.data?.items || []),
      naverQueryDebug: naverResult.debug || null,
      candidateSource: 'naver_shop'
    };
  } catch (error) {
    return {
      improvedQuery,
      candidates: buildFallbackCandidate(improvedQuery || q),
      naverQueryDebug: {
        error: error.message || 'Naver candidate lookup failed',
        fallback: 'query-only product candidate'
      },
      candidateSource: 'query_fallback'
    };
  }
}

function pickItemDiagnostics(item){
  const reviewSignals = item?.reviewSignals || {};
  return {
    id: item?.id || '',
    name: item?.name || '',
    store: item?.store || '',
    price: safeNumber(item?.lprice),
    priceText: item?.priceText || '',
    link: item?.link || '',
    reviewSignals: {
      matchedCount: safeNumber(reviewSignals.matchedCount),
      weakMatchedCount: safeNumber(reviewSignals.weakMatchedCount),
      strongestMatch: reviewSignals.strongestMatch || 'none',
      positiveHits: safeNumber(reviewSignals.positiveHits),
      negativeHits: safeNumber(reviewSignals.negativeHits),
      confidence: safeNumber(reviewSignals.confidence),
      bonus: safeNumber(reviewSignals.bonus),
      valueBonus: safeNumber(reviewSignals.valueBonus),
      publicSummary: reviewSignals.publicSummary || '',
      publicReasons: Array.isArray(reviewSignals.publicReasons) ? reviewSignals.publicReasons : []
    },
    scores: {
      searchSignalScore: safeNumber(item?.searchSignalScore),
      confidence: safeNumber(reviewSignals.confidence),
      positiveHits: safeNumber(reviewSignals.positiveHits),
      negativeHits: safeNumber(reviewSignals.negativeHits)
    },
    finalClassification: item?.reviewSignalClassification || 'neutral',
    positiveSignals: Array.isArray(item?.positiveSignals) ? item.positiveSignals : [],
    searchSignalReasons: item?.searchSignalReasons || '',
    evidence: Array.isArray(item?.reviewSignalEvidence) ? item.reviewSignalEvidence : []
  };
}

async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const q = String(req.query.q || req.query.query || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: '검색어가 없습니다.' });

  try {
    const provider = getReviewSignalsProvider();
    const candidateDiagnostics = await buildDiagnosticCandidates(q, req.query);
    const diagnostics = await diagnoseReviewSignals({
      query: candidateDiagnostics.improvedQuery,
      items: candidateDiagnostics.candidates,
      provider,
      apiKey: getReviewSignalsApiKey(provider),
      cx: process.env.GOOGLE_CSE_CX,
      enabled: isReviewSignalsEnabled(provider),
      timeoutMs: REVIEW_SIGNALS_TIMEOUT_MS
    });

    return res.status(200).json({
      ok: true,
      query: q,
      improvedQuery: candidateDiagnostics.improvedQuery,
      provider,
      candidateSource: candidateDiagnostics.candidateSource,
      naverQueryDebug: candidateDiagnostics.naverQueryDebug,
      searchedQueries: diagnostics.searchedQueries || [],
      search_signals: diagnostics.debug || null,
      scores: diagnostics.scores || null,
      finalClassification: diagnostics.finalClassification || 'neutral',
      rawSerperResults: diagnostics.results || [],
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
