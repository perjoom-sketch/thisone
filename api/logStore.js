/**
 * api/logStore.js
 * 사용자 검색 궤적 데이터를 Vercel KV에 저장하는 엔드포인트.
 *
 * POST /api/logStore
 * Body: { session: { sessionId, queries[], dwellTimes[], clickEvents[], refinements, durationMs } }
 *
 * 저장 구조 (Vercel KV):
 *   Key:  "session:{sessionId}"
 *   Value: 궤적 JSON (익명화)
 *   TTL:  7일 (604800초) 자동 만료
 *
 * 추가 인덱스:
 *   Key:  "sessions:list"  (LPUSH — 최근 세션 ID 목록, 최대 1000개)
 *
 * ※ Beacon API는 Content-Type을 text/plain으로 보낼 수 있어
 *   raw body 파싱 처리를 포함합니다.
 */

const { kv } = require('@vercel/kv');

const SESSION_TTL = 60 * 60 * 24 * 7; // 7일
const MAX_SESSIONS_LIST = 1000;

// ─── Body 파싱 헬퍼 (Beacon 대응) ─────────────────────────────────
async function parseBody(req) {
  // Vercel은 보통 req.body를 자동 파싱하지만
  // Beacon API가 보내는 Blob은 text/plain으로 오는 경우가 있음
  if (req.body && typeof req.body === 'object') return req.body;

  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch (_) { reject(new Error('Body 파싱 실패')); }
    });
    req.on('error', reject);
  });
}

// ─── 데이터 검증 ───────────────────────────────────────────────────
function validateSession(session) {
  if (!session || typeof session !== 'object') return false;
  if (!session.sessionId || typeof session.sessionId !== 'string') return false;
  if (!Array.isArray(session.queries) || session.queries.length === 0) return false;
  return true;
}

// ─── 익명화: 민감 데이터 제거 ─────────────────────────────────────
function sanitize(session) {
  return {
    sessionId:    session.sessionId,
    startedAt:    session.startedAt || Date.now(),
    savedAt:      Date.now(),
    queries:      (session.queries || []).map(q => String(q).slice(0, 200)),
    dwellTimes:   (session.dwellTimes || []).map(Number),
    clickEvents:  session.clickEvents || [],
    decisionLogs: session.decisionLogs || [], // 신규: 상세 결정 로그
    refinements:  Number(session.refinements) || 0,
    durationMs:   Number(session.durationMs) || 0,
  };
}

// ─── [Simulation] 실구매가(EMP) 편차 계산 ──────────────────────────
function simulateValidation(decisionLogs) {
  if (!decisionLogs || decisionLogs.length === 0) return null;

  console.log('--- [Validation Simulation] 시작 ---');
  decisionLogs.forEach(log => {
    const price = Number(log.price);
    if (!price) return;

    // 가상의 기준가 (나중에 DB/Baseline 연동)
    // 여기서는 간단히 100만원 이상 가전은 20% 오차, 이하는 10% 오차 시뮬레이션
    let expectedMin = price * 0.9;
    let expectedMax = price * 1.1;

    console.log(`[Item] ${log.productName}`);
    console.log(`[Clicked Price] ${price.toLocaleString()}원`);
    console.log(`[Category] ${log.category}`);
    
    // 편차 계산 (실제로는 누적된 데이터를 기반으로 하겠지만, 여기선 시뮬레이션 로그만 출력)
    const deviation = 0; // 초기값
    console.log(`[EMP Deviation] 0% (최초 수집 데이터)`);
  });
  console.log('--- [Validation Simulation] 종료 ---');
}

// ─── 핸들러 ────────────────────────────────────────────────────────
async function handler(req, res) {
  // Beacon API는 CORS 필요
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    console.error('[logStore] Body 파싱 오류:', err.message);
    return res.status(400).json({ error: '잘못된 요청 형식' });
  }

  const { session } = body || {};

  if (!validateSession(session)) {
    return res.status(400).json({ error: '유효하지 않은 세션 데이터' });
  }

    const clean = sanitize(session);
    const key = `session:${clean.sessionId}`;

    // [Simulation] 로그 수집 즉시 검증 시뮬레이션 수행
    simulateValidation(clean.decisionLogs);

    try {
    // 1) 세션 데이터 저장 (TTL 7일)
    await kv.set(key, clean, { ex: SESSION_TTL });

    // 2) 세션 ID를 최근 목록에 추가 (List 앞쪽에 push)
    await kv.lpush('sessions:list', clean.sessionId);

    // 3) 목록 크기 유지 (오래된 세션 ID 자동 제거)
    await kv.ltrim('sessions:list', 0, MAX_SESSIONS_LIST - 1);

    console.log(`[logStore] 저장 완료: ${key} (쿼리 ${clean.queries.length}개)`);
    return res.status(200).json({ ok: true, sessionId: clean.sessionId });

  } catch (err) {
    console.error('[logStore] KV 저장 오류:', err.message);
    // KV 오류는 사용자 경험에 영향 없이 무시 처리
    return res.status(200).json({ ok: false, error: 'KV 저장 실패 (무시됨)' });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 10 };
