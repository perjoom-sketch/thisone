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

window.ThisOneAPI = {
  safeFetchJson,
  requestSearch,
  requestChat
};
