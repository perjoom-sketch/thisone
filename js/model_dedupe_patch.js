(function applyModelDedupePatch(global) {
  const ranking = global.ThisOneRanking || {};
  const originalBuildCandidates = ranking.buildCandidates || global.buildCandidates;

  const PROMO_WORDS = [
    '정품', '공식', '공식판매', '국내정품', '사은품', '무료배송', '당일배송', '빠른배송',
    '재택근무', '홈오피스', '학생', '책상', '스탠딩', '모션데스크', '전동', '높이조절',
    '프레임', '상판', '다리', '세트', '단품', '방문설치', '설치', '행사', '특가',
    '화이트', '블랙', '실버', '그레이', '레드', '블루', '핑크', '베이지', '오크', '월넛'
  ];

  const BRAND_ALIASES = [
    ['플렉티엠', 'FLEXISPOT'],
    ['플렉스팟', 'FLEXISPOT'],
    ['플렉시스팟', 'FLEXISPOT'],
    ['로보락', 'ROBOROCK'],
    ['다이슨', 'DYSON'],
    ['삼성', 'SAMSUNG'],
    ['엘지', 'LG'],
    ['LG전자', 'LG']
  ];

  function normalizeText(value) {
    let text = String(value || '').toUpperCase();
    BRAND_ALIASES.forEach(([from, to]) => {
      text = text.replace(new RegExp(from.toUpperCase(), 'g'), to);
    });
    return text
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]+\)/g, ' ')
      .replace(/[|/,+·ㆍ:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripPromoWords(text) {
    let result = ` ${text} `;
    PROMO_WORDS.forEach((word) => {
      result = result.replace(new RegExp(`\\s${word.toUpperCase()}\\s`, 'g'), ' ');
    });
    return result.replace(/\s+/g, ' ').trim();
  }

  function extractStrongModelKey(name) {
    const normalized = stripPromoWords(normalizeText(name));
    if (!normalized) return '';

    const brandModelPatterns = [
      /\b(FLEXISPOT)\s+([A-Z]{1,3}\d{1,4}[A-Z0-9-]*)\b/,
      /\b(ROBOROCK)\s+([A-Z]{1,3}\d{1,4}[A-Z0-9\s-]*(?:ULTRA|MAXV|PRO|PLUS)?)\b/,
      /\b(DYSON)\s+([A-Z0-9]{1,8}(?:\s+(?:ABSOLUTE|COMPLETE|DETECT|SLIM|PLUS|PRO))?)\b/,
      /\b(SAMSUNG|LG)\s+([A-Z]{1,10}\d{2,}[A-Z0-9-]*)\b/
    ];

    for (const pattern of brandModelPatterns) {
      const match = normalized.match(pattern);
      if (match) return `${match[1]} ${match[2]}`.replace(/\s+/g, ' ').trim();
    }

    const codePatterns = [
      /\b([A-Z]{1,10}-\d{2,}[A-Z0-9-]*)\b/,
      /\b([A-Z]{1,10}\d{2,}[A-Z0-9-]*)\b/,
      /\b(\d{3,}[A-Z]{1,10})\b/
    ];

    for (const pattern of codePatterns) {
      const match = normalized.match(pattern);
      if (match) return match[1];
    }

    return normalized
      .split(/\s+/)
      .filter((word) => word.length >= 2)
      .slice(0, 3)
      .join(' ');
  }

  function candidateQuality(candidate) {
    const price = Number(candidate.totalPriceNum || candidate.priceNum || 0);
    return (
      (candidate.shippingKnown ? 3 : 0) +
      (candidate.image ? 2 : 0) +
      (candidate.link ? 2 : 0) +
      (candidate.review ? 1 : 0) +
      (candidate.store ? 1 : 0) -
      (candidate.excludeFromPriceRank || candidate.isExcluded ? 5 : 0) -
      (price <= 0 ? 2 : 0)
    );
  }

  function preferCandidate(prev, current) {
    const prevQuality = candidateQuality(prev);
    const currQuality = candidateQuality(current);
    if (currQuality !== prevQuality) return currQuality > prevQuality ? current : prev;

    const prevPrice = Number(prev.totalPriceNum || prev.priceNum || Infinity);
    const currPrice = Number(current.totalPriceNum || current.priceNum || Infinity);
    if (currPrice !== prevPrice) return currPrice < prevPrice ? current : prev;

    return String(current.name || '').length > String(prev.name || '').length ? current : prev;
  }

  function dedupeByStrongModel(items) {
    const map = new Map();
    const output = [];

    (items || []).forEach((item) => {
      const key = extractStrongModelKey(item && item.name);
      if (!key) {
        output.push(item);
        return;
      }

      const enriched = { ...item, modelKey: item.modelKey || key, strongModelKey: key };
      const prev = map.get(key);
      map.set(key, prev ? preferCandidate(prev, enriched) : enriched);
    });

    return [...map.values(), ...output];
  }

  function patchedBuildCandidates(...args) {
    if (typeof originalBuildCandidates !== 'function') return [];
    const result = originalBuildCandidates(...args);
    if (!Array.isArray(result)) return result;
    return dedupeByStrongModel(result);
  }

  global.buildCandidates = patchedBuildCandidates;
  global.ThisOneRanking = {
    ...ranking,
    buildCandidates: patchedBuildCandidates,
    extractStrongModelKey
  };
})(window);
