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

  function isMaskQuery(query) {
    return normalize(query || global.currentQuery || '').includes('마스크');
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

  function isLikelyMaskMainProduct(item) {
    const text = normalize([
      item && item.name,
      item && item.store,
      item && item.delivery,
      item && item.reason,
      item && item.review
    ].filter(Boolean).join(' '));
    if (!text.includes('마스크')) return false;
    if (isMaskNonRetailByText(item, '마스크')) return false;

    return (
      /kf\s*-?\s*(94|80|ad)/i.test(text) ||
      /\d+\s*(매|개입|개|팩|박스|box)/i.test(text) ||
      ['새부리', '덴탈', '일회용', '보건용', '비말', '방역', '의약외품'].some((word) => text.includes(word))
    );
  }

  function shouldHide(item, query) {
    return isExcludedByRanking(item) || isMaskNonRetailByText(item, query);
  }

  function filterItems(items, query) {
    if (!Array.isArray(items)) return items;
    const filtered = items.filter((item) => !shouldHide(item, query));

    // 전체 소거 방지:
    // 김서방마스크처럼 네이버 raw 결과 자체가 판촉/제작형으로만 잡히는 경우,
    // 렌더 단계에서 전부 지워버리면 사용자는 '검색 실패'로 보게 된다.
    // 본품 후보가 하나도 없을 때는 원본을 유지하고, 본품 후보가 있을 때만 의심 후보를 숨긴다.
    if (filtered.length === 0 && items.length > 0 && isMaskQuery(query)) {
      const mainLike = items.filter(isLikelyMaskMainProduct);
      if (mainLike.length > 0) return mainLike;
      return items;
    }

    return filtered;
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
