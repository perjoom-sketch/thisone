(function applyResultExclusionGuardPatch(global) {
  function normalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function hasBadge(item, pattern) {
    return Array.isArray(item && item.badges) && item.badges.some((badge) => pattern.test(String(badge || '')));
  }

  function isExcludedByRanking(item) {
    if (!item) return false;
    return Boolean(
      item.maskNonRetailSuspect ||
      item.maskConsumableSuspect ||
      item.isExcluded ||
      hasBadge(item, /소모품\s*의심|판촉\/제작\s*의심|액세서리\s*의심/) ||
      /마스크 본품 구매가 아닌 판촉|필터\/교체용 소모품/.test(String(item.rejectReason || item.reason || ''))
    );
  }

  function isMaskNonRetailByText(item, query) {
    const q = normalize(query || global.currentQuery || '');
    const text = normalize([
      item && item.name,
      item && item.store,
      item && item.delivery,
      item && item.reason,
      item && item.review
    ].filter(Boolean).join(' '));

    if (!q.includes('마스크')) return false;
    if (!text.includes('마스크')) return false;

    const promoWords = [
      '판촉', '판촉물', '홍보', '인쇄', '제작', '주문제작', '단체', '행사',
      '기념품', '답례품', '사은품', '기프트', '기프트랜드', '상세페이지 확인'
    ];
    const consumableWords = [
      '필터', '교체필터', '리필', '교체용', '호환', '부품', '소모품',
      '패드', '스트랩', '클립', '고리', '밸브', '케이스'
    ];

    return promoWords.some((word) => text.includes(word)) || consumableWords.some((word) => text.includes(word));
  }

  function shouldHide(item, query) {
    return isExcludedByRanking(item) || isMaskNonRetailByText(item, query);
  }

  function filterItems(items, query) {
    if (!Array.isArray(items)) return items;
    return items.filter((item) => !shouldHide(item, query));
  }

  function patchUiWhenReady() {
    const ui = global.ThisOneUI;
    if (!ui || ui.__resultExclusionGuardPatched) return false;

    const originalRenderResults = ui.renderResults;
    const originalAddResultCard = ui.addResultCard;

    if (typeof originalRenderResults === 'function') {
      ui.renderResults = function guardedRenderResults(items, total, currentPage, currentSort, resultMode) {
        const filtered = filterItems(items, global.GeneralSearchState?.query || global.currentQuery || '');
        return originalRenderResults.call(this, filtered, total, currentPage, currentSort, resultMode);
      };
    }

    if (typeof originalAddResultCard === 'function') {
      ui.addResultCard = function guardedAddResultCard(result, intentProfile) {
        if (result && Array.isArray(result.cards)) {
          const query = global.GeneralSearchState?.query || global.currentQuery || '';
          result = {
            ...result,
            cards: filterItems(result.cards, query)
          };
        }
        return originalAddResultCard.call(this, result, intentProfile);
      };
    }

    ui.__resultExclusionGuardPatched = true;
    return true;
  }

  if (!patchUiWhenReady()) {
    document.addEventListener('DOMContentLoaded', () => {
      patchUiWhenReady();
      setTimeout(patchUiWhenReady, 0);
      setTimeout(patchUiWhenReady, 500);
    });
    setTimeout(patchUiWhenReady, 1000);
  }

  global.ThisOneResultExclusionGuard = {
    shouldHide,
    filterItems
  };
})(window);
