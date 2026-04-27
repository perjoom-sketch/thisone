(function applyMaskConsumablePatch(global) {
  const ranking = global.ThisOneRanking || {};
  const originalBuildCandidates = ranking.buildCandidates || global.buildCandidates;
  const originalMergeAiWithCandidates = ranking.mergeAiWithCandidates;

  const MASK_MAIN_WORDS = [
    '마스크', 'kf94', 'kf80', 'kf-ad', '비말', '새부리', '덴탈', '일회용', '보건용', '방역'
  ];

  const MASK_CONSUMABLE_WORDS = [
    '필터', '교체필터', '리필', '교체용', '교체', '호환', '부품', '소모품',
    '패드', '스트랩', '끈', '밴드', '고리', '클립', '걸이', '밸브', '캡', '커버', '케이스'
  ];

  const MASK_PROMO_WORDS = [
    '판촉', '판촉물', '홍보', '인쇄', '로고', '각인', '제작', '주문제작',
    '단체', '행사', '기념품', '답례품', '사은품', '굿즈', '판촉용', '홍보용',
    '기프트', '기프트랜드', '상세페이지 확인'
  ];

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function allText(candidate) {
    return normalize([
      candidate && candidate.name,
      candidate && candidate.store,
      candidate && candidate.delivery,
      candidate && candidate.review,
      candidate && candidate.reason
    ].filter(Boolean).join(' '));
  }

  function queryWantsMask(query) {
    const q = normalize(query);
    return MASK_MAIN_WORDS.some((word) => q.includes(word));
  }

  function queryWantsMaskPart(query) {
    const q = normalize(query);
    return MASK_CONSUMABLE_WORDS.some((word) => q.includes(word));
  }

  function hasAny(text, words) {
    return words.some((word) => text.includes(word));
  }

  function isMaskConsumable(candidate) {
    const text = allText(candidate);
    if (!text) return false;

    const hasMask = hasAny(text, MASK_MAIN_WORDS);
    const hasConsumable = hasAny(text, MASK_CONSUMABLE_WORDS);

    return hasMask && hasConsumable;
  }

  function isMaskPromoOrCustom(candidate) {
    const text = allText(candidate);
    if (!text) return false;

    const hasMask = hasAny(text, MASK_MAIN_WORDS);
    const hasPromo = hasAny(text, MASK_PROMO_WORDS);
    const price = Number(candidate && (candidate.totalPriceNum || candidate.priceNum || 0));
    const detailOnlyLowPrice = text.includes('상세페이지 확인') && price > 0 && price < 1000;

    return hasMask && (hasPromo || detailOnlyLowPrice);
  }

  function isMaskMainCandidate(candidate) {
    const name = normalize(candidate && candidate.name);
    if (!name) return false;
    if (isMaskConsumable(candidate) || isMaskPromoOrCustom(candidate)) return false;

    return (
      /kf\s*-?\s*(94|80|ad)/i.test(name) ||
      /\d+\s*(매|개입|개|팩|박스|box)/i.test(name) ||
      ['새부리', '덴탈', '일회용', '보건용', '비말', '방역', '의약외품'].some((word) => name.includes(word))
    );
  }

  function markMaskSuspect(candidate, reason, badge) {
    const badges = Array.isArray(candidate.badges) ? [...candidate.badges] : [];
    if (!badges.includes(badge)) badges.push(badge);

    const penalty = 100000;
    const finalScore = Number(candidate.finalScore ?? candidate.score ?? 0) - penalty;

    return {
      ...candidate,
      badges,
      excludeFromPriceRank: true,
      isExcluded: true,
      maskNonRetailSuspect: true,
      maskConsumableSuspect: badge === '소모품 의심' || candidate.maskConsumableSuspect,
      rejectReason: candidate.rejectReason || reason,
      reason: candidate.reason || reason,
      score: Number(candidate.score || 0) - penalty,
      finalScore,
      specPenalty: Number(candidate.specPenalty || 0) + penalty,
      bonusScore: Number(candidate.bonusScore || 0) - penalty
    };
  }

  function patchMaskCandidates(candidates, query) {
    if (!Array.isArray(candidates)) return candidates;
    if (!queryWantsMask(query) || queryWantsMaskPart(query)) return candidates;

    const patched = candidates
      .map((candidate) => {
        if (isMaskConsumable(candidate)) {
          return markMaskSuspect(
            candidate,
            '마스크 본품이 아닌 필터/교체용 소모품 의심',
            '소모품 의심'
          );
        }

        if (isMaskPromoOrCustom(candidate)) {
          return markMaskSuspect(
            candidate,
            '마스크 본품 구매가 아닌 판촉/인쇄/주문제작형 상품 의심',
            '판촉/제작 의심'
          );
        }

        return candidate;
      })
      .sort((a, b) => {
        const aMain = isMaskMainCandidate(a) ? 1 : 0;
        const bMain = isMaskMainCandidate(b) ? 1 : 0;
        if (aMain !== bMain) return bMain - aMain;

        const aBad = a.maskNonRetailSuspect ? 1 : 0;
        const bBad = b.maskNonRetailSuspect ? 1 : 0;
        if (aBad !== bBad) return aBad - bBad;

        return Number(b.finalScore ?? b.score ?? 0) - Number(a.finalScore ?? a.score ?? 0);
      });

    const clean = patched.filter((candidate) => !candidate.maskNonRetailSuspect);
    const suspect = patched.filter((candidate) => candidate.maskNonRetailSuspect);

    // AI 추천 후보에는 판촉/소모품 후보가 섞이면 저가 때문에 다시 뽑히므로,
    // 본품 후보가 충분하면 의심 후보를 후보군 밖으로 빼낸다.
    if (clean.length >= 3) return clean;

    return [...clean, ...suspect];
  }

  function patchedBuildCandidates(items, queryText, intentProfile) {
    if (typeof originalBuildCandidates !== 'function') return [];
    const result = originalBuildCandidates(items, queryText, intentProfile);
    return patchMaskCandidates(result, queryText);
  }

  function patchedMergeAiWithCandidates(aiData, candidates) {
    const safeCandidates = Array.isArray(candidates)
      ? candidates.filter((candidate) => !candidate.maskNonRetailSuspect)
      : candidates;

    if (typeof originalMergeAiWithCandidates === 'function') {
      return originalMergeAiWithCandidates(aiData, safeCandidates);
    }
    return aiData;
  }

  global.buildCandidates = patchedBuildCandidates;
  global.ThisOneRanking = {
    ...ranking,
    buildCandidates: patchedBuildCandidates,
    mergeAiWithCandidates: patchedMergeAiWithCandidates,
    patchMaskCandidates
  };
})(window);
