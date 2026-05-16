const MAX_INPUT_LENGTH = 1200;
const MAX_QUERY_LENGTH = 120;

const CASUAL_ENDINGS = [
  '되는거야',
  '알려줘',
  '궁금해',
  '누구야',
  '어디야',
  '뭐야',
  '맞아',
  '인가',
  '이야',
  '해줘',
  '되나'
];

const TASK_RULES = [
  { taskType: 'affiliation/status', words: ['직원', '공무원', '소속', '위촉', '민간', '정식', '기관', '산하'] },
  { taskType: 'authority/role', words: ['권한', '역할', '단속', '처분', '감독', '점검', '지적', '명령', '과태료'] },
  { taskType: 'how_to', words: ['방법', '어떻게', '어디서', '신청', '발급', '출력', '사는 곳', '구하는 법', '어디서 사', '어디서 사나', '어디서 살'] },
  { taskType: 'eligibility', words: ['대상', '조건', '자격', '가능', '아무나', '해당', '벌금', '안 하면', '않으면'] },
  { taskType: 'comparison', words: ['차이', '비교', '뭐가 나아', '어느 쪽', '더 좋은'] },
  { taskType: 'recommendation', words: ['추천', '골라줘', '뭐 사', '어떤 게 좋아', '뭐 해먹지', '뭐 먹지', '메뉴'] },
  { taskType: 'troubleshooting', words: ['오류', '안됨', '안 됨', '실패', '고장', '이상', '왜 이래', '부스스', '안 돼'] },
  { taskType: 'interpretation', words: ['무슨 뜻', '해석', '설명', '이해', '정리', '의미', '뜻', '의무사용기간'] }
];

const OFFICIAL_SOURCE_WORDS = [
  '법', '제도', '정부', '공공기관', '고용노동부', '노동부', '공단', '지자체', '시청', '구청', '주민센터',
  '동사무소', '증명서', '신고', '신청', '과태료', '벌금', '안전', '보건', '노동', '감독', '공무원', '직원', '위촉', '민간',
  '정부24', '민원', '주민등록', '전입신고', '폐기물', '스티커', '판매처', '사업'
];

const INSTITUTION_WORDS = [
  '고용노동부', '노동부', '정부24', '정부', '공공기관', '공단', '시청', '구청', '주민센터', '동사무소', '지자체',
  '보건소', '교육청', '국세청', '경찰서', '소방서', '법원', '검찰청', '국민건강보험', '근로복지공단', '안전보건공단'
];

const ROLE_WORDS = [
  '직원', '공무원', '소속', '위촉', '민간', '정식', '기관', '산하', '권한', '역할', '단속', '처분', '감독', '점검', '지적', '명령', '과태료'
];

const PROCEDURE_WORDS = ['신청', '발급', '출력', '신고', '구매', '판매처', '사는 곳', '구하는 법', '신고기한'];
const PRODUCT_OR_WEB_WORDS = ['렌탈', '의무사용기간', '정수기', '제품', '가격', '후기', '비교', '추천', '고장', '오류', '수리'];
const DOCUMENT_HINT_WORDS = ['문서', '이미지', '사진', '캡처', '첨부', '파일', '설명서', '계약서', 'PDF'];
const STOP_WORDS = new Set(['이', '가', '은', '는', '을', '를', '에', '에서', '으로', '로', '와', '과', '도', '좀', '그', '저', '나', '내', '제']);

function cleanInput(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_INPUT_LENGTH);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeKoreanQuestion(text) {
  let normalized = cleanInput(text).replace(/[?？!！]+$/g, '').trim();
  for (const ending of CASUAL_ENDINGS) {
    normalized = normalized.replace(new RegExp(`\\s*${escapeRegExp(ending)}\\s*$`), '').trim();
  }
  normalized = normalized
    .replace(/들은/g, '')
    .replace(/이라\b/g, '')
    .replace(/라서\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || cleanInput(text);
}

function detectLanguage(text) {
  if (/[가-힣]/.test(text)) return 'ko';
  if (/[A-Za-z]/.test(text)) return 'en';
  return 'unknown';
}

function includesAny(text, words) {
  const source = String(text || '').toLowerCase();
  return words.some((word) => source.includes(String(word).toLowerCase()));
}

function collectMatches(text, words) {
  const found = [];
  for (const word of words) {
    if (String(text || '').toLowerCase().includes(String(word).toLowerCase())) found.push(word);
  }
  return unique(found);
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const clean = cleanQueryPart(value);
    if (!clean || clean.length < 2) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function cleanQueryPart(value) {
  return String(value || '')
    .replace(/["'`<>()[\]{}]/g, ' ')
    .replace(/[?？!！.,;:|\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectTaskType(text) {
  for (const rule of TASK_RULES) {
    if (includesAny(text, rule.words)) return rule.taskType;
  }
  return includesAny(text, ['뭐', '무엇', '누구', '어디', '언제', '왜', '어떻게', '?']) ? 'factual' : 'general';
}

function detectIntentType(taskType, text) {
  if (['affiliation/status', 'authority/role', 'eligibility', 'how_to'].includes(taskType)) return 'factual';
  if (taskType === 'recommendation') return 'recommendation';
  if (taskType === 'troubleshooting') return 'diagnostic';
  if (taskType === 'interpretation') return 'interpretation';
  if (taskType === 'comparison') return 'comparison';
  return includesAny(text, ['?', '？', '뭐', '누구', '어디', '언제', '어떻게']) ? 'factual' : 'general';
}

function stripParticles(value) {
  return String(value || '')
    .replace(/(들은|들은지|들|인가요|인가|이에요|예요|이야|야|은|는|을|를|에|에서|으로|로|와|과|하고|랑)$/g, '')
    .trim();
}

function tokenize(text) {
  return cleanQueryPart(text)
    .split(/\s+/)
    .map(stripParticles)
    .filter((token) => token && token.length >= 2 && !STOP_WORDS.has(token));
}

function simplifyEntityCandidate(value) {
  return stripParticles(cleanQueryPart(value)
    .replace(/(어디서|어떻게|언제|누구|무엇|뭐).*$/g, ' ')
    .replace(/(안 하면|않으면|하면|있는지|있어).*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function extractEntities(text, institutionWords, roleWords) {
  const cleaned = cleanQueryPart(text);
  const entities = [...institutionWords];
  let working = ` ${cleaned} `;

  for (const word of [...institutionWords, ...roleWords, ...PROCEDURE_WORDS, ...OFFICIAL_SOURCE_WORDS]) {
    working = working.replace(new RegExp(`\\s${escapeRegExp(word)}(?=\\s|$)`, 'g'), ' ');
  }
  working = working.replace(/\s+/g, ' ').trim();

  const chunks = working.split(/(?:은|는|을|를|에|에서|으로|로|와|과|하고|랑|라서|이라|인지|있는지|있어|하면|안 하면|않으면|어디서|어떻게)/g);
  for (const chunk of chunks) {
    const candidate = simplifyEntityCandidate(chunk);
    if (candidate.length >= 2 && candidate.length <= 30 && !includesAny(candidate, CASUAL_ENDINGS)) entities.push(candidate);
  }

  const nounRuns = cleaned.match(/[가-힣A-Za-z0-9]+(?:\s+[가-힣A-Za-z0-9]+){0,4}/g) || [];
  for (const run of nounRuns) {
    const candidate = simplifyEntityCandidate(run);
    if (candidate.length >= 2 && candidate.length <= 30 && !includesAny(candidate, roleWords)) entities.push(candidate);
  }

  return unique(entities).filter((entity) => !roleWords.includes(entity) && !PROCEDURE_WORDS.includes(entity));
}

function extractKeyPhrases(text, entities, roleWords, institutionWords) {
  const tokens = tokenize(text);
  const phrases = [...entities, ...roleWords, ...institutionWords];
  for (const token of tokens) {
    if (!phrases.some((phrase) => phrase.includes(token) || token.includes(phrase))) phrases.push(token);
  }
  return unique(phrases).slice(0, 10);
}

function getPrimaryEntity(entities, institutionWords) {
  const nonInstitution = entities.find((entity) => !institutionWords.includes(entity));
  return nonInstitution || entities[0] || '';
}

function sourceTermsForTask(taskType, needsOfficialSource = false) {
  if (taskType === 'affiliation/status') return ['소속', '역할', '위촉 민간', '사업 제도', '공식'];
  if (taskType === 'authority/role') return ['권한', '역할', '업무', '공식'];
  if (taskType === 'how_to') return ['신청', '구매', '판매처', '주민센터', '구청'];
  if (taskType === 'eligibility') return ['대상', '조건', '신고기한', '과태료', '정부24'];
  if (taskType === 'interpretation') return needsOfficialSource ? ['공식', '제도', '사업'] : ['뜻', '의미', '약정', '계약'];
  if (taskType === 'recommendation') return ['추천', '레시피', '활용', '방법'];
  if (taskType === 'troubleshooting') return ['원인', '해결', '관리법', '방법'];
  return needsOfficialSource ? ['공식', '제도', '사업'] : ['정보', '정리', '가이드'];
}

function buildRewrittenQuestion({ normalizedText, taskType, primaryEntity, institutionWords, roleWords }) {
  const institution = institutionWords[0] || '';
  if (taskType === 'affiliation/status') {
    return `${primaryEntity || normalizedText}의 소속과 지위는 무엇이며${institution ? `, ${institution} 정식 직원 또는 공무원인지` : ''} 확인한다.`;
  }
  if (taskType === 'authority/role') return `${primaryEntity || normalizedText}의 역할, 권한, 공식 업무 범위를 확인한다.`;
  if (taskType === 'how_to') return `${primaryEntity || normalizedText}의 신청·구매·발급 방법과 공식 처리 기관을 확인한다.`;
  if (taskType === 'eligibility') return `${primaryEntity || normalizedText}의 대상, 조건, 기한, 과태료 또는 불이익 여부를 공식 기준으로 확인한다.`;
  if (taskType === 'comparison') return `${normalizedText}에 대해 비교 기준과 차이를 확인한다.`;
  if (taskType === 'recommendation') return `${normalizedText}에 대해 사용자의 조건에 맞는 선택지와 추천 방향을 정리한다.`;
  if (taskType === 'troubleshooting') return `${normalizedText}의 원인과 해결 방법을 일반 기준으로 정리한다.`;
  if (taskType === 'interpretation') return `${normalizedText}의 의미와 실제 적용 방식을 쉽게 설명한다.`;
  return `${normalizedText}에 대해 필요한 근거를 확인해 답한다.`;
}

function compactQuery(parts) {
  return cleanQueryPart(parts.filter(Boolean).join(' ')).slice(0, MAX_QUERY_LENGTH).trim();
}

function buildSearchQueries({ normalizedText, taskType, entities, primaryEntity, institutionWords, roleWords, needsOfficialSource }) {
  const queries = [];
  const taskWords = sourceTermsForTask(taskType, needsOfficialSource);
  const institution = institutionWords[0] || '';
  const importantRoles = roleWords.slice(0, 3);

  queries.push(compactQuery([primaryEntity || normalizedText, institution, ...importantRoles.slice(0, 1)]));
  queries.push(compactQuery([primaryEntity || normalizedText, ...taskWords.slice(0, 2)]));
  if (institution) queries.push(compactQuery([primaryEntity || normalizedText, institution, taskWords[0] || '공식']));
  if (needsOfficialSource) queries.push(compactQuery([primaryEntity || normalizedText, taskWords.slice(2, 4).join(' ')]));
  if (!needsOfficialSource) queries.push(compactQuery([primaryEntity || normalizedText, taskWords.slice(2, 4).join(' ')]));
  if (taskType === 'affiliation/status') queries.push(compactQuery([primaryEntity || normalizedText, '위촉 민간']));
  if (taskType === 'how_to') queries.push(compactQuery([primaryEntity || normalizedText, '주민센터 구청 판매처']));
  if (taskType === 'eligibility') queries.push(compactQuery([primaryEntity || normalizedText, '과태료 신고기한 정부24']));
  if (!needsOfficialSource && entities.length > 1) queries.push(compactQuery([entities.slice(0, 3).join(' '), taskWords[0] || '정보']));
  queries.push(compactQuery([normalizedText, taskWords[0]]) || normalizedText);

  return unique(queries).filter(Boolean).slice(0, 5);
}

function spacingVariants(value) {
  const clean = cleanQueryPart(value);
  if (!clean.includes(' ')) return [];
  return [clean.replace(/\s+/g, '')];
}

function buildDeeperResearchQueries({ primaryEntity, normalizedText, institutionWords, roleWords, taskType, needsOfficialSource }) {
  const base = primaryEntity || normalizedText;
  const institution = institutionWords[0] || '';
  const sourceTerms = sourceTermsForTask(taskType, needsOfficialSource);
  const queries = [
    compactQuery([base, institution, roleWords.slice(0, 3).join(' '), needsOfficialSource ? '공식' : '정보']),
    compactQuery([base, needsOfficialSource ? '사업 제도 공식' : '상세 정보']),
    compactQuery([base, sourceTerms.join(' ')]),
    compactQuery([base, institution, '보도자료 공고']),
    compactQuery([base, '업무 역할 권한']),
    ...spacingVariants(base).map((variant) => compactQuery([variant, institution, needsOfficialSource ? '공식' : '정보']))
  ];

  if (taskType === 'how_to') queries.push(compactQuery([base, '지자체 구청 주민센터 판매처 신청']));
  if (taskType === 'eligibility') queries.push(compactQuery([base, '법령 과태료 신고기한 대상']));
  return unique(queries).slice(0, 6);
}

function getEvidencePreference({ text, taskType, needsOfficialSource }) {
  if (includesAny(text, DOCUMENT_HINT_WORDS)) return 'user_provided';
  if (needsOfficialSource) return 'official';
  if (includesAny(text, PRODUCT_OR_WEB_WORDS) || ['comparison', 'recommendation'].includes(taskType)) return 'web';
  if (taskType === 'troubleshooting') return 'general';
  return 'general';
}

function getInterimMessages(needsOfficialSource) {
  return [
    '질문 의도를 파악하고 있습니다.',
    '검색 질문을 다시 정리하고 있습니다.',
    needsOfficialSource ? '공식 출처와 관련 자료를 확인하고 있습니다.' : '확인 가능한 출처가 부족해 추가로 조사하고 있습니다.',
    '근거가 부족한 부분을 분리해 정리하고 있습니다.'
  ];
}

function analyzeQuestion(input, options = {}) {
  const originalText = cleanInput(typeof input === 'string' ? input : input?.text);
  const normalizedText = normalizeKoreanQuestion(originalText);
  const language = detectLanguage(originalText);
  const taskType = detectTaskType(originalText);
  const intentType = detectIntentType(taskType, originalText);
  const roleWords = collectMatches(originalText, ROLE_WORDS);
  const institutionWords = collectMatches(originalText, INSTITUTION_WORDS);
  const needsOfficialSource = includesAny(originalText, OFFICIAL_SOURCE_WORDS) || ['affiliation/status', 'authority/role', 'eligibility'].includes(taskType);
  const entities = extractEntities(normalizedText, institutionWords, roleWords);
  const primaryEntity = getPrimaryEntity(entities, institutionWords);
  const keyPhrases = extractKeyPhrases(normalizedText, entities, roleWords, institutionWords);
  const evidencePreference = getEvidencePreference({ text: originalText, taskType, needsOfficialSource });
  const needsCurrentInfo = needsOfficialSource || includesAny(originalText, ['최신', '최근', '오늘', '현재', '가격', '뉴스', '판매처', '신청', '과태료']);
  const needsSearch = evidencePreference !== 'user_provided' && (needsCurrentInfo || evidencePreference === 'web' || intentType === 'factual' || taskType !== 'general');
  const mainQuestion = primaryEntity ? `${primaryEntity} ${roleWords.concat(institutionWords).slice(0, 3).join(' ')}`.trim() : normalizedText;
  const rewrittenQuestion = buildRewrittenQuestion({ normalizedText, taskType, primaryEntity, institutionWords, roleWords });
  const queryBase = { normalizedText, taskType, entities, primaryEntity, institutionWords, roleWords, needsOfficialSource };
  const searchQueries = buildSearchQueries(queryBase);
  const deeperResearchQueries = buildDeeperResearchQueries(queryBase);
  const firstSearchWeak = options.firstSearchWeak === true || options.escalate === true;
  let answerStrategy = needsSearch ? 'source_backed' : 'careful_general';
  if (!originalText || normalizedText.length < 2) answerStrategy = 'ask_for_context';
  if (firstSearchWeak && needsSearch) answerStrategy = 'needs_deeper_research';

  return {
    originalText,
    normalizedText,
    language,
    intentType,
    taskType,
    mainQuestion,
    rewrittenQuestion,
    entities,
    keyPhrases,
    roleWords,
    institutionWords,
    needsSearch,
    needsCurrentInfo,
    needsOfficialSource,
    evidencePreference,
    searchQueries,
    deeperResearchQueries,
    answerStrategy,
    interimMessages: getInterimMessages(needsOfficialSource),
  };
}

module.exports = { analyzeQuestion };
