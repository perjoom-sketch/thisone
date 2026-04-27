(function applyShippingLabelPatch(global) {
  const FROM = '배송비 미확인';
  const TO = '배송비 상세확인';

  function patchBadges(badges) {
    if (!Array.isArray(badges)) return badges;
    return badges.map((badge) => (badge === FROM ? TO : badge));
  }

  function patchCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return candidate;
    return {
      ...candidate,
      badges: patchBadges(candidate.badges)
    };
  }

  const ranking = global.ThisOneRanking || {};
  const originalBuildCandidates = ranking.buildCandidates || global.buildCandidates;
  const originalShouldExcludeFromPriceRank = ranking.shouldExcludeFromPriceRank || global.shouldExcludeFromPriceRank;

  function patchedShouldExcludeFromPriceRank(...args) {
    const result = typeof originalShouldExcludeFromPriceRank === 'function'
      ? originalShouldExcludeFromPriceRank(...args)
      : { exclude: false, reason: '', badges: [] };

    if (!result || typeof result !== 'object') return result;
    return {
      ...result,
      badges: patchBadges(result.badges)
    };
  }

  function patchedBuildCandidates(...args) {
    const result = typeof originalBuildCandidates === 'function'
      ? originalBuildCandidates(...args)
      : [];

    if (!Array.isArray(result)) return result;
    return result.map(patchCandidate);
  }

  global.shouldExcludeFromPriceRank = patchedShouldExcludeFromPriceRank;
  global.buildCandidates = patchedBuildCandidates;
  global.ThisOneRanking = {
    ...ranking,
    shouldExcludeFromPriceRank: patchedShouldExcludeFromPriceRank,
    buildCandidates: patchedBuildCandidates
  };
})(window);
