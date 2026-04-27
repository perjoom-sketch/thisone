(function applyMobileSearchSafetyPatch(global) {
  const api = global.ThisOneAPI || {};
  const originalRequestSearch = api.requestSearch;
  const originalRewriteSearchQuery = global.ThisOneRanking && global.ThisOneRanking.rewriteSearchQuery;

  function normalizeQuery(value) {
    return String(value || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[㎏]/g, 'kg')
      .replace(/[Ｋｋ][Ｇｇ]/g, 'kg')
      .replace(/(\d)\s*(kg|g|ml|l)\b/gi, '$1$2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isMobileLike() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || Math.min(global.innerWidth || 9999, global.innerHeight || 9999) < 768;
  }

  function getRetryQueries(query) {
    const q = normalizeQuery(query);
    const variants = [q];
    const lower = q.toLowerCase();

    if (/로얄\s*캐닌|로얄캐닌|royal\s*canin/i.test(q)) {
      const compact = q
        .replace(/로얄\s*캐닌/gi, '로얄캐닌')
        .replace(/하이포\s*알러제닉/gi, '하이포알러제닉')
        .replace(/하이포알러제닉/gi, '하이포알러제닉')
        .replace(/\s+/g, ' ')
        .trim();
      variants.push(compact);

      const noSize = compact.replace(/\b\d+(?:\.\d+)?\s*kg\b/gi, '').replace(/\s+/g, ' ').trim();
      if (noSize) variants.push(noSize);

      variants.push('로얄캐닌 하이포알러제닉 2kg');
      variants.push('로얄캐닌 하이포알러제닉');
      variants.push('royal canin hypoallergenic 2kg');
    }

    if (lower.includes('hypoallergenic')) {
      variants.push(q.replace(/hypoallergenic/ig, '하이포알러제닉'));
    }

    return Array.from(new Set(variants.map(normalizeQuery).filter(Boolean)));
  }

  function hasUsableItems(data) {
    return Array.isArray(data && data.items) && data.items.length > 0;
  }

  async function patchedRequestSearch(query, settings = {}, start = 1, display = 30, sort = 'sim') {
    if (typeof originalRequestSearch !== 'function') {
      throw new Error('requestSearch is not available');
    }

    const normalized = normalizeQuery(query);
    const safeDisplay = isMobileLike() ? Math.min(Number(display) || 30, 20) : display;
    const effectiveSettings = { ...settings };

    let firstData = await originalRequestSearch(normalized, effectiveSettings, start, safeDisplay, sort);
    if (hasUsableItems(firstData)) return firstData;

    const retries = getRetryQueries(normalized).filter((candidate) => candidate !== normalized);
    for (const retryQuery of retries) {
      try {
        const retryData = await originalRequestSearch(retryQuery, effectiveSettings, start, safeDisplay, sort);
        if (hasUsableItems(retryData)) {
          return {
            ...retryData,
            query: retryData.query || normalized,
            fallbackQuery: retryQuery,
            originalQuery: normalized
          };
        }
      } catch (err) {
        console.warn('[ThisOne][mobile-search-safety] retry failed:', retryQuery, err && err.message ? err.message : err);
      }
    }

    return firstData;
  }

  function patchedRewriteSearchQuery(query) {
    const normalized = normalizeQuery(query);
    if (typeof originalRewriteSearchQuery === 'function') {
      return normalizeQuery(originalRewriteSearchQuery(normalized));
    }
    return normalized;
  }

  global.ThisOneAPI = {
    ...api,
    requestSearch: patchedRequestSearch
  };

  global.ThisOneRanking = {
    ...(global.ThisOneRanking || {}),
    rewriteSearchQuery: patchedRewriteSearchQuery
  };
})(window);
