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
      '최우수 추천': '추천',
      ['가성' + '비 추천']: '최저가',
      '균형형 추천': '균형형',
      '브랜드/완성도 추천': '브랜드 우선',
      '최저가 추천': '최저가',
      '프리미엄 추천': '프리미엄',
      '합리적인 가격': '중간 가격대',
      '관리편의 렌탈': '관리편의',
      'AI추천': '추천',
      'AI 추천': '추천',
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

  function numberOrZero(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function splitReasonList(value) {
    if (Array.isArray(value)) return value.map(compactText).filter(Boolean);
    return String(value || '')
      .split(/[,\n]/g)
      .map(compactText)
      .filter(Boolean);
  }

  function isYoutubeDisplayText(text) {
    return /youtube|유튜브/i.test(String(text || ''));
  }

  function hasYoutubeSignal(card) {
    const youtubeTextSources = [
      card?.label,
      ...(Array.isArray(card?.badges) ? card.badges : []),
      ...(Array.isArray(card?.positiveSignals) ? card.positiveSignals : []),
      ...splitReasonList(card?.bonusReasons),
      ...splitReasonList(card?.youtubeReasons)
    ];

    return !!(
      card?.youtubeReputation ||
      card?.youtubeReasons ||
      card?.youtubeVideoCount ||
      card?.youtubeAnalyzedVideoCount ||
      youtubeTextSources.some(isYoutubeDisplayText)
    );
  }

  function renderYoutubeReputationBadge(card) {
    if (!hasYoutubeSignal(card)) return '';
    return '<span class="row-badge-item badge-trust row-youtube-badge" title="YouTube 평판 데이터 반영">YouTube 평판</span>';
  }

  function renderReviewSignalBadge(card) {
    const reviewSignals = card?.reviewSignals;
    if (!reviewSignals || typeof reviewSignals !== 'object') return '';

    const reviewSignalBonus = numberOrZero(card?.reviewSignalBonus);
    const searchSignalScore = numberOrZero(card?.searchSignalScore);
    const strongestMatch = compactText(reviewSignals?.strongestMatch).toLowerCase();
    const positiveHits = Number(reviewSignals?.positiveHits || 0);
    const negativeHits = Number(reviewSignals?.negativeHits || 0);
    const confidence = Number(reviewSignals?.confidence || 0);
    const hasModelMatchedSignal = strongestMatch === 'medium' || strongestMatch === 'strong';

    if (!hasModelMatchedSignal) return '';
    if (!Number.isFinite(positiveHits) || !Number.isFinite(negativeHits)) return '';
    if (negativeHits > positiveHits) return '';
    if (!Number.isFinite(confidence) || confidence < 0.3) return '';

    const isEligible = reviewSignalBonus > 0 || (searchSignalScore > 0 && positiveHits >= negativeHits);
    if (!isEligible) return '';

    const sanitizeTitleText = (value) => {
      const forbiddenPattern = new RegExp([
        '사용' + '후기',
        '구매자' + ' 후기',
        '검증된' + ' 리뷰'
      ].join('|'), 'g');
      return compactText(value).replace(forbiddenPattern, '외부 리뷰 신호');
    };
    const reasons = Array.isArray(reviewSignals.publicReasons)
      ? reviewSignals.publicReasons.map(sanitizeTitleText).filter(Boolean)
      : [];
    const summary = sanitizeTitleText(reviewSignals.publicSummary);
    const matchedCount = numberOrZero(reviewSignals.matchedCount);
    const titleParts = reasons.length
      ? reasons.slice(0, 3)
      : summary
        ? [summary]
        : [];

    if (!titleParts.length) {
      const countParts = [];
      if (matchedCount > 0) countParts.push('외부 리뷰 신호 ' + matchedCount + '건');
      if (positiveHits > 0) countParts.push(`긍정 신호 ${positiveHits}건`);
      if (negativeHits > 0) countParts.push(`제외 신호 ${negativeHits}건`);
      titleParts.push(countParts.join(' · ') || '외부 리뷰 신호 보조 반영');
    }

    const title = titleParts.join(' · ');
    return `<span class="row-badge-item badge-review-signal row-review-signal-badge" title="${escAttr(title)}">리뷰 신호</span>`;
  }

  function renderPositiveSignalBadges(card) {
    const signals = Array.isArray(card?.positiveSignals) ? card.positiveSignals : [];
    return signals
      .map(compactText)
      .filter(Boolean)
      .filter((signal) => !isYoutubeDisplayText(signal))
      .slice(0, 2)
      .map((signal) => `<span class="row-positive-signal-badge">✓ ${esc(signal)}</span>`)
      .join('');
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
    if (text.includes('최저가')) return 'badge-value';
    if (text.includes('신뢰') || text.includes('브랜드')) return 'badge-trust';
    if (text.includes('추천') || text.includes('프리미엄')) return 'badge-thisone';
    return 'badge-default';
  }



  function getRecurringContractTitle(card) {
    return compactText([
      card?.name,
      card?.title,
      card?.productName,
      card?.price,
      card?.priceText
    ].filter(Boolean).join(' '));
  }

  function normalizeContractLabel(label) {
    const text = compactText(label).replace(/\s+/g, '');
    const labels = {
      '의무사용': '의무사용',
      '의무구독': '의무구독',
      '최소이용': '최소이용',
      '대여기간': '대여기간',
      '임대기간': '임대기간',
      '계약기간': '계약기간',
      '약정': '약정',
      '의무': '의무사용'
    };
    return labels[text] || '';
  }

  function monthsFromYears(years) {
    const value = Number(years || 0);
    return Number.isFinite(value) && value > 0 ? value * 12 : 0;
  }

  function extractContractLabel(text) {
    const monthPatterns = [
      /(의무\s*사용|의무구독|최소\s*이용|대여\s*기간|임대\s*기간|계약\s*기간|약정)\s*(\d{1,3})\s*개월/i,
      /(\d{1,3})\s*개월\s*(의무\s*사용|의무|약정|의무구독|최소\s*이용|대여\s*기간|임대\s*기간|계약\s*기간)/i
    ];

    for (const pattern of monthPatterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const label = normalizeContractLabel(Number(match[1]) ? match[2] : match[1]);
      const months = Number(Number(match[1]) ? match[1] : match[2]);
      if (label && Number.isFinite(months) && months > 0) {
        return { contractMonths: months, contractLabel: `${label} ${months}개월` };
      }
    }

    const yearPatterns = [
      /(의무\s*사용|약정|의무구독|최소\s*이용|대여\s*기간|임대\s*기간|계약\s*기간)\s*(\d{1,2})\s*년/i,
      /(\d{1,2})\s*년\s*(의무\s*사용|의무|약정|의무구독|최소\s*이용|대여\s*기간|임대\s*기간|계약\s*기간)/i
    ];

    for (const pattern of yearPatterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const label = normalizeContractLabel(Number(match[1]) ? match[2] : match[1]);
      const months = monthsFromYears(Number(match[1]) ? match[1] : match[2]);
      if (label && months > 0) {
        return { contractMonths: months, contractLabel: `${label} ${months}개월` };
      }
    }

    return { contractMonths: 0, contractLabel: '' };
  }

  function extractRecurringContractMeta(title) {
    const text = compactText(title);
    const meta = {
      contractType: '',
      contractMonths: 0,
      contractLabel: '',
      managementType: '',
      visitCycleMonths: 0,
      deliveryCycleMonths: 0
    };
    if (!text) return meta;

    if (/정기\s*배송/i.test(text)) meta.contractType = '정기배송';
    else if (/정기\s*구독|구독/i.test(text)) meta.contractType = '구독';
    else if (/대여/i.test(text)) meta.contractType = '대여';
    else if (/임대/i.test(text)) meta.contractType = '임대';
    else if (/렌탈|월납|월\s*납부|월\s*이용료/i.test(text)) meta.contractType = '렌탈';

    const contract = extractContractLabel(text);
    meta.contractMonths = contract.contractMonths;
    meta.contractLabel = contract.contractLabel;

    if (/자가\s*관리/i.test(text)) meta.managementType = '자가관리';
    else if (/셀프\s*관리/i.test(text)) meta.managementType = '셀프관리';
    else if (/방문\s*관리(?:형)?/i.test(text)) meta.managementType = '방문관리';
    else if (/(?:^|[^가-힣])관리형(?:\s*렌탈)?(?:$|[^가-힣])/i.test(text)) meta.managementType = '관리형';

    const visitMatch = text.match(/방문\s*주기\s*(\d{1,2})\s*개월/i)
      || text.match(/(\d{1,2})\s*개월\s*마다\s*방문/i)
      || text.match(/(\d{1,2})\s*개월\s*방문/i)
      || text.match(/방문\s*(\d{1,2})\s*개월/i);
    if (visitMatch) meta.visitCycleMonths = Number(visitMatch[1]) || 0;

    const deliveryMatch = text.match(/배송\s*주기\s*(\d{1,2})\s*개월/i)
      || text.match(/(\d{1,2})\s*개월\s*마다\s*배송/i);
    if (deliveryMatch) meta.deliveryCycleMonths = Number(deliveryMatch[1]) || 0;
    else if (/매월\s*배송/i.test(text)) meta.deliveryCycleMonths = 1;

    if (!meta.contractType && (meta.contractLabel || meta.managementType || meta.visitCycleMonths)) {
      meta.contractType = '렌탈';
    }

    return meta;
  }

  function getUniqueRecurringMetaParts(meta) {
    if (!meta || typeof meta !== 'object') return [];
    const parts = [];
    if (meta.contractType) parts.push(meta.contractType);
    if (meta.contractLabel) parts.push(meta.contractLabel);
    if (meta.managementType) parts.push(meta.managementType);
    if (meta.visitCycleMonths > 0) parts.push(`방문주기 ${meta.visitCycleMonths}개월`);
    if (meta.deliveryCycleMonths > 0) parts.push(`배송주기 ${meta.deliveryCycleMonths}개월`);

    const seen = new Set();
    return parts.filter((part) => {
      const key = String(part || '').replace(/\s+/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function formatRecurringContractMeta(meta) {
    return getUniqueRecurringMetaParts(meta).join(' · ');
  }

  function formatRecurringContractMetaHtml(meta) {
    const parts = getUniqueRecurringMetaParts(meta);
    if (!parts.length) return `<span class="row-contract-line">의무기간 상세페이지 확인</span>`;

    const primary = [meta.contractType, meta.managementType].filter(Boolean);
    const secondary = [
      meta.contractLabel,
      meta.visitCycleMonths > 0 ? `방문주기 ${meta.visitCycleMonths}개월` : '',
      meta.deliveryCycleMonths > 0 ? `배송주기 ${meta.deliveryCycleMonths}개월` : ''
    ].filter(Boolean);
    const lines = [primary, secondary]
      .map((lineParts) => {
        const allowed = new Set(lineParts.map((part) => String(part || '').replace(/\s+/g, '')));
        return parts.filter((part) => allowed.has(String(part || '').replace(/\s+/g, '')));
      })
      .filter((lineParts) => lineParts.length)
      .map((lineParts) => lineParts.join(' · '));

    return lines
      .map((line) => `<span class="row-contract-line">${esc(line)}</span>`)
      .join('');
  }

  function formatPriceHtml(card) {
    if (card?.isRental && card.rentalMonthlyFee > 0) {
      const fmt = (v) => Number(v || 0).toLocaleString('ko-KR');
      const monthly = `월 ${fmt(card.rentalMonthlyFee)}원`;
      const meta = extractRecurringContractMeta(getRecurringContractTitle(card));
      return `<span class="row-price-main">${esc(monthly)}</span><span class="row-price-sub">${formatRecurringContractMetaHtml(meta)}</span>`;
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

    const shouldHideBadge = (badge) => normalizeBadgeText(badge) === '종합 1위';

    const badgesHtml = !hideRecommendationUi && Array.isArray(card.badges) && card.badges.length
      ? card.badges
          .map((badge) => normalizeBadgeText(badge))
          .filter((badge) => badge && !shouldHideBadge(badge) && !isYoutubeDisplayText(badge))
          .map((b) => `<span class="row-badge-item ${getBadgeClass(b)}">${esc(b)}</span>`)
          .join('')
      : '';

    const labelBadge = !hideRecommendationUi && card.label && !shouldHideBadge(card.label) && !isYoutubeDisplayText(card.label)
      ? `<span class="row-badge-item row-label-badge">${esc(normalizeBadgeText(card.label))}</span>`
      : '';

    const recommendationBadgesHtml = !hideRecommendationUi
      ? [
          labelBadge,
          badgesHtml,
          renderReviewSignalBadge(card),
          renderYoutubeReputationBadge(card)
        ].join('')
      : '';

    const positiveSignalBadgesHtml = !hideRecommendationUi
      ? renderPositiveSignalBadges(card)
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
                ${recommendationBadgesHtml}
              </div>
            </div>
          </div>

          <div class="row-meta">
            <span class="row-store-name">${esc(card.store || '판매처 정보 없음')}</span>
            <span class="row-delivery">${esc(card.delivery || '배송 정보 확인 필요')}</span>
            ${card.review ? `<span class="row-review">${esc(card.review)}</span>` : ''}
            ${positiveSignalBadgesHtml}
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
    renderAiComment,
    extractRecurringContractMeta,
    formatRecurringContractMeta
  };
})(window);

// 렌탈 상품을 구매가처럼 오해하지 않도록 월 납입액 표시 데이터만 보정한다.
(function patchRentalDisplay(global) {
  function parseNumber(text) {
    return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
  }

  const rentalSignalPattern = /렌탈|대여|임대|구독|정기\s*구독|정기\s*배송|약정|월납|월\s*납부|월\s*이용료|의무\s*사용|의무구독|최소\s*이용|대여\s*기간|임대\s*기간|계약\s*기간|방문관리|자가관리|셀프관리|코디관리|관리형|방문\s*주기|배송\s*주기|매월\s*배송|월\s*[0-9,]+\s*원/i;

  function rentalText(item) {
    return `${item?.name || ''} ${item?.store || ''} ${item?.price || ''}`;
  }

  function isRental(item) {
    return item?.isRental === true || rentalSignalPattern.test(rentalText(item));
  }

  function rentalMonthlyFee(item) {
    const m = rentalText(item).match(/월\s*([0-9,]+)\s*원/i);
    if (m) return parseNumber(m[1]);
    return isRental(item) ? Number(item?.priceNum || item?.lprice || parseNumber(item?.price) || 0) : 0;
  }

  function enrichRental(item) {
    if (!item || typeof item !== 'object') return item;
    const rental = isRental(item);
    const monthly = Number(item.rentalMonthlyFee || 0) || rentalMonthlyFee(item);
    const next = { ...item, isRental: rental, rentalMonthlyFee: monthly };

    if (rental) {
      const badges = Array.isArray(next.badges) ? [...next.badges] : [];
      if (!badges.some((b) => String(b).includes('렌탈'))) badges.unshift('렌탈');
      next.badges = badges;
    }

    return next;
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
        return originalRender(enrichRental(card), ...rest);
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
    enrichRental
  };
})(window);
