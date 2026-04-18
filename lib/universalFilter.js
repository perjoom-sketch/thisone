const { GoogleGenerativeAI } = require("@google/generative-ai");
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

  return {
    looksAccessory: accessoryWords.some(word => text.includes(normalizeText(word))),
    looksDecorToy: decorToyWords.some(word => text.includes(normalizeText(word))),
    looksSibling: siblingWords.some(word => text.includes(normalizeText(word))),
    looksBundle: bundleWords.some(word => text.includes(normalizeText(word))) || hasCountPack,
    looksToyLike: false
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
    return { suspicious: false, hardReject: false, ratio: 1 };
  }

  const price = numericPrice(item);
  if (!price || !medianPrice) {
    return { suspicious: false, hardReject: false, ratio: 1 };
  }

  const ratio = price / medianPrice;
  return {
    suspicious: ratio < 0.25,
    hardReject: ratio < 0.15,
    ratio
  };
}

async function callGemini(prompt) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json"
    }
  });

  // 7초 타임아웃 설정 (Vercel 10초 제한 대비)
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI 응답 시간 초과")), 7000)
  );

  const resultPromise = model.generateContent(prompt);
  const result = await Promise.race([resultPromise, timeoutPromise]);
  const response = await result.response;
  const text = await response.text();
  return JSON.parse(String(text || "").replace(/```json|```/g, "").trim());
}

function buildPrompt(query, items, category, medianPrice, targetRole) {
  return `
너는 쇼핑 검색 결과를 의미적으로 분류하는 AI 필터다.

사용자 질문:
${query}

카테고리:
${category}

사용자가 찾는 대상 역할:
${targetRole}

판단 목표:
1. 각 후보가 본품(main_product)인지 액세서리(accessory)인지 판단
2. 질문 대상과 같은 계열인지(same_family), 유사 계열인지(sibling), 무관한지(unrelated) 판단
3. 실사용 본품인지(real_usable), 장식/모형/놀이 소품인지(decorative_or_prop) 판단
4. 컵홀더, 클립, 모기장, 운전대 장난감, 필터, 토너, 케이스류는 본품이 아님
5. 반드시 JSON만 출력

강한 규칙:
- 본품 요청이면 액세서리 keep=false
- 본품 요청이면 장식용/모형/장난감 keep=false
- stroller 카테고리에서 컵홀더, 클립, 모기장, 운전대, 핸들토이, 깜빡이, 키즈카페, 생일선물은 본품 아님
- 비정상적으로 저가이면 액세서리 가능성을 높게 보라
- 애매하면 keep=false

현재 본품 기준 중앙값(reference median price):
${medianPrice ? `${medianPrice}원` : "알 수 없음"}

출력 형식:
  "targetRole": "${targetRole}",
  "results": [
    {
      "id": "1",
      "keep": true,
      "itemRole": "main_product",
      "relationType": "same_family",
      "useReality": "real_usable",
      "queryFit": 0.92,
      "textMatch": 0.88,
      "textImageConsistency": 0.7,
      "accessoryProbability": 0.05,
      "toyDecorProbability": 0.04,
      "ambiguity": 0.08,
      "reason": "짧은 판단 이유"
    }
  ]
}

후보 목록:
${JSON.stringify(items, null, 2)}
`;
}

function deterministicHardReject(item, category, targetRole, medianPrice) {
  if (targetRole !== "main_product") {
    return { reject: false, reason: "" };
  }

  const text = normalizeText(item.name);
  const signals = getMergedSignals(category, item.name);
  const priceCheck = getPriceSuspicion(item, medianPrice, targetRole);

  if (category === "stroller") {
    if (
      text.includes("컵홀더") ||
      text.includes("컵 홀더") ||
      text.includes("컵거치대") ||
      text.includes("컵 거치대") ||
      text.includes("cup holder") ||
      text.includes("holder")
    ) {
      return { reject: true, reason: "유모차 컵홀더/거치대 액세서리" };
    }
  }

  if (signals.looksToyLike) {
    return { reject: true, reason: "장난감성 부속품 신호" };
  }

  if ((signals.looksAccessory || signals.looksBundle) && priceCheck.suspicious) {
    return { reject: true, reason: "액세서리/묶음 + 비정상적 저가" };
  }

  if (signals.looksDecorToy) {
    return { reject: true, reason: "모형/장식/소품 신호" };
  }

  if (signals.looksSibling) {
    return { reject: true, reason: "유사 카테고리 신호" };
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

  const sliced = items.slice(0, 15).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    lprice: item.lprice,
    store: stripHtml(item.store || "")
  }));

  const medianPrice = getReferenceMedianPrice(sliced, category);

  try {
    const prompt = `질문: ${query}\n카테고리: ${category}\n본품여부: ${targetRole}\n중앙가: ${medianPrice}원\n\n상품목록:\n${JSON.stringify(sliced)}\n\n각 상품이 질문에 부합하는 본품(main_product)이면 keep:true, 아니면 false로 JSON만 출력.`;
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
      return decideKeep(targetRole, r, priceCheck);
    });

    if (filteredItems.length < 4) {
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
        let reason = hard.reject ? hard.reason : (r.reason || "제외");

        if (priceCheck.hardReject) {
          reason = `후보군 중앙값 대비 비정상적 저가(${Math.round(priceCheck.ratio * 100)}%)`;
        } else if (priceCheck.suspicious && !String(reason).includes("저가")) {
          reason = `${reason} / 저가 액세서리·소품 가능성`;
        }

        return {
          id: item.id,
          name: item.name,
          reason
        };
      });

    return {
      filteredItems,
      rejectedItems,
      debug: {
        category,
        targetRole,
        count: filteredItems.length,
        medianPrice
      }
    };
  } catch (err) {
    const fallback = genericFallback(query, sliced, category, medianPrice);
    const fallbackIds = new Set(fallback.results.filter(r => r.keep).map(r => String(r.id)));

    return {
      filteredItems: items.filter(item => fallbackIds.has(String(item.id))).slice(0, 12),
      rejectedItems: [],
      debug: {
        category,
        targetRole,
        count: 0,
        medianPrice,
        mode: "fallback",
        error: err.message
      }
    };
  }
}

module.exports = { applyUniversalAIFilter };
