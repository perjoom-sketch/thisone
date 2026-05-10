const ACCESSORY_KEYWORDS = [
  '필터',
  '교체용',
  '교체용 필터',
  '정수필터',
  '헤파',
  '활성탄',
  '봉투',
  '호스',
  '커버',
  '패드',
  '시트',
  '천갈이',
  '덮개',
  '부품',
  '액세서리',
  '악세서리',
  '브러시',
  '브러쉬',
  '솔',
  '걸레'
];

function normalizeQuery(query) {
  return String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function includesKeyword(text, keyword) {
  const normalizedKeyword = normalizeQuery(keyword);
  const compactText = text.replace(/\s+/g, '');
  const compactKeyword = normalizedKeyword.replace(/\s+/g, '');

  return text.includes(normalizedKeyword) || compactText.includes(compactKeyword);
}

function detectIntent(query) {
  const text = normalizeQuery(query);

  if (!text) return 'main';

  const hasKimSeobangMask = includesKeyword(text, '김서방마스크');
  const hasBidet = includesKeyword(text, '비데');

  if (ACCESSORY_KEYWORDS.some((keyword) => includesKeyword(text, keyword))) {
    return 'accessory';
  }

  if (!hasKimSeobangMask && includesKeyword(text, '리필')) {
    return 'accessory';
  }

  if (!hasBidet && includesKeyword(text, '노즐')) {
    return 'accessory';
  }

  return 'main';
}

module.exports = { detectIntent };
