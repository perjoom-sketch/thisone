(function applyMaskConsumablePatch(global) {
  const ranking = global.ThisOneRanking || {};
  const originalBuildCandidates = ranking.buildCandidates || global.buildCandidates;

  const MASK_MAIN_WORDS = [
    '마스크', 'kf94', 'kf80', 'kf-ad', '비말', '새부리', '덴탈', '일회용', '보건용', '방역'
  ];

  const MASK_CONSUMABLE_WORDS = [
    '필터', '교체필터', '리필', '교체용', '교체', '호환', '부품', '소모품',
    '패드', '스트랩', '끈', '밴드', '고리', '클립', '걸이', '밸브', '캡', '커버', '케이스'
  ];

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function queryWantsMask(query) {
    const q = normalize(query);
    return MASK_MAIN_WORDS.some((word) => q.includes(word));
  }

  function queryWantsMaskPart(query) {
    const q = normalize(query);
    return MASK_CONSUMABLE_WORDS.some((word) => q.includes(word));
  }

  function isMaskConsumable(candidate) {
    const name = normalize(candidate && candidate.name);
    if (!name) return false;

    const hasMask = MASK_MAIN_WORDS.some((word) => name.includes(word));
    const hasConsumable = MASK_CONSUMABLE_WORDS.some((word) => name.includes(word));

    return hasMask && hasConsumable;
  }

  function isMaskMainCandidate(candidate) {
    const name = normalize(candidate && candidate.name);
    if (!name) return false;
    if (isMaskConsumable(candidate)) return false;

    return (
      /kf\s*-?\s*(94|80|ad)/i.test(name) ||
      /\d+\s*(매|개입|개|팩|박스|box)/i.test(name) ||
      ['새부리', '덴탈', '일회용', '보건용', '비말', '방역'].some((word) => name.includes(word))
    );
  }

  function patchMaskCandidates(candidates, query) {
    if (!Array.isArray(candidates)) return candidates;
    if (!queryWantsMask(query) || queryWantsMaskPart(query)) return candidates;

    return candidates
      .map((candidate) => {
        if (!isMaskConsumable(candidate)) return candidate;

        const badges = Array.isArray(candidate.badges) ? [...candidate.badges] : [];
        if (!badges.includes('소모품 의심')) badges.push('소모품 의심');

        return {
          ...candidate,
          badges,
          excludeFromPriceRank: true,
          isExcluded: true,
          maskConsumableSuspect: true,
          rejectReason: candidate.rejectReason || '마스크 본품이 아닌 필터/교체용 소모품 의심',
          reason: candidate.reason || '마스크 본품 검색에서 필터/교체용 소모품으로 보여 제외했습니다.',
          score: Number(candidate.score || 0) - 100
        };
      })
      .sort((a, b) => {
        const aMain = isMaskMainCandidate(a) ? 1 : 0;
        const bMain = isMaskMainCandidate(b) ? 1 : 0;
        if (aMain !== bMain) return bMain - aMain;

        const aBad = a.maskConsumableSuspect ? 1 : 0;
        const bBad = b.maskConsumableSuspect ? 1 : 0;
        if (aBad !== bBad) return aBad - bBad;

        return Number(b.score || 0) - Number(a.score || 0);
      });
  }

  function patchedBuildCandidates(items, queryText, intentProfile) {
    if (typeof originalBuildCandidates !== 'function') return [];
    const result = originalBuildCandidates(items, queryText, intentProfile);
    return patchMaskCandidates(result, queryText);
  }

  global.buildCandidates = patchedBuildCandidates;
  global.ThisOneRanking = {
    ...ranking,
    buildCandidates: patchedBuildCandidates,
    patchMaskCandidates
  };
})(window);
