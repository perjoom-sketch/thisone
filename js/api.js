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

async function requestChat(payload, onChunk) {
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
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      if (typeof onChunk === 'function') {
        onChunk(chunk, fullText);
      }
    }
  }

  return fullText; // 최종 텍스트 반환 (호출부에서 JSON 파싱)
}

/**
 * 사용자 검색 궤적과 이미지를 서버에 보내 의도를 추론한다.
 * @param {string} query - 현재 검색어
 * @param {object} trajectory - trajectoryLogger.getSession() 결과
 * @param {object} image - { data: 'base64...', src: '...' }
 * @returns {Promise<object|null>} intentProfile
 */
async function requestIntentInfer(query, trajectory, image = null) {
  try {
    return await safeFetchJson('/api/intentInfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, trajectory, image }),
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
