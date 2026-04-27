(function applyResultExclusionGuardPatch(global) {
  function normalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function parsePriceNumber(value) {
    return Number(String(value || '').replace(/[^\d]/g, '')) || 0;
  }

  function hasBadge(item, pattern) {
    return Array.isArray(item && item.badges) && item.badges.some((badge) => pattern.test(String(badge || '')));
  }

  function hasUsableProductData(item) {
    if (!item) return false;
    const name = String(item.name || '').trim();
    const price = String(item.price || item.priceText || '').trim();
    const link = String(item.link || item.productUrl || item.url || '').trim();

    if (!name || name === '상품명 없음' || name === '상품') return false;
    if (!price || price === '가격 정보 없음') return false;
    if (!link || link === '#') return false;
    return true;
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
    const price = Number(item && (item.totalPriceNum || item.priceNum || item.lprice || 0)) || parsePriceNumber(item && item.price);

    if (!q.includes('마스크')) return false;
    if (!text.includes('마스크')) return false;

    const strongPromoWords = [
      '판촉', '판촉물', '홍보', '인쇄', '제작', '주문제작', '단체', '행사',
      '기념품', '답례품', '사은품', '기프트', '기프트랜드'
    ];
    const consumableWords = [
      '필터', '교체필터', '리필', '교체용', '호환', '부품', '소모품',
      '패드', '스트랩', '클립', '고리', '밸브', '케이스'
    ];

    const hasStrongPromo = strongPromoWords.some((word) => text.includes(word));
    const hasConsumable = consumableWords.some((word) => text.includes(word));
    const detailOnlyLowPrice = text.includes('상세페이지 확인') && price > 0 && price < 1000;

    return hasStrongPromo || hasConsumable || detailOnlyLowPrice;
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
      ['새부리', '덴탈', '일회용', '보건용', '비말', '방역', '의약외품', '세탁마스크', '면마스크'].some((word) => text.includes(word))
    );
  }

  function shouldHide(item, query, options) {
    const opts = options || {};
    if (opts.requireUsableProductData && !hasUsableProductData(item)) return true;
    return isExcludedByRanking(item) || isMaskNonRetailByText(item, query);
  }

  function filterItems(items, query, options) {
    if (!Array.isArray(items)) return items;
    const opts = options || {};
    const filtered = items.filter((item) => !shouldHide(item, query, opts));

    // 전체 소거 방지:
    // 일반 검색 결과는 빈 화면보다 원본 유지가 낫다.
    // 단, AI 추천 카드에서는 가짜/매칭 실패 카드를 되살리지 않는다.
    if (!opts.strict && filtered.length === 0 && items.length > 0 && isMaskQuery(query)) {
      const mainLike = items.filter(isLikelyMaskMainProduct);
      if (mainLike.length > 0) return mainLike.filter(hasUsableProductData);
      return items.filter(hasUsableProductData);
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
        const filtered = filterItems(items, global.GeneralSearchState?.query || global.currentQuery || '', {
          strict: false,
          requireUsableProductData: true
        });
        return originalRenderResults.call(this, filtered, total, currentPage, currentSort, resultMode);
      };
    }

    if (typeof originalAddResultCard === 'function') {
      ui.addResultCard = function guardedAddResultCard(result, intentProfile) {
        if (result && Array.isArray(result.cards)) {
          const query = global.GeneralSearchState?.query || global.currentQuery || '';
          result = {
            ...result,
            cards: filterItems(result.cards, query, {
              strict: true,
              requireUsableProductData: true
            })
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
    filterItems,
    hasUsableProductData
  };
})(window);
