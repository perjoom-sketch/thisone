// js/rental_handling_patch.js
(function (global) {
  function num(text) {
    return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
  }

  function textOf(item) {
    return `${item?.name || ''} ${item?.store || ''} ${item?.price || ''}`;
  }

  function isRental(item) {
    return item?.isRental === true || /렌탈|대여|구독|약정|월납/i.test(textOf(item));
  }

  function monthlyFee(item) {
    const m = textOf(item).match(/월\s*([0-9,]+)\s*원/i);
    if (m) return num(m[1]);
    return isRental(item) ? Number(item?.priceNum || item?.lprice || num(item?.price) || 0) : 0;
  }

  function months(item) {
    const t = textOf(item);
    const m = t.match(/(\d+)\s*개월/i);
    if (m) return parseInt(m[1], 10) || 0;
    const y = t.match(/(\d+)\s*년\s*약정/i);
    return y ? (parseInt(y[1], 10) || 0) * 12 : 0;
  }

  function enrich(item) {
    if (!item || typeof item !== 'object') return item;
    const rental = isRental(item);
    const fee = Number(item.rentalMonthlyFee || 0) || monthlyFee(item);
    const term = Number(item.rentalMonths || 0) || months(item);
    const total = Number(item.rentalTotalFee || 0) || (fee > 0 && term > 0 ? fee * term : 0);
    const next = { ...item, isRental: rental, rentalMonthlyFee: fee, rentalMonths: term, rentalTotalFee: total };
    if (rental) {
      const badges = Array.isArray(next.badges) ? [...next.badges] : [];
      if (!badges.some((b) => String(b).includes('렌탈'))) badges.unshift('렌탈');
      next.badges = badges;
    }
    return next;
  }

  function priceText(item) {
    const c = enrich(item);
    if (!c?.isRental) return c?.price || c?.priceText || '';
    const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
    if (c.rentalMonthlyFee > 0 && c.rentalMonths > 0) {
      return `월 ${fmt(c.rentalMonthlyFee)}원 / ${c.rentalMonths}개월 / 총 ${fmt(c.rentalTotalFee)}원`;
    }
    if (c.rentalMonthlyFee > 0) return `월 ${fmt(c.rentalMonthlyFee)}원`;
    return `렌탈 ${c.price || c.priceText || '가격 확인'}`;
  }

  function rentalLast(list) {
    return [...(list || [])].sort((a, b) => {
      if (!!a.isRental !== !!b.isRental) return a.isRental ? 1 : -1;
      const fs = Number(b.finalScore || 0) - Number(a.finalScore || 0);
      if (fs) return fs;
      return Number(a.totalPriceNum || a.priceNum || 0) - Number(b.totalPriceNum || b.priceNum || 0);
    });
  }

  function patchRanking() {
    const r = global.ThisOneRanking;
    if (!r || r.__rentalHandlingPatched) return;
    if (typeof r.buildCandidates === 'function') {
      const original = r.buildCandidates.bind(r);
      r.buildCandidates = function (...args) {
        return rentalLast((original(...args) || []).map((candidate) => {
          const c = enrich(candidate);
          if (c.isRental) {
            c.rentalPenalty = 20;
            c.finalScore = Number(c.finalScore || 0) - 20;
          }
          return c;
        }));
      };
    }
    if (typeof r.mergeAiWithCandidates === 'function') {
      const originalMerge = r.mergeAiWithCandidates.bind(r);
      r.mergeAiWithCandidates = function (...args) {
        const merged = originalMerge(...args);
        if (Array.isArray(merged?.cards)) merged.cards = merged.cards.map(enrich);
        return merged;
      };
    }
    r.__rentalHandlingPatched = true;
  }

  function patchCards() {
    const c = global.ThisOneResultCards;
    if (!c || c.__rentalHandlingPatched) return;
    if (typeof c.renderPickCard === 'function') {
      const original = c.renderPickCard.bind(c);
      c.renderPickCard = function (card, ...rest) {
        const next = enrich(card);
        if (next.isRental) next.price = priceText(next);
        return original(next, ...rest);
      };
    }
    c.__rentalHandlingPatched = true;
  }

  patchRanking();
  patchCards();
  global.addEventListener?.('load', () => { patchRanking(); patchCards(); });
  global.ThisOneRentalHandling = { enrich, priceText, rentalLast };
})(window);
