const {
  getCategoryRole
} = require('./categoryRole');

function parseRentalNumber(text) {
  return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
}

function getRentalText(item) {
  return `${item?.name || ''} ${item?.store || ''} ${item?.price || ''} ${item?.priceText || ''} ${item?.delivery || ''}`;
}

function getMonthlyMatch(item) {
  return getRentalText(item).match(/월\s*([0-9,]+)\s*원/i);
}

function hasRentalTextSignal(item) {
  const text = getRentalText(item);
  const monthlyMatch = text.match(/월\s*([0-9,]+)\s*원/i);
  return /렌탈|대여|구독|약정|월납|의무사용|방문관리|코디관리|관리형|월\s*[0-9,]+\s*원|\d+\s*개월/i.test(text)
    || !!monthlyMatch;
}

function isRentalLike(item) {
  const role = getCategoryRole(item);

  if (role === 'rental') {
    return true;
  }

  if (role !== 'unknown') {
    return false;
  }

  return hasRentalTextSignal(item);
}

function getRentalMonthlyFee(item) {
  const monthlyMatch = getMonthlyMatch(item);
  if (monthlyMatch) return parseRentalNumber(monthlyMatch[1]);
  return isRentalLike(item)
    ? parseRentalNumber(item?.price || item?.priceText || item?.lprice || item?.priceNum || 0)
    : 0;
}

function enrichRentalCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return candidate;

  const isRental = isRentalLike(candidate);
  return {
    ...candidate,
    isRental,
    rentalMonthlyFee: isRental ? getRentalMonthlyFee(candidate) : 0
  };
}

module.exports = {
  parseRentalNumber,
  getRentalText,
  hasRentalTextSignal,
  isRentalLike,
  getRentalMonthlyFee,
  enrichRentalCandidate
};
