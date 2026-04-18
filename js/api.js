async function safeFetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(text || `HTTP ${res.status}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON 파싱 실패: ${text}`);
  }
}

async function requestSearch(query) {
  return await safeFetchJson(`/api/search?q=${encodeURIComponent(query)}`, {
    method: 'GET'
  });
}

async function requestChat(payload) {
  return await safeFetchJson('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/**
 * 사용자 검색 궤적을 서버에 보내 의도를 추론한다.
 * 실패 시 null을 반환 (앱 흐름 중단 없음).
 * @param {string} query - 현재 검색어
 * @param {object} trajectory - trajectoryLogger.getSession() 결과
 * @returns {Promise<object|null>} intentProfile
 */
async function requestIntentInfer(query, trajectory) {
  try {
    return await safeFetchJson('/api/intentInfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, trajectory }),
    });
  } catch (err) {
    console.warn('[api] intentInfer 실패 (무시):', err.message);
    return null;
  }
}

window.ThisOneAPI = {
  safeFetchJson,
  requestSearch,
  requestChat,
  requestIntentInfer,
};
