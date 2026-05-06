(function() {
function parseRentalNumber(text) {
  return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
}

function enrichRentalCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const text = `${candidate.name || ''} ${candidate.store || ''} ${candidate.price || ''}`;
  const monthlyMatch = text.match(/월\s*([0-9,]+)\s*원/i);
  const monthsMatch = text.match(/(\d+)\s*개월/i);
  const yearsMatch = text.match(/(\d+)\s*년\s*약정/i);
  const isRental = /렌탈|대여|구독|약정|월납|의무사용|방문관리|코디관리|관리형/i.test(text)
    || !!monthlyMatch
    || !!monthsMatch
    || !!yearsMatch;
  const rentalMonthlyFee = monthlyMatch
    ? parseRentalNumber(monthlyMatch[1])
    : (isRental ? parseRentalNumber(candidate.price) : 0);
  const rentalMonths = monthsMatch
    ? parseInt(monthsMatch[1], 10)
    : (yearsMatch ? parseInt(yearsMatch[1], 10) * 12 : 0);
  const rentalTotalFee = rentalMonthlyFee > 0 && rentalMonths > 0
    ? rentalMonthlyFee * rentalMonths
    : 0;

  return {
    ...candidate,
    isRental,
    rentalMonthlyFee,
    rentalMonths,
    rentalTotalFee
  };
}

function extractAreaPyeong(text) {
  const source = String(text || '');
  const patterns = [
    /(\d+)\s*평형/,
    /(\d+)\s*평까지/,
    /(\d+)\s*평\s*용/,
    /(\d+)\s*평/
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return Number(match[1]);
  }

  return null;
}

function enrichRentalCandidatesInPayload(payload) {
  try {
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const clonedMessages = messages.map((message) => {
      const content = Array.isArray(message?.content) ? message.content : [];
      const nextContent = content.map((part) => {
        if (part?.type !== 'text' || typeof part.text !== 'string') return part;

        const marker = '후보 상품 목록(JSON):';
        const start = part.text.indexOf(marker);
        if (start === -1) return part;

        const jsonStart = part.text.indexOf('[', start);
        const jsonEndMarker = '\n\n의도분석:';
        const jsonEnd = part.text.indexOf(jsonEndMarker, jsonStart);
        if (jsonStart === -1 || jsonEnd === -1) return part;

        const before = part.text.slice(0, jsonStart);
        const jsonText = part.text.slice(jsonStart, jsonEnd);
        const after = part.text.slice(jsonEnd);
        let parsed;
        try {
          parsed = JSON.parse(jsonText);
        } catch (e) {
          return part;
        }

        if (!Array.isArray(parsed)) return part;
        const enriched = parsed.map(enrichRentalCandidate);
        console.debug('[ThisOne][rental-enrich]', {
          before: parsed.length,
          rentalCount: enriched.filter(x => x.isRental).length,
          samples: enriched.filter(x => x.isRental).slice(0, 3)
        });
        return {
          ...part,
          text: `${before}${JSON.stringify(enriched, null, 2)}${after}`
        };
      });
      return { ...message, content: nextContent };
    });
    return { ...payload, messages: clonedMessages };
  } catch (e) {
    console.warn('[api] rental candidate enrichment skipped:', e.message);
    return payload;
  }
}


function getCategoryPolicy(query) {
  const text = String(query || '');
  const categories = [
    {
      category: 'water_purifier',
      pattern: /정수기/i,
      policy: { rentalMode: 'aggressive', rentalMaxRank: null, rentalScorePenalty: 0, priceFloor: null, areaPriceFloor: null }
    },
    {
      category: 'air_purifier',
      pattern: /공기청정기|공청기/i,
      policy: {
        rentalMode: 'limited',
        rentalMaxRank: 3,
        rentalScorePenalty: 0.3,
        priceFloor: null,
        areaPriceFloor: {
          small: { maxPyeong: 13, floor: 150000 },
          medium: { maxPyeong: 25, floor: 350000 },
          large: { maxPyeong: null, floor: 650000 }
        }
      }
    },
    {
      category: 'bidet',
      pattern: /비데/i,
      policy: { rentalMode: 'aggressive', rentalMaxRank: null, rentalScorePenalty: 0, priceFloor: null, areaPriceFloor: null }
    },
    {
      category: 'massage_chair',
      pattern: /안마의자|안마기/i,
      policy: { rentalMode: 'aggressive', rentalMaxRank: null, rentalScorePenalty: 0, priceFloor: null, areaPriceFloor: null }
    },
    {
      category: 'food_disposer',
      pattern: /음식물처리기|음식물\s*처리|음식물쓰레기처리기/i,
      policy: { rentalMode: 'aggressive', rentalMaxRank: null, rentalScorePenalty: 0, priceFloor: 400000, areaPriceFloor: null }
    },
    {
      category: 'printer',
      pattern: /프린터|복합기/i,
      policy: { rentalMode: 'limited', rentalMaxRank: 2, rentalScorePenalty: 0.4, priceFloor: 200000, areaPriceFloor: null }
    },
    {
      category: 'robot_vacuum',
      pattern: /로봇청소기|로보락|샤오미\s*청소기/i,
      policy: { rentalMode: 'purchase_priority', rentalMaxRank: null, rentalScorePenalty: 0.5, priceFloor: 800000, areaPriceFloor: null }
    }
  ];

  const matched = categories.find((entry) => entry.pattern.test(text));
  if (!matched) {
    return {
      category: 'general',
      rentalMode: 'exclude',
      rentalMaxRank: null,
      rentalScorePenalty: 1.0,
      priceFloor: null,
      areaPriceFloor: null
    };
  }

  return {
    category: matched.category,
    ...matched.policy
  };
}

function getEffectivePriceFloor(query, item) {
  const policy = getCategoryPolicy(query);

  if (policy.priceFloor !== null) return policy.priceFloor;

  if (policy.areaPriceFloor) {
    const queryPyeong = extractAreaPyeong(query);
    if (queryPyeong === null) return null;

    const { small, medium, large } = policy.areaPriceFloor;
    if (queryPyeong <= small.maxPyeong) return small.floor;
    if (queryPyeong <= medium.maxPyeong) return medium.floor;
    return large.floor;
  }

  return null;
}

function isManagedQuery(query) {
  const policy = getCategoryPolicy(query);
  return policy.rentalMode === 'aggressive' || policy.rentalMode === 'limited';
}

function applyRentalReasoningInstruction(payload) {
  const rentalInstruction = `

[렌탈/관리형 상품 판단 원칙]
- 렌탈 상품을 무조건 제외하거나 무조건 뒤로 보내지 마세요.
- 렌탈 상품의 가격은 구매가가 아니라 월 납입액일 수 있습니다.
- 후보에 isRental, rentalMonthlyFee, rentalMonths, rentalTotalFee가 있으면 반드시 이를 읽고 판단하세요.
- rentalMonthlyFee는 월 납입액, rentalMonths는 약정 개월, rentalTotalFee는 전체 납부 예상액입니다.
- 월 납입액만 보고 저렴하다고 판단하지 말고, 총 납부액과 약정기간을 함께 보세요.
- 관리/AS/방문관리/초기비용 부담 감소가 중요한 품목은 렌탈도 합리적인 선택일 수 있습니다.
- 반대로 총 납부액이 구매가보다 지나치게 높거나 약정 부담이 크면 감점하세요.
- 사용자가 렌탈제외를 켰다면 서버에서 이미 제거됩니다. 남아 있는 렌탈 후보는 비교 가능한 후보로 다루세요.
- 추천 이유에는 렌탈이면 월 납입액과 총 납부액 관점을 명확히 설명하세요.

[정수기 판단 원칙]
- 정수기 카테고리에서는 렌탈/방문관리형이 실제 이용 흐름에서 상위권의 주류 선택지입니다.
- 사용자가 단순히 “정수기”라고 검색했다면 기본 의도는 단순 최저가 본체가 아니라 깨끗한 물을 안정적으로 마시고 관리 부담을 줄이는 것입니다.
- 따라서 단순 “정수기” 검색에서는 렌탈/방문관리/관리형 후보를 주변 옵션이 아니라 핵심 비교 후보로 다루세요.
- 정수기에서는 필터 교체, 방문관리, AS, 위생관리, 관리 번거로움 감소가 핵심 가치입니다.
- “자가관리”, “셀프관리”, “자가설치”, “필터 직접 교체” 상품은 저렴하더라도 기본 정수기 추천에서 1순위로 올리지 마세요.
- 단, 사용자가 직접 “자가관리 정수기”, “셀프관리 정수기”, “무전원 정수기”, “저렴한 정수기”처럼 명시했다면 자가관리 상품도 우선 후보가 될 수 있습니다.
- “렌탈”, “방문관리”, “관리형”, “필터교체”, “AS포함”, “코디관리” 문구가 있는 후보는 관리 편의성 관점에서 적극 비교하세요.
- 정수기, 공기청정기, 안마의자, 비데, 음식물처리기처럼 관리/방문관리/필터교체가 중요한 품목에서는 렌탈 후보를 단순 저가 상품으로 보지 말고, isRental·rentalMonthlyFee·rentalMonths·rentalTotalFee 필드를 읽어 약정개월·총납부액·관리편의성을 구매 후보와 함께 비교하세요.
- 정수기 추천 이유에는 가격뿐 아니라 필터 교체 방식과 관리 부담을 반드시 언급하세요.`;

  return {
    ...payload,
    system: `${payload.system || ''}${rentalInstruction}`
  };
}

function installManagedRentalRankingPatch() {
  const ranking = window.ThisOneRanking || {};
  const originalBuildCandidates = ranking.buildCandidates || window.buildCandidates;
  if (typeof originalBuildCandidates !== 'function' || originalBuildCandidates.__rentalPatchApplied) return;

  const isRentalLike = (item) => /렌탈|대여|구독|약정|월납|의무사용|방문관리|코디관리|관리형|월\s*[0-9,]+\s*원|\d+\s*개월/i.test(`${item?.name || ''} ${item?.store || ''} ${item?.price || ''} ${item?.priceText || ''} ${item?.delivery || ''}`);
  const addBadge = (item, badge) => {
    const badges = Array.isArray(item?.badges) ? item.badges.slice() : [];
    if (!badges.includes(badge)) badges.push(badge);
    return badges;
  };
  const rentalFields = (item) => {
    const text = `${item?.name || ''} ${item?.price || ''} ${item?.priceText || ''}`;
    const monthlyMatch = text.match(/월\s*([0-9,]+)\s*원/i);
    const monthsMatch = text.match(/(\d+)\s*개월/i);
    const yearsMatch = text.match(/(\d+)\s*년\s*약정/i);
    const monthly = monthlyMatch ? parseRentalNumber(monthlyMatch[1]) : parseRentalNumber(item?.price || item?.priceText || item?.lprice || item?.priceNum || 0);
    const months = monthsMatch ? parseInt(monthsMatch[1], 10) : (yearsMatch ? parseInt(yearsMatch[1], 10) * 12 : 0);
    return {
      isRental: true,
      rentalMonthlyFee: monthly || 0,
      rentalMonths: months || 0,
      rentalTotalFee: monthly > 0 && months > 0 ? monthly * months : 0
    };
  };
  const applyRentalScorePenalty = (item, policy) => {
    const penalty = Math.min(Math.max(Number(policy?.rentalScorePenalty || 0), 0), 1);
    if (!penalty) return item;

    const scoreMultiplier = 1 - penalty;
    const penalizeScore = (score) => score >= 0 ? score * scoreMultiplier : score * (1 + penalty);
    const nextBonusScore = penalizeScore(Number(item?.bonusScore || 0));
    const nextFinalScore = penalizeScore(Number(item?.finalScore || 0));

    return {
      ...item,
      rentalScorePenalty: penalty,
      bonusScore: nextBonusScore,
      finalScore: nextFinalScore
    };
  };
  const protectRental = (item, policy = getCategoryPolicy('')) => {
    const protectedItem = {
      ...item,
      ...rentalFields(item),
      excludeFromPriceRank: false,
      isExcluded: false,
      badges: addBadge(item, '관리형 렌탈'),
      bonusScore: Number(item?.bonusScore || 0) + 2,
      finalScore: Math.max(Number(item?.finalScore || 0), 1)
    };

    return applyRentalScorePenalty(protectedItem, policy);
  };
  const rawToCandidate = (item, index, policy) => {
    const priceNum = Number(item?.priceNum || item?.totalPriceNum || item?.lprice || parseRentalNumber(item?.price || item?.priceText));
    const price = item?.price || item?.priceText || (priceNum ? `${priceNum.toLocaleString('ko-KR')}원` : '');
    return protectRental({
      ...item,
      id: String(item?.id || item?.productId || `rental-${index + 1}`),
      sourceId: String(item?.id || item?.productId || `rental-${index + 1}`),
      price,
      priceNum,
      totalPriceNum: priceNum,
      specPenalty: Number(item?.specPenalty || 0),
      rentalProtected: true
    }, policy);
  };
  const sortByScore = (items) => items.slice().sort((a, b) => {
    if (Number(b?.finalScore || 0) !== Number(a?.finalScore || 0)) {
      return Number(b?.finalScore || 0) - Number(a?.finalScore || 0);
    }

    const ap = Number(a?.totalPriceNum || a?.priceNum || 0);
    const bp = Number(b?.totalPriceNum || b?.priceNum || 0);
    if (ap && bp) return ap - bp;

    return 0;
  });
  const limitRentalRank = (items, policy) => {
    const maxRank = Number(policy?.rentalMaxRank || 0);
    if (!maxRank) return items;

    const rentals = [];
    const purchases = [];
    items.forEach((item) => {
      if (isRentalLike(item)) rentals.push(item);
      else purchases.push(item);
    });

    if (!rentals.length || !purchases.length) return items;

    const topPurchase = purchases.shift();
    const rentalSlots = Math.max(maxRank - 1, 0);
    const visibleRentals = rentals.slice(0, rentalSlots);
    const overflowRentals = rentals.slice(rentalSlots);

    return [topPurchase, ...visibleRentals, ...purchases, ...overflowRentals];
  };

  const patchedBuildCandidates = function(...args) {
    const rawItems = Array.isArray(args[0]) ? args[0] : [];
    const query = args[1] || '';
    const policy = getCategoryPolicy(query);
    const built = originalBuildCandidates(...args);
    if (!Array.isArray(built)) return built;

    if (policy.rentalMode === 'purchase_priority') {
      return sortByScore(built.map(item => isRentalLike(item) ? applyRentalScorePenalty(item, policy) : item));
    }

    if (!isManagedQuery(query)) return built;

    const protectedBuilt = built.map(item => isRentalLike(item) ? protectRental(item, policy) : item);
    const seen = new Set(protectedBuilt.map(item => String(item?.productId || item?.link || item?.id || item?.name || '')));
    const restored = rawItems
      .filter(isRentalLike)
      .filter(item => {
        const key = String(item?.productId || item?.link || item?.id || item?.name || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, policy.rentalMode === 'limited' ? Math.max(Number(policy.rentalMaxRank || 0) - 1, 0) : 10)
      .map((item, index) => rawToCandidate(item, index, policy));

    if (restored.length) {
      console.debug('[ThisOne][rental-ranking-protect]', {
        category: policy.category,
        rentalMode: policy.rentalMode,
        builtCount: protectedBuilt.length,
        restoredCount: restored.length,
        samples: restored.slice(0, 3)
      });
    }

    const result = policy.rentalMode === 'limited'
      ? sortByScore([...protectedBuilt, ...restored])
      : [...protectedBuilt, ...restored];
    return policy.rentalMode === 'limited' ? limitRentalRank(result, policy) : result;
  };
  patchedBuildCandidates.__rentalPatchApplied = true;

  window.buildCandidates = patchedBuildCandidates;
  window.ThisOneRanking = {
    ...ranking,
    buildCandidates: patchedBuildCandidates
  };
}

  window.rentalPolicy = {
    parseRentalNumber: parseRentalNumber,
    getCategoryPolicy: getCategoryPolicy,
    extractAreaPyeong: extractAreaPyeong,
    getEffectivePriceFloor: getEffectivePriceFloor,
    isManagedQuery: isManagedQuery,
    enrichRentalCandidate: enrichRentalCandidate,
    enrichRentalCandidatesInPayload: enrichRentalCandidatesInPayload,
    applyRentalReasoningInstruction: applyRentalReasoningInstruction,
    installManagedRentalRankingPatch: installManagedRentalRankingPatch
  };
})();
