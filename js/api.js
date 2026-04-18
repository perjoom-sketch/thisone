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

async function requestSearch(query, settings = {}) {
  const params = new URLSearchParams({ q: query, ...settings });
  return await safeFetchJson(`/api/search?${params.toString()}`, {
    method: 'GET'
  });
}

async function requestChat(payload) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `HTTP ${res.status}`);
  }

  // 스트리밍 응답 읽기
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  let fullText = "";

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    if (value) {
      fullText += decoder.decode(value, { stream: true });
    }
  }

  try {
    // 백엔드에서 스트리밍으로 보낸 최종 JSON 파싱
    const parsed = JSON.parse(fullText);
    return parsed;
  } catch (e) {
    console.error("스트리밍 JSON 파싱 실패:", fullText);
    throw new Error("AI 응답 파싱 실패");
  }
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
