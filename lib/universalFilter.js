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
    '거치대', '필터', '토너', '잉크', '리필', '이어팁'
  ];

  const wantsAccessory = accessoryWords.some(word => q.includes(word));

  return wantsAccessory ? 'accessory' : 'main_product';
}

function buildBlocks(query, items) {
  const targetRole = detectTargetRole(query);

  const intro = `
너는 쇼핑 검색 결과를 의미적으로 분류하는 멀티모달 필터다.

사용자 질문:
${query}

반드시 판단할 것:
1. 사용자가 찾는 것이 본품(main_product)인지 액세서리(accessory)인지
2. 각 후보가 본품인지 액세서리인지
3. 질문과 같은 계열인지(same_family), 비슷하지만 다른 계열인지(sibling), 무관한지(unrelated)
4. 텍스트와 이미지가 같은 상품을 가리키는지
5. 최종 keep 여부

엄격한 규칙:
- 사용자가 본품을 찾으면 액세서리는 keep=false
- 사용자가 액세서리를 찾으면 본품은 keep=false
- 애매하면 keep=false
- 이미지와 텍스트가 심하게 불일치하면 keep=false
- 반드시 JSON만 출력

JSON 형식:
{
  "targetRole": "${targetRole}",
  "results": [
    {
      "id": "1",
      "keep": true,
      "itemRole": "main_product",
      "relationType": "same_family",
      "queryFit": 0.92,
      "textMatch": 0.88,
      "imageMatch": 0.91,
      "textImageConsistency": 0.94,
      "accessoryProbability": 0.03,
      "ambiguity": 0.08,
      "reason": "짧은 판단 이유"
    }
  ]
}
`;

  const blocks = [{ type: 'text', text: intro }];

  items.forEach((item) => {
    blocks.push({
      type: 'text',
      text:
`[ITEM ${item.id}]
name: ${item.name}
price: ${item.priceText || item.price || ''}
store: ${item.store || ''}
link: ${item.link || ''}`
    });

    if (item.image) {
      blocks.push({
        type: 'image',
        source: {
          type: 'url',
          url: item.image
        }
      });
    }
  });

  return blocks;
}

function genericFallback(query, items) {
  const targetRole = detectTargetRole(query);

  const accessoryWords = [
    '컵홀더', '홀더', '커버', '후크', '가방', '액세서리', '악세사리',
    '거치대', '필터', '토너', '잉크', '리필', '케이스', '이어팁',
    '충전독', '브라켓', '브래킷', '리모컨', '날개', '부품', '부속'
  ];

  const results = items.map((item) => {
    const name = String(item.name || '').toLowerCase();
    const looksAccessory = accessoryWords.some(word => name.includes(word));
    const keep =
      targetRole === 'main_product'
        ? !looksAccessory
        : looksAccessory;

    return {
      id: item.id,
      keep,
      itemRole: looksAccessory ? 'accessory' : 'main_product',
      relationType: 'same_family',
      queryFit: keep ? 0.65 : 0.25,
      textMatch: keep ? 0.7 : 0.3,
      imageMatch: 0.5,
      textImageConsistency: 0.5,
      accessoryProbability: looksAccessory ? 0.9 : 0.1,
      ambiguity: 0.3,
      reason: keep ? 'fallback 통과' : 'fallback에서 액세서리/비본품으로 판단'
    };
  });

  return {
    targetRole,
    results
  };
}

function decideKeep(targetRole, r) {
  const relationOk = r.relationType === 'same_family';
  const consistencyOk = Number(r.textImageConsistency || 0) >= 0.45;
  const fitOk = Number(r.queryFit || 0) >= 0.55;
  const lowAccessory = Number(r.accessoryProbability || 0) < 0.45;
  const ambiguityOk = Number(r.ambiguity || 0) < 0.75;

  if (targetRole === 'main_product') {
    return r.itemRole === 'main_product' && relationOk && consistencyOk && fitOk && lowAccessory && ambiguityOk;
  }

  if (targetRole === 'accessory') {
    return r.itemRole === 'accessory' && (r.relationType === 'same_family' || r.relationType === 'sibling') && consistencyOk && fitOk && ambiguityOk;
  }

  return relationOk && consistencyOk && fitOk && ambiguityOk;
}

async function callAnthropic(contentBlocks) {
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
          content: contentBlocks
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

async function applyUniversalAIFilter({ query, items }) {
  const sliced = (items || []).slice(0, 12).map(item => ({
    id: String(item.id),
    name: stripHtml(item.name),
    price: item.price || '',
    priceText: item.priceText || '',
    store: stripHtml(item.store || ''),
    link: item.link || '',
    image: item.image || ''
  }));

  try {
    const blocks = buildBlocks(query, sliced);
    const parsed = await callAnthropic(blocks);

    const targetRole = parsed.targetRole || detectTargetRole(query);
    const byId = {};
    (parsed.results || []).forEach((r) => {
      byId[String(r.id)] = r;
    });

    const filteredItems = sliced.filter((item) => {
      const r = byId[String(item.id)];
      if (!r) return false;
      return decideKeep(targetRole, r);
    });

    const rejectedItems = sliced
      .filter((item) => {
        const r = byId[String(item.id)];
        if (!r) return true;
        return !decideKeep(targetRole, r);
      })
      .map((item) => {
        const r = byId[String(item.id)] || {};
        return {
          id: item.id,
          name: item.name,
          reason: r.reason || '판단 불충분',
          itemRole: r.itemRole || 'unknown',
          relationType: r.relationType || 'unknown',
          accessoryProbability: r.accessoryProbability ?? null,
          ambiguity: r.ambiguity ?? null
        };
      });

    return {
      filteredItems: filteredItems.length ? filteredItems : genericFallback(query, sliced).results.filter(r => r.keep).map(r => sliced.find(i => i.id === r.id)).filter(Boolean),
      rejectedItems,
      debug: {
        mode: 'ai',
        targetRole
      }
    };
  } catch (err) {
    const fallback = genericFallback(query, sliced);
    return {
      filteredItems: fallback.results.filter(r => r.keep).map(r => sliced.find(i => i.id === r.id)).filter(Boolean),
      rejectedItems: fallback.results
        .filter(r => !r.keep)
        .map(r => ({
          id: r.id,
          name: sliced.find(i => i.id === r.id)?.name || '',
          reason: r.reason,
          itemRole: r.itemRole,
          relationType: r.relationType
        })),
      debug: {
        mode: 'fallback',
        targetRole: fallback.targetRole,
        error: err.message
      }
    };
  }
}

module.exports = {
  applyUniversalAIFilter
};
