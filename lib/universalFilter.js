// lib/universalFilter.js
// CommonJS

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

function safeJsonParse(text) {
  const clean = String(text || '').replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : clean);
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function detectTargetRole(query) {
  const q = String(query || '').toLowerCase();

  const accessoryWords = [
    '액세서리', '악세사리', '부품', '부속',
    '케이스', '커버', '컵홀더', '홀더', '후크', '가방',
    '거치대', '필터', '토너', '잉크', '리필', '이어팁',
    '모기장', '레인커버', '방풍커버', '풋머프', '시트', '라이너'
  ];

  const wantsAccessory = accessoryWords.some(word => q.includes(word));
  return wantsAccessory ? 'accessory' : 'main_product';
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

function getPriceSuspicion(item, medianPrice, targetRole) {
  if (targetRole !== 'main_product') {
    return {
      suspicious: false,
      hardReject: false,
      ratio: 1
    };
  }

  const price = numericPrice(item);
  if (!price || !medianPrice) {
    return {
      suspicious: false,
      hardReject: false,
      ratio: 1
    };
  }

  const ratio = price / medianPrice;

  return {
    suspicious: ratio < 0.25,
    hardReject: ratio < 0.15,
    ratio
  };
}

function getGenericSemanticSignals(name) {
  const text = String(name || '').toLowerCase();

  const accessoryWords = [
    '컵홀더', '홀더', '커버', '후크', '가방', '액세서리', '악세사리',
    '거치대', '필터', 'replacement', '리필', '리필용', '토너', '잉크',
    '케이스', '이어팁', '충전독', '브라켓', '브래킷', '리모컨', '날개',
    '부품', '부속', '모기장', '레인커버', '방풍커버', '풋머프', '시트', '라이너'
  ];

  const decorToyWords = [
    '모형', '미니어처', '장난감', '토이', '피규어', '인형',
    '소품', '장식', '데코', '인테리어', '방꾸미기',
    '스튜디오', '포토존', '촬영', 'diy', '만들기',
    '오브제', '모조', '목업', '진열', '꾸미기'
  ];

  const siblingWords = [
    '자전거', '웨건', '킥보드', '세발', '네발', '붕붕카',
    '스쿠터', '휠체어', '보행기', '카시트'
  ];

  return {
    looksAccessory: accessoryWords.some(word => text.includes(word)),
    looksDecorToy: decorToyWords.some(word => text.includes(word)),
    looksSibling: siblingWords.some(word => text.includes(word))
  };
}

function buildPrompt(query, items) {
  const targetRole = detectTargetRole(query);
  const medianPrice = getMedianPrice(items);

  return `
너는 쇼핑 검색 결과를 의미적으로 분류하는 AI 필터다.

사용자 질문:
${query}

사용자가 찾는 대상 역할:
${targetRole}

판단 목표:
1. 이 후보가 본품(main_product)인지 액세서리(accessory)인지 판단
2. 질문 대상과 같은 계열인지(same_family), 비슷하지만 다른 계열인지(sibling), 무관한지(unrelated) 판단
3. 실사용 본품인지(real_usable), 모형/장식/소품/장난감인지(decorative_or_prop) 판단
4. 질문 적합도(queryFit)와 액세서리일 확률(accessoryProbability), 모형/장식/소품일 확률(toyDecorProbability) 평가
5. 애매하면 보수적으로 판단
6. 반드시 JSON만 출력

중요 규칙:
- 사용자가 본품을 찾으면 액세서리는 keep=false 쪽으로 판단
- 사용자가 본품을 찾으면 장식용 모형, 미니어처, 소품, 촬영용 오브제, 인테리어 소품, 장난감은 keep=false 쪽으로 판단
- 제목에 유모차, 공기청정기, 프린터 등의 단어가 있어도 장식용/모형이면 본품으로 보지 마세요
- 사용자가 액세서리를 찾으면 본품은 keep=false 쪽으로 판단
- 같은 계열이 아니면 keep=false 쪽으로 판단
- 비정상적으로 저가인 상품은 액세서리/모형 가능성을 강하게 의심
- 애매하면 keep=false
- id는 그대로 유지

가격 참고:
- 현재 후보군 중앙값(medianPrice): ${medianPrice ? `${medianPrice}원` : '알 수 없음'}

허용값:
- itemRole: "main_product" | "accessory" | "unknown"
- relationType: "same_family" | "sibling" | "unrelated" | "unknown"
- useReality: "real_usable" | "decorative_or_prop" | "unknown"

출력 형식:
{
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
      "textImageConsistency": 0.50,
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

async function callAnthropic(prompt) {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1800,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt }
          ]
        }
      ]
    })
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Anthropic filter error: ${text}`);
  }

  const data = JSON.parse(text);
  const raw = Array.isArray(data.content)
    ? data.content.filter(b => b.type === 'text').map(b => b.text).join('')
    : '';

  return safeJsonParse(raw);
}

function genericFallback(query, items) {
  const targetRole = detectTargetRole(query);
  const medianPrice = getMedianPrice(items);

  const results = items.map((item) => {
    const signals = getGenericSemanticSignals(item.name);
    const priceCheck = getPriceSuspicion(item, medianPrice, targetRole);

    const keep = targetRole === 'main_product'
      ? !signals.looksAccessory &&
        !signals.looksDecorToy &&
        !signals.looksSibling &&
        !priceCheck.hardReject
      : signals.looksAccessory && !signals.looksSibling;

    return {
      id: item.id,
      keep,
      itemRole: signals.looksAccessory ? 'accessory' : 'main_product',
      relationType: signals.looksSibling ? 'sibling' : 'same_family',
      useReality: signals.looksDecorToy ? 'decorative_or_prop' : 'real_usable',
      queryFit: keep ? 0.7 : 0.25,
      textMatch: keep ? 0.75 : 0.3,
      textImageConsistency: 0.5,
      accessoryProbability: signals.looksAccessory ? 0.92 : (priceCheck.suspicious ? 0.72 : 0.12),
      toyDecorProbability: signals.looksDecorToy ? 0.9 : 0.08,
      ambiguity: signals.looksSibling ? 0.55 : 0.25,
      reason: keep
        ? 'fallback 통과'
        : signals.looksDecorToy
          ? 'fallback에서 모형/장식/소품으로 판단'
          : signals.looksAccessory
            ? 'fallback에서 액세서리로 판단'
            : signals.looksSibling
              ? 'fallback에서 유사 카테고리로 판단'
              : priceCheck.hardReject
                ? 'fallback에서 비정상적 저가로 판단'
                : 'fallback 탈락'
    };
  });

  return {
    targetRole,
    results
  };
}

function decideKeep(targetRole, r, priceCheck) {
  const relationOk = r.relationType === 'same_family';
  const consistencyOk = Number(r.textImageConsistency || 0) >= 0.35;
  const fitOk = Number(r.queryFit || 0) >= 0.55;
  const ambiguityOk = Number(r.ambiguity || 0) < 0.75;
  const toyDecorLow = Number(r.toyDecorProbability || 0) < 0.35;
  const useRealityOk = !r.useReality || r.useReality === 'real_usable';

  if (targetRole === 'main_product') {
    const lowAccessory = Number(r.accessoryProbability || 0) < 0.45;

    if (r.itemRole !== 'main_product') return false;
    if (!relationOk) return false;
    if (!consistencyOk) return false;
    if (!fitOk) return false;
    if (!lowAccessory) return false;
    if (!toyDecorLow) return false;
    if (!useRealityOk) return false;
    if (!ambiguityOk) return false;
    if (priceCheck.hardReject) return false;
    if (priceCheck.suspicious && Number(r.queryFit || 0) < 0.86) return false;

    return true;
  }

  if (targetRole === 'accessory') {
    if (r.itemRole !== 'accessory') return false;
    if (!(r.relationType === 'same_family' || r.relationType === 'sibling')) return false;
    if (!fitOk) return false;
    if (!ambiguityOk) return false;

    return true;
  }

  return relationOk && consistencyOk && fitOk && ambiguityOk;
}

async function applyUniversalAIFilter({ query, items }) {
  const sliced = (items || []).slice(0, 16).map(item => ({
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

  try {
    const prompt = buildPrompt(query, sliced);
    const parsed = await callAnthropic(prompt);

    const resolvedTargetRole = parsed.targetRole || targetRole;
    const byId = {};
    (parsed.results || []).forEach((r) => {
      byId[String(r.id)] = r;
    });

    const filteredItems = sliced.filter((item) => {
      const r = byId[String(item.id)];
      if (!r) return false;

      const priceCheck = getPriceSuspicion(item, medianPrice, resolvedTargetRole);
      return decideKeep(resolvedTargetRole, r, priceCheck);
    });

    const rejectedItems = sliced
      .filter((item) => !filteredItems.some(f => f.id === item.id))
      .map((item) => {
        const r = byId[String(item.id)] || {};
        const priceCheck = getPriceSuspicion(item, medianPrice, resolvedTargetRole);

        let reason = r.reason || '판단 불충분';
        if (priceCheck.hardReject) {
          reason = `후보군 중앙값 대비 비정상적 저가(${Math.round(priceCheck.ratio * 100)}%)`;
        } else if (priceCheck.suspicious && !reason.includes('저가')) {
          reason = `${reason} / 저가 액세서리·소품 가능성`;
        }

        return {
          id: item.id,
          name: item.name,
          reason,
          itemRole: r.itemRole || 'unknown',
          relationType: r.relationType || 'unknown',
          useReality: r.useReality || 'unknown',
          accessoryProbability: r.accessoryProbability ?? null,
          toyDecorProbability: r.toyDecorProbability ?? null,
          ambiguity: r.ambiguity ?? null,
          priceRatio: priceCheck.ratio
        };
      });

    if (filteredItems.length) {
      return {
        filteredItems,
        rejectedItems,
        debug: {
          mode: 'ai',
          targetRole: resolvedTargetRole,
          medianPrice
        }
      };
    }

    const fallback = genericFallback(query, sliced);
    return {
      filteredItems: fallback.results
        .filter(r => r.keep)
        .map(r => sliced.find(i => i.id === r.id))
        .filter(Boolean),
      rejectedItems,
      debug: {
        mode: 'ai_then_fallback',
        targetRole: resolvedTargetRole,
        medianPrice
      }
    };
  } catch (err) {
    const fallback = genericFallback(query, sliced);

    return {
      filteredItems: fallback.results
        .filter(r => r.keep)
        .map(r => sliced.find(i => i.id === r.id))
        .filter(Boolean),
      rejectedItems: fallback.results
        .filter(r => !r.keep)
        .map(r => {
          const item = sliced.find(i => i.id === r.id);
          const priceCheck = getPriceSuspicion(item || {}, medianPrice, fallback.targetRole);

          return {
            id: r.id,
            name: item?.name || '',
            reason: priceCheck.hardReject
              ? `fallback에서 비정상적 저가(${Math.round(priceCheck.ratio * 100)}%)로 판단`
              : r.reason,
            itemRole: r.itemRole,
            relationType: r.relationType,
            useReality: r.useReality,
            toyDecorProbability: r.toyDecorProbability,
            priceRatio: priceCheck.ratio
          };
        }),
      debug: {
        mode: 'fallback',
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
