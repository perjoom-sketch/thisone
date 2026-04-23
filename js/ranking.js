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

function isRentalOrContract(title, priceNum) {
  const t = String(title || '').toLowerCase();
  // 렌탈, 대여, 약정, 가입형 상품 감지
  const rentalKeywords = ['대여', '렌탈', '약정', '가입', '요금제', '통신사', '월납', '공시지원'];
  const hasRentalWord = rentalKeywords.some(w => t.includes(w));
  
  // 가격이 1원, 100원 등 극단적으로 낮으면서 상품명이 본체인 경우(아이패드 1원 등) 약정 상품 확률 높음
  const isSuspiciousPrice = priceNum > 0 && priceNum <= 1000;

  return hasRentalWord || isSuspiciousPrice;
}

function isAccessoryLike(title, query) {
  const t = String(title || '').toLowerCase();
  const q = String(query || '').toLowerCase();

  const ACCESSORY_KEYWORDS = [
    '부품', '악세사리', '액세서리', '필터', '소모품', '보호필름', '충전기', 
    '호환', '더스트백', '먼지봉투', '브러쉬', '물걸레', '패드', '세척액', 
    '카트리지', '키트', '거름망', '헤파필터', '걸레', '전원선', '교체용', '여분', '노즐', '케이스'
  ];

  const ACCESSORY_EXCEPTIONS = {
    '패드': ['아이패드', '키패드', '마우스패드', '터치패드', '노트패드', '런치패드', 'ipad'],
    '필터': ['공기청정기 필터', '정수기 필터', '샤워기 필터', '수전 필터'],
    '케이스': ['아이패드 케이스', '맥북 케이스', '이어폰 케이스']
  };

  // 1. 쿼리에 포함된 키워드는 필터링 비활성화 (사용자가 검색 중인 품목)
  const activeKeywords = ACCESSORY_KEYWORDS.filter(kw => !q.includes(kw.toLowerCase()));
  
  // 2. 각 키워드별 매칭 + 예외 체크
  for (const kw of activeKeywords) {
    if (!t.includes(kw.toLowerCase())) continue;
    
    const exceptions = ACCESSORY_EXCEPTIONS[kw] || [];
    const hasException = exceptions.some(ex => t.includes(ex.toLowerCase()));
    
    if (!hasException) {
      console.log(`[isAccessoryLike] EXCLUDE: "${title}" matched keyword "${kw}" (No exception)`);
      return true;
    }
  }

  return false;
}

function getMedianPrice(items) {
  const nums = (items || [])
    .map((item) => Number(item.priceNum || 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  if (!nums.length) {
    console.log('[getMedianPrice] No prices found');
    return 0;
  }

  const mid = Math.floor(nums.length / 2);
  const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  console.log(`[getMedianPrice] Count: ${nums.length}, Median: ${median.toLocaleString()}, Min: ${nums[0].toLocaleString()}, Max: ${nums[nums.length-1].toLocaleString()}`);
  return median;
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

  // ── 2024-2025 최신 가전 트렌드 가중치 (로봇청소기/세탁건조기) ────────────────
  const isRobotVacuum = name.includes('로봇청소기') || profile.categoryHint?.includes('로봇청소기');
  if (isRobotVacuum) {
    if (name.includes('올인원') || name.includes('스테이션') || name.includes('자동세척') || name.includes('온풍건조')) {
      bonusScore += 5;
      bonusReasons.push('최신 올인원 스테이션');
    }
    if (name.includes('직배수')) {
      bonusScore += 3;
      bonusReasons.push('직배수 지원 편리성');
    }
  }

  const isLaundry = name.includes('세탁기') || name.includes('건조기') || profile.categoryHint?.includes('세탁');
  if (isLaundry) {
    if (name.includes('올인원') || name.includes('워시콤보') || name.includes('일체형')) {
      bonusScore += 6;
      bonusReasons.push('차세대 세탁건조 일체형');
    }
    if (name.includes('구독') || name.includes('렌탈') || name.includes('방문관리')) {
      bonusScore += 2;
      bonusReasons.push('케어 서비스 구독 트렌드');
    }
  }

  const isRazor = name.includes('면도기') || profile.categoryHint?.includes('면도');
  if (isRazor) {
    if (name.includes('3헤드') || name.includes('4D') || name.includes('입체')) {
      bonusScore += 3;
      bonusReasons.push('정밀 밀착 헤드');
    }
    if (name.includes('방수') || name.includes('IPX7')) {
      bonusScore += 2;
      bonusReasons.push('완전 방수 지원');
    }
    if (name.includes('올인원') || name.includes('코털') || name.includes('트리머')) {
      bonusScore += 2;
      bonusReasons.push('다용도 액세서리 포함');
    }
    if (price > 0 && price < 40000) {
      bonusScore += 2;
      bonusReasons.push('입문용 가성비 우수');
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

  // [Case B] 가격 분포 기반 배제 (강화된 로직)
  if (medianPrice && item.priceNum > 0) {
    // 1. 중앙값 대비 30% 미만 (기존)
    if (item.priceNum < medianPrice * 0.3) {
      console.log(`[Filter Case B] EXCLUDE: "${item.name}" (Price: ${item.priceNum.toLocaleString()} < Median*0.3: ${(medianPrice*0.3).toLocaleString()})`);
      badges.push('극단적 저가');
      return {
        exclude: true,
        reason: `중앙값(${medianPrice.toLocaleString()}원) 대비 과도하게 낮음(${Math.round((item.priceNum / medianPrice) * 100)}%)`,
        badges
      };
    }
  }

  // 2. [신규] 상품명 내 소모품 키워드가 포함되어 있고, 가격이 검색 쿼리 내 '본체 예상가'보다 현저히 낮은 경우
  // (실제 전체 아이템 중 최고가 그룹의 일정 비율 미만이면 소모품 확률 급상승)
  // 이 로직은 buildCandidates에서 최고가 정보를 넘겨받아 처리하도록 확장 예정이나,
  // 현재는 isAccessoryLike로 1차 차단 후 여기서 렌탈/약정/소모품 여부를 최종 판정함.

  if (isRentalOrContract(item.name, item.priceNum)) {
    badges.push('렌탈/약정 의심');
    return {
      exclude: true,
      reason: '대여(렌탈) 또는 통신사 약정 상품으로 추정됨',
      badges
    };
  }

  if (isAccessoryLike(item.name, query)) {
    badges.push('액세서리 의심');
    return {
      exclude: true,
      reason: '본품이 아닌 액세서리/부속품으로 추정됨',
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
function buildCandidates(items, queryText = '', intentProfile = null) {
  const profile = intentProfile || inferIntentProfile(queryText);
  
  // 사용자 설정 로드
  const savedSettings = localStorage.getItem('thisone_expert_settings');
  const expertSettings = savedSettings ? JSON.parse(savedSettings) : {};

  const mapped = (items || []).slice(0, 50).map((item, idx) => { // 후보군 풀을 50개로 확대 (30개 노출 보장)
    const shipping = parseShippingCost(item.delivery || '');
    const priceNum = parsePriceNumber(item.priceText || item.price || item.lprice || '');
    const hpriceNum = parsePriceNumber(item.hprice || item.highPrice || '');

    return {
      id: String(item.id ?? (idx + 1)),
      name: String(item.name || '').trim(),
      price: String(item.priceText || item.price || item.lprice || '').trim(),
      priceNum,
      hpriceNum,
      store: String(item.store || item.mallName || '').trim(),
      delivery: String(item.delivery || '상세페이지 확인').trim(),
      review: String(item.review || '').trim(),
      image: String(item.image || item.imageUrl || '').trim(),
      link: String(item.link || item.productUrl || item.url || '').trim(),
      shippingKnown: shipping.known,
      shippingCost: shipping.cost,
      totalPriceNum: shipping.known ? (priceNum + shipping.cost) : priceNum,
      isOverseas: /해외|직구|구매대행/i.test(`${item.name} ${item.delivery} ${item.store}`),
      isUsed: /중고|리퍼|반품|전시/i.test(`${item.name}`)
    };
  });

  const deduped = dedupeCandidatesByModel(mapped);
  const medianPrice = getMedianPrice(deduped);

  const scored = deduped.map((candidate) => {
    const bonus = getCandidateBonus(candidate, profile);
    const priceRisk = shouldExcludeFromPriceRank(candidate, queryText, medianPrice);

    let specPenalty = 0;
    const badges = [...(priceRisk.badges || [])];

    // ── 전문가 설정 필터링 반영 ──────────────────
    if (expertSettings.minPrice && candidate.totalPriceNum < Number(expertSettings.minPrice)) {
      specPenalty += 20;
      badges.push('설정가 미달');
    }
    if (expertSettings.maxPrice && candidate.totalPriceNum > Number(expertSettings.maxPrice)) {
      specPenalty += 20;
      badges.push('설정가 초과');
    }
    if (expertSettings.excludeOverseas && candidate.isOverseas) {
      specPenalty += 15;
      badges.push('해외직구 페널티');
    }
    if (expertSettings.excludeUsed && candidate.isUsed) {
      specPenalty += 15;
      badges.push('중고/리퍼 페널티');
    }
    if (expertSettings.freeShipping && candidate.shippingCost > 0) {
      specPenalty += 5;
      badges.push('유료배송 감점');
    }
    if (expertSettings.excludeRental && /렌탈|구독|방문관리/i.test(candidate.name + candidate.store)) {
      specPenalty += 20;
      badges.push('렌탈/구독 페널티');
    }

    // ── AI 의도 분석(focus_specs) 추가 보너스 ──────────
    if (profile?.expertFactors?.focus_specs) {
      profile.expertFactors.focus_specs.forEach(spec => {
        if (candidate.name.includes(spec)) {
          bonus.bonusScore += 2;
        }
      });
    }

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
      excludeFromPriceRank: priceRisk.exclude || specPenalty >= 15,
      priceRiskReason: priceRisk.reason,
      badges
    };
  });

  const sorted = scored.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;

    const ap = Number(a.totalPriceNum || a.priceNum || 0);
    const bp = Number(b.totalPriceNum || b.priceNum || 0);
    if (ap && bp) return ap - bp;

    return 0;
  });

  const filtered = sorted.filter(c => !c.excludeFromPriceRank);
  
  if (filtered.length < 3) {
    console.log(`[SafetyNet] Filtered count ${filtered.length} < 3. Returning original sorted list with replacement labels.`);
    return sorted.map(c => {
      if (c.excludeFromPriceRank) {
        return {
          ...c,
          badges: [...new Set([...c.badges, "본품 결과 부족", "관련 상품"])]
        };
      }
      return c;
    });
  }

  return filtered;
}

function mergeAiWithCandidates(aiResult, candidates = []) {
  const safe = aiResult && typeof aiResult === 'object' ? aiResult : {};
  const aiCards = Array.isArray(safe.cards) ? safe.cards : [];
  const rejects = Array.isArray(safe.rejects) ? safe.rejects : [];
  const aiPickSourceType = String(safe.aiPickSourceType || '').trim();

  const mergedCards = aiCards.map((card) => {
    const sid = card.sourceId || card.id;
    const found = candidates.find((c) => String(c.id) === String(sid));

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
