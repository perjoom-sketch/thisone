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
  }, 25000);
}

function parseRentalNumber(text) {
  return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
}

function enrichRentalCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const text = `${candidate.name || ''} ${candidate.store || ''} ${candidate.price || ''}`;
  const isRental = /렌탈|대여|구독|약정|월납/i.test(text);
  const monthlyMatch = text.match(/월\s*([0-9,]+)\s*원/i);
  const monthsMatch = text.match(/(\d+)\s*개월/i);
  const yearsMatch = text.match(/(\d+)\s*년\s*약정/i);
  const rentalMonthlyFee = monthlyMatch
    ? parseRentalNumber(monthlyMatch[1])
    : (isRental ? parseRentalNumber(candidate.price) : 0);
  const rentalMonths = monthsMatch
    ? parseInt(monthsMatch[1], 10)
    : (yearsMatch ? parseInt(yearsMatch[1], 10) * 12 : 0);
  const rentalTotalFee = rentalMonthlyFee > 0 && rentalMonths > 0
    ? rentalMonthlyFee * rentalMonths
    : 0;

  return {
    ...candidate,
    isRental,
    rentalMonthlyFee,
    rentalMonths,
    rentalTotalFee
  };
}

function enrichRentalCandidatesInPayload(payload) {
  try {
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const clonedMessages = messages.map((message) => {
      const content = Array.isArray(message?.content) ? message.content : [];
      const nextContent = content.map((part) => {
        if (part?.type !== 'text' || typeof part.text !== 'string') return part;

        const marker = '후보 상품 목록(JSON):';
        const start = part.text.indexOf(marker);
        if (start === -1) return part;

        const jsonStart = part.text.indexOf('[', start);
        const jsonEndMarker = '\n\n의도분석:';
        const jsonEnd = part.text.indexOf(jsonEndMarker, jsonStart);
        if (jsonStart === -1 || jsonEnd === -1) return part;

        const before = part.text.slice(0, jsonStart);
        const jsonText = part.text.slice(jsonStart, jsonEnd);
        const after = part.text.slice(jsonEnd);
        let parsed;
        try {
          parsed = JSON.parse(jsonText);
        } catch (e) {
          return part;
        }

        if (!Array.isArray(parsed)) return part;
        const enriched = parsed.map(enrichRentalCandidate);
        return {
          ...part,
          text: `${before}${JSON.stringify(enriched, null, 2)}${after}`
        };
      });
      return { ...message, content: nextContent };
    });
    return { ...payload, messages: clonedMessages };
  } catch (e) {
    console.warn('[api] rental candidate enrichment skipped:', e.message);
    return payload;
  }
}

function applyRentalReasoningInstruction(payload) {
  const rentalInstruction = `

[렌탈/관리형 상품 판단 원칙]
- 렌탈 상품을 무조건 제외하거나 무조건 뒤로 보내지 마세요.
- 렌탈 상품의 가격은 구매가가 아니라 월 납입액일 수 있습니다.
- 후보에 isRental, rentalMonthlyFee, rentalMonths, rentalTotalFee가 있으면 반드시 이를 읽고 판단하세요.
- rentalMonthlyFee는 월 납입액, rentalMonths는 약정 개월, rentalTotalFee는 전체 납부 예상액입니다.
- 월 납입액만 보고 저렴하다고 판단하지 말고, 총 납부액과 약정기간을 함께 보세요.
- 관리/AS/방문관리/초기비용 부담 감소가 중요한 품목은 렌탈도 합리적인 선택일 수 있습니다.
- 반대로 총 납부액이 구매가보다 지나치게 높거나 약정 부담이 크면 감점하세요.
- 사용자가 렌탈제외를 켰다면 서버에서 이미 제거됩니다. 남아 있는 렌탈 후보는 비교 가능한 후보로 다루세요.
- 추천 이유에는 렌탈이면 월 납입액과 총 납부액 관점을 명확히 설명하세요.

[정수기 판단 원칙]
- 정수기 카테고리에서는 렌탈/방문관리형이 실제 이용 흐름에서 상위권의 주류 선택지입니다.
- 사용자가 단순히 “정수기”라고 검색했다면 기본 의도는 단순 최저가 본체가 아니라 깨끗한 물을 안정적으로 마시고 관리 부담을 줄이는 것입니다.
- 따라서 단순 “정수기” 검색에서는 렌탈/방문관리/관리형 후보를 주변 옵션이 아니라 핵심 비교 후보로 다루세요.
- 정수기에서는 필터 교체, 방문관리, AS, 위생관리, 관리 번거로움 감소가 핵심 가치입니다.
- “자가관리”, “셀프관리”, “자가설치”, “필터 직접 교체” 상품은 저렴하더라도 기본 정수기 추천에서 1순위로 올리지 마세요.
- 단, 사용자가 직접 “자가관리 정수기”, “셀프관리 정수기”, “무전원 정수기”, “저렴한 정수기”처럼 명시했다면 자가관리 상품도 우선 후보가 될 수 있습니다.
- “렌탈”, “방문관리”, “관리형”, “필터교체”, “AS포함”, “코디관리” 문구가 있는 후보는 관리 편의성 관점에서 적극 비교하세요.
- 정수기 추천 이유에는 가격뿐 아니라 필터 교체 방식과 관리 부담을 반드시 언급하세요.`;

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

  payload = enrichRentalCandidatesInPayload(payload);
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
