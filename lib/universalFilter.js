// lib/universalFilter.js
// CommonJS
// 원칙: 애매하면 살린다. 명확한 액세서리/부품/판촉/무관 후보만 제거한다.

const { GoogleGenerativeAI } = require('@google/generative-ai');
const MODEL = 'gemini-2.5-flash';

function safeJsonParse(text) {
  const clean = String(text || '').replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : clean);
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function normalize(text) {
  return stripHtml(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function numericPrice(item) {
  if (typeof item.lprice === 'number' && !Number.isNaN(item.lprice)) return item.lprice;
  const text = String(item.priceText || item.price || '').replace(/[^\d]/g, '');
  return text ? Number(text) : 0;
}

function getMedianPrice(items) {
  const prices = (items || [])
    .map(numericPrice)
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  if (!prices.length) return 0;

  const mid = Math.floor(prices.length / 2);
  return prices.length % 2
    ? prices[mid]
    : Math.round((prices[mid - 1] + prices[mid]) / 2);
}

function isMaskQuery(query) {
  const q = normalize(query);
  return /(마스크|kf94|kf80|kf-ad|비말|황사|방역|보건용|덴탈|새부리)/i.test(q);
}

function isManagedRentalCategory(query) {
  const q = normalize(query);
  return /(정수기|냉온정수기|직수정수기|공기청정기|공청기|안마의자|비데|음식물처리기|음쓰처리기)/i.test(q);
}

function isRentalText(text) {
  return /렌탈|대여|구독|약정|월납|월\s*[0-9,]+\s*원/i.test(normalize(text));
}

function isMaskMainProductText(text) {
  const t = normalize(text);
  // 마스크 키워드 자체가 있으면 일단 본품 가능성으로 본다 (소모품/판촉 판단은 isClearlyMaskNonRetailText에서)
  if (!t.includes('마스크') && !/kf\s*-?\s*(94|80|ad)/i.test(t)) return false;
  return true;
}

function isClearlyMaskNonRetailText(text) {
  const t = normalize(text);
  if (!t.includes('마스크') && !/kf\s*-?\s*(94|80|ad)/i.test(t)) return false;

  const strongAccessory = [
    '필터', '교체필터', '필터교체', '교체용', '리필', '부품', '부속',
    '스트랩', '클립', '고리', '밴드', '밸브', '케이스', '파우치'
  ];

  const strongPromo = [
    '판촉', '판촉물', '홍보', '인쇄', '로고', '각인', '주문제작',
    '단체', '기념품', '답례품', '사은품', '굿즈', '홍보용', '판촉용',
    '상세페이지 확인'
  ];

  return strongAccessory.some(w => t.includes(w)) || strongPromo.some(w => t.includes(w));
}

function detectTargetRole(query) {
  const q = normalize(query);

  if (isMaskQuery(q) && !/(필터|교체|리필|스트랩|클립|고리|케이스|부품|부속)/.test(q)) {
    return 'main_product';
  }

  const accessoryWords = [
    '액세서리', '악세사리', '부품', '부속',
    '케이스', '커버', '컵홀더', '홀더', '후크', '가방',
    '거치대', '필터', '토너', '잉크', '리필', '이어팁',
    '모기장', '레인커버', '방풍커버', '풋머프', '시트', '라이너'
  ];

  return accessoryWords.some(word => q.includes(word)) ? 'accessory' : 'main_product';
}

function getPriceSuspicion(item, medianPrice, targetRole) {
  if (targetRole !== 'main_product') return { suspicious: false, hardReject: false, ratio: 1 };

  const price = numericPrice(item);
  if (!price || !medianPrice) return { suspicious: false, hardReject: false, ratio: 1 };

  const ratio = price / medianPrice;

  return {
    suspicious: ratio < 0.15,
    hardReject: false,
    ratio
  };
}

function buildPrompt(query, items) {
  const targetRole = detectTargetRole(query);
  const medianPrice = getMedianPrice(items);
  const managedRental = isManagedRentalCategory(query);

  return `
너는 쇼핑 검색 결과를 의미적으로 분류하는 AI 필터다.

사용자 질문:
${query}

사용자가 찾는 대상 역할:
${targetRole}

관리형 렌탈 카테고리 여부:
${managedRental ? 'true' : 'false'}

중요 원칙:

- 명확한 액세서리/부품/판촉/무관 후보만 제거한다.
- 애매하면 반드시 keep=true.
- 가격이 낮거나 높다는 이유만으로 keep=false 하지 않는다.
- 정수기, 공기청정기, 안마의자, 비데, 음식물처리기 같은 관리형 품목에서 렌탈은 무관 후보가 아니다.
- 관리형 품목의 렌탈은 필터 교체, 방문관리, AS 포함, 초기비용 부담 감소, 관리 번거로움 감소가 핵심 구매 이유다.
- 관리형 품목에서 렌탈/대여/구독/약정/월납 문구가 있어도 그것만으로 keep=false 하지 않는다.
- 렌탈 여부는 제거 기준이 아니라 구매/렌탈 비교 관점의 상품 유형으로 판단한다.
- 단, 판촉물/홍보물/주문제작/단체기념품 같은 판촉형 상품은 제거한다.
- 2kg, 30m, 30롤, 3겹 같은 규격/수량 표현은 액세서리 신호가 아니다.
- 마스크 검색에서 KF94, KF80, 황사, 비말, 새부리, 덴탈, 일회용, 보건용, 의약외품, 매수/개입 표기가 있으면 본품으로 간주한다.
- 안전화, 안전모, 안전장갑 등 산업안전용품은 본품으로 간주한다.
- 화장지, 휴지, 키친타올, 티슈 등 생활소모품은 본품으로 간주한다.
- 사료, 간식, 영양제 등 반려동물 식품류는 본품으로 간주한다.
- 브랜드명이 포함된 상품은 keep=true를 기본으로 한다.
- 반드시 JSON만 출력한다.

가격 참고:

- 현재 후보군 중앙값(medianPrice): ${medianPrice ? `${medianPrice}원` : '알 수 없음'}

허용값:

- itemRole: "main_product" | "accessory" | "unknown"
- relationType: "same_family" | "sibling" | "unrelated" | "unknown"

출력 형식:
{
  "targetRole": "${targetRole}",
  "results": [
    {
      "id": "1",
      "keep": true,
      "itemRole": "main_product",
      "relationType": "same_family",
      "queryFit": 0.80,
      "textMatch": 0.80,
      "textImageConsistency": 0.50,
      "accessoryProbability": 0.10,
      "ambiguity": 0.30,
      "reason": "짧은 판단 이유"
    }
  ]
}

후보 목록:
${JSON.stringify(items, null, 2)}
`;
}

async function callGemini(prompt, timeoutMs = 6000) {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL });
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Gemini filter timeout (${timeoutMs / 1000}s)`)), timeoutMs);
  });
  const result = await Promise.race([
    model.generateContent(prompt),
    timeout
  ]);
  const text = result.response.text();
  return safeJsonParse(text);
}

function genericFallback(query, items) {
  const targetRole = detectTargetRole(query);
  const medianPrice = getMedianPrice(items);
  const q = normalize(query);
  const managedRental = isManagedRentalCategory(query);

  // 명확한 액세서리/소모품 키워드 (상품명에 이것만 있을 때 제외)
  const accessoryWords = [
    '컵홀더', '홀더', '커버', '후크', '거치대', 'replacement',
    '리필', '리필용', '토너', '잉크', '이어팁', '충전독', '브라켓',
    '브래킷', '리모컨', '날개', '부품', '부속', '모기장', '레인커버',
    '방풍커버', '풋머프', '시트', '라이너'
  ];
  // '필터'는 마스크 필터/정수 필터 혼재 → 단독 판단 제외

  const promoWords = [
    '판촉', '판촉물', '홍보', '인쇄', '주문제작', '단체', '기념품', '답례품', '사은품'
  ];

  const rentalWords = [
    '렌탈', '대여', '약정', '가입', '월납', '구독'
  ];

  const siblingWords = [
    '자전거', '웨건', '킥보드', '세발', '네발', '붕붕카', '스쿠터', '휠체어'
  ];

  // 생활소모품/식품/산업안전용품 등 본품 화이트리스트
  const mainProductGuarantee = [
    '화장지', '휴지', '키친타올', '티슈', '두루마리',
    '사료', '간식', '영양제', '펫푸드',
    '안전화', '안전모', '안전장갑', '안전조끼', '보호대',
    '마스크', 'kf94', 'kf80', 'kf-ad'
  ];

  const results = items.map((item) => {
    const name = normalize(item.name || '');
    const priceCheck = getPriceSuspicion(item, medianPrice, targetRole);

    // 화이트리스트 본품 확정
    const guaranteedMain = mainProductGuarantee.some(w => name.includes(w) || q.includes(w));

    const clearlyMaskMain = isMaskQuery(q) && isMaskMainProductText(name);
    const clearlyMaskNonRetail = isMaskQuery(q) && isClearlyMaskNonRetailText(name);

    // 명확한 액세서리 판단 (상품명에 accessoryWords가 있고, 화이트리스트에 없을 때)
    const looksAccessory = !guaranteedMain && !clearlyMaskMain &&
      accessoryWords.some(word => name.includes(word));
    const looksPromo = promoWords.some(word => name.includes(word));
    const looksRental = rentalWords.some(word => name.includes(word));
    const looksRentalPromo = looksPromo || (!managedRental && looksRental);
    const looksSibling = siblingWords.some(word => name.includes(word));

    let keep = true;

    if (managedRental && looksRental && !looksPromo && !looksAccessory && !looksSibling) {
      keep = true;
    } else if (guaranteedMain && !clearlyMaskNonRetail) {
      keep = true;
    } else if (targetRole === 'accessory') {
      keep = looksAccessory && !looksSibling;
    } else {
      keep = !looksSibling && !looksRentalPromo && !clearlyMaskNonRetail && !looksAccessory;
      if (clearlyMaskMain && !clearlyMaskNonRetail) keep = true;
    }

    return {
      id: item.id,
      keep,
      itemRole: looksAccessory ? 'accessory' : 'main_product',
      relationType: looksSibling ? 'sibling' : 'same_family',
      queryFit: keep ? 0.7 : 0.25,
      textMatch: keep ? 0.75 : 0.3,
      textImageConsistency: 0.5,
      accessoryProbability: looksAccessory ? 0.92 : (priceCheck.suspicious ? 0.35 : 0.12),
      ambiguity: keep ? 0.35 : 0.6,
      reason: keep
        ? managedRental && looksRental
          ? '관리형 품목의 렌탈 후보로 비교 대상 유지'
          : 'fallback 통과'
        : looksAccessory
          ? '명확한 액세서리/부품 후보'
          : looksRentalPromo
            ? '렌탈/판촉/제작형 후보'
            : looksSibling
              ? '유사 카테고리 후보'
              : clearlyMaskNonRetail
                ? '마스크 본품이 아닌 소모품/판촉 후보'
                : 'fallback 제외'
    };
  });

  return { targetRole, results };
}

function decideKeep(targetRole, r, priceCheck, item, query) {
  const itemText = normalize(item && item.name);
  const q = normalize(query);

  // 관리형 렌탈 품목 보호: 렌탈은 제거 대상이 아니라 비교 대상이다.
  if (isManagedRentalCategory(q) && isRentalText(itemText)) {
    return true;
  }

  // 마스크 본품 보호
  if (isMaskQuery(q) && isMaskMainProductText(itemText) && !isClearlyMaskNonRetailText(itemText)) {
    return true;
  }
  if (isMaskQuery(q) && isClearlyMaskNonRetailText(itemText)) {
    return false;
  }

  if (targetRole === 'main_product') {
    const role = r.itemRole || 'unknown';
    const relation = r.relationType || 'unknown';
    const accessoryProbability = Number(r.accessoryProbability || 0);
    const queryFit = Number(r.queryFit || 0);
    const ambiguity = Number(r.ambiguity || 0);

    // 명확한 액세서리이고 queryFit도 낮을 때만 제거
    if (role === 'accessory' && accessoryProbability >= 0.85 && queryFit < 0.4) return false;

    // unrelated 기준 완화: queryFit < 0.3 이하일 때만 제거 (기존 0.45 → 0.3)
    if (relation === 'unrelated' && queryFit < 0.3) return false;

    // 나머지는 살린다
    if (role === 'unknown') return true;
    if (relation === 'unknown') return true;
    if (ambiguity >= 0.4 && queryFit >= 0.25) return true;
    if (priceCheck.suspicious && queryFit >= 0.25) return true;

    // queryFit 기준 완화: 0.35 → 0.25
    return queryFit >= 0.25 || relation === 'same_family';
  }

  if (targetRole === 'accessory') {
    const fitOk = Number(r.queryFit || 0) >= 0.4;
    if (r.itemRole === 'accessory' && fitOk) return true;
    return r.itemRole === 'unknown' && fitOk;
  }

  return true;
}

async function applyUniversalAIFilter({ query, items }) {
  const originalItems = Array.isArray(items) ? items : [];
  const sliced = originalItems.slice(0, 16).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    price: item.price || '',
    priceText: item.priceText || '',
    lprice: item.lprice || 0,
    store: stripHtml(item.store || ''),
    link: item.link || '',
    image: item.image || ''
  }));

  const targetRole = detectTargetRole(query);
  const medianPrice = getMedianPrice(sliced);

  if (!sliced.length) {
    return {
      filteredItems: [],
      rejectedItems: [],
      debug: { mode: 'empty_input', targetRole, medianPrice }
    };
  }

  try {
    const prompt = buildPrompt(query, sliced);
    const parsed = await callGemini(prompt);

    const resolvedTargetRole = parsed.targetRole || targetRole;
    const byId = {};
    (parsed.results || []).forEach((r) => {
      byId[String(r.id)] = r;
    });

    const filteredItems = sliced.filter((item) => {
      const r = byId[String(item.id)];
      if (!r) return true; // AI가 판단 못한 건 살린다
      const priceCheck = getPriceSuspicion(item, medianPrice, resolvedTargetRole);
      return decideKeep(resolvedTargetRole, r, priceCheck, item, query);
    });

    const rejectedItems = sliced
      .filter((item) => !filteredItems.some(f => f.id === item.id))
      .map((item) => {
        const r = byId[String(item.id)] || {};
        const priceCheck = getPriceSuspicion(item, medianPrice, resolvedTargetRole);
        return {
          id: item.id,
          name: item.name,
          reason: r.reason || '명확한 제외 후보',
          itemRole: r.itemRole || 'unknown',
          relationType: r.relationType || 'unknown',
          accessoryProbability: r.accessoryProbability ?? null,
          ambiguity: r.ambiguity ?? null,
          priceRatio: priceCheck.ratio
        };
      });

    if (filteredItems.length) {
      return {
        filteredItems,
        rejectedItems,
        debug: { mode: 'ai_soft_filter', targetRole: resolvedTargetRole, medianPrice }
      };
    }

    // AI 결과가 0개 → fallback 시도
    const fallback = genericFallback(query, sliced);
    const fallbackItems = fallback.results
      .filter(r => r.keep)
      .map(r => sliced.find(i => i.id === r.id))
      .filter(Boolean);

    if (fallbackItems.length) {
      return {
        filteredItems: fallbackItems,
        rejectedItems,
        debug: { mode: 'ai_empty_then_fallback', targetRole: fallback.targetRole, medianPrice }
      };
    }

    // fallback도 0개 → raw 전체 반환 (절대 0개 안 만든다)
    return {
      filteredItems: sliced,
      rejectedItems: [],
      debug: {
        mode: 'fail_open_restore_raw',
        targetRole: resolvedTargetRole,
        medianPrice,
        reason: 'filter_returned_empty'
      }
    };
  } catch (err) {
    const fallback = genericFallback(query, sliced);
    const fallbackItems = fallback.results
      .filter(r => r.keep)
      .map(r => sliced.find(i => i.id === r.id))
      .filter(Boolean);

    return {
      filteredItems: fallbackItems.length ? fallbackItems : sliced,
      rejectedItems: fallback.results
        .filter(r => !r.keep)
        .map(r => {
          const item = sliced.find(i => i.id === r.id);
          const priceCheck = getPriceSuspicion(item || {}, medianPrice, fallback.targetRole);
          return {
            id: r.id,
            name: item?.name || '',
            reason: r.reason,
            itemRole: r.itemRole,
            relationType: r.relationType,
            priceRatio: priceCheck.ratio
          };
        }),
      debug: {
        mode: fallbackItems.length ? 'fallback_soft_filter' : 'fallback_fail_open_restore_raw',
        targetRole: fallback.targetRole,
        medianPrice,
        error: err.message
      }
    };
  }
}

module.exports = {
  applyUniversalAIFilter
};
