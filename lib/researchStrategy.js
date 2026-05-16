const MAX_NEXT_QUERY_COUNT = 5;

const LOW_QUALITY_DOMAINS = [
  'pinterest.', 'facebook.', 'instagram.', 'tiktok.', 'x.com', 'twitter.', 'youtube.', 'dcinside.', 'fmkorea.', 'theqoo.',
  'blog.naver.com', 'm.blog.naver.com', 'cafe.naver.com', 'brunch.co.kr', 'tistory.com', 'velog.io', 'medium.com', 'reddit.com'
];

const OFFICIAL_SOURCE_DOMAINS = [
  '.go.kr', 'gov.kr', 'epeople.go.kr', 'moel.go.kr', 'korea.kr', 'law.go.kr', 'easylaw.go.kr',
  'safety.or.kr', 'kosha.or.kr', 'nhis.or.kr', 'comwel.or.kr', 'nts.go.kr', 'me.go.kr', 'waste.go.kr'
];

function normalizeDomain(source) {
  const directDomain = String(source?.domain || '').trim().toLowerCase().replace(/^www\./, '');
  if (directDomain) return directDomain;

  try {
    return new URL(String(source?.link || '').trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch (error) {
    return '';
  }
}

function isOfficialSource(source) {
  const domain = normalizeDomain(source);
  if (!domain) return false;
  return OFFICIAL_SOURCE_DOMAINS.some((officialDomain) => (
    domain === officialDomain
    || domain.endsWith(officialDomain)
    || domain.includes(officialDomain)
  ));
}

function isLowQualitySource(source) {
  const domain = normalizeDomain(source);
  if (!domain) return true;
  return LOW_QUALITY_DOMAINS.some((blocked) => domain.includes(blocked));
}

function uniqueQueries(queries) {
  const seen = new Set();
  const result = [];
  for (const query of Array.isArray(queries) ? queries : []) {
    const clean = String(query || '').replace(/\s+/g, ' ').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= MAX_NEXT_QUERY_COUNT) break;
  }
  return result;
}

function evaluateSourceQuality(analysis, sources) {
  const sourceList = Array.isArray(sources) ? sources.filter(Boolean) : [];
  if (sourceList.length === 0) return 'none';

  const officialCount = sourceList.filter(isOfficialSource).length;
  const lowQualityCount = sourceList.filter(isLowQualitySource).length;
  const usableCount = sourceList.length - lowQualityCount;

  if (analysis?.needsOfficialSource) {
    return officialCount > 0 ? 'good' : 'weak';
  }

  if (usableCount > 0 || sourceList.length >= 2) return 'good';
  return 'weak';
}

function reasonForQuality(analysis, sourceQuality, sources) {
  const count = Array.isArray(sources) ? sources.length : 0;

  if (sourceQuality === 'good') {
    if (analysis?.needsOfficialSource) return '공식·공공 성격의 출처가 포함되어 1차 답변 근거로 사용할 수 있습니다.';
    return '공개 출처가 확인되어 1차 답변 근거로 사용할 수 있습니다.';
  }

  if (sourceQuality === 'none') return '1차 검색에서 사용할 공개 출처를 찾지 못했습니다.';

  if (analysis?.needsOfficialSource) {
    return `1차 검색에서 출처 ${count}개를 찾았지만 공식·공공 근거가 없어 추가 확인이 필요합니다.`;
  }

  return `1차 검색에서 출처 ${count}개를 찾았지만 근거 품질이 약해 추가 확인이 필요합니다.`;
}

function planResearch(analysis, sources) {
  const sourceQuality = evaluateSourceQuality(analysis, sources);
  const shouldEscalate = sourceQuality !== 'good';

  return {
    sourceQuality,
    shouldEscalate,
    reason: reasonForQuality(analysis, sourceQuality, sources),
    nextQueries: shouldEscalate ? uniqueQueries(analysis?.deeperResearchQueries) : [],
    answerSections: shouldEscalate
      ? ['결론', '확인된 내용', '합리적 해석', '확인되지 않은 부분', '지금 확인할 것']
      : ['결론', '근거', '지금 할 일', '주의할 점']
  };
}

module.exports = {
  planResearch,
  _private: {
    evaluateSourceQuality,
    isOfficialSource,
    isLowQualitySource,
    uniqueQueries
  }
};
