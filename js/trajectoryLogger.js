/**
 * trajectoryLogger.js
 * 사용자 검색 궤적(Trajectory)을 수집하는 모듈.
 *
 * 수집 데이터:
 *   - queries[]:      사용자가 입력한 검색어 순서
 *   - dwellTimes[]:   각 검색어에서 다음 검색어까지 걸린 시간(ms)
 *   - clickEvents[]:  각 검색 결과에서 클릭한 상품 ID (없으면 null)
 *   - refinements:    검색어 수정 횟수
 *
 * 세션이 끝날 때(페이지 언로드 또는 명시적 flush)
 * /api/logStore 에 비동기 전송 (Beacon API 우선, fetch 폴백).
 */

(function () {
  'use strict';

  // ─── 내부 상태 ───────────────────────────────────────────────────
  let _session = _initSession();
  let _lastQueryTime = Date.now();

  function _initSession() {
    return {
      sessionId: _genId(),
      startedAt: Date.now(),
      queries: [],
      dwellTimes: [],
      clickEvents: [],
      refinements: 0,
    };
  }

  function _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ─── 공개 API ────────────────────────────────────────────────────

  /**
   * 새 검색어를 기록한다.
   * @param {string} query - 사용자가 입력한 검색어
   */
  function recordQuery(query) {
    const now = Date.now();
    const dwell = _session.queries.length > 0 ? now - _lastQueryTime : 0;

    // 이전 검색어와 다를 때만 수정 횟수 증가
    const prev = _session.queries[_session.queries.length - 1];
    if (prev && prev !== query) {
      _session.refinements++;
    }

    _session.queries.push(query);
    _session.dwellTimes.push(dwell);
    _session.clickEvents.push(null); // 클릭 발생 전 기본값
    _lastQueryTime = now;

    _saveToSession();
  }

  /**
   * 특정 인덱스의 검색 결과에서 상품을 클릭했을 때 기록한다.
   * @param {string} productId - 클릭한 상품 ID
   * @param {number} [queryIndex] - 몇 번째 검색어의 결과인지 (기본: 마지막)
   */
  function recordClick(productId, queryIndex) {
    const idx =
      queryIndex !== undefined
        ? queryIndex
        : _session.clickEvents.length - 1;

    if (idx >= 0 && idx < _session.clickEvents.length) {
      _session.clickEvents[idx] = productId;
    }
    _saveToSession();
  }

  /**
   * 현재 세션의 스냅샷을 반환한다 (의도 추론에 사용).
   * @returns {object}
   */
  function getSession() {
    return {
      ..._session,
      durationMs: Date.now() - _session.startedAt,
    };
  }

  /**
   * 현재 세션을 기반으로 간단한 의도 힌트를 동기적으로 반환한다.
   * 서버 호출 없이 프론트에서 빠른 판단이 필요할 때 사용.
   *
   * intentTag:
   *   "spec_refine"  - 구체화 검색 (단어 추가 패턴)
   *   "price_focus"  - 가격 민감 (가격 키워드 등장)
   *   "brand_seek"   - 브랜드 지향 (브랜드명 패턴)
   *   "explore"      - 탐색 중 (수정 횟수 적음)
   *
   * @returns {{ intentTag: string, confidence: number, refinements: number }}
   */
  function getLocalIntentHint() {
    const q = _session.queries;
    const ref = _session.refinements;

    if (q.length < 2) {
      return { intentTag: 'explore', confidence: 0.5, refinements: ref };
    }

    const last = q[q.length - 1] || '';
    const first = q[0] || '';

    // 가격 키워드
    const priceKw = /가격|저렴|싼|최저|할인|원이하|만원|비교/;
    if (priceKw.test(last)) {
      return { intentTag: 'price_focus', confidence: 0.8, refinements: ref };
    }

    // 브랜드 패턴: 영문 대문자 혼합 단어 등장 (ex: "삼성", "LG", "Dyson")
    const brandKw = /[A-Z]{2,}|삼성|lg|애플|다이슨|필립스|보쉬|다이콘/i;
    if (brandKw.test(last) && !brandKw.test(first)) {
      return { intentTag: 'brand_seek', confidence: 0.75, refinements: ref };
    }

    // 구체화: 단어 수가 늘어났고 수정 횟수 ≥ 2
    const firstWords = first.trim().split(/\s+/).length;
    const lastWords = last.trim().split(/\s+/).length;
    if (ref >= 2 && lastWords > firstWords) {
      return { intentTag: 'spec_refine', confidence: 0.85, refinements: ref };
    }

    return { intentTag: 'explore', confidence: 0.6, refinements: ref };
  }

  /**
   * 세션 데이터를 /api/logStore 에 전송하고 세션을 초기화한다.
   * 페이지 언로드 시 자동 호출되며, 수동으로도 호출 가능.
   * @param {boolean} [andReset=false] - 전송 후 세션 초기화 여부
   */
  function flush(andReset = false) {
    const data = getSession();

    // 의미 있는 데이터가 없으면 전송 안 함
    if (data.queries.length === 0) return;

    const payload = JSON.stringify({ session: data });

    // Beacon API: 페이지 언로드 중에도 신뢰성 있는 전송
    const sent =
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/logStore', new Blob([payload], { type: 'application/json' }));

    // Beacon 실패 시 fetch 폴백 (keepalive로 언로드 대응)
    if (!sent) {
      fetch('/api/logStore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {/* 무시 */});
    }

    if (andReset) {
      _session = _initSession();
      _lastQueryTime = Date.now();
      _clearSession();
    }
  }

  // ─── sessionStorage 헬퍼 (탭 새로고침 대비) ───────────────────────
  const _SK = 'thisone_trajectory';

  function _saveToSession() {
    try {
      sessionStorage.setItem(_SK, JSON.stringify(_session));
    } catch (_) {/* 무시 */}
  }

  function _loadFromSession() {
    try {
      const raw = sessionStorage.getItem(_SK);
      if (raw) return JSON.parse(raw);
    } catch (_) {/* 무시 */}
    return null;
  }

  function _clearSession() {
    try { sessionStorage.removeItem(_SK); } catch (_) {/* 무시 */}
  }

  // ─── 초기화: sessionStorage 복원 ─────────────────────────────────
  (function _restore() {
    const saved = _loadFromSession();
    if (saved && saved.sessionId) {
      _session = saved;
      _lastQueryTime = Date.now();
    }
  })();

  // ─── 페이지 언로드 시 자동 flush ─────────────────────────────────
  window.addEventListener('pagehide', () => flush(false));

  // ─── 전역 노출 ────────────────────────────────────────────────────
  window.ThisOneTrajectory = {
    recordQuery,
    recordClick,
    getSession,
    getLocalIntentHint,
    flush,
  };
})();
