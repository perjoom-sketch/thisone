async function safeFetchJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || `HTTP ${res.status}`);
    }

    return JSON.parse(text);
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error(`요청 시간이 초과되었습니다. (${timeoutMs/1000}초)`);
    }
    throw e;
  }
}

function buildSearchParams(query, settings = {}, start = 1, display = 30, sort = 'sim') {
  return new URLSearchParams({ q: query, ...settings, start, display, sort });
}

async function requestSearch(query, settings = {}, start = 1, display = 30, sort = 'sim') {
  const params = buildSearchParams(query, settings, start, display, sort);
  return await safeFetchJson(`/api/search?${params.toString()}`, {
    method: 'GET'
  }, 55000);
}

async function requestSearchRaw(query, settings = {}, start = 1, display = 30, sort = 'sim') {
  const params = buildSearchParams(query, settings, start, display, sort);
  return await safeFetchJson(`/api/search/raw?${params.toString()}`, {
    method: 'GET'
  }, 20000);
}

async function requestSearchFull(query, settings = {}, start = 1, display = 30, sort = 'sim') {
  const params = buildSearchParams(query, settings, start, display, sort);
  return await safeFetchJson(`/api/search/full?${params.toString()}`, {
    method: 'GET'
  }, 55000);
}

function hasLiveImagePreview() {
  const selectors = [
    '#imgPreview.show',
    '.image-preview.show',
    '.upload-preview.show',
    '.search-image-preview.show',
    '.attached-image.show',
    '.image-chip.show',
    '.preview-image.show',
    '[data-image-preview].show',
    '[data-has-image="true"]'
  ];
  return selectors.some((selector) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function clearStalePendingImage(reason = 'unknown') {
  if (hasLiveImagePreview()) return false;
  try {
    if (typeof pendingImg !== 'undefined' && pendingImg) {
      pendingImg = null;
      console.debug('[ThisOne][image-state-reset]', `pendingImg cleared before Vision (${reason})`);
      return true;
    }
  } catch (e) {
    console.warn('[ThisOne][image-state-reset] pendingImg clear failed:', e.message);
  }
  return false;
}

function normalizeIntentImage(image) {
  if (!image) return null;
  if (image.data) return image;
  if (!hasLiveImagePreview()) {
    console.debug('[ThisOne][image-state-reset]', 'image payload ignored because no live image preview exists');
    return null;
  }
  return image;
}

async function requestChat(payload, onChunk) {
  // [보안/방어] 모델명이 누락된 경우 기본값 강제 할당 (503 에러 방지)
  if (!payload.model || payload.model === 'undefined') {
    payload.model = 'gemini-2.5-flash';
  }

  payload = window.rentalPolicy.enrichRentalCandidatesInPayload(payload);
  payload = window.rentalPolicy.applyRentalReasoningInstruction(payload);

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
    const cleanImage = normalizeIntentImage(image);
    const timeout = cleanImage ? 30000 : 12000; // 이미지가 있으면 30초, 없으면 12초
    return await safeFetchJson('/api/intentInfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, trajectory, image: cleanImage }),
    }, timeout);
  } catch (err) {
    console.warn('[api] intentInfer 실패 (무시):', err.message);
    return null;
  }
}


async function trackSearchEvent(payload) {
  try {
    const body = JSON.stringify(payload || {});

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/track', blob)) return Promise.resolve();
    }

    return fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  } catch (e) {
    return Promise.resolve();
  }
}

function installPreSendImageStateCapture() {
  if (window.__thisOneImageCapturePatchApplied) return;
  window.__thisOneImageCapturePatchApplied = true;

  const isSearchSubmitEvent = (event) => {
    if (event.type === 'keydown') {
      return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && event.which !== 229;
    }

    const target = event.target;
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('#sendBtn, .send-btn, .search-btn, .search-icon, button[aria-label*="검색"], [data-search-submit]');
  };

  const capture = (event) => {
    if (!isSearchSubmitEvent(event)) return;
    clearStalePendingImage(`capture:${event.type}`);
  };

  document.addEventListener('keydown', capture, true);
  document.addEventListener('click', capture, true);
  document.addEventListener('touchstart', capture, true);
}

function installStaleImageStatePatch() {
  if (typeof sendMsg !== 'function' || sendMsg.__imageStatePatchApplied) return;

  const originalSendMsg = sendMsg;
  const patchedSendMsg = function(...args) {
    clearStalePendingImage('sendMsg-wrapper');
    return originalSendMsg.apply(this, args);
  };
  patchedSendMsg.__imageStatePatchApplied = true;
  sendMsg = patchedSendMsg;
  window.sendMsg = patchedSendMsg;
}

window.addEventListener('load', () => {
  window.rentalPolicy.installManagedRentalRankingPatch();
  installPreSendImageStateCapture();
  installStaleImageStatePatch();
});

window.ThisOneAPI = {
  safeFetchJson,
  requestSearch,
  requestSearchRaw,
  requestSearchFull,
  requestChat,
  requestIntentInfer,
  trackSearchEvent,
};
