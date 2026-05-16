const ANSWER_BASIS = Object.freeze({
  DOCUMENT_SUPPORTED: 'document_supported',
  DOCUMENT_PARTIAL: 'document_partial',
  DOCUMENT_MISSING: 'document_missing',
  PUBLIC_SUPPLEMENT_NEEDED: 'public_supplement_needed'
});

const PUBLIC_TRIGGER_PATTERN = /(법적|법률|절차|신청|발급|제출|자격|대상|조건|기한|마감|권리|의무|위험|리스크|주의|주의사항|괜찮|맞아|어떻게|해야|공식|정책|제도|규정|약관|매뉴얼|설명서|제품|의미|뜻|수수료|필요서류|서류|이의신청|민원|보상|환불|해지|계약|납부|연체|처벌|벌금|과태료|보험|의료|진료|처방|금융|대출|세금|공제|공공|정부|기관)/i;
const STRONG_PUBLIC_TRIGGER_PATTERN = /(법적|법률|절차|신청|발급|제출|자격|대상|조건|기한|마감|권리|의무|위험|리스크|주의|주의사항|괜찮|맞아|어떻게 해야|공식|정책|제도|규정|약관|매뉴얼|설명서|제품|의미|뜻|수수료|필요서류|이의신청|민원|보상|환불|해지|납부|연체|처벌|벌금|과태료|보험|의료|진료|처방|금융|대출|세금|공제|공공|정부|기관)/i;
const INTERNAL_QUESTION_PATTERN = /(이 문서|문서에서|사진에서|여기서|내용만|요약|정리|적힌|나온|보이는|핵심|해야 할 일만|체크리스트)/i;
const WEAK_SUMMARY_PATTERN = /(읽지 못|확인하지 못|요약 없음|지원되는 파일 형식이 아니|내용이 많지|자동으로 확인하지 못|없음)/i;

function normalizeText(value, maxLength = 4000) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function redactSensitive(value) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
    .replace(/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, ' ')
    .replace(/\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, ' ')
    .replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, ' ')
    .replace(/\b\d{2,6}[-\s]?\d{2,6}[-\s]?\d{2,8}\b/g, ' ')
    .replace(/(계좌|카드|여권|면허|사업자|법인|접수|사건)\s*(?:번호|No\.?|ID)?\s*[:：]?\s*[A-Za-z0-9-]{4,}/gi, ' ')
    .replace(/(?:주소|거주지|소재지)\s*[:：]?\s*[^\n.。]{6,80}/g, ' ')
    .replace(/(성명|이름|예금주|신청인|청구인|피청구인|계약자|임차인|임대인)\s*[:：]?\s*[가-힣A-Za-z]{2,20}/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizePublicKeyword(value) {
  return normalizeText(redactSensitive(value), 80)
    .replace(/["'`<>()[\]{}]/g, ' ')
    .replace(/[?？!！.,;:|\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizePublicKeywords(keywords) {
  const seen = new Set();
  const safe = [];
  for (const item of Array.isArray(keywords) ? keywords : []) {
    const keyword = sanitizePublicKeyword(item);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    safe.push(keyword);
    if (safe.length >= 6) break;
  }
  return safe;
}

function normalizeDocumentSession(session) {
  if (!session || typeof session !== 'object') return null;
  const documentSessionId = normalizeText(session.documentSessionId, 120);
  const safeSummary = normalizeText(session.safeSummary, 1800);
  if (!documentSessionId || !safeSummary) return null;
  return {
    documentSessionId,
    fileName: normalizeText(session.fileName || '업로드 문서', 160),
    fileType: normalizeText(session.fileType || '', 120),
    documentType: normalizeText(session.documentType || '문서/사진', 80),
    safeSummary,
    publicKeywords: sanitizePublicKeywords(session.publicKeywords),
    createdAt: normalizeText(session.createdAt || '', 80),
    lastUsedAt: normalizeText(session.lastUsedAt || '', 80)
  };
}

function createDocumentSession({ fileName, fileType, documentType, safeSummary, publicKeywords }) {
  return {
    documentSessionId: `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    fileName: normalizeText(fileName || '업로드 문서', 160),
    fileType: normalizeText(fileType || '', 120),
    documentType: normalizeText(documentType || '문서/사진', 80),
    safeSummary: normalizeText(safeSummary || '', 1800),
    publicKeywords: sanitizePublicKeywords(publicKeywords),
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString()
  };
}

function classifyDocumentAnswerBasis({ question, documentSession, hasUploadedFile }) {
  const q = normalizeText(question, 1000);
  const summary = normalizeText(documentSession?.safeSummary || '', 1800);
  const keywords = sanitizePublicKeywords(documentSession?.publicKeywords);
  const hasDocumentContext = Boolean(summary && !WEAK_SUMMARY_PATTERN.test(summary));
  const asksPublicContext = PUBLIC_TRIGGER_PATTERN.test(q);
  const asksInternal = INTERNAL_QUESTION_PATTERN.test(q);
  const hasRelevantKeyword = keywords.some((keyword) => q.includes(keyword) || keyword.includes(q));

  let basis = ANSWER_BASIS.DOCUMENT_MISSING;
  if (hasDocumentContext && (asksInternal || hasRelevantKeyword || hasUploadedFile)) {
    basis = asksPublicContext && !asksInternal ? ANSWER_BASIS.DOCUMENT_PARTIAL : ANSWER_BASIS.DOCUMENT_SUPPORTED;
  } else if (hasDocumentContext) {
    basis = asksPublicContext ? ANSWER_BASIS.DOCUMENT_PARTIAL : ANSWER_BASIS.DOCUMENT_PARTIAL;
  }

  const strongPublicContext = STRONG_PUBLIC_TRIGGER_PATTERN.test(q);
  const publicSupplementNeeded = (asksPublicContext && !(asksInternal && hasDocumentContext && !strongPublicContext))
    || !hasDocumentContext
    || basis === ANSWER_BASIS.DOCUMENT_PARTIAL
    || basis === ANSWER_BASIS.DOCUMENT_MISSING;

  return {
    answerBasis: publicSupplementNeeded ? ANSWER_BASIS.PUBLIC_SUPPLEMENT_NEEDED : basis,
    documentBasis: basis,
    publicSupplementNeeded,
    reason: publicSupplementNeeded
      ? '문서 요약만으로 확정하기 어렵거나 공개 절차/주의사항 확인이 필요한 질문입니다.'
      : '문서 세션 요약만으로 답할 수 있는 문서 내부 질문입니다.'
  };
}

function buildSafePublicSearchQuery({ question, documentSession, fallbackTerms = [] }) {
  const keywords = sanitizePublicKeywords(documentSession?.publicKeywords);
  const terms = [...keywords, ...sanitizePublicKeywords(fallbackTerms)];
  const safeQuestionTerms = sanitizePublicKeyword(question)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && token.length <= 20)
    .filter((token) => PUBLIC_TRIGGER_PATTERN.test(token))
    .slice(0, 4);

  const unique = [];
  const seen = new Set();
  for (const term of [...terms, ...safeQuestionTerms, '공식', '절차', '주의사항']) {
    const safe = sanitizePublicKeyword(term);
    if (!safe || seen.has(safe)) continue;
    seen.add(safe);
    unique.push(safe);
    if (unique.length >= 7) break;
  }
  return unique.join(' ').slice(0, 140);
}

module.exports = {
  ANSWER_BASIS,
  buildSafePublicSearchQuery,
  classifyDocumentAnswerBasis,
  createDocumentSession,
  normalizeDocumentSession,
  sanitizePublicKeywords
};
