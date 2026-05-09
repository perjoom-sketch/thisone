// js/rental_handling_patch.js
(function (global) {
  function num(text) {
    return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
  }

  const rentalSignalPattern = /렌탈|대여|구독|약정|월납|의무사용|방문관리|코디관리|관리형|월\s*[0-9,]+\s*원|\d+\s*개월/i;

  function textOf(item) {
    return `${item?.name || ''} ${item?.store || ''} ${item?.price || ''}`;
  }

  function isRental(item) {
    return item?.isRental === true || rentalSignalPattern.test(textOf(item));
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
      return `월 ${fmt(c.rentalMonthlyFee)}원 / 의무 ${c.rentalMonths}개월 / 총 ${fmt(c.rentalTotalFee)}원`;
    }
    if (c.rentalMonthlyFee > 0) return `월 ${fmt(c.rentalMonthlyFee)}원`;
    return `렌탈 ${c.price || c.priceText || '가격 확인'}`;
  }

  // result_cards.js와 rental_policy.js가 카드 표시/랭킹 패치를 담당한다.
  // 이 파일은 복원된 로드 순서에서 중복 래핑을 만들지 않도록 렌탈 판별/표시 헬퍼만 노출한다.

  global.ThisOneRentalHandling = { enrich, priceText };
})(window);
