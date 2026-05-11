function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasExplicitRecurringIntent(query) {
  return /렌탈|구독|대여|임대|정기\s*(?:배송|구독)|월납|월\s*(?:납부|이용료)|약정|의무\s*사용|의무구독|계약\s*기간/i.test(String(query || ''));
}

function itemText(item) {
  return compactText([
    item?.name,
    item?.title,
    item?.productName,
    item?.price,
    item?.priceText,
    item?.store,
    item?.mallName,
    item?.delivery,
    item?.label,
    ...(Array.isArray(item?.badges) ? item.badges : [])
  ].filter(Boolean).join(' '));
}

function detectRecurringOfferType(item) {
  if (item?.isRecurringOffer && item?.recurringOfferType) return item.recurringOfferType;
  const text = itemText(item);
  if (!text) return '';

  if (/정기\s*배송/i.test(text)) return '정기배송';
  if (/정기\s*구독|구독/i.test(text)) return '구독';
  if (/대여/i.test(text)) return '대여';
  if (/임대/i.test(text)) return '임대';
  if (/렌탈|월납|월\s*(?:납부|이용료|납입)|약정|의무\s*사용|의무구독|계약\s*기간/i.test(text)) return '렌탈';
  if (/월\s*[0-9,]+\s*원/i.test(text) && /개월|관리|방문|렌탈|대여|구독|임대/i.test(text)) return '렌탈';
  if (/\d{1,3}\s*개월/i.test(text) && /렌탈|구독|대여|임대|월납|월\s*(?:납부|이용료)|약정|의무|계약/i.test(text)) return '렌탈';

  return '';
}

function annotateRecurringOffer(item, explicitRecurringIntent) {
  if (!item || typeof item !== 'object') return item;
  const recurringOfferType = detectRecurringOfferType(item);
  const recurring = Boolean(recurringOfferType);
  return {
    ...item,
    isRecurringOffer: recurring || item.isRecurringOffer === true,
    recurringOfferType: recurringOfferType || item.recurringOfferType || '',
    recurringIntentExplicit: explicitRecurringIntent === true
  };
}

function annotateRecurringOffers(items, explicitRecurringIntent) {
  return (Array.isArray(items) ? items : []).map((item) => annotateRecurringOffer(item, explicitRecurringIntent));
}

function orderRecurringOffers(items, explicitRecurringIntent, excludeRental) {
  const annotated = annotateRecurringOffers(items, explicitRecurringIntent);
  if (excludeRental || explicitRecurringIntent) return annotated;

  const purchaseItems = [];
  const recurringItems = [];
  annotated.forEach((item) => {
    if (item?.isRecurringOffer) recurringItems.push(item);
    else purchaseItems.push(item);
  });
  return [...purchaseItems, ...recurringItems];
}

function itemKey(item) {
  return String(item?.id || item?.productId || item?.link || item?.name || item?.title || '');
}

function restoreRecurringOffers(filteredItems, sourceItems, settings) {
  if (settings?.excludeRental) return Array.isArray(filteredItems) ? filteredItems : [];
  const base = Array.isArray(filteredItems) ? [...filteredItems] : [];
  const source = Array.isArray(sourceItems) ? sourceItems : [];
  const existingKeys = new Set(base.map(itemKey).filter(Boolean));

  source.forEach((item) => {
    if (!detectRecurringOfferType(item)) return;
    const key = itemKey(item);
    if (key && existingKeys.has(key)) return;
    if (key) existingKeys.add(key);
    base.push(item);
  });

  return base;
}

function applyRecurringOfferPolicy(items, settings = {}) {
  const explicitRecurringIntent = settings.explicitRecurringIntent === true;
  const excludeRental = settings.excludeRental === true;
  const orderedItems = orderRecurringOffers(items, explicitRecurringIntent, excludeRental);
  const recurringOfferCount = orderedItems.filter((item) => item?.isRecurringOffer).length;

  return {
    items: orderedItems,
    debug: {
      explicitRecurringIntent,
      excludeRental,
      demoted: !excludeRental && !explicitRecurringIntent,
      recurringOfferCount
    }
  };
}

module.exports = {
  annotateRecurringOffer,
  annotateRecurringOffers,
  applyRecurringOfferPolicy,
  detectRecurringOfferType,
  hasExplicitRecurringIntent,
  orderRecurringOffers,
  restoreRecurringOffers
};
