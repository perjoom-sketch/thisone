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

async function requestSearch(query, settings = {}, start = 1, display = 30, sort = 'sim') {
  const params = new URLSearchParams({ q: query, ...settings, start, display, sort });
  return await safeFetchJson(`/api/search?${params.toString()}`, {
    method: 'GET'
  });
}

function applyRentalReasoningInstruction(payload) {
  const rentalInstruction = `

[렌탈 상품 판단 원칙]
- 렌탈 상품을 무조건 제외하거나 무조건 뒤로 보내지 마세요.
- 렌탈 상품의 가격은 구매가가 아니라 월 납입액일 수 있습니다.
- 후보에 isRental, rentalMonthlyFee, rentalMonths, rentalTotalFee가 있으면 반드시 이를 읽고 판단하세요.
- rentalMonthlyFee는 월 납입액, rentalMonths는 약정 개월, rentalTotalFee는 전체 납부 예상액입니다.
- 월 납입액만 보고 저렴하다고 판단하지 말고, 총 납부액과 약정기간을 함께 보세요.
- 관리/AS/방문관리/초기비용 부담 감소가 중요한 품목은 렌탈도 합리적인 선택일 수 있습니다.
- 반대로 총 납부액이 구매가보다 지나치게 높거나 약정 부담이 크면 감점하세요.
- 사용자가 렌탈제외를 켰다면 서버에서 이미 제거됩니다. 남아 있는 렌탈 후보는 비교 가능한 후보로 다루세요.
- 추천 이유에는 렌탈이면 월 납입액과 총 납부액 관점을 명확히 설명하세요.`;

  return {
    ...payload,
    system: `${payload.system || ''}${rentalInstruction}`
  };
}

async function requestChat(payload, onChunk) {
  // [보안/방어] 모델명이 누락된 경우 기본값 강제 할당 (503 에러 방지)
  if (!payload.model || payload.model === 'undefined') {
    payload.model = 'gemini-2.5-flash';
  }

  payload = applyRentalReasoningInstruction(payload);

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
    const timeout = image ? 30000 : 12000; // 이미지가 있으면 30초, 없으면 12초
    return await safeFetchJson('/api/intentInfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, trajectory, image }),
    }, timeout);
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
