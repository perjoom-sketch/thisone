(function applyRankingIntentPatch(global) {
  const ranking = global.ThisOneRanking || {};
  const originalBuildCandidates = ranking.buildCandidates || global.buildCandidates;
  const originalShouldExcludeFromPriceRank = ranking.shouldExcludeFromPriceRank || global.shouldExcludeFromPriceRank;

  const MAIN_PRODUCT_WORDS = [
    '로보락', '다이슨', '비스포크', '에어랩', '청소기', '로봇청소기', '공기청정기',
    '세탁기', '건조기', '노트북', '모니터', '아이폰', '갤럭시', '태블릿', '패드',
    '프린터', '유모차', '선풍기', '스타일러', '에어컨', '냉장고', 'TV', '티비'
  ];

  const STRONG_ACCESSORY_WORDS = [
    '사이드브러시', '사이드브러쉬', '메인브러시', '메인브러쉬', '브러시', '브러쉬',
    '먼지봉투', '더스트백', '물걸레패드', '물걸레', '배터리', '충전기', '거치대',
    '호환', '액세서리', '악세사리', '소모품', '부품', '카트리지', '토너', '잉크',
    '보호필름', '케이스', '리모컨', '어댑터', '케이블', '연장관'
  ];

  const WEAK_CONTEXT_WORDS = [
    '필터', '단품', '세트', '실리콘', '패드', '리필', '교체', '커버', '헤드'
  ];

  const CONSUMABLE_SEARCH_WORDS = [
    '마스크', '화장지', '휴지', '물티슈', '사료', '간식', '샴푸', '세제', '청소포',
    '기저귀', '생수', '커피', '캡슐', '건전지', '테이프', '장갑', '수건'
  ];

  function text(value) {
    return String(value || '').toLowerCase();
  }

  function includesAny(source, words) {
    const s = text(source);
    return words.some((word) => s.includes(text(word)));
  }

  function getProductIntentContext(query, profile) {
    const q = text(query);
    const accessoryIntentHits = STRONG_ACCESSORY_WORDS.filter((word) => q.includes(text(word)));
    const weakIntentHits = WEAK_CONTEXT_WORDS.filter((word) => q.includes(text(word)));
    const mainProductHits = MAIN_PRODUCT_WORDS.filter((word) => q.includes(text(word)));
    const consumableHits = CONSUMABLE_SEARCH_WORDS.filter((word) => q.includes(text(word)));
    const categoryHint = text(profile && profile.categoryHint);

    const queryIsConsumable = consumableHits.length > 0;
    const queryWantsAccessory = accessoryIntentHits.length > 0 || (
      weakIntentHits.length > 0 && (mainProductHits.length > 0 || /가전|기기|디지털|스마트/.test(categoryHint))
    );
    const queryIsMainProduct = mainProductHits.length > 0 || /가전|기기|디지털|스마트/.test(categoryHint);

    return {
      queryWantsAccessory,
      queryIsMainProduct,
      queryIsConsumable,
      accessoryIntentHits,
      weakIntentHits,
      mainProductHits,
      consumableHits
    };
  }

  function isStrongAccessoryTitle(title) {
    const t = text(title);
    const strongHits = STRONG_ACCESSORY_WORDS.filter((word) => t.includes(text(word)));
    const weakHits = WEAK_CONTEXT_WORDS.filter((word) => t.includes(text(word)));

    return (
      strongHits.length >= 2 ||
      /(호환|소모품|부품).*(세트|교체|리필|브러시|브러쉬|패드|봉투|더스트백)/i.test(t) ||
      /((사이드|메인)\s*브러시|물걸레\s*패드|먼지\s*봉투|더스트백)/i.test(t) ||
      (strongHits.length >= 1 && weakHits.length >= 1 && /(호환|소모품|부품)/i.test(t))
    );
  }

  function isWeakWordOnlyAccessoryTitle(title) {
    const t = text(title);
    const hasStrong = STRONG_ACCESSORY_WORDS.some((word) => t.includes(text(word)));
    const hasWeak = WEAK_CONTEXT_WORDS.some((word) => t.includes(text(word)));
    return hasWeak && !hasStrong;
  }

  function shouldRescueExcludedCandidate(candidate, query, profile) {
    const ctx = getProductIntentContext(query, profile);
    const reason = text(candidate && (candidate.excludeReason || candidate.reason || ''));
    const name = text(candidate && candidate.name);

    if (ctx.queryWantsAccessory) {
      if (/액세서리|부품|본품이 아닌|중앙값|가격 불균형|5000|5,000|낚시/.test(reason)) return true;
      if (includesAny(name, STRONG_ACCESSORY_WORDS) || includesAny(name, WEAK_CONTEXT_WORDS)) return true;
    }

    if (ctx.queryIsConsumable) {
      if (/액세서리|부품|중앙값|가격 불균형|5000|5,000|낚시/.test(reason)) return true;
      if (isWeakWordOnlyAccessoryTitle(name)) return true;
    }

    return false;
  }

  function shouldForceExcludeCandidate(candidate, query, profile) {
    const ctx = getProductIntentContext(query, profile);
    const name = text(candidate && candidate.name);

    if (!ctx.queryIsMainProduct || ctx.queryWantsAccessory || ctx.queryIsConsumable) return false;
    return isStrongAccessoryTitle(name);
  }

  function normalizeBadges(badges) {
    return Array.isArray(badges) ? [...new Set(badges.filter(Boolean))] : [];
  }

  function patchCandidate(candidate, query, profile) {
    if (!candidate || typeof candidate !== 'object') return candidate;
    const next = { ...candidate };
    const badges = normalizeBadges(next.badges);

    if (shouldRescueExcludedCandidate(next, query, profile)) {
      next.excludeFromPriceRank = false;
      next.isExcluded = false;
      next.exclude = false;
      next.excludeReason = '';
      next.reason = next.reason && /액세서리|부품|중앙값|가격 불균형|낚시/.test(text(next.reason)) ? '' : next.reason;
      badges.push('검색의도 보호');
    } else if (shouldForceExcludeCandidate(next, query, profile)) {
      next.excludeFromPriceRank = true;
      next.isExcluded = true;
      next.exclude = true;
      next.excludeReason = next.excludeReason || '본체 검색에서 액세서리/부품 조합 제외';
      badges.push('액세서리 의심');
    }

    next.badges = normalizeBadges(badges);
    return next;
  }

  function patchedShouldExcludeFromPriceRank(item, query, medianPrice, profile) {
    const base = typeof originalShouldExcludeFromPriceRank === 'function'
      ? originalShouldExcludeFromPriceRank(item, query, medianPrice, profile)
      : { exclude: false, reason: '', badges: [] };

    const ctx = getProductIntentContext(query, profile);
    const title = item && item.name;
    const reason = text(base && base.reason);

    if ((ctx.queryWantsAccessory || ctx.queryIsConsumable) && base && base.exclude) {
      if (/액세서리|부품|중앙값|가격 불균형|5000|5,000|낚시/.test(reason) || includesAny(title, STRONG_ACCESSORY_WORDS) || isWeakWordOnlyAccessoryTitle(title)) {
        return {
          ...base,
          exclude: false,
          reason: '',
          badges: normalizeBadges([...(base.badges || []), '검색의도 보호'])
        };
      }
    }

    if (ctx.queryIsMainProduct && !ctx.queryWantsAccessory && !ctx.queryIsConsumable && isStrongAccessoryTitle(title)) {
      return {
        exclude: true,
        reason: '본체 검색에서 액세서리/부품 조합 제외',
        badges: normalizeBadges([...(base.badges || []), '액세서리 의심'])
      };
    }

    return base;
  }

  function patchedBuildCandidates(items, queryText, intentProfile) {
    if (typeof originalBuildCandidates !== 'function') return [];
    const built = originalBuildCandidates(items, queryText, intentProfile);
    if (!Array.isArray(built)) return built;
    return built.map((candidate) => patchCandidate(candidate, queryText, intentProfile));
  }

  global.getProductIntentContext = getProductIntentContext;
  global.shouldExcludeFromPriceRank = patchedShouldExcludeFromPriceRank;
  global.buildCandidates = patchedBuildCandidates;
  global.ThisOneRanking = {
    ...ranking,
    getProductIntentContext,
    shouldExcludeFromPriceRank: patchedShouldExcludeFromPriceRank,
    buildCandidates: patchedBuildCandidates
  };
})(window);
