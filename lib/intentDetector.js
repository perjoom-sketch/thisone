const ACCESSORY_KEYWORDS = [
  '필터', '교체용', '리필', '정수필터', '헤파', '활성탄',
  '노즐', '봉투', '호스',
  '커버', '패드', '시트', '천갈이', '덮개',
  '부품', '액세서리', '악세서리',
  '브러시', '솔', '걸레'
];

function getAccessoryKeywords() {
  return [...ACCESSORY_KEYWORDS];
}

function normalizeQuery(query) {
  return String(query || '').trim();
}

function detectIntent(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) return 'main';

  if (normalized.includes('김서방마스크') && normalized.includes('리필')) {
    const withoutRefill = normalized.replace(/\s*리필\s*/g, ' ').trim().replace(/\s+/g, ' ');
    return getAccessoryKeywords().some((kw) => kw !== '리필' && withoutRefill.includes(kw)) ? 'accessory' : 'main';
  }

  if (normalized.includes('비데') && normalized.includes('노즐')) {
    const withoutNozzle = normalized.replace(/\s*노즐\s*/g, ' ').trim().replace(/\s+/g, ' ');
    return getAccessoryKeywords().some((kw) => kw !== '노즐' && withoutNozzle.includes(kw)) ? 'accessory' : 'main';
  }

  return getAccessoryKeywords().some((kw) => normalized.includes(kw)) ? 'accessory' : 'main';
}

function stripAccessoryKeywords(query) {
  const keywords = getAccessoryKeywords();
  let result = query;
  for (const kw of keywords) {
    result = result.replace(new RegExp(`\\s*${kw}\\s*`, 'g'), ' ');
  }
  return result.trim().replace(/\s+/g, ' ');
}

module.exports = { detectIntent, getAccessoryKeywords, stripAccessoryKeywords };
