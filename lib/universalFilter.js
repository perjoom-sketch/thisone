const { GoogleGenerativeAI } = require("@google/generative-ai");
const AI_CONFIG = require('../js/config');
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

function stripHtml(text) {
  return String(text || "").replace(/<[^>]*>/g, "").trim();
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[\[\]()/_,.+\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numericPrice(item) {
  if (typeof item?.lprice === "number" && !Number.isNaN(item.lprice)) {
    return item.lprice;
  }
  const text = String(item?.priceText || item?.price || "").replace(/[^\d]/g, "");
  return text ? Number(text) : 0;
}

function getMedianPrice(items) {
  const prices = (items || [])
    .map(numericPrice)
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  if (!prices.length) return 0;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
}

function detectTargetCategory(query) {
  const q = normalizeText(query);

  if (q.includes("유모차") || q.includes("stroller")) return "stroller";
  if (q.includes("공기청정기") || q.includes("air purifier")) return "air_purifier";
  if (q.includes("프린터") || q.includes("printer")) return "printer";
  if (q.includes("로봇청소기") || q.includes("robot vacuum")) return "robot_vacuum";
  if (
    q.includes("이어폰") ||
    q.includes("헤드폰") ||
    q.includes("에어팟") ||
    q.includes("earphone") ||
    q.includes("headphone")
  ) return "audio";

  return "generic";
}

function detectTargetRole(query) {
  const q = normalizeText(query);

  const accessoryWords = [
    "액세서리", "악세사리", "부품", "부속",
    "케이스", "커버", "컵홀더", "컵 홀더", "컵거치대", "컵 거치대",
    "holder", "cup holder",
    "후크", "가방", "거치대",
    "필터", "토너", "잉크", "리필", "이어팁",
    "모기장", "레인커버", "방풍커버", "풋머프", "시트", "라이너",
    "클립", "집게", "스트랩", "고리", "브라켓", "브래킷",
    "교체용", "세트", "묶음"
  ];

  const wantsAccessory = accessoryWords.some(word => q.includes(normalizeText(word)));
  return wantsAccessory ? "accessory" : "main_product";
}

function getGenericSemanticSignals(name) {
  const text = normalizeText(name);

  const accessoryWords = [
    "컵홀더", "컵 홀더", "컵거치대", "컵 거치대", "holder", "cup holder",
    "커버", "후크", "가방", "액세서리", "악세사리", "거치대",
    "필터", "replacement", "리필", "리필용", "토너", "잉크",
    "케이스", "이어팁", "충전독", "브라켓", "브래킷",
    "부품", "부속", "모기장", "레인커버", "방풍커버", "풋머프",
    "시트", "라이너", "클립", "집게", "고정클립", "멀티클립",
    "스트랩", "밴드", "걸이", "고리"
  ];

  const decorToyWords = [
    "모형", "미니어처", "장난감", "토이", "피규어", "인형",
    "소품", "장식", "데코", "인테리어", "방꾸미기",
    "스튜디오", "포토존", "촬영", "diy", "만들기",
    "오브제", "모조", "목업", "진열", "꾸미기"
  ];

  const siblingWords = [
    "자전거", "웨건", "킥보드", "세발", "네발", "붕붕카",
    "스쿠터", "휠체어", "보행기", "카시트"
  ];

  const bundleWords = ["세트", "묶음", "패키지", "리필팩", "교체용"];
  const hasCountPack = /\b\d+\s*(p|개|입|종|pcs)\b/i.test(text);

  const rentalWords = ["렌탈", "대여", "임대", "정수기렌탈", "안마의자렌탈", "로봇청소기렌탈"];
  const looksRental = rentalWords.some(word => text.includes(normalizeText(word)));

  return {
    looksAccessory: accessoryWords.some(word => text.includes(normalizeText(word))) || looksRental,
    looksDecorToy: decorToyWords.some(word => text.includes(normalizeText(word))),
    looksSibling: siblingWords.some(word => text.includes(normalizeText(word))),
    looksBundle: bundleWords.some(word => text.includes(normalizeText(word))) || hasCountPack,
    looksToyLike: false,
    looksRental // 렌탈 여부 플래그 추가
  };
}

function getCategorySignals(category, name) {
  const text = normalizeText(name);

  if (category === "stroller") {
    const strollerAccessory = [
      "컵홀더", "컵 홀더", "컵거치대", "컵 거치대", "holder", "cup holder",
      "모기장", "레인커버", "방풍커버", "풋머프",
      "시트", "라이너", "클립", "집게", "유모차클립",
      "고정클립", "멀티클립", "스트랩", "고리", "후크",
      "가방걸이", "장착", "부착"
    ];

    const strollerToyLike = [
      "운전대", "핸들", "핸들토이", "핸들 토이",
      "깜빡이", "자동차소리", "사운드", "키즈카페",
      "생일선물", "놀이", "역할놀이", "장난감", "토이"
    ];

    const strollerDecor = [
      "모형", "미니어처", "소품", "장식", "방꾸미기",
      "포토존", "스튜디오", "촬영", "오브제", "인테리어"
    ];

    const strollerSibling = [
      "자전거", "웨건", "킥보드", "세발", "네발",
      "붕붕카", "스쿠터", "보행기", "카시트"
    ];

    return {
      looksAccessory: strollerAccessory.some(word => text.includes(normalizeText(word))),
      looksSibling: strollerSibling.some(word => text.includes(normalizeText(word))),
      looksDecorToy: strollerDecor.some(word => text.includes(normalizeText(word))),
      looksToyLike: strollerToyLike.some(word => text.includes(normalizeText(word))),
      looksBundle:
        /\b\d+\s*(p|개|입|종|pcs)\b/i.test(text) ||
        text.includes("세트") ||
        text.includes("묶음")
    };
  }

  if (category === "air_purifier") {
    const accessory = ["필터", "헤파필터", "교체용", "리필", "커버", "거치대", "받침대"];
    const sibling = ["가습기", "제습기", "선풍기", "에어서큘레이터"];
    return {
      looksAccessory: accessory.some(word => text.includes(normalizeText(word))),
      looksSibling: sibling.some(word => text.includes(normalizeText(word))),
      looksDecorToy: false,
      looksToyLike: false,
      looksBundle: text.includes("세트") || text.includes("묶음")
    };
  }

  if (category === "printer") {
    const accessory = ["토너", "잉크", "카트리지", "드럼", "용지", "케이블", "리필", "교체용"];
    return {
      looksAccessory: accessory.some(word => text.includes(normalizeText(word))),
      looksSibling: false,
      looksDecorToy: false,
      looksToyLike: false,
      looksBundle: text.includes("세트") || text.includes("묶음")
    };
  }

  if (category === "audio") {
    const accessory = ["케이스", "이어팁", "팁", "커버", "충전케이스", "스트랩", "거치대"];
    return {
      looksAccessory: accessory.some(word => text.includes(normalizeText(word))),
      looksSibling: false,
      looksDecorToy: false,
      looksToyLike: false,
      looksBundle: text.includes("세트") || text.includes("묶음")
    };
  }

  if (category === "robot_vacuum") {
    const accessory = ["먼지봉투", "먼지통", "물걸레", "패드", "브러시", "필터", "충전기", "스테이션", "호환", "부품", "소모품"];
    return {
      looksAccessory: accessory.some(word => text.includes(normalizeText(word))),
      looksSibling: false,
      looksDecorToy: false,
      looksToyLike: false,
      looksBundle: text.includes("세트") || text.includes("묶음")
    };
  }

  return {
    looksAccessory: false,
    looksSibling: false,
    looksDecorToy: false,
    looksToyLike: false,
    looksBundle: false
  };
}

function getMergedSignals(category, name) {
  const g = getGenericSemanticSignals(name);
  const c = getCategorySignals(category, name);

  return {
    looksAccessory: g.looksAccessory || c.looksAccessory,
    looksDecorToy: g.looksDecorToy || c.looksDecorToy,
    looksSibling: g.looksSibling || c.looksSibling,
    looksBundle: g.looksBundle || c.looksBundle,
    looksToyLike: g.looksToyLike || c.looksToyLike
  };
}

function getReferenceMedianPrice(items, category) {
  const plausibleMainPrices = (items || [])
    .filter(item => {
      const s = getMergedSignals(category, item.name);
      return !s.looksAccessory && !s.looksDecorToy && !s.looksSibling && !s.looksBundle && !s.looksToyLike;
    })
    .map(numericPrice)
    .filter(v => v > 0)
    .sort((a, b) => a - b);

  if (!plausibleMainPrices.length) return getMedianPrice(items);

  const mid = Math.floor(plausibleMainPrices.length / 2);
  return plausibleMainPrices.length % 2
    ? plausibleMainPrices[mid]
    : Math.round((plausibleMainPrices[mid - 1] + plausibleMainPrices[mid]) / 2);
}

function getPriceSuspicion(item, medianPrice, targetRole) {
  if (targetRole !== "main_product") {
    return { suspicious: false, hardReject: false, ratio: 1, totalPrice: 0 };
  }

  const price = numericPrice(item);
  const shipping = Number(String(item.delivery || item.shipping || "0").replace(/[^\d]/g, "")) || 0;
  const totalPrice = price + shipping;

  if (!price || !medianPrice) {
    return { suspicious: false, hardReject: false, ratio: 1, totalPrice };
  }

  const ratio = totalPrice / medianPrice;
  return {
    suspicious: ratio < 0.28,
    hardReject: ratio < 0.18,
    ratio,
    totalPrice
  };
}

async function callGemini(prompt) {
  const model = genAI.getGenerativeModel({
    model: AI_CONFIG.MODEL_NAME,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1
    }
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI 응답 시간 초과")), 55000)
  );

  const resultPromise = model.generateContent(prompt);
  const result = await Promise.race([resultPromise, timeoutPromise]);
  const response = await result.response;
  const text = await response.text();
  return JSON.parse(String(text || "").replace(/```json|```/g, "").trim());
}

function buildPrompt(query, items, category, medianPrice, targetRole) {
  return `
당신은 베테랑 쇼핑 큐레이터이자 '최저가 낚시'와 '부적합 상품'을 잡아내는 전문가입니다.
후보 상품들이 본품(main_product)인지, 그리고 사용자의 실제 용도(Use Case)에 부합하는지 전문가의 안목으로 판단하세요.

사용자 질문: "${query}"
카테고리: ${category}
중앙 가격대: ${medianPrice ? `${medianPrice}원` : "알 수 없음"}

판단 가이드라인:
1. 용도 일치성(Use Case Match): 질문의 맥락(예: 산업용, 회사용, 유아용)과 상품의 실제 용도가 일치하는지 엄격히 보세요. 
   - 이름만 비슷하고 용도가 다르면(예: 유모차 찾는데 반려동물 유모차) keep:false 처리하세요.
2. 가격 불일치: 중앙가 대비 가격이 너무 낮으면(30% 이하), 제목에 '본품'이라 써있어도 'accessory'로 의심하세요.
3. 제목 키워드: "추가금", "단품", "호환", "부품", "전용", "리필" 등의 단어가 있으면 액세서리일 확률이 90%입니다.
4. 반드시 JSON 배열 results로만 출력하세요.
5. 큰따옴표(" ")를 사용한 키워드는 필수 포함 조건(Exact Match)으로 간주하여 필터링하세요.
6. 최신 트렌드 반영 (2024-2025): '올인원 세탁건조기', '자동 세척/건조 로봇청소기', '구독/렌탈 케어 서비스' 등 최신 편의 사양이 포함된 모델을 높게 평가하세요.

출력 형식:
{
  "results": [
    {
      "id": "상품ID",
      "keep": true,
      "itemRole": "main_product" | "accessory",
      "useCaseMatch": 0.0 ~ 1.0,
      "priceRisk": "low" | "medium" | "high",
      "priceRiskReason": "가격이 너무 낮아 단품/부품일 가능성이 매우 높음",
      "queryFit": 0.95,
      "reason": "전문가 판단 근거 (용도 적합성 포함)"
    }
  ]
}`;
}

function deterministicHardReject(item, category, targetRole, medianPrice) {
  if (targetRole !== "main_product") {
    return { reject: false, reason: "" };
  }

  const text = normalizeText(item.name);
  const signals = getMergedSignals(category, item.name);
  const priceCheck = getPriceSuspicion(item, medianPrice, targetRole);

  if (category === "stroller") {
    const accessoryWords = ["컵홀더", "방풍커버", "모기장", "오거나이저", "이너시트", "풋머프", "가방걸이"];
    if (accessoryWords.some(w => text.includes(w))) {
      return { reject: true, reason: "유모차 전용 액세서리 상품" };
    }
  }

  if (signals.looksToyLike || signals.looksDecorToy) {
    return { reject: true, reason: "실사용 본품이 아닌 모형/장난감/소품" };
  }

  if (priceCheck.hardReject && (signals.looksAccessory || text.includes("호환") || text.includes("전용"))) {
    return { reject: true, reason: `비정상적 저가(${Math.round(priceCheck.ratio * 100)}%) 및 부속품 신호` };
  }

  return { reject: false, reason: "" };
}

function decideKeep(targetRole, r, priceCheck) {
  const relationOk = r.relationType === "same_family";
  const consistencyOk = Number(r.textImageConsistency || 0) >= 0.35;
  const fitOk = Number(r.queryFit || 0) >= 0.55;
  const ambiguityOk = Number(r.ambiguity || 0) < 0.75;
  const toyDecorLow = Number(r.toyDecorProbability || 0) < 0.35;
  const useRealityOk = !r.useReality || r.useReality === "real_usable";

  if (targetRole === "main_product") {
    const lowAccessory = Number(r.accessoryProbability || 0) < 0.35;

    if (r.itemRole !== "main_product") return false;
    if (!relationOk) return false;
    if (!consistencyOk) return false;
    if (!fitOk) return false;
    if (!lowAccessory) return false;
    if (!toyDecorLow) return false;
    if (!useRealityOk) return false;
    if (!ambiguityOk) return false;
    if (priceCheck.hardReject) return false;
    if (priceCheck.suspicious && Number(r.queryFit || 0) < 0.9) return false;

    return true;
  }

  if (targetRole === "accessory") {
    if (r.itemRole !== "accessory") return false;
    if (!(r.relationType === "same_family" || r.relationType === "sibling")) return false;
    if (!fitOk) return false;
    if (!ambiguityOk) return false;

    return true;
  }

  return relationOk && consistencyOk && fitOk && ambiguityOk;
}

function genericFallback(query, items, category, medianPrice) {
  const targetRole = detectTargetRole(query);

  const results = items.map((item) => {
    const signals = getMergedSignals(category, item.name);
    const priceCheck = getPriceSuspicion(item, medianPrice, targetRole);

    const keep = targetRole === "main_product"
      ? !signals.looksAccessory &&
        !signals.looksDecorToy &&
        !signals.looksSibling &&
        !signals.looksBundle &&
        !signals.looksToyLike &&
        !priceCheck.hardReject
      : signals.looksAccessory && !signals.looksSibling;

    return {
      id: item.id,
      keep,
      itemRole: signals.looksAccessory || signals.looksBundle || signals.looksToyLike ? "accessory" : "main_product",
      relationType: signals.looksSibling ? "sibling" : "same_family",
      useReality: signals.looksDecorToy || signals.looksToyLike ? "decorative_or_prop" : "real_usable",
      queryFit: keep ? 0.7 : 0.25,
      textMatch: keep ? 0.75 : 0.3,
      textImageConsistency: 0.5,
      accessoryProbability:
        signals.looksAccessory || signals.looksBundle || signals.looksToyLike
          ? 0.95
          : (priceCheck.suspicious ? 0.72 : 0.12),
      toyDecorProbability: (signals.looksDecorToy || signals.looksToyLike) ? 0.92 : 0.08,
      ambiguity: signals.looksSibling ? 0.55 : 0.25,
      reason: keep
        ? "fallback 통과"
        : signals.looksToyLike
          ? "fallback에서 장난감성 부속품으로 판단"
          : signals.looksDecorToy
            ? "fallback에서 모형/장식/소품으로 판단"
            : (signals.looksAccessory || signals.looksBundle)
              ? "fallback에서 장착형 액세서리/묶음상품으로 판단"
              : signals.looksSibling
                ? "fallback에서 유사 카테고리로 판단"
                : priceCheck.hardReject
                  ? `fallback에서 비정상적 저가(${Math.round(priceCheck.ratio * 100)}%)로 판단`
                  : "fallback 탈락"
    };
  });

  return {
    targetRole,
    results
  };
}

async function applyUniversalAIFilter({ query, items }) {
  if (!items || items.length === 0) {
    return { filteredItems: [], rejectedItems: [], debug: { count: 0 } };
  }

  const category = detectTargetCategory(query);
  const targetRole = detectTargetRole(query);

  // AI 분석 대상 개수 최적화 (18 -> 12로 축소하여 속도 향상)
  const sliced = items.slice(0, 12).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    lprice: item.lprice,
    shipping: item.delivery || item.shipping || "0",
    store: stripHtml(item.store || "")
  }));

  const medianPrice = getReferenceMedianPrice(sliced, category);

  try {
    const prompt = buildPrompt(query, sliced, category, medianPrice, targetRole);
    const parsed = await callGemini(prompt);
    const byId = {};
    (parsed.results || []).forEach(r => {
      byId[String(r.id)] = r;
    });

    let filteredItems = items.filter(item => {
      const hard = deterministicHardReject(item, category, targetRole, medianPrice);
      if (hard.reject) return false;

      const r = byId[String(item.id)];
      if (!r) return false;

      const priceCheck = getPriceSuspicion(item, medianPrice, targetRole);
      
      // 전문가가 분석한 가격 리스크와 용도 적합성, 실제 가격 비율을 종합 판단
      if (targetRole === "main_product") {
        if (r.itemRole !== "main_product") return false;
        if (r.priceRisk === "high" && priceCheck.suspicious) return false;
        if (priceCheck.hardReject) return false;
        // 용도 적합성이 너무 낮으면 제외 (의미적 필터링 핵심)
        if (typeof r.useCaseMatch === "number" && r.useCaseMatch < 0.45) return false;
      }
      
      // 아이템 객체에 분석 결과 주입 (최종 AI 전달용)
      item.priceRisk = r.priceRisk;
      item.priceRiskReason = r.priceRiskReason;
      item.useCaseMatch = r.useCaseMatch;
      item.totalPriceNum = priceCheck.totalPrice;
      
      // 렌탈 상품인 경우 처리
      const signals = getMergedSignals(category, item.name);
      const isExplicitRentalQuery = query.includes("렌탈") || query.includes("대여") || query.includes("임대") || query.includes("구독");

      if (signals.looksRental) {
        if (!isExplicitRentalQuery) {
          // 구매 의도인데 렌탈 상품이 섞인 경우 -> 제외 및 페널티
          item.excludeFromPriceRank = true;
          item.priceRiskReason = "렌탈 상품 (구매 상품과 가격 비교 불가)";
        } else {
          // 렌탈 의도인 경우 -> 주인공으로 대접
          item.isRental = true;
          item.priceRiskReason = "사용자 요청 렌탈 상품";
        }
      }

      return r.keep;
    });

    if (filteredItems.length < 3) {
      const fallback = genericFallback(query, sliced, category, medianPrice);
      const fallbackIds = new Set(fallback.results.filter(r => r.keep).map(r => String(r.id)));
      filteredItems = items.filter(item => fallbackIds.has(String(item.id))).slice(0, 12);
    }

    const rejectedItems = items
      .filter(item => !filteredItems.some(f => String(f.id) === String(item.id)))
      .slice(0, 20)
      .map(item => {
        const hard = deterministicHardReject(item, category, targetRole, medianPrice);
        const r = byId[String(item.id)] || {};
        const priceCheck = getPriceSuspicion(item, medianPrice, targetRole);
        let reason = hard.reject ? hard.reason : (r.reason || r.priceRiskReason || "전문가 판단 제외");

        if (priceCheck.hardReject && !reason.includes("저가")) {
          reason = `비정상적 저가(${Math.round(priceCheck.ratio * 100)}%) - 낚시성 상품 의심`;
        }

        return { id: item.id, name: item.name, reason };
      });

    return {
      filteredItems,
      rejectedItems,
      debug: { category, targetRole, count: filteredItems.length, medianPrice }
    };
  } catch (err) {
    const fallback = genericFallback(query, sliced, category, medianPrice);
    const fallbackIds = new Set(fallback.results.filter(r => r.keep).map(r => String(r.id)));
    return {
      filteredItems: items.filter(item => fallbackIds.has(String(item.id))).slice(0, 12),
      rejectedItems: [],
      debug: { category, targetRole, mode: "fallback", error: err.message }
    };
  }
}

module.exports = { applyUniversalAIFilter };
