// lib/canonicalIntent.js
// Phase C-1: optional canonical query normalizer.
// Safe by default: no external AI call here. It prepares the async/fallback contract
// so search APIs can later swap this implementation for AI-backed canonicalization.

function normalizeSpaces(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeUnits(text) {
  return normalizeSpaces(text)
    .replace(/(\d+)\s*겹/g, '$1겹')
    .replace(/(\d+)\s*m/gi, '$1m')
    .replace(/(\d+)\s*롤/g, '$1롤')
    .replace(/(\d+)\s*kg/gi, '$1kg');
}

function shouldUseCanonicalIntent(query) {
  const q = normalizeSpaces(query);
  if (!q) return false;

  // Natural language / spacing-sensitive / spec-heavy searches benefit most.
  return (
    /\s{2,}/.test(query) ||
    /김\s*서방\s*마스크|김서방마스크/.test(q) ||
    /(화장지|휴지).*(겹|m|롤)/i.test(q) ||
    /(로얄캐닌|하이포알러제닉|사료).*(kg|\d)/i.test(q) ||
    /(추천|좋은|가장|배송비 포함|유지비|맘카페|반응)/.test(q)
  );
}

async function canonicalizeQuery(query) {
  let canonicalQuery = normalizeUnits(query);

  canonicalQuery = canonicalQuery.replace(/김\s*서방\s*마스크/g, '김서방 마스크');
  canonicalQuery = canonicalQuery.replace(/김서방마스크/g, '김서방 마스크');

  if (/(화장지|휴지)/.test(canonicalQuery)) {
    canonicalQuery = canonicalQuery.replace(/휴지/g, '화장지');
    if (/3겹/.test(canonicalQuery) && /30m/i.test(canonicalQuery) && /30롤/.test(canonicalQuery)) {
      canonicalQuery = '3겹 화장지 30m 30롤';
    }
  }

  return {
    query: normalizeSpaces(canonicalQuery),
    confidence: canonicalQuery === query ? 0.5 : 0.75,
    source: 'canonical_local'
  };
}

module.exports = {
  shouldUseCanonicalIntent,
  canonicalizeQuery
};