// js/recurring_offer_guard.js
// 일반 구매 검색에 섞인 렌탈/구독/대여/임대형 상품이 구매가처럼 보이지 않도록 보정한다.
(function installRecurringOfferGuard(global) {
  if (global.__thisOneRecurringOfferGuardInstalled) return;
  global.__thisOneRecurringOfferGuardInstalled = true;

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
    if (!recurringOfferType) {
      return {
        ...item,
        isRecurringOffer: item.isRecurringOffer === true,
        recurringOfferType: item.recurringOfferType || '',
        recurringIntentExplicit: explicitRecurringIntent === true
      };
    }

    return {
      ...item,
      isRecurringOffer: true,
      recurringOfferType,
      recurringIntentExplicit: explicitRecurringIntent === true
    };
  }

  function demoteRecurringOffersForGenericPurchase(items, explicitRecurringIntent, excludeRental) {
    const annotated = (Array.isArray(items) ? items : []).map((item) => annotateRecurringOffer(item, explicitRecurringIntent));
    if (excludeRental || explicitRecurringIntent) return annotated;

    const normal = [];
    const recurring = [];
    annotated.forEach((item) => {
      if (item?.isRecurringOffer) recurring.push(item);
      else normal.push(item);
    });
    return [...normal, ...recurring];
  }

  function patchSearchResponse(response, query, settings) {
    if (!response || typeof response !== 'object') return response;
    const applied = response.searchSettingsDebug?.applied || {};
    const explicitRecurringIntent = applied.explicitRecurringIntent === true || hasExplicitRecurringIntent(query);
    const excludeRental = applied.excludeRental === true || String(settings?.excludeRental).toLowerCase() === 'true';
    const items = demoteRecurringOffersForGenericPurchase(response.items, explicitRecurringIntent, excludeRental);

    return {
      ...response,
      items,
      searchSettingsDebug: {
        ...(response.searchSettingsDebug || {}),
        recurringOfferGuard: {
          explicitRecurringIntent,
          excludeRental,
          demoted: !excludeRental && !explicitRecurringIntent,
          recurringOfferCount: items.filter((item) => item?.isRecurringOffer).length
        }
      }
    };
  }

  function wrapSearchFunction(name) {
    const original = global[name];
    if (typeof original !== 'function' || original.__recurringOfferGuardWrapped) return;

    const wrapped = async function recurringOfferGuardedSearch(query, settings, ...rest) {
      const response = await original.call(this, query, settings, ...rest);
      return patchSearchResponse(response, query, settings || {});
    };
    wrapped.__recurringOfferGuardWrapped = true;
    global[name] = wrapped;
    if (global.ThisOneAPI && typeof global.ThisOneAPI === 'object') {
      global.ThisOneAPI[name] = wrapped;
    }
  }

  function renderRecurringOfferNote(card) {
    if (!card?.isRecurringOffer || card?.recurringIntentExplicit === true) return '';
    const type = compactText(card.recurringOfferType) || '월납';
    return `<div class="row-price-sub row-recurring-offer-note"><span class="row-contract-line">${esc(type)} 조건 · 일반 구매가 아님</span></div>`;
  }

  function wrapResultCardRenderer() {
    const cards = global.ThisOneResultCards;
    if (!cards || typeof cards.renderPickCard !== 'function' || cards.renderPickCard.__recurringOfferGuardWrapped) return;
    const originalRenderPickCard = cards.renderPickCard;

    cards.renderPickCard = function recurringOfferGuardedPickCard(card, isFirst, options) {
      const annotated = annotateRecurringOffer(card, card?.recurringIntentExplicit === true);
      const html = originalRenderPickCard.call(this, annotated, isFirst, options);
      const note = renderRecurringOfferNote(annotated);
      if (!note) return html;
      return String(html).replace('<div class="row-cta">최종가 확인</div>', `${note}<div class="row-cta">최종가 확인</div>`);
    };
    cards.renderPickCard.__recurringOfferGuardWrapped = true;
  }

  wrapSearchFunction('requestSearch');
  wrapSearchFunction('requestSearchRaw');
  wrapSearchFunction('requestSearchFull');
  wrapResultCardRenderer();

  global.ThisOneRecurringOfferGuard = {
    hasExplicitRecurringIntent,
    detectRecurringOfferType,
    annotateRecurringOffer,
    demoteRecurringOffersForGenericPurchase,
    patchSearchResponse
  };
})(window);
