// lib/universalFilter.js
// CommonJS
// 원칙: 애매하면 살린다. 명확한 액세서리/부품/판촉/무관 후보만 제거한다.

const { GoogleGenerativeAI } = require('@google/generative-ai');
const MODEL = 'gemini-2.5-flash';
const OPENAI_MODEL = 'gpt-5.4-mini';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const MASK_PRICE_FLOOR = 1500;

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
  /에어컨|스탠드\s*에어컨|창문형\s*에어컨|이동식\s*에어컨|벽걸이\s*에어컨|냉난방기/i,
  /프린터|복합기/i,
  /마우스/i,
  /렌탈|대여|구독|약정|월납|월\s*[0-9,]+\s*원/i
];


const PRINTER_BODY_PROTECTION_PATTERN = /토너\s*(?:미\s*)?포함|기본\s*토너|번들\s*토너|토너\s*내장|(?:정품\s*)?잉크\s*포함|무한\s*잉크|잉크젯|레이저|복합기/i;
const PRINTER_ACCESSORY_PATTERN = /(?:호환|재생|리필)\s*(?:토너|카트리지)|(?:clt|mlt|pg)[\s-]?[a-z0-9-]+|리필\s*잉크|토너\s*카트리지|잉크\s*카트리지|카트리지|토너/i;

function isPrinterCategoryText(text) {
  return /프린터|복합기|잉크젯|레이저/.test(normalize(text));
}

function isPrinterAccessoryText(text) {
  const t = normalize(text);
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
  const q = normalize(query).replace(/\s+/g, '');
  return ACCESSORY_INTENT_WORDS.some((word) => q.includes(word));
}

function accessoryFilterMode(query) {
  if (queryHasAccessoryIntent(query)) return 'off';
  const q = normalize(query);
  if (/로보락|roborock|로봇\s*청소기|로봇청소기|비데/.test(q)) return 'strict';
  if (/정수기|냉온정수기|직수정수기|공기\s*청정기|공청기|프린터|복합기|에어컨|냉난방기/.test(q)) return 'normal';
  return 'normal';
}

function hasAccessoryPatternText(text) {
  const t = normalize(text);
  const compact = t.replace(/\s+/g, '');
  return ACCESSORY_PATTERNS.some((pattern) => pattern.test(t) || pattern.test(compact));
}

function isAccessory(text, query = '') {
  if (queryHasAccessoryIntent(query)) return false;
  const mode = accessoryFilterMode(query);
  if (mode === 'off') return false;

  const t = normalize(text);
  if ((isPrinterCategoryText(query) || isPrinterCategoryText(t)) && mode === 'normal') {
    return isPrinterAccessoryText(t);
  }

  if (!hasAccessoryPatternText(t)) return false;
  if (isRentalText(t)) return false;

  const hasBodyIndicator = BODY_INDICATORS.some((pattern) => pattern.test(t));
  if (mode === 'strict') return true;
  return !hasBodyIndicator || /호환|소모품|부품|부속|더스트백|먼지봉투|사이드\s*브러|메인\s*브러|케이스|토너|카트리지/i.test(t);
}

function isMaskQuery(query) {
  const q = normalize(query);
  return /(마스크|kf94|kf80|kf-ad|비말|황사|방역|보건용|덴탈|새부리)/i.test(q);
}

function isManagedRentalCategory(query) {
  const q = normalize(query);
  return /(정수기|냉온정수기|직수정수기|공기청정기|공청기|안마의자|비데|음식물처리기|음쓰처리기|로보락|roborock|로봇청소기|로봇\s*청소기)/i.test(q);
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


function isMaskConsumableCandidateText(text) {
  const t = normalize(text);
  if (!t.includes('마스크') && !/kf\s*-?\s*(94|80|ad)/i.test(t)) return false;
  return /(리필|필터|교체용|교체필터|필터교체|소모품|부품|부속)/.test(t);
}

function isMaskPromoNonRetailText(text) {
  const t = normalize(text);
  if (!t.includes('마스크') && !/kf\s*-?\s*(94|80|ad)/i.test(t)) return false;

  const strongPromo = [
    '판촉', '판촉물', '홍보', '인쇄', '로고', '각인', '주문제작',
    '단체', '기념품', '답례품', '사은품', '굿즈', '홍보용', '판촉용',
    '상세페이지 확인'
  ];

  return strongPromo.some(w => t.includes(w));
}

function isClearlyMaskNonRetailText(text, query = '') {
  const t = normalize(text);
  const q = normalize(query);

  if (!t.includes('마스크') && !/kf\s*-?\s*(94|80|ad)/i.test(t)) return false;

  const queryWantsAccessory = /(리필|교체|필터|소모품|부품|부속)/.test(q);

  const strongAccessory = queryWantsAccessory
    ? [
        '스트랩', '클립', '고리', '밴드', '밸브',
        '케이스', '파우치'
      ]
    : [
        '필터', '교체필터', '필터교체', '교체용', '리필', '부품', '부속',
        '스트랩', '클립', '고리', '밴드', '밸브', '케이스', '파우치', '소모품'
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

  return queryHasAccessoryIntent(q) ? 'accessory' : 'main_product';
}

function getPriceSuspicion(item, medianPrice, targetRole, query = '') {
  const price = numericPrice(item);
  const isMaskLowPrice = isMaskQuery(query) && price > 0 && price < MASK_PRICE_FLOOR;

  if (targetRole !== 'main_product') {
    return { suspicious: isMaskLowPrice, hardReject: isMaskLowPrice, ratio: 1 };
  }

  if (isMaskLowPrice) {
    return {
      suspicious: true,
      hardReject: true,
      ratio: medianPrice ? price / medianPrice : 1
    };
  }

  if (!price || !medianPrice) return { suspicious: false, hardReject: false, ratio: 1 };

  const ratio = price / medianPrice;
  const suspicious = ratio < 0.15;

  return {
    suspicious,
    hardReject: isMaskQuery(query) && suspicious,
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
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: { temperature: 0, topP: 1, topK: 1 }
  });
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

async function callOpenAI(prompt, timeoutMs = 9000) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a strict shopping search semantic filter. Output valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        seed: 12345
      }),
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI filter HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('OpenAI filter returned empty content');

    return safeJsonParse(content);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`OpenAI filter timeout (${timeoutMs / 1000}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callAIFilter(prompt) {
  try {
    const parsed = await callGemini(prompt);
    return { parsed, provider: 'gemini', geminiError: null, openaiError: null };
  } catch (geminiErr) {
    try {
      const parsed = await callOpenAI(prompt);
      return {
        parsed,
        provider: 'openai',
        geminiError: geminiErr.message,
        openaiError: null
      };
    } catch (openaiErr) {
      const err = new Error(`Gemini failed: ${geminiErr.message}; OpenAI failed: ${openaiErr.message}`);
      err.geminiError = geminiErr.message;
      err.openaiError = openaiErr.message;
      throw err;
    }
  }
}

function genericFallback(query, items) {
  const targetRole = detectTargetRole(query);
  const medianPrice = getMedianPrice(items);
  const q = normalize(query);
  const managedRental = isManagedRentalCategory(query);

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

  const maskMainGuaranteeWords = ['마스크', 'kf94', 'kf80', 'kf-ad'];

  const results = items.map((item) => {
    const name = normalize(item.name || '');
    const priceCheck = getPriceSuspicion(item, medianPrice, targetRole, query);

    // 화이트리스트 본품 확정
    // 마스크 검색은 검색어만으로 모든 후보를 본품 확정하지 않고, 상품명도 마스크 본품 텍스트일 때만 보호한다.
    const guaranteedMain = mainProductGuarantee.some((w) => {
      if (maskMainGuaranteeWords.includes(w)) {
        return isMaskQuery(q) && isMaskMainProductText(name);
      }
      return name.includes(w) || q.includes(w);
    });

    const clearlyMaskMain = isMaskQuery(q) && isMaskMainProductText(name);
    const clearlyMaskNonRetail = isMaskQuery(q) && isClearlyMaskNonRetailText(name, query);
    const allowMaskConsumable = isMaskQuery(q) && isMaskConsumableCandidateText(name) && !isMaskPromoNonRetailText(name);

    // 명확한 액세서리 판단은 가격이 아니라 상품명 패턴 기반으로 처리한다.
    const looksAccessory = !guaranteedMain && !clearlyMaskMain && (targetRole === 'accessory' ? hasAccessoryPatternText(name) : isAccessory(name, q));
    const looksPromo = promoWords.some(word => name.includes(word));
    const looksRental = rentalWords.some(word => name.includes(word));
    const looksRentalPromo = looksPromo || (!managedRental && looksRental);
    const looksSibling = siblingWords.some(word => name.includes(word));

    let keep = true;

    if (priceCheck.hardReject) {
      keep = false;
    } else if (managedRental && looksRental && !looksPromo && !looksAccessory && !looksSibling) {
      keep = true;
    } else if (allowMaskConsumable) {
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
        : priceCheck.hardReject
          ? '마스크 검색의 가격 하한 미만 후보'
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

function decideKeep(targetRole, r, priceCheck, item, query, allItems = []) {
  const { getCategoryRole, isAmbiguousQuery } = require('./categoryRole');
  const { detectIntent } = require('./intentDetector');
  const role = getCategoryRole(item);
  const userIntent = detectIntent(query);
  const isAmbiguous = isAmbiguousQuery(query, allItems);

  // categoryRole 기반 판정 (우선): unknown일 때만 아래 기존 텍스트/AI 정규식 로직으로 폴백한다.
  if (role === 'irrelevant' && !isAmbiguous) {
    if (r) r.reason = 'irrelevant_category';
    return false;
  }
  if (role === 'accessory' && userIntent === 'main' && !isAmbiguous) {
    if (r) r.reason = 'accessory_main_intent';
    return false;
  }
  if (role === 'main' && userIntent === 'accessory' && !isAmbiguous) {
    if (r) r.reason = 'main_accessory_intent';
    return false;
  }
  if (role === 'main' || role === 'accessory' || role === 'rental') {
    if (r) r.reason = 'category_match';
    return true;
  }

  const itemText = normalize(item && item.name);
  const q = normalize(query);

  // 관리형 렌탈 품목 보호: 렌탈은 제거 대상이 아니라 비교 대상이다.
  if (isManagedRentalCategory(q) && isRentalText(itemText)) {
    return true;
  }

  if (priceCheck.hardReject) {
    return false;
  }

  // 마스크 본품 보호: 비정상 저가(1,500원 미만)는 본품 보호에서 제외한다.
  const itemPrice = numericPrice(item || {});
  if (isMaskQuery(q) && isMaskConsumableCandidateText(itemText) && !isMaskPromoNonRetailText(itemText) && itemPrice >= MASK_PRICE_FLOOR) {
    return true;
  }

  if (isMaskQuery(q) && isMaskMainProductText(itemText) && !isClearlyMaskNonRetailText(itemText, query) && itemPrice >= MASK_PRICE_FLOOR) {
    return true;
  }

  if (isMaskQuery(q) && isClearlyMaskNonRetailText(itemText, query)) {
    return false;
  }
  if (targetRole === 'main_product' && isAccessory(itemText, q)) {
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
    image: item.image || '',
    category1: item.category1 || '',
    category2: item.category2 || '',
    category3: item.category3 || '',
    category4: item.category4 || '',
    brand: item.brand || '',
    maker: item.maker || '',
    productType: item.productType || ''
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
    const aiResult = await callAIFilter(prompt);
    const parsed = aiResult.parsed;

    const resolvedTargetRole = parsed.targetRole || targetRole;
    const byId = {};
    (parsed.results || []).forEach((r) => {
      byId[String(r.id)] = r;
    });

    const filteredItems = sliced.filter((item) => {
      const r = byId[String(item.id)];
      const priceCheck = getPriceSuspicion(item, medianPrice, resolvedTargetRole, query);
      if (!r) return decideKeep(resolvedTargetRole, {}, priceCheck, item, query, sliced); // AI가 판단 못해도 categoryRole/텍스트 fallback으로 판단한다
      return decideKeep(resolvedTargetRole, r, priceCheck, item, query, sliced);
    });

    const rejectedItems = sliced
      .filter((item) => !filteredItems.some(f => f.id === item.id))
      .map((item) => {
        const r = byId[String(item.id)] || {};
        const priceCheck = getPriceSuspicion(item, medianPrice, resolvedTargetRole, query);
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
        debug: {
          mode: 'ai_soft_filter',
          provider: aiResult.provider,
          targetRole: resolvedTargetRole,
          medianPrice,
          geminiError: aiResult.geminiError || undefined
        }
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
        debug: {
          mode: 'ai_empty_then_fallback',
          provider: aiResult.provider,
          targetRole: fallback.targetRole,
          medianPrice,
          geminiError: aiResult.geminiError || undefined
        }
      };
    }

    // fallback도 0개 → raw 전체 반환 (절대 0개 안 만든다)
    return {
      filteredItems: sliced,
      rejectedItems: [],
      debug: {
        mode: 'fail_open_restore_raw',
        provider: aiResult.provider,
        targetRole: resolvedTargetRole,
        medianPrice,
        reason: 'filter_returned_empty',
        geminiError: aiResult.geminiError || undefined
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
          const priceCheck = getPriceSuspicion(item || {}, medianPrice, fallback.targetRole, query);
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
        error: err.message,
        geminiError: err.geminiError,
        openaiError: err.openaiError
      }
    };
  }
}

module.exports = {
  applyUniversalAIFilter,
  ACCESSORY_PATTERNS,
  BODY_INDICATORS,
  queryHasAccessoryIntent,
  accessoryFilterMode,
  hasAccessoryPatternText,
  isAccessory
};
