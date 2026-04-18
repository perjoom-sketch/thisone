function rewriteSearchQuery(query) {
  const q = String(query || '').trim();
  const lower = q.toLowerCase();

  if (!q) return '';

  if (lower.includes('유지비') && lower.includes('프린터')) {
    return '무한잉크 프린터';
  }

  if ((lower.includes('배송비 포함') || lower.includes('가장 나은')) && lower.includes('공기청정기')) {
    return '공기청정기';
  }

  if ((lower.includes('맘카페') || lower.includes('반응 좋은')) && lower.includes('유모차')) {
    return '신생아 절충형 유모차';
  }

  if ((lower.includes('통화') || lower.includes('통화품질')) && (lower.includes('이어폰') || lower.includes('에어팟'))) {
    return '통화품질 좋은 블루투스 이어폰';
  }

  if ((lower.includes('저소음') || lower.includes('소음 적은')) && lower.includes('산업용 선풍기')) {
    return '저소음 산업용 선풍기';
  }

  return q;
}

function parsePriceNumber(text) {
  return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
}

function parseShippingCost(text) {
  const t = String(text || '');
  if (!t) return { known: false, cost: 0 };
  if (/무료/i.test(t)) return { known: true, cost: 0 };

  const m = t.match(/(\d[\d,]*)\s*원/);
  if (m) {
    return { known: true, cost: parsePriceNumber(m[1]) };
  }
  return { known: false, cost: 0 };
}

function normalizeUnit(unit) {
  return String(unit || '').toLowerCase();
}

function extractSpecs(text) {
  const pattern = /(\d+(?:\.\d+)?)\s*(인치|cm|mm|kg|g|ml|l|리터|w|평|매|개입|세트)/gi;
  const specs = [];
  let m;

  while ((m = pattern.exec(String(text || ''))) !== null) {
    specs.push({
      value: parseFloat(m[1]),
      unit: normalizeUnit(m[2]),
      raw: m[0]
    });
  }

  return specs;
}

function detectAlphaSizeMix(title) {
  const t = String(title || '').toUpperCase();
  const alphaSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const found = alphaSizes.filter((size) => new RegExp(`(^|[^A-Z])${size}([^A-Z]|$)`).test(t));

  if (found.length >= 2) {
    return {
      isMixed: true,
      specs: found,
      unit: 'alpha',
      reason: '복수 알파사이즈'
    };
  }

  return { isMixed: false, specs: [], unit: '', reason: '' };
}

function detectMixedSpecs(title) {
  const t = String(title || '');

  const optionKeywords = /택\d|골라담기|모음전|모음|세트선택|옵션선택|옵션|선택/i;
  if (optionKeywords.test(t)) {
    return {
      isMixed: true,
      specs: [],
      unit: '',
      reason: '선택형 키워드'
    };
  }

  const alphaMix = detectAlphaSizeMix(t);
  if (alphaMix.isMixed) return alphaMix;

  const specMatches = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(인치|cm|mm|kg|g|ml|l|리터|w)/gi)];
  const grouped = {};

  specMatches.forEach((m) => {
    const value = parseFloat(m[1]);
    const unit = normalizeUnit(m[2]);
    if (!grouped[unit]) grouped[unit] = [];
    grouped[unit].push(value);
  });

  for (const unit of Object.keys(grouped)) {
    const unique = [...new Set(grouped[unit])];
    if (unique.length >= 2) {
      return {
        isMixed: true,
        specs: unique.sort((a, b) => a - b),
        unit,
        reason: `복수 규격(${unit})`
      };
    }
  }

  if (/[\/,]/.test(t) && specMatches.length >= 2) {
    const nums = specMatches.map((m) => parseFloat(m[1]));
    const lastUnit = normalizeUnit(specMatches[specMatches.length - 1][2]);

    return {
      isMixed: true,
      specs: [...new Set(nums)].sort((a, b) => a - b),
      unit: lastUnit,
      reason: '슬래시/콤마 혼합 규격'
    };
  }

  return { isMixed: false, specs: [], unit: '', reason: '' };
}

function isBundleLike(title) {
  return /(1\+1|\d+\s*개입|\d+\s*팩|\d+\s*세트|\d+\s*묶음)/i.test(String(title || ''));
}

function isAccessoryLike(title, query) {
  const t = String(title || '').toLowerCase();
  const q = String(query || '').toLowerCase();

  const accessoryWords = [
    '날개', '커버', '리모컨', '받침', '브라켓', '거치대',
    '부품', '악세사리', '액세서리', '필터', '소모품',
    '케이스', '보호필름', '충전기', '호환'
  ];

  const hasAccessoryWord = accessoryWords.some((w) => t.includes(w));
  const queryIsMainProduct = /(선풍기|공기청정기|프린터|유모차|이어폰|에어팟|가전|의자|책상|노트북|모니터)/i.test(q);

  return hasAccessoryWord && queryIsMainProduct;
}

function getMedianPrice(items) {
  const nums = (items || [])
    .map((item) => Number(item.priceNum || 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  if (!nums.length) return 0;

  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function inferIntentProfile(query) {
  const q = String(query || '').toLowerCase();

  return {
    strollerNewbornStable:
      q.includes('신생아') ||
      q.includes('안정감 좋은 유모차') ||
      q.includes('맘카페') ||
      q.includes('반응 좋은 유모차'),

    purifierEnergy:
      q.includes('전기요금') ||
      q.includes('전기료') ||
      q.includes('저전력') ||
      q.includes('공기청정기'),

    printerMaintenance:
      q.includes('유지비 적은 프린터') ||
      q.includes('유지비') ||
      q.includes('프린터'),

    earphoneCall:
      q.includes('통화품질') ||
      q.includes('통화') ||
      q.includes('이어폰') ||
      q.includes('에어팟'),

    fanLowNoise:
      q.includes('소음 적은') ||
      q.includes('저소음') ||
      q.includes('산업용 선풍기')
  };
}

function getCandidateBonus(candidate, profile) {
  const name = String(candidate.name || '').toLowerCase();
  const price = parsePriceNumber(candidate.price);

  let bonusScore = 0;
  const bonusReasons = [];

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

    const isTrikeLike = name.includes('트라이크') || name.includes('유모카');

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

    if (name.includes('필터포함') || name.includes('정품필터') || name.includes('교체필터')) {
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

    if (name.includes('토너') || name.includes('카트리지')) {
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

function isOptionItem(item) {
  const mixed = detectMixedSpecs(item.name || '');

  if (mixed.isMixed) {
    return {
      isOption: true,
      confidence: 0.9,
      reason: mixed.reason || '제목에 복수 규격 포함'
    };
  }

  const lprice = Number(item.priceNum || 0);
  const hprice = Number(item.hpriceNum || 0);

  if (lprice > 0 && hprice > 0) {
    const ratio = lprice / hprice;

    if (ratio < 0.5) {
      return {
        isOption: true,
        confidence: 0.85,
        reason: `최저가/최고가 비율 ${Math.round(ratio * 100)}%`
      };
    }

    if (ratio < 0.7) {
      return {
        isOption: true,
        confidence: 0.65,
        reason: `가격 폭 ${Math.round((1 - ratio) * 100)}%`
      };
    }
  }

  return { isOption: false, confidence: 0.1, reason: '' };
}

function checkSpecMatch(query, title) {
  const querySpecs = extractSpecs(query);
  if (!querySpecs.length) return { match: true, mismatchReason: '' };

  const mixed = detectMixedSpecs(title);
  if (!mixed.isMixed || !mixed.specs.length) {
    return { match: true, mismatchReason: '' };
  }

  for (const qs of querySpecs) {
    if (mixed.unit !== 'alpha' && normalizeUnit(qs.unit) !== normalizeUnit(mixed.unit)) continue;

    const numericSpecs = mixed.specs.filter((v) => typeof v === 'number');
    if (!numericSpecs.length) continue;

    const minSpec = Math.min(...numericSpecs);
    const maxSpec = Math.max(...numericSpecs);

    if (qs.value > minSpec && qs.value <= maxSpec) {
      return {
        match: false,
        mismatchReason: `검색 ${qs.raw}, 제목 최저옵션 ${minSpec}${mixed.unit}`
      };
    }
  }

  return { match: true, mismatchReason: '' };
}

function shouldExcludeFromPriceRank(item, query, medianPrice) {
  const badges = [];
  const option = isOptionItem(item);
  const specMatch = checkSpecMatch(query, item.name || '');

  if (option.isOption && !specMatch.match) {
    badges.push('옵션가 주의');
    return {
      exclude: true,
      reason: `옵션형 상품 — ${specMatch.mismatchReason}`,
      badges
    };
  }

  if (medianPrice && item.priceNum > 0 && item.priceNum < medianPrice * 0.15) {
    badges.push('극단적 저가');
    return {
      exclude: true,
      reason: `중앙값 대비 ${Math.round((item.priceNum / medianPrice) * 100)}%`,
      badges
    };
  }

  if (isAccessoryLike(item.name, query)) {
    badges.push('액세서리 의심');
    return {
      exclude: true,
      reason: '본품이 아닌 액세서리/부품 의심',
      badges
    };
  }

  if (option.isOption && option.confidence >= 0.6) {
    badges.push('옵션가 확인');
  }

  if (isBundleLike(item.name)) {
    badges.push('묶음상품');
  }

  if (!item.shippingKnown) {
    badges.push('배송비 미확인');
  } else if (item.shippingCost > 0) {
    badges.push('배송비 포함 확인');
  }

  if (/배송비\s*별도/i.test(`${item.name || ''} ${item.delivery || ''}`)) {
    badges.push('배송비 별도');
  }

  return {
    exclude: false,
    reason: option.reason || '',
    badges
  };
}

function getSafePriceCandidate(candidates) {
  return (candidates || [])
    .filter((c) => !c.excludeFromPriceRank)
    .sort((a, b) => {
      const ap = Number(a.totalPriceNum || a.priceNum || 0);
      const bp = Number(b.totalPriceNum || b.priceNum || 0);
      return ap - bp;
    })[0] || null;
}

function getModelKey(name) {
  const original = String(name || '').toUpperCase().trim();

  if (!original) return '';

  const cleaned = original
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]+\)/g, ' ')
    .replace(/\b(정품|공식|공식판매|국내정품|사은품|무료배송|당일배송|복합기|프린터|무한잉크|잉크젯|화이트|블랙|실버|그레이|레드|블루|핑크)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const codePatterns = [
    /\b([A-Z]{1,10}-\d{2,}[A-Z0-9-]*)\b/,
    /\b([A-Z]{1,10}\d{3,}[A-Z0-9]*)\b/,
    /\b(\d{3,}[A-Z]{1,10})\b/
  ];

  for (const pattern of codePatterns) {
    const match = cleaned.match(pattern);
    if (match) return match[1];
  }

  const words = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 2)
    .slice(0, 3);

  return words.join(' ');
}
function dedupeCandidatesByModel(items = []) {
  const map = new Map();

  for (const item of items) {
    const key = getModelKey(item.name);
    const current = { ...item, modelKey: key };
    const prev = map.get(key);

    if (!prev) {
      map.set(key, current);
      continue;
    }

    const prevScore =
      (prev.shippingKnown ? 2 : 0) +
      (prev.image ? 1 : 0) +
      (prev.link ? 1 : 0) +
      (prev.review ? 1 : 0) -
      (prev.excludeFromPriceRank ? 3 : 0);

    const currScore =
      (current.shippingKnown ? 2 : 0) +
      (current.image ? 1 : 0) +
      (current.link ? 1 : 0) +
      (current.review ? 1 : 0) -
      (current.excludeFromPriceRank ? 3 : 0);

    const prevPrice = Number(prev.totalPriceNum || prev.priceNum || Infinity);
    const currPrice = Number(current.totalPriceNum || current.priceNum || Infinity);

    if (currScore > prevScore) {
      map.set(key, current);
      continue;
    }

    if (currScore === prevScore && currPrice < prevPrice) {
      map.set(key, current);
    }
  }

  return Array.from(map.values());
}
function buildCandidates(items, queryText = '') {
  const profile = inferIntentProfile(queryText);

  const mapped = (items || []).slice(0, 20).map((item, idx) => {
    const shipping = parseShippingCost(item.delivery || '');
    const priceNum = parsePriceNumber(item.priceText || item.price || '');
    const hpriceNum = parsePriceNumber(item.hprice || item.highPrice || '');

    return {
      id: String(item.id ?? (idx + 1)),
      name: String(item.name || '').trim(),
      price: String(item.priceText || item.price || '').trim(),
      priceNum,
      hpriceNum,
      store: String(item.store || item.mallName || '').trim(),
      delivery: String(item.delivery || '상세페이지 확인').trim(),
      review: String(item.review || '').trim(),
      image: String(item.image || item.imageUrl || '').trim(),
      link: String(item.link || item.productUrl || item.url || '').trim(),
      shippingKnown: shipping.known,
      shippingCost: shipping.cost,
      totalPriceNum: shipping.known ? (priceNum + shipping.cost) : priceNum
    };
  });

  const deduped = dedupeCandidatesByModel(mapped);
  const medianPrice = getMedianPrice(deduped);

  return deduped.map((candidate) => {
    const bonus = getCandidateBonus(candidate, profile);
    const priceRisk = shouldExcludeFromPriceRank(candidate, queryText, medianPrice);

    let specPenalty = 0;

    if (priceRisk.exclude) specPenalty += 12;
    else if (priceRisk.badges.includes('옵션가 확인')) specPenalty += 6;
    else if (priceRisk.badges.includes('묶음상품')) specPenalty += 2;

    const finalScore = bonus.bonusScore - specPenalty;

    return {
      ...candidate,
      modelKey: candidate.modelKey || getModelKey(candidate.name),
      bonusScore: bonus.bonusScore,
      bonusReasons: bonus.bonusReasons,
      specPenalty,
      finalScore,
      excludeFromPriceRank: priceRisk.exclude,
      priceRiskReason: priceRisk.reason,
      badges: priceRisk.badges || []
    };
  }).sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;

    const ap = Number(a.totalPriceNum || a.priceNum || 0);
    const bp = Number(b.totalPriceNum || b.priceNum || 0);
    if (ap && bp) return ap - bp;

    return 0;
  });
}

function mergeAiWithCandidates(aiResult, candidates = []) {
  const safe = aiResult && typeof aiResult === 'object' ? aiResult : {};
  const aiCards = Array.isArray(safe.cards) ? safe.cards : [];
  const rejects = Array.isArray(safe.rejects) ? safe.rejects : [];
  const aiPickSourceType = String(safe.aiPickSourceType || '').trim();

  const mergedCards = aiCards.map((card) => {
    const found = candidates.find((c) => String(c.id) === String(card.sourceId));

    if (!found) {
      return {
        ...card,
        name: '상품명 없음',
        price: '',
        store: '',
        image: '',
        link: '',
        delivery: '',
        review: '',
        badges: [],
        modelKey: ''
      };
    }

    return {
      ...found,
      ...card,
      name: found.name || found.title || '상품명 없음',
      price: found.price || found.priceText || found.lprice || '',
      store: found.store || found.mallName || '',
      image: found.image || found.imageUrl || '',
      link: found.link || found.productUrl || found.url || '',
      delivery: found.delivery || found.shipping || '',
      review: found.review || found.reviewText || '',
      badges: Array.isArray(found.badges) ? found.badges : [],
      modelKey: found.modelKey || getModelKey(found.name || '')
    };
  });

  let finalCards = mergedCards;

  if (aiPickSourceType) {
    const picked = mergedCards.find((card) => String(card.type) === aiPickSourceType);
    if (picked) {
      const aiCard = {
        ...picked,
        type: 'ai',
        label: 'AI추천',
        reason: picked.reason || '조건을 종합했을 때 가장 균형이 좋은 선택'
      };
      finalCards = [aiCard, ...mergedCards];
    }
  }

  const usedModelKeys = new Set();
  finalCards = finalCards.filter((card) => {
    const key = card.modelKey || getModelKey(card.name || '');
    if (!key) return true;

    if (usedModelKeys.has(key)) {
      return false;
    }

    usedModelKeys.add(key);
    return true;
  });
  
  return {
    ...safe,
    cards: finalCards,
    rejects
  };
}

window.ThisOneRanking = {
  rewriteSearchQuery,
  parsePriceNumber,
  parseShippingCost,
  extractSpecs,
  detectMixedSpecs,
  isOptionItem,
  checkSpecMatch,
  shouldExcludeFromPriceRank,
  getSafePriceCandidate,
  getModelKey,
  dedupeCandidatesByModel,
  buildCandidates,
  mergeAiWithCandidates
};
