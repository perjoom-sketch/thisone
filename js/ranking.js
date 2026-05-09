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


const ACCESSORY_PATTERNS = [
  /사이드\s*브러(?:시|쉬)/i,
  /메인\s*브러(?:시|쉬)/i,
  /브러(?:시|쉬)\s*(?:커버|모듈|교체|리필|세트)?/i,
  /더스트\s*백/i,
  /먼지\s*(?:봉투|필터|통)/i,
  /물걸레\s*(?:패드|포|청소포|걸레)/i,
  /(?:교체|호환|정품)?\s*필터/i,
  /(?:교체|호환|정품)?\s*(?:패드|리필|소모품|부품|부속|액세서리|악세사리)/i,
  /(?:커버|케이스|보호필름|거치대|브라켓|브래킷|어댑터|충전기|배터리|리모컨|연장관|거름망|헤드|노즐)/i,
  /(?:토너|잉크|카트리지|이어팁)/i
];

const BODY_INDICATORS = [
  /로봇\s*청소기/i,
  /청소기\s*(?:본체|올인원|스테이션)?/i,
  /(?:q|s)\s*\d{1,2}\s*(?:max|맥스|pro|프로|ultra|울트라|plus|\+)?/i,
  /maxv|s\d|max\s*pro|ultra|울트라|프로\+|pro\+/i,
  /정수기|냉온정수기|직수정수기/i,
  /비데(?:\s*본체)?/i,
  /공기\s*청정기|공청기/i,
  /프린터|복합기/i,
  /마우스/i,
  /렌탈|대여|구독|약정|월납|월\s*[0-9,]+\s*원/i
];


const PRINTER_BODY_PROTECTION_PATTERN = /토너\s*(?:미\s*)?포함|기본\s*토너|번들\s*토너|토너\s*내장|(?:정품\s*)?잉크\s*포함|무한\s*잉크|잉크젯|레이저|복합기/i;
const PRINTER_ACCESSORY_PATTERN = /(?:호환|재생|리필)\s*(?:토너|카트리지)|(?:clt|mlt|pg)[\s-]?[a-z0-9-]+|리필\s*잉크|토너\s*카트리지|잉크\s*카트리지|카트리지|토너/i;

function isPrinterCategoryText(text) {
  return /프린터|복합기|잉크젯|레이저/.test(String(text || '').toLowerCase());
}

function isPrinterAccessoryText(text) {
  const t = String(text || '').toLowerCase();
  const compact = t.replace(/\s+/g, '');
  if (PRINTER_BODY_PROTECTION_PATTERN.test(t) || PRINTER_BODY_PROTECTION_PATTERN.test(compact)) return false;
  return PRINTER_ACCESSORY_PATTERN.test(t) || PRINTER_ACCESSORY_PATTERN.test(compact);
}

const ACCESSORY_INTENT_WORDS = [
  '액세서리', '악세사리', '부품', '부속', '소모품', '필터', '브러시', '브러쉬',
  '사이드브러시', '사이드브러쉬', '메인브러시', '메인브러쉬', '패드', '물걸레',
  '먼지봉투', '더스트백', '리필', '교체', '호환', '커버', '시트', '토너', '잉크', '카트리지'
];

function queryHasAccessoryIntent(query) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, '');
  return ACCESSORY_INTENT_WORDS.some((word) => q.includes(word));
}

function inferAccessoryCategoryKey(query, profile) {
  const text = `${query || ''} ${profile?.categoryHint || ''}`.toLowerCase();
  if (/로보락|roborock|로봇\s*청소기|로봇청소기/.test(text)) return 'robot_vacuum';
  if (/비데/.test(text)) return 'bidet';
  if (/정수기|냉온정수기|직수정수기/.test(text)) return 'water_purifier';
  if (/공기\s*청정기|공청기/.test(text)) return 'air_purifier';
  if (/프린터|복합기/.test(text)) return 'printer';
  return profile?.categoryKey || 'generic';
}

function getAccessoryFilterMode(query, profile) {
  if (queryHasAccessoryIntent(query)) return 'off';
  const categoryKey = inferAccessoryCategoryKey(query, profile);
  const family = window.ThisOneFamilies?.getFamilyByCategory?.(categoryKey);
  return family?.accessoryFilterMode || (categoryKey === 'robot_vacuum' || categoryKey === 'bidet' ? 'strict' : 'normal');
}

function isRentalLikeCandidate(item) {
  return /렌탈|대여|구독|약정|월납|월\s*[0-9,]+\s*원|\d+\s*개월/i.test(`${item?.name || ''} ${item?.price || ''} ${item?.priceText || ''} ${item?.delivery || ''}`);
}

function isAccessory(title, query = '', profile = null) {
  if (queryHasAccessoryIntent(query)) return false;

  const mode = getAccessoryFilterMode(query, profile);
  if (mode === 'off') return false;

  const text = String(title || '').toLowerCase();
  if ((inferAccessoryCategoryKey(query, profile) === 'printer' || isPrinterCategoryText(query) || isPrinterCategoryText(text)) && mode === 'normal') {
    return isPrinterAccessoryText(text);
  }

  const compact = text.replace(/\s+/g, '');
  const hasAccessoryPattern = ACCESSORY_PATTERNS.some((pattern) => pattern.test(text) || pattern.test(compact));
  if (!hasAccessoryPattern) return false;

  const hasBodyIndicator = BODY_INDICATORS.some((pattern) => pattern.test(text));
  const hasRentalIndicator = /렌탈|대여|구독|약정|월납|월\s*[0-9,]+\s*원/i.test(text);
  if (hasRentalIndicator) return false;

  if (mode === 'strict') return true;
  return !hasBodyIndicator || /호환|소모품|부품|부속|더스트백|먼지봉투|사이드\s*브러|메인\s*브러|케이스|토너|카트리지/i.test(text);
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

function isAccessoryLike(title, query, profile) {
  return isAccessory(title, query, profile);
}

function getMedianPrice(items, query = '') {
  const q = String(query || '').toLowerCase();
  const queryIsMainProduct = /(선풍기|공기청정기|프린터|유모차|이어폰|에어팟|가전|의자|책상|노트북|모니터|로봇청소기|청소기|세탁기|건조기|스타일러|에어랩|로보락|다이슨|비스포크|갤럭시|아이폰|워치|패드|태블릿)/i.test(q);

  const nums = (items || [])
    .map((item) => Number(item.priceNum || 0))
    .filter((n) => {
      if (n <= 0) return false;
      // 가전 등 고가 제품 검색 시 5000원 이하 낚시는 중앙값 계산에서 제외
      if (queryIsMainProduct && n < 5000) return false;
      return true;
    })
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


function clampScore(value, min, max) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

function getYoutubeReputationBonus(candidate) {
  const rep = candidate?.youtubeReputation;
  if (!rep || typeof rep !== 'object') {
    return { bonus: 0, valueBonus: 0, reasons: '' };
  }

  const bonus = clampScore(rep.bonus ?? candidate.youtubeScore, -3, 5);
  const valueBonus = clampScore(rep.valueBonus ?? Math.round(bonus * 0.6), -2, 3);
  const reasons = Array.isArray(rep.reasons) ? rep.reasons.join(', ') : String(candidate.youtubeReasons || 'YouTube 평판 반영').trim();
  return { bonus, valueBonus, reasons };
}

function getCandidateBonus(candidate, profile, query) {
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
      bonusReasons.push('입문용 가격 경쟁력 우수');
    }
  }
// ── 범용 가점 기준 ────────────────────────────────────────────
  
  // 1. 브랜드 공식몰 가점
  const officialBrands = [
    '삼성', 'samsung', 'lg전자', 'lg공식', '애플', 'apple', '다이슨', 'dyson',
    '소니', 'sony', '필립스', 'philips', '브라운', 'braun', '보쉬', 'bosch',
    '쿠쿠', '쿠첸', '위닉스', '청호나이스', '코웨이', '로보락', 'roborak',
    '에코백스', 'ecovacs', '샤오미', 'xiaomi', '나이키', 'nike', '아디다스',
    'adidas', '뉴발란스', '데카트론'
  ];
  const storeLower = String(candidate.store || '').toLowerCase();
  const nameLower = String(candidate.name || '').toLowerCase();
  const isOfficialStore = officialBrands.some(b => storeLower.includes(b)) ||
    /공식|official|직영|본사|제조사직판/i.test(storeLower);
  if (isOfficialStore) {
    bonusScore += 3;
    bonusReasons.push('공식몰');
  }

  // 2. 리뷰 수 가점
  const reviewText = String(candidate.review || '');
  const reviewMatch = reviewText.match(/[\d,]+/);
  if (reviewMatch) {
    const reviewCount = parseInt(reviewText.replace(/,/g, ''), 10);
    if (reviewCount >= 10000) {
      bonusScore += 4;
      bonusReasons.push('리뷰 1만+');
    } else if (reviewCount >= 3000) {
      bonusScore += 3;
      bonusReasons.push('리뷰 3천+');
    } else if (reviewCount >= 1000) {
      bonusScore += 2;
      bonusReasons.push('리뷰 1천+');
    } else if (reviewCount >= 100) {
      bonusScore += 1;
      bonusReasons.push('리뷰 100+');
    }
  }

  const youtube = getYoutubeReputationBonus(candidate);
  if (youtube.bonus) {
    bonusScore += youtube.bonus;
    bonusReasons.push(youtube.reasons || 'YouTube 평판 반영');
  }

  // 3. 네이버 랭킹 가점 (id 기반 — 앞 순위일수록 가점)
  const rankId = parseInt(String(candidate.id || '0'), 10);
  if (rankId > 0 && rankId <= 5) {
    bonusScore += 3;
    bonusReasons.push(`네이버 ${rankId}위`);
  } else if (rankId <= 10) {
    bonusScore += 2;
    bonusReasons.push(`네이버 ${rankId}위`);
  } else if (rankId <= 20) {
    bonusScore += 1;
    bonusReasons.push(`네이버 ${rankId}위`);
  }

  // 4. 무료배송 가점
  if (candidate.shippingKnown && candidate.shippingCost === 0) {
    bonusScore += 2;
    bonusReasons.push('무료배송');
  }

  // 5. 해외직구 / 중고 감점
  if (candidate.isOverseas) {
    bonusScore -= 2;
    bonusReasons.push('해외직구 감점');
  }
  if (candidate.isUsed) {
    bonusScore -= 3;
    bonusReasons.push('중고/리퍼 감점');
  }

  const effectiveFloor = window.rentalPolicy?.getEffectivePriceFloor(query || '', candidate);
  if (effectiveFloor && candidate.lprice) {
    const itemPrice = Number(candidate.lprice);
    if (itemPrice > 0 && itemPrice < effectiveFloor) {
      const ratio = itemPrice / effectiveFloor;
      if (ratio < 0.8) {
        const penalty = Math.round((1 - ratio) * 5);
        bonusScore -= Math.min(penalty, 5);
      }
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

function shouldExcludeFromPriceRank(item, query, medianPrice, profile) {
  const badges = [];
  const q = String(query || '').toLowerCase();
  const t = String(item.name || '').toLowerCase();
  const queryIsMainProduct = /(선풍기|공기청정기|프린터|유모차|이어폰|에어팟|가전|의자|책상|노트북|모니터|로봇청소기|청소기|세탁기|건조기|스타일러|에어랩|에어컨|냉난방기|로보락|다이슨|비스포크|갤럭시|아이폰|워치|패드|태블릿)/i.test(q) || (profile?.categoryHint && /(가전|기기|디지털|스마트)/i.test(profile.categoryHint));
  const titleIsMainProduct = /(선풍기|공기청정기|프린터|유모차|이어폰|에어팟|가전|의자|책상|노트북|모니터|로봇청소기|청소기|세탁기|건조기|스타일러|에어랩|에어컨|냉난방기|로보락|다이슨|비스포크|갤럭시|아이폰|워치|패드|태블릿)/i.test(t);
  
  const accessoryWords = ['부품','악세사리','액세서리','필터','소모품','케이스','보호필름','충전기','먼지봉투','물걸레','배터리','사이드브러쉬','더스트백','브러쉬'];
  const queryWantsAccessory = accessoryWords.some(w => q.includes(w));
  const isMainProductContext = queryIsMainProduct || titleIsMainProduct;

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

  const rentalLike = isRentalLikeCandidate(item);

  if (item.priceNum > 0 && item.priceNum < 5000 && isMainProductContext && !queryWantsAccessory && !rentalLike) {
    badges.push('극단적 저가(낚시)');
    return {
      exclude: true,
      reason: '5,000원 미만의 본체 의심 가격',
      badges
    };
  }

  if (medianPrice && item.priceNum > 0 && item.priceNum < medianPrice * 0.2 && !queryWantsAccessory && !rentalLike) {
    badges.push('가격 불균형 확인');
  }

  if (isAccessoryLike(item.name, query, profile)) {
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


function getPriceValueIndex(candidate, candidates = []) {
  const price = Number(candidate?.totalPriceNum || candidate?.priceNum || 0);
  const prices = (candidates || [])
    .map((item) => Number(item?.totalPriceNum || item?.priceNum || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (!Number.isFinite(price) || price <= 0 || prices.length <= 1) return 0;
  const cheaperCount = prices.filter((value) => value < price).length;
  const percentile = cheaperCount / (prices.length - 1);
  return Math.max(0, Math.min(1, 1 - percentile));
}

const sortCandidatesByMode = window.ThisOneSort.sortCandidatesByMode;

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

  const mapped = (items || []).slice(0, 50).map((item, idx) => {
    const shipping = parseShippingCost(item.delivery || '');
    const priceNum = parsePriceNumber(item.priceText || item.price || item.lprice || '');
    const hpriceNum = parsePriceNumber(item.hprice || item.highPrice || '');

    return {
      id: String(item.id ?? (idx + 1)),
      name: String(item.name || '').trim(),
      price: String(item.priceText || item.price || item.lprice || '').trim(),
      lprice: priceNum,
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
      isUsed: /중고|리퍼|반품|전시/i.test(`${item.name}`),
      youtubeReputation: item.youtubeReputation || null,
      youtubeScore: Number(item.youtubeScore || item.youtubeReputation?.bonus || 0),
      youtubeReasons: String(item.youtubeReasons || (Array.isArray(item.youtubeReputation?.reasons) ? item.youtubeReputation.reasons.join(', ') : '')).trim()
    };
  });

  const deduped = dedupeCandidatesByModel(mapped);
  const medianPrice = getMedianPrice(deduped, queryText);

  return deduped.map((candidate) => {
    const bonus = getCandidateBonus(candidate, profile, queryText);
    const youtubeBonus = getYoutubeReputationBonus(candidate);
    const priceValueIndex = getPriceValueIndex(candidate, deduped);
    const priceRisk = shouldExcludeFromPriceRank(candidate, queryText, medianPrice, profile);

    let specPenalty = 0;
    let isStrictExcluded = false;
    let excludeReason = '';
    const badges = [...(priceRisk.badges || [])];
    if (youtubeBonus.bonus > 0 && candidate.youtubeReputation?.matchedVideoCount > 0) {
      badges.push('YouTube 평판');
    }

    // ── 전문가 설정 필터링 반영 (Strict 모드 전환) ──────────────────
    if (expertSettings.minPrice && candidate.totalPriceNum < Number(expertSettings.minPrice)) {
      isStrictExcluded = true;
      excludeReason = '설정 가격 미달';
    }
    if (expertSettings.maxPrice && candidate.totalPriceNum > Number(expertSettings.maxPrice)) {
      isStrictExcluded = true;
      excludeReason = '설정 가격 초과';
    }
    if (expertSettings.excludeOverseas && candidate.isOverseas) {
      isStrictExcluded = true;
      excludeReason = '해외직구 제외 설정';
    }
    if (expertSettings.excludeUsed && candidate.isUsed) {
      isStrictExcluded = true;
      excludeReason = '중고/리퍼 제외 설정';
    }
    if (expertSettings.excludeRental && /렌탈|구독|방문관리/i.test(candidate.name + candidate.store)) {
      isStrictExcluded = true;
      excludeReason = '렌탈/구독 제외 설정';
    }
    
    // 배송비 감점은 여전히 점수제로 유지 (완전 제외보다는 불이익)
    if (expertSettings.freeShipping && candidate.shippingCost > 0) {
      specPenalty += 10;
      badges.push('유료배송 감점');
    }

    // ── AI 의도 분석(focus_specs) 추가 보너스 강화 ──────────
    if (profile?.expertFactors?.focus_specs) {
      profile.expertFactors.focus_specs.forEach(spec => {
        // 더 정확한 매칭을 위해 정규식 사용 고려 가능
        if (candidate.name.includes(spec)) {
          bonus.bonusScore += 3; // 가중치 상향
          if (!bonus.bonusReasons.includes(spec)) {
            bonus.bonusReasons += (bonus.bonusReasons ? ', ' : '') + `핵심기능(${spec}) 적합`;
          }
        }
      });
    }

    if (priceRisk.exclude) {
      isStrictExcluded = true;
      excludeReason = priceRisk.reason || '가격 리스크(낚시성/액세서리) 감지';
    } else if (priceRisk.badges.includes('옵션가 확인')) {
      specPenalty += 6;
    } else if (priceRisk.badges.includes('묶음상품')) {
      specPenalty += 2;
    }

    const finalScore = isStrictExcluded ? -999 : (bonus.bonusScore - specPenalty);
    const baseScoreWithoutYoutube = isStrictExcluded ? -999 : (finalScore - youtubeBonus.bonus);
    const totalScore = finalScore;
    const valueScore = isStrictExcluded ? -999 : Number((baseScoreWithoutYoutube + (6 * priceValueIndex) + youtubeBonus.valueBonus).toFixed(2));

    return {
      ...candidate,
      modelKey: candidate.modelKey || getModelKey(candidate.name),
      bonusScore: bonus.bonusScore,
      bonusReasons: bonus.bonusReasons,
      youtubeReputation: candidate.youtubeReputation || null,
      youtubeBonus: youtubeBonus.bonus,
      youtubeValueBonus: youtubeBonus.valueBonus,
      priceValueIndex,
      specPenalty,
      finalScore,
      totalScore,
      valueScore,
      excludeFromPriceRank: isStrictExcluded || priceRisk.exclude || specPenalty >= 15,
      priceRiskReason: isStrictExcluded ? excludeReason : priceRisk.reason,
      badges
    };
  }).filter(c => c.finalScore > -50) // 엄격하게 제외된 상품(-999) 제거
  .sort((a, b) => {
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
        label: '관련순'
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
  ACCESSORY_PATTERNS,
  BODY_INDICATORS,
  queryHasAccessoryIntent,
  getAccessoryFilterMode,
  isAccessory,
  shouldExcludeFromPriceRank,
  getSafePriceCandidate,
  getModelKey,
  dedupeCandidatesByModel,
  sortCandidatesByMode,
  buildCandidates,
  mergeAiWithCandidates
};
