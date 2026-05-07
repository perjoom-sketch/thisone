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
    const raw = String(text || '').trim();
    const mapped = {
      '최우수 추천': '종합 1위',
      '가성비 추천': '가성비',
      '균형형 추천': '균형형',
      '브랜드/완성도 추천': '브랜드 우선',
      '최저가 추천': '최저가',
      '프리미엄 추천': '프리미엄',
      '합리적인 가격': '중간 가격대',
      '관리편의 렌탈': '관리편의',
      'AI추천': '종합 1위',
      'AI 추천': '종합 1위',
      '추가 후보': '추가',
      '배송비 미확인': '배송비 상세확인'
    };
    if (mapped[raw]) return mapped[raw];
    return raw.replace(/\s*추천\s*$/g, '').trim();
  }
function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractModelName(name) {
  const text = compactText(name).toUpperCase();
  if (!text) return '';

  const patterns = [
    /\b([A-Z]{1,10}-[A-Z]{0,10}\d[A-Z0-9-]*)\b/,
    /\b([A-Z]{1,10}\d[A-Z0-9-]*\d[A-Z0-9-]*)\b/,
    /\b([A-Z]{1,10}-\d{2,}[A-Z0-9-]*)\b/,
    /\b([A-Z]{1,10}\d{3,}[A-Z0-9-]*)\b/,
    /\b([A-Z]{2,}\d{2,}[A-Z0-9-]*)\b/,
    /\b(\d{3,}[A-Z]{1,10})\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return '';
}
function renderProductFacts(card) {
  const name = compactText(card.name);
  const facts = [];
  const categoryWords = new Set([
    '정수기', '공기청정기', '렌탈', '프린터', '복합기', '마우스', '청소기', '로봇청소기',
    '상품', '정품', '공식', '공식판매', '국내정품', '무료배송', '당일배송'
  ]);

  const unique = (values) => {
    const seen = new Set();
    return values
      .map(compactText)
      .filter(Boolean)
      .map((value) => value.replace(/[(),]/g, '').trim())
      .filter(Boolean)
      .filter((value) => !categoryWords.has(value))
      .filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  function dedupeTokens(tokens) {
    const filtered = tokens.filter((t) => t && t.trim().length > 0);
    const result = [];

    for (const token of filtered) {
      const normalizedToken = token.toLowerCase();
      const hasModelSignal = /\d/.test(token);
      const isSubstring = result.some((existing) =>
        hasModelSignal &&
        /\d/.test(existing) &&
        existing.length > token.length &&
        existing.toLowerCase().includes(normalizedToken)
      );
      if (isSubstring) continue;

      const shorterDuplicates = result.filter((existing) =>
        hasModelSignal &&
        /\d/.test(existing) &&
        token.length > existing.length &&
        normalizedToken.includes(existing.toLowerCase())
      );
      for (const dup of shorterDuplicates) {
        const idx = result.indexOf(dup);
        if (idx >= 0) result.splice(idx, 1);
      }

      result.push(token);
    }

    return result;
  }

  const extractKnownBrand = (text) => {
    const brands = [
      'LG퓨리케어', 'LG전자', '삼성전자', '바디프랜드', '다이슨', '로보락', '에코백스',
      '샤오미', '쿠쿠', '쿠첸', '위닉스', '브라운', '필립스', '소니', '애플', '로지텍',
      '레노버', '한성', '루메나', '듀플렉스', '캐논', '코웨이', 'LG', '삼성', '신일', '제스파', '코지마', 'HP'
    ];
    const source = String(text || '');
    return brands.find((brand) => source.toLowerCase().includes(String(brand).toLowerCase())) || '';
  };

  const extractFallbackBrand = (text) => {
    const tokens = compactText(text)
      .replace(/[|/()\[\],]/g, ' ')
      .split(/\s+/)
      .map((token) => token.replace(/^(공식|정품|국내정품|브랜드)[:：-]?/g, '').trim())
      .filter(Boolean);
    return tokens.find((token) => {
      if (categoryWords.has(token)) return false;
      if (/^\d/.test(token)) return false;
      if (/무료배송|당일배송|공식|정품|렌탈/i.test(token)) return false;
      return /[가-힣A-Za-z]/.test(token);
    }) || '';
  };

  const extractSpecs = (text) => {
    const matches = String(text || '').match(/\d+(?:\.\d+)?\s*(?:cm|mm|인치|inch|kg|g|ml|l|리터|w|kw|평|㎡|m²)/gi) || [];
    return unique(matches).filter((value) => !/^\d+\s*(?:개월|개|매|팩|세트)$/i.test(value)).slice(0, 2);
  };

  const isDisplayLike = (text) => /tv|티비|텔레비전|모니터|디스플레이|uhd|oled|qled|스마트tv|스마트 tv/i.test(String(text || ''));

  const extractDisplayFeatures = (text) => {
    if (!isDisplayLike(text)) return [];
    const source = String(text || '');
    const found = [];
    if (/4k\s*uhd/i.test(source)) found.push('4K UHD');
    else if (/uhd/i.test(source)) found.push('UHD');
    if (/oled/i.test(source)) found.push('OLED');
    else if (/qled/i.test(source)) found.push('QLED');
    else if (/(^|[^A-Z])led([^A-Z]|$)/i.test(source)) found.push('LED');
    if (/스마트\s*tv|smart\s*tv/i.test(source)) found.push('스마트TV');
    if (/\bai\b|인공지능/i.test(source)) found.push('AI');
    if (/1\s*등급|1등급/i.test(source)) found.push('1등급');
    return unique(found).slice(0, 3);
  };

  const extractPurpose = (text) => {
    const purposes = [
      '업소용', '산업용', '공업용', '현장용', '축사용', '가정용', '사무실용',
      '캠핑용', '차량용', '휴대용', '영업용', '매장용', '주방용', '욕실용'
    ];
    return unique(purposes.filter((word) => String(text || '').includes(word))).slice(0, 2).join('/');
  };

  const extractForm = (text) => {
    const forms = [
      '무선', '유선', '스탠드', '벽걸이', '좌식', '앉은뱅이', '접이식',
      '올인원', '일체형', '휴대형', '핸디형', '로봇형', '써큘레이터'
    ];
    return unique(forms.filter((word) => String(text || '').includes(word))).slice(0, 2).join('/');
  };

  const combinedText = `${name} ${card.store || ''} ${card.mallName || ''} ${card.delivery || ''}`;
  const brand = compactText(card.brand || card.maker || extractKnownBrand(combinedText) || extractFallbackBrand(card.mallName || card.store || name));
  const rawModelCode = extractModelName(`${card.modelCode || ''} ${card.model || ''} ${card.modelKey || ''} ${name}`);
  const modelCode = /^\d+(?:CM|MM|KG|G|ML|L|W|KW)$/i.test(rawModelCode) ? '' : rawModelCode;
  const specs = extractSpecs(name).filter((spec) => !modelCode || spec.toUpperCase().replace(/\s+/g, '') !== modelCode.toUpperCase());
  const displayFeatures = extractDisplayFeatures(combinedText);
  const purpose = extractPurpose(combinedText);
  const form = extractForm(combinedText);

  if (brand) facts.push(brand);
  if (modelCode) facts.push(modelCode);
  facts.push(...displayFeatures);
  if (purpose) facts.push(purpose);
  if (form) facts.push(form);
  facts.push(...specs);

  const cleanFacts = dedupeTokens(unique(facts)).slice(0, 4);
  if (!cleanFacts.length) return '';

  return `
    <div class="row-product-facts">
      <span class="row-product-facts-label">제품정보</span>
      <span>${esc(cleanFacts.join(' · '))}</span>
    </div>
  `;
}
  
function getBadgeClass(text) {
    if (text.includes('가성비') || text.includes('최저가')) return 'badge-value';
    if (text.includes('신뢰') || text.includes('브랜드')) return 'badge-trust';
    if (text.includes('종합 1위') || text.includes('프리미엄')) return 'badge-thisone';
    return 'badge-default';
  }



  function formatPriceHtml(card) {
    if (card?.isRental && card.rentalMonthlyFee > 0) {
      const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
      const monthly = `월 ${fmt(card.rentalMonthlyFee)}원`;
      if (card.rentalMonths > 0 && card.rentalTotalFee > 0) {
        return `<span class="row-price-main">${esc(monthly)}</span><span class="row-price-sub">${esc(`${card.rentalMonths}개월 · 총 ${fmt(card.rentalTotalFee)}원`)}</span>`;
      }
      return `<span class="row-price-main">${esc(monthly)}</span>`;
    }
    return esc(card.price || '가격 정보 없음');
  }

  function renderPickCard(card, isFirst, options) {
    const opts = options || {};
    const hideRecommendationUi = !!opts.hideRecommendationUi;
    const priceClass = card.isRental ? 'row-price row-price-rental' : 'row-price';
    const imageHtml = card.image
      ? `<img class="row-img" src="${escAttr(card.image)}" alt="${escAttr(card.name || '상품')}" onerror="this.onerror=null;this.alt='';this.style.visibility='hidden';">`
      : `<div class="row-img-placeholder">상품</div>`;

    const badgesHtml = !hideRecommendationUi && Array.isArray(card.badges) && card.badges.length
      ? card.badges.map((badge) => normalizeBadgeText(badge)).map((b) => `<span class="row-badge-item ${getBadgeClass(b)}">${esc(b)}</span>`).join('')
      : '';

    const labelBadge = !hideRecommendationUi && card.label
      ? `<span class="row-badge-item row-label-badge">${esc(normalizeBadgeText(card.label))}</span>`
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

          ${renderProductFacts(card)}
        </div>

        <div class="row-price-area">
          <div class="${priceClass}">${formatPriceHtml(card)}</div>
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

// 렌탈 상품을 구매가처럼 오해하지 않도록 표시 데이터만 보정한다.
// 정렬은 강제하지 않고 AI가 월 납입액/약정/총액을 이해해 판단하게 한다.
(function patchRentalDisplay(global) {
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
    }

    return next;
  }

  function rentalPriceText(item) {
    const c = enrichRental(item);
    if (!c?.isRental) return c?.price || c?.priceText || '';
    const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
    if (c.rentalMonthlyFee > 0 && c.rentalMonths > 0) {
      return `월 ${fmt(c.rentalMonthlyFee)}원 ${c.rentalMonths}개월 총 ${fmt(c.rentalTotalFee)}원`;
    }
    if (c.rentalMonthlyFee > 0) return `월 ${fmt(c.rentalMonthlyFee)}원`;
    return `렌탈 ${c.price || c.priceText || '가격 확인'}`;
  }

  function patchRankingData() {
    const ranking = global.ThisOneRanking;
    if (!ranking || ranking.__rentalDisplayPatched) return;

    if (typeof ranking.buildCandidates === 'function') {
      const originalBuild = ranking.buildCandidates.bind(ranking);
      ranking.buildCandidates = function patchedBuildCandidates(...args) {
        return (originalBuild(...args) || []).map(enrichRental);
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

    ranking.__rentalDisplayPatched = true;
  }

  function patchCards() {
    const cards = global.ThisOneResultCards;
    if (!cards || cards.__rentalDisplayPatched) return;

    if (typeof cards.renderPickCard === 'function') {
      const originalRender = cards.renderPickCard.bind(cards);
      cards.renderPickCard = function patchedRenderPickCard(card, ...rest) {
        const next = enrichRental(card);
        if (next.isRental) next.price = rentalPriceText(next);
        return originalRender(next, ...rest);
      };
    }

    cards.__rentalDisplayPatched = true;
  }

  patchRankingData();
  patchCards();
  global.addEventListener?.('load', () => {
    patchRankingData();
    patchCards();
  });

  global.ThisOneRentalHandling = {
    enrichRental,
    rentalPriceText
  };
})(window);
