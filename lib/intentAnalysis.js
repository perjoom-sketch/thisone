const MAX_INPUT_LENGTH = 1200;
const MAX_QUERY_LENGTH = 120;

const QUESTION_ENDING_PATTERNS = [
  /(?:이야|야|인가|맞아|뭐야|누구야|어디야|알려줘|궁금해)$/,
  /(?:입니까|인가요|인가요|인가|맞나요|맞습니까|뭔가요|무엇인가요|누구인가요|어디인가요|알려주세요|궁금합니다)$/
];

const TASK_PATTERNS = [
  { type: 'affiliation/status', words: ['직원', '공무원', '소속', '위촉', '민간'] },
  { type: 'authority/role', words: ['권한', '역할', '단속', '처분', '감독', '점검'] },
  { type: 'how-to', words: ['방법', '어떻게', '어디서', '신청', '발급', '출력'] },
  { type: 'eligibility', words: ['대상', '조건', '자격', '가능'] },
  { type: 'comparison', words: ['차이', '비교', '뭐가 나아', '무엇이 나아'] },
  { type: 'recommendation', words: ['추천', '골라줘', '고르'] },
  { type: 'troubleshooting', words: ['오류', '안됨', '안 돼', '실패', '고장'] }
];

const ROLE_WORDS = [
  '직원', '공무원', '소속', '위촉', '민간', '권한', '역할', '단속', '처분', '감독', '점검',
  '대상', '조건', '자격', '가능', '신청', '발급', '출력', '추천', '오류', '실패', '고장',
  '벌금', '과태료', '의무사용기간'
];

const OFFICIAL_SOURCE_WORDS = [
  '법', '제도', '공공기관', '고용노동부', '정부', '공단', '지자체', '증명서', '신고', '신청',
  '과태료', '안전', '보건', '노동', '벌금', '주민센터', '구청', '시청', '전입신고', '폐기물'
];

const INSTITUTION_WORDS = [
  '고용노동부', '정부', '공단', '지자체', '주민센터', '구청', '시청', '구청', '동사무소',
  '행정복지센터', '보건소', '경찰서', '소방서', '교육청', '법원', '국세청', '관세청', '공공기관'
];

const CURRENT_INFO_WORDS = ['최신', '최근', '오늘', '현재', '지금', '요즘', '개정', '변경', '시행'];
const KOREAN_PARTICLES = /(?:가|을|를|에게|한테|에서|으로|로|와|과|도|만)$/;
const FILLER_WORDS = new Set(['있어', '하면', '해서', '이라', '라서', '때', '날', '머리', '뭐', '무엇', '어디서', '어떻게', '안']);

function compactText(value, maxLength = MAX_INPUT_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function stripQuestionEnding(text) {
  let next = compactText(text)
    .replace(/[?？!！.。]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  let changed = true;
  while (changed && next) {
    changed = false;
    for (const pattern of QUESTION_ENDING_PATTERNS) {
      const replaced = next.replace(pattern, '').trim();
      if (replaced !== next) {
        next = replaced.replace(/[?？!！.。]+$/g, '').trim();
        changed = true;
      }
    }
  }
  return next;
}

function normalizeKoreanQuestion(text) {
  return stripQuestionEnding(text)
    .replace(/["'`<>()[\]{}]/g, ' ')
    .replace(/[?？!！.,;:|\\/]+/g, ' ')
    .replace(/\b(좀|혹시|그냥|제발)\b/g, ' ')
    .replace(/([가-힣]+)들은(?=\s|$)/g, '$1')
    .replace(/([가-힣]+)들(?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectLanguage(text) {
  const source = String(text || '');
  if (/[가-힣]/.test(source)) return 'ko';
  if (/[a-zA-Z]/.test(source)) return 'en';
  return 'unknown';
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const trimmed = compactText(value, 80);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function includesWord(text, word) {
  return String(text || '').toLowerCase().includes(String(word || '').toLowerCase());
}

function detectTaskType(text) {
  for (const pattern of TASK_PATTERNS) {
    if (pattern.words.some((word) => includesWord(text, word))) return pattern.type;
  }
  return 'general';
}

function extractWords(text, dictionary) {
  return unique(dictionary.filter((word) => includesWord(text, word)));
}

function cleanEntityCandidate(value) {
  let candidate = compactText(value, 80)
    .replace(/[?？!！.,;:|\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = candidate.split(' ')
    .map((word) => word.replace(KOREAN_PARTICLES, ''))
    .filter((word) => word && !FILLER_WORDS.has(word));

  while (words.length && ROLE_WORDS.some((role) => words[words.length - 1].includes(role))) words.pop();
  return words.join(' ').trim();
}

function extractEntityCandidates(text, roleWords, institutionWords) {
  let working = ` ${text} `;
  for (const word of [...roleWords, ...institutionWords]) {
    working = working.replace(new RegExp(`\\s*${escapeRegExp(word)}\\s*`, 'g'), ' ');
  }

  const candidates = [];
  const chunks = working.split(/\s+(?:안|하면|있어|이라|라서|때|날|뭐|무엇|어디서|어떻게)\s+|\s*,\s*/);
  for (const chunk of chunks) {
    const cleaned = cleanEntityCandidate(chunk);
    if (cleaned.length >= 2) candidates.push(cleaned);
  }
  return candidates;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPrimaryEntity(entities, institutionWords) {
  return entities.find((entity) => !institutionWords.includes(entity)) || entities[0] || '';
}

function isOfficialTopic(text) {
  return OFFICIAL_SOURCE_WORDS.some((word) => includesWord(text, word));
}

function isCurrentTopic(text) {
  return CURRENT_INFO_WORDS.some((word) => includesWord(text, word)) || isOfficialTopic(text);
}

function pushQuery(queries, query) {
  const normalized = compactText(query, MAX_QUERY_LENGTH);
  if (normalized && !queries.includes(normalized)) queries.push(normalized);
}

function buildSearchQueries({ normalizedText, taskType, entities, roleWords, institutionWords, needsOfficialSource }) {
  const queries = [];
  const primaryEntity = getPrimaryEntity(entities, institutionWords);
  const institution = institutionWords[0] || '';
  const firstRole = roleWords[0] || '';
  const compactBase = [primaryEntity, institution, firstRole].filter(Boolean).join(' ');

  if (taskType === 'affiliation/status') {
    pushQuery(queries, compactBase || normalizedText);
    if (primaryEntity) {
      pushQuery(queries, `${primaryEntity} 소속 역할`);
      pushQuery(queries, `${primaryEntity} 위촉 민간`);
      pushQuery(queries, `${primaryEntity} 사업 제도`);
      pushQuery(queries, `${primaryEntity} 공식`);
    }
  } else if (taskType === 'authority/role') {
    pushQuery(queries, compactBase || normalizedText);
    if (primaryEntity) pushQuery(queries, `${primaryEntity} 권한 역할 공식`);
    if (primaryEntity) pushQuery(queries, `${primaryEntity} 감독 점검 처분`);
  } else if (taskType === 'how-to') {
    pushQuery(queries, `${primaryEntity || normalizedText} 방법`);
    pushQuery(queries, `${primaryEntity || normalizedText} 어디서 신청 발급`);
    if (needsOfficialSource) pushQuery(queries, `${primaryEntity || normalizedText} 공식 안내`);
  } else if (taskType === 'eligibility') {
    pushQuery(queries, `${primaryEntity || normalizedText} 대상 조건 자격`);
    pushQuery(queries, `${primaryEntity || normalizedText} 가능 여부`);
    if (needsOfficialSource) pushQuery(queries, `${primaryEntity || normalizedText} 공식 기준`);
  } else if (taskType === 'comparison') {
    pushQuery(queries, `${normalizedText} 차이 비교`);
    pushQuery(queries, `${normalizedText} 장단점`);
  } else if (taskType === 'recommendation') {
    pushQuery(queries, `${normalizedText} 추천 기준`);
    pushQuery(queries, `${normalizedText} 고르는 법`);
  } else if (taskType === 'troubleshooting') {
    pushQuery(queries, `${primaryEntity || normalizedText} 오류 실패 원인`);
    pushQuery(queries, `${primaryEntity || normalizedText} 해결 방법`);
  } else {
    pushQuery(queries, primaryEntity || normalizedText);
    pushQuery(queries, `${primaryEntity || normalizedText} 의미 설명`);
    if (needsOfficialSource) pushQuery(queries, `${primaryEntity || normalizedText} 공식 안내`);
  }

  if (institution && primaryEntity) pushQuery(queries, `${primaryEntity} ${institution} 공식`);
  if (queries.length < 3 && normalizedText) pushQuery(queries, `${normalizedText} 정보`);
  if (queries.length < 3 && primaryEntity) pushQuery(queries, `${primaryEntity} 관련 정보`);

  return queries.slice(0, 5);
}

function analyzeUserIntent(input, options = {}) {
  const rawText = typeof input === 'string' ? input : input?.text;
  const mode = options.mode || (typeof input === 'object' && input ? input.mode : undefined);
  const normalizedText = normalizeKoreanQuestion(rawText);
  const language = detectLanguage(normalizedText || rawText);
  const taskType = detectTaskType(normalizedText);
  const roleWords = extractWords(normalizedText, ROLE_WORDS);
  const institutionWords = extractWords(normalizedText, INSTITUTION_WORDS);
  const inferredEntities = extractEntityCandidates(normalizedText, roleWords, institutionWords);
  const entities = unique([...inferredEntities, ...institutionWords]);
  const needsOfficialSource = isOfficialTopic(normalizedText);
  const needsCurrentInfo = isCurrentTopic(normalizedText);
  const evidencePreference = needsOfficialSource ? 'official' : (needsCurrentInfo ? 'web' : (mode === 'loveme' ? 'user_provided' : 'general'));
  const answerStrategy = normalizedText.length < 2 ? 'ask_for_context' : (needsOfficialSource || needsCurrentInfo ? 'source_backed' : 'careful_general');
  const searchQueries = buildSearchQueries({ normalizedText, taskType, entities, roleWords, institutionWords, needsOfficialSource });

  return {
    normalizedText,
    language,
    taskType,
    entities,
    roleWords,
    institutionWords,
    needsCurrentInfo,
    needsOfficialSource,
    evidencePreference,
    searchQueries,
    answerStrategy
  };
}

module.exports = {
  analyzeUserIntent,
  _private: {
    normalizeKoreanQuestion,
    stripQuestionEnding,
    detectTaskType,
    buildSearchQueries
  }
};
