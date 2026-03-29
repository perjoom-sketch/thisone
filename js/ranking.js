function parsePriceNumber(text) {
  return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
}
function detectCategoryKey(query) {
  const q = String(query || '').toLowerCase();

  if (q.includes('유모차')) return 'stroller';
  if (q.includes('공기청정기')) return 'air_purifier';
  if (q.includes('선풍기')) return 'fan';
  if (q.includes('프린터')) return 'printer';
  if (q.includes('이어폰') || q.includes('에어팟') || q.includes('헤드폰')) return 'earphone';
  if (q.includes('냉장고')) return 'refrigerator';
  if (q.includes('세탁기')) return 'washer';
  if (q.includes('건조기')) return 'dryer';
  if (q.includes('식기세척기')) return 'dishwasher';
  if (q.includes('전자레인지')) return 'microwave';
  if (q.includes('에어프라이어')) return 'air_fryer';
  if (q.includes('tv')) return 'tv';
  if (q.includes('에어컨')) return 'air_conditioner';

  return 'generic';
}
function rewriteSearchQuery(query) {
  const q = String(query || '').toLowerCase();
  const categoryKey = detectCategoryKey(query);
  const family = window.ThisOneFamilies.getFamilyByCategory(categoryKey);

  if (categoryKey === 'printer' && q.includes('유지비')) {
    if (q.includes('회사') || q.includes('사무용')) {
      return '사무용 무한잉크 프린터 레이저 프린터 유지비 적은';
    }
    return '무한잉크 프린터 유지비 적은 가정용 프린터';
  }

  if (categoryKey === 'air_purifier' && (q.includes('전기료') || q.includes('전기요금'))) {
    return '저전력 공기청정기 에너지효율 좋은 공기청정기';
  }

  if (categoryKey === 'stroller' && q.includes('맘카페')) {
    return '맘카페 후기 좋은 유모차 절충형 디럭스 유모차';
  }

  return query;
}

function inferIntentProfile(query) {
  const q = String(query || '').toLowerCase();
  const categoryKey = detectCategoryKey(query);
  const family = window.ThisOneFamilies.getFamilyByCategory(categoryKey);

  return {
    categoryKey,
    familyKey: family.key,
    familyName: family.name,
    coreValues: family.coreValues || [],

    strollerNewbornStable:
      categoryKey === 'stroller' &&
      (q.includes('신생아') ||
        q.includes('안정감 좋은 유모차') ||
        q.includes('맘카페') ||
        q.includes('반응 좋은 유모차')),

    purifierEnergy:
      categoryKey === 'air_purifier' &&
      (q.includes('전기요금') ||
        q.includes('전기료') ||
        q.includes('저전력') ||
        q.includes('공기청정기')),

    printerMaintenance:
      categoryKey === 'printer' &&
      (q.includes('유지비 적은 프린터') ||
        q.includes('유지비') ||
        q.includes('프린터')),

    earphoneCall:
      categoryKey === 'earphone' &&
      (q.includes('통화품질') ||
        q.includes('통화') ||
        q.includes('이어폰') ||
        q.includes('에어팟')),

    fanLowNoise:
      categoryKey === 'fan' &&
      (q.includes('소음 적은') ||
        q.includes('저소음') ||
        q.includes('산업용 선풍기'))
  };
}
function getFamilyBonus(candidate, profile) {
  const name = String(candidate.name || '').toLowerCase();
  const price = parsePriceNumber(candidate.price);

  let bonusScore = 0;
  const bonusReasons = [];

  if (profile.familyKey === 'mobility') {
    const stableWords = ['절충형', '디럭스', '양대면', '서스펜션', '리클라이닝'];
    const lightWords = ['휴대용', '초경량', '경량', '기내반입', '접이식', '여행용'];

    if (stableWords.some(word => name.includes(word.toLowerCase()))) {
      bonusScore += 2;
      bonusReasons.push('이동형-안정감');
    }

    if (lightWords.some(word => name.includes(word.toLowerCase()))) {
      bonusScore += 1;
      bonusReasons.push('이동형-휴대성');
    }

    if (price >= 300000) {
      bonusScore += 1;
      bonusReasons.push('이동형-품질가격대');
    }
  }

  if (profile.familyKey === 'environment') {
    const energyWords = ['저전력', '절전', '에너지', '1등급', '인버터', 'dc'];
    const noiseWords = ['저소음', 'bldc', 'dc모터'];

    if (energyWords.some(word => name.includes(word.toLowerCase()))) {
      bonusScore += 2;
      bonusReasons.push('환경형-에너지');
    }

    if (noiseWords.some(word => name.includes(word.toLowerCase()))) {
      bonusScore += 2;
      bonusReasons.push('환경형-저소음');
    }

    if (/\d+\s*(㎡|m²|평)/i.test(name)) {
      bonusScore += 1;
      bonusReasons.push('환경형-면적정보');
    }
  }

  if (profile.familyKey === 'office_output') {
    const runningCostWords = ['무한잉크', '정품무한', 'ink tank', 'tank', '레이저'];
    const minusWords = ['토너', '카트리지'];

    if (runningCostWords.some(word => name.includes(word.toLowerCase()))) {
      bonusScore += 3;
      bonusReasons.push('사무형-유지비');
    }

    if (minusWords.some(word => name.includes(word.toLowerCase()))) {
      bonusScore -= 2;
      bonusReasons.push('사무형-소모품');
    }
  }

  if (profile.familyKey === 'wearable_usage') {
    const callWords = ['enc', '통화', '마이크', 'cvc', '노이즈캔슬링'];

    if (callWords.some(word => name.includes(word.toLowerCase()))) {
      bonusScore += 2;
      bonusReasons.push('착용형-기능성');
    }
  }

  return {
    bonusScore,
    bonusReasons
  };
}
function getCandidateBonus(candidate, profile) {
  const name = String(candidate.name || '').toLowerCase();
  const price = parsePriceNumber(candidate.price);

  const familyBonus = getFamilyBonus(candidate, profile);

  let bonusScore = familyBonus.bonusScore;
  const bonusReasons = [...familyBonus.bonusReasons];

  if (profile.strollerNewbornStable) {
    const isLight =
      name.includes('휴대용') ||
      name.includes('초경량') ||
      name.includes('경량') ||
      name.includes('기내반입') ||
      name.includes('접이식') ||
      name.includes('여행용');

    const isStable =
      name.includes('절충형') ||
      name.includes('디럭스') ||
      name.includes('신생아') ||
      name.includes('양대면') ||
      name.includes('리클라이닝') ||
      name.includes('서스펜션');

    const isTrikeLike =
      name.includes('트라이크') ||
      name.includes('유모카');

    if (isStable) {
      bonusScore += 3;
      bonusReasons.push('안정형 키워드');
    }

    if (isLight) {
      bonusScore -= 2;
      bonusReasons.push('경량형 감점');
    }

    if (isTrikeLike) {
      bonusScore -= 4;
      bonusReasons.push('트라이크형 감점');
    }

    if (price > 0 && price < 150000) {
      bonusScore -= 3;
      bonusReasons.push('저가형 감점');
    }

    if (price >= 300000) {
      bonusScore += 1;
      bonusReasons.push('품질 기대 가격대');
    }
  }

  if (profile.purifierEnergy) {
    if (
      name.includes('저전력') ||
      name.includes('절전') ||
      name.includes('에너지') ||
      name.includes('1등급') ||
      name.includes('인버터') ||
      name.includes('dc')
    ) {
      bonusScore += 3;
      bonusReasons.push('절전 힌트');
    }

    if (
      name.includes('필터포함') ||
      name.includes('정품필터') ||
      name.includes('교체필터')
    ) {
      bonusScore += 1;
      bonusReasons.push('유지비 힌트');
    }

    if (/\d+\s*(㎡|m²|평)/i.test(name)) {
      bonusScore += 1;
      bonusReasons.push('면적 정보');
    }
  }

  if (profile.printerMaintenance) {
    if (
      name.includes('무한잉크') ||
      name.includes('정품무한') ||
      name.includes('ink tank') ||
      name.includes('tank')
    ) {
      bonusScore += 4;
      bonusReasons.push('무한잉크');
    }

    if (name.includes('레이저')) {
      bonusScore += 2;
      bonusReasons.push('레이저 계열');
    }

    if (
      name.includes('토너') ||
      name.includes('카트리지')
    ) {
      bonusScore -= 3;
      bonusReasons.push('소모품형 감점');
    }
  }

  if (profile.earphoneCall) {
    if (
      name.includes('enc') ||
      name.includes('통화') ||
      name.includes('마이크') ||
      name.includes('cvc') ||
      name.includes('노이즈캔슬링')
    ) {
      bonusScore += 4;
      bonusReasons.push('통화 기능');
    }

    if (name.includes('게이밍')) {
      bonusScore -= 1;
      bonusReasons.push('게이밍 치우침');
    }
  }

  if (profile.fanLowNoise) {
    if (
      name.includes('저소음') ||
      name.includes('bldc') ||
      name.includes('dc모터')
    ) {
      bonusScore += 4;
      bonusReasons.push('저소음 힌트');
    }

    if (
      name.includes('고출력') ||
      name.includes('터보') ||
      name.includes('초강력')
    ) {
      bonusScore -= 1;
      bonusReasons.push('소음 우려');
    }
  }

  return {
    bonusScore,
    bonusReasons: bonusReasons.join(', ')
  };
}

function buildCandidates(items, queryText = '') {
  const profile = inferIntentProfile(queryText);

  return (items || []).slice(0, 12).map((item, idx) => {
    const candidate = {
      id: String(item.id ?? (idx + 1)),
      name: String(item.name || '').trim(),
      price: String(item.priceText || item.price || '').trim(),
      store: String(item.store || '').trim(),
      delivery: String(item.delivery || '상세페이지 확인').trim(),
      review: String(item.review || '').trim(),
      image: String(item.image || '').trim(),
      link: String(item.link || '').trim(),
      categoryKey: profile.categoryKey,
      familyKey: profile.familyKey,
      familyName: profile.familyName,
      coreValues: profile.coreValues
    };

    const bonus = getCandidateBonus(candidate, profile);

    return {
      ...candidate,
      bonusScore: bonus.bonusScore,
      bonusReasons: bonus.bonusReasons
    };
  }).sort((a, b) => {
    if (b.bonusScore !== a.bonusScore) return b.bonusScore - a.bonusScore;

    const ap = parsePriceNumber(a.price);
    const bp = parsePriceNumber(b.price);
    if (ap && bp) return ap - bp;

    return 0;
  });
}

function mergeAiWithCandidates(aiJson, candidates) {
  const byId = {};
  candidates.forEach((c, idx) => {
    byId[String(c.id)] = { ...c, _index: idx };
  });

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findSource(card, index) {
    if (card && card.sourceId != null) {
      const exact = byId[String(card.sourceId)];
      if (exact) return exact;
    }

    if (card && card.name) {
      const target = norm(card.name);

      let found = candidates.find(c => norm(c.name) === target);
      if (found) return found;

      found = candidates.find(c => norm(c.name).includes(target) || target.includes(norm(c.name)));
      if (found) return found;
    }

    if (candidates[index]) return candidates[index];
    return candidates[0] || null;
  }

  const rawCards = Array.isArray(aiJson.cards) ? aiJson.cards : [];

  const cards = rawCards.map((card, index) => {
    const source = findSource(card, index);

    return {
      type: card.type || '',
      label:
        card.type === 'price' ? '가격순' :
        card.type === 'review' ? '리뷰순' :
        card.type === 'popular' ? '인기순' :
        card.type === 'trust' ? '신뢰순' :
        (card.label || ''),
      name: source ? source.name : '',
      price: source ? source.price : '',
      store: source ? source.store : '',
      delivery: source ? source.delivery : '상세페이지 확인',
      review: source ? source.review : '',
      reason: card.reason || '',
      image: source ? source.image : '',
      link: source ? source.link : '',
      sourceId: source ? String(source.id) : String(card.sourceId || ''),
      _originalType: card.type || ''
    };
  }).filter(card => card.name || card.price || card.store || card.reason);

  const aiPickType = aiJson.aiPickSourceType || '';
  const aiBase =
    cards.find(card => card._originalType === aiPickType) ||
    cards[0] ||
    null;

  const aiPick = aiBase ? {
    ...aiBase,
    type: 'ai',
    label: 'AI추천'
  } : null;

  const orderedCards = [
    ...(aiPick ? [aiPick] : []),
    ...cards.filter(card => card._originalType !== aiPickType)
  ];

  return {
    cards: orderedCards,
    rejects: Array.isArray(aiJson.rejects) ? aiJson.rejects : []
  };
}

window.ThisOneRanking = {
  parsePriceNumber,
  rewriteSearchQuery,
  inferIntentProfile,
  getCandidateBonus,
  buildCandidates,
  mergeAiWithCandidates
};
