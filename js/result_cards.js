(function initResultCardsNamespace(global) {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function normalizeBadgeText(text) {
    return text === '배송비 미확인' ? '배송비 상세확인' : text;
  }

  function getBadgeClass(text) {
    if (text.includes('가성비')) return 'badge-value';
    if (text.includes('신뢰')) return 'badge-trust';
    if (text.includes('추천')) return 'badge-thisone';
    return 'badge-default';
  }

  function renderPickCard(card, isFirst, options) {
    const opts = options || {};
    const hideRecommendationUi = !!opts.hideRecommendationUi;
    const imageHtml = card.image
      ? `<img class="row-img" src="${escAttr(card.image)}" alt="${escAttr(card.name || '상품')}" onerror="this.onerror=null;this.alt='';this.style.visibility='hidden';">`
      : `<div class="row-img-placeholder">상품</div>`;

    const badgesHtml = !hideRecommendationUi && Array.isArray(card.badges) && card.badges.length
      ? card.badges.map((badge) => normalizeBadgeText(badge)).map((b) => `<span class="row-badge-item ${getBadgeClass(b)}">${esc(b)}</span>`).join('')
      : '';

    const labelBadge = !hideRecommendationUi && card.label
      ? `<span class="row-badge-item row-label-badge">${esc(card.label)}</span>`
      : '';

    return `
    <a class="pick-row-link" href="${escAttr(card.link || '#')}" target="_blank" rel="noopener noreferrer">
      <article class="pick-row ${isFirst ? 'pick-row-first' : ''}">
        <div class="row-thumb">
          ${imageHtml}
        </div>

        <div class="row-info">
          <div class="row-header">
            <div class="row-title-line">
              <h3 class="row-title">${esc(card.name || '상품명 없음')}</h3>
              <div class="row-badges">
                ${labelBadge}
                ${badgesHtml}
              </div>
            </div>
          </div>

          <div class="row-meta">
            <span class="row-store-name">${esc(card.store || '판매처 정보 없음')}</span>
            <span class="row-delivery">${esc(card.delivery || '배송 정보 확인 필요')}</span>
            ${card.review ? `<span class="row-review">${esc(card.review)}</span>` : ''}
          </div>

          ${card.reason ? `<div class="row-reason-text">${esc(card.reason)}</div>` : ''}
        </div>

        <div class="row-price-area">
          <div class="row-price">${esc(card.price || '가격 정보 없음')}</div>
          <div class="row-cta">최종가 확인</div>
        </div>
      </article>
    </a>
  `;
  }

  function renderAiComment(aiComment) {
    const content = String(aiComment || '').trim();
    if (!content) return '';

    return `
      <details class="fold-box ai-comment-box">
        <summary>AI 코멘트</summary>
        <div class="fold-content">${esc(content)}</div>
      </details>
    `;
  }

  global.ThisOneResultCards = {
    renderPickCard,
    renderAiComment
  };
})(window);

// 렌탈 상품을 구매 상품처럼 오해하지 않도록 랭킹/표시 보정
(function patchRentalHandling(global) {
  function parseNumber(text) {
    return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
  }

  function rentalText(item) {
    return `${item?.name || ''} ${item?.store || ''} ${item?.price || ''}`;
  }

  function isRental(item) {
    return item?.isRental === true || /렌탈|대여|구독|약정|월납/i.test(rentalText(item));
  }

  function rentalMonthlyFee(item) {
    const m = rentalText(item).match(/월\s*([0-9,]+)\s*원/i);
    if (m) return parseNumber(m[1]);
    return isRental(item) ? Number(item?.priceNum || item?.lprice || parseNumber(item?.price) || 0) : 0;
  }

  function rentalMonths(item) {
    const t = rentalText(item);
    const months = t.match(/(\d+)\s*개월/i);
    if (months) return parseInt(months[1], 10) || 0;
    const years = t.match(/(\d+)\s*년\s*약정/i);
    return years ? (parseInt(years[1], 10) || 0) * 12 : 0;
  }

  function enrichRental(item) {
    if (!item || typeof item !== 'object') return item;
    const rental = isRental(item);
    const monthly = Number(item.rentalMonthlyFee || 0) || rentalMonthlyFee(item);
    const months = Number(item.rentalMonths || 0) || rentalMonths(item);
    const total = Number(item.rentalTotalFee || 0) || (monthly > 0 && months > 0 ? monthly * months : 0);
    const next = { ...item, isRental: rental, rentalMonthlyFee: monthly, rentalMonths: months, rentalTotalFee: total };

    if (rental) {
      const badges = Array.isArray(next.badges) ? [...next.badges] : [];
      if (!badges.some((b) => String(b).includes('렌탈'))) badges.unshift('렌탈');
      next.badges = badges;
      next.rentalPenalty = Number(next.rentalPenalty || 0) || 20;
      next.finalScore = Number(next.finalScore || 0) - next.rentalPenalty;
    }

    return next;
  }

  function rentalPriceText(item) {
    const c = enrichRental(item);
    if (!c?.isRental) return c?.price || c?.priceText || '';
    const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
    if (c.rentalMonthlyFee > 0 && c.rentalMonths > 0) {
      return `월 ${fmt(c.rentalMonthlyFee)}원 / ${c.rentalMonths}개월 / 총 ${fmt(c.rentalTotalFee)}원`;
    }
    if (c.rentalMonthlyFee > 0) return `월 ${fmt(c.rentalMonthlyFee)}원`;
    return `렌탈 ${c.price || c.priceText || '가격 확인'}`;
  }

  function sortRentalAfterPurchase(items) {
    return [...(items || [])].sort((a, b) => {
      if (!!a.isRental !== !!b.isRental) return a.isRental ? 1 : -1;
      const scoreDiff = Number(b.finalScore || 0) - Number(a.finalScore || 0);
      if (scoreDiff) return scoreDiff;
      const ap = Number(a.totalPriceNum || a.priceNum || 0);
      const bp = Number(b.totalPriceNum || b.priceNum || 0);
      return ap - bp;
    });
  }

  function patchRanking() {
    const ranking = global.ThisOneRanking;
    if (!ranking || ranking.__rentalHandlingPatched) return;

    if (typeof ranking.buildCandidates === 'function') {
      const originalBuild = ranking.buildCandidates.bind(ranking);
      ranking.buildCandidates = function patchedBuildCandidates(...args) {
        return sortRentalAfterPurchase((originalBuild(...args) || []).map(enrichRental));
      };
    }

    if (typeof ranking.mergeAiWithCandidates === 'function') {
      const originalMerge = ranking.mergeAiWithCandidates.bind(ranking);
      ranking.mergeAiWithCandidates = function patchedMergeAiWithCandidates(...args) {
        const merged = originalMerge(...args);
        if (Array.isArray(merged?.cards)) merged.cards = merged.cards.map(enrichRental);
        return merged;
      };
    }

    ranking.__rentalHandlingPatched = true;
  }

  function patchCards() {
    const cards = global.ThisOneResultCards;
    if (!cards || cards.__rentalHandlingPatched) return;

    if (typeof cards.renderPickCard === 'function') {
      const originalRender = cards.renderPickCard.bind(cards);
      cards.renderPickCard = function patchedRenderPickCard(card, ...rest) {
        const next = enrichRental(card);
        if (next.isRental) next.price = rentalPriceText(next);
        return originalRender(next, ...rest);
      };
    }

    cards.__rentalHandlingPatched = true;
  }

  patchRanking();
  patchCards();
  global.addEventListener?.('load', () => {
    patchRanking();
    patchCards();
  });

  global.ThisOneRentalHandling = {
    enrichRental,
    rentalPriceText,
    sortRentalAfterPurchase
  };
})(window);
