const MODEL = 'claude-sonnet-4-20250514';
const MINI_SCOPE = '<svg width="10" height="10" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="14" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/><circle cx="32" cy="32" r="5" fill="#fff"/><line x1="32" y1="6" x2="32" y2="18" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="32" y1="46" x2="32" y2="58" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="6" y1="32" x2="18" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="46" y1="32" x2="58" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/></svg>';

let pendingImg = null;
let loading = false;
let isSearchMode = false;
let searchHistory = [];
let currentQuery = '';
let searchMode = 'thisone';
let _lastIntentProfile = null; // 최근 의도 추론 결과 캐시

const RANKING_PROMPT = `당신은 ThisOne 구매결정 AI입니다.
절대 <cite>, </cite>, <b>, </b> 같은 태그를 출력하지 마세요.
반드시 제공된 후보 상품 목록 안에서만 고르세요.
후보 목록에 없는 상품을 새로 만들지 마세요.
반드시 JSON만 출력하세요.

규칙:
- AI추천은 반드시 아래 4개 후보(가격순, 리뷰순, 인기순, 신뢰순) 중 하나를 선택해야 합니다.
- 즉 aiPickSourceType은 price / review / popular / trust 중 하나여야 합니다.
- sourceId는 반드시 후보 상품 목록의 id를 그대로 써야 합니다.
- cards 4개는 가능하면 서로 다른 sourceId를 사용하세요.
- 동일 상품 중복은 후보가 부족한 경우에만 허용하세요.
- excludeFromPriceRank가 true인 후보는 "price" 카드와 AI추천 후보에서 절대 선택하지 마세요.
- badges에 "옵션가 주의"가 있으면 price 카드로 선택하지 마세요.
- priceRiskReason이 있으면 반드시 참고하세요.
- totalPriceNum과 shippingKnown을 참고해서 가격 판단 시 대표가가 아니라 총지불액 기준으로 보수적으로 판단하세요.
- review/popular/trust 카드는 필요하면 선택 가능하지만, 동일 조건이면 excludeFromPriceRank가 false인 후보를 우선하세요.
- bonusScore, specPenalty, finalScore를 모두 참고하세요.

출력 형식:
{
  "aiPickSourceType": "price",
  "cards": [
    {"type":"price","label":"가격순","sourceId":"1","reason":"실구매가 기준 가장 유리"},
    {"type":"review","label":"리뷰순","sourceId":"2","reason":"평점과 리뷰 반응이 가장 좋음"},
    {"type":"popular","label":"인기순","sourceId":"3","reason":"판매량과 관심도가 높음"},
    {"type":"trust","label":"신뢰순","sourceId":"4","reason":"브랜드·판매처 안정성이 좋음"}
  ],
  "rejects": [
    {"name":"제외상품명","reason":"제외 이유"}
  ]
}`;

function getInput() {
  return document.getElementById(isSearchMode ? 'msgInput2' : 'msgInput');
}

function getSendBtn() {
  return document.getElementById(isSearchMode ? 'sendBtn2' : 'sendBtn');
}

function goHome() {
  isSearchMode = false;

  const landing = document.getElementById('landing');
  const stickySearch = document.getElementById('stickySearch');
  const content = document.getElementById('content');

  if (landing) landing.style.display = '';
  if (stickySearch) stickySearch.style.display = 'none';
  if (content) {
    content.style.display = 'none';
    content.innerHTML = '';
  }
}

function switchToSearchMode() {
  if (isSearchMode) return;
  isSearchMode = true;

  const landing = document.getElementById('landing');
  const stickySearch = document.getElementById('stickySearch');
  const content = document.getElementById('content');

  if (landing) landing.style.display = 'none';
  if (stickySearch) stickySearch.style.display = 'block';
  if (content) content.style.display = 'block';
}

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMsg();
  }
}

function quick(t) {
  currentQuery = t;
  syncQueryInputs(t);
  setSearchMode('thisone');
  sendMsg();
}

function handleImg(e) {
  const file = e.target.files[0];
  if (!file) return;

  const r = new FileReader();
  r.onload = (ev) => {
    pendingImg = {
      data: ev.target.result.split(',')[1],
      src: ev.target.result
    };

    ['', '2'].forEach((s) => {
      const el = document.getElementById('previewImg' + s);
      const nm = document.getElementById('previewName' + s);
      const pv = document.getElementById('imgPreview' + s);

      if (el) el.src = ev.target.result;
      if (nm) nm.textContent = file.name;
      if (pv) pv.classList.add('show');
    });
  };

  r.readAsDataURL(file);
  e.target.value = '';
}

function removeImg() {
  pendingImg = null;
  ['', '2'].forEach((s) => {
    const pv = document.getElementById('imgPreview' + s);
    if (pv) pv.classList.remove('show');
  });
}

function stripCitations(text) {
  return String(text || '')
    .replace(/<cite\b[^>]*>/gi, '')
    .replace(/<\/cite>/gi, '')
    .replace(/<b>/gi, '')
    .replace(/<\/b>/gi, '')
    .trim();
}

function deepClean(value) {
  if (typeof value === 'string') return stripCitations(value);
  if (Array.isArray(value)) return value.map(deepClean);

  if (value && typeof value === 'object') {
    const out = {};
    for (const key in value) {
      out[key] = deepClean(value[key]);
    }
    return out;
  }

  return value;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function syncQueryInputs(value) {
  ['msgInput', 'msgInput2'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = value;
      autoResize(el);
    }
  });
}

function setSearchMode(mode) {
  searchMode = mode;

  const rawBtn = document.getElementById('rawSearchBtn');
  const thisoneBtn = document.getElementById('thisoneSearchBtn');

  if (rawBtn) rawBtn.classList.toggle('active', mode === 'raw');
  if (thisoneBtn) thisoneBtn.classList.toggle('active', mode === 'thisone');
}

async function sendMsg(forceMode) {
  if (loading) return;

  if (forceMode === 'raw' || forceMode === 'thisone') {
    setSearchMode(forceMode);
  }

  const inp = getInput();
  if (!inp) {
    console.error('input element not found');
    return;
  }

  const txt = inp.value.trim();

  if (txt) currentQuery = txt;
  if (!currentQuery && !pendingImg) return;

  if (!isSearchMode) {
    searchHistory = [];
  }
  switchToSearchMode();

  const contentEl = document.getElementById('content');
  if (contentEl) contentEl.innerHTML = '';

  if (txt) searchHistory.push(txt);

  syncQueryInputs(currentQuery);

  if (window.ThisOneUI?.renderHistoryBar) {
    window.ThisOneUI.renderHistoryBar();
  }

  const queryText = currentQuery || '이미지 기반 상품 검색';

  // ── 궤적 로거: 검색어 기록 ─────────────────────────────────────
  if (window.ThisOneTrajectory) {
    window.ThisOneTrajectory.recordQuery(queryText);
  }

  removeImg();

  loading = true;
  const btn = getSendBtn();
  if (btn) btn.disabled = true;

  const typingEl = window.ThisOneUI?.addTyping ? window.ThisOneUI.addTyping() : null;

  try {
    let searchQuery = queryText;

    if (window.ThisOneRanking && typeof window.ThisOneRanking.rewriteSearchQuery === 'function') {
      searchQuery = window.ThisOneRanking.rewriteSearchQuery(queryText);
    }

    const searchData = await window.ThisOneAPI.requestSearch(searchQuery);
    const items = searchData?.items || [];

    const candidates = window.ThisOneRanking?.buildCandidates
      ? window.ThisOneRanking.buildCandidates(items, queryText)
      : items;

    if (!candidates || !candidates.length) {
      typingEl?.remove();
      window.ThisOneUI?.addFallback?.('검색 결과가 없습니다.');
      return;
    }

    if (searchMode === 'raw') {
      typingEl?.remove();

      if (window.ThisOneUI?.renderRawResults) {
        window.ThisOneUI.renderRawResults(candidates);
      } else {
        window.ThisOneUI?.addFallback?.('원본 검색 결과 렌더 함수(renderRawResults)가 없습니다.');
      }
      return;
    }

    const prunedCandidates = candidates.map(c => ({
      id: c.id,
      name: c.name,
      price: c.price,
      store: c.store,
      review: c.review,
      badges: c.badges,
      bonusScore: c.bonusScore,
      specPenalty: c.specPenalty,
      finalScore: c.finalScore,
      totalPriceNum: c.totalPriceNum
    }));

    // ── 의도 추론: 궤적 기반 intentProfile 요청 ──────────────────
    let intentProfile = null;
    if (window.ThisOneTrajectory && window.ThisOneAPI) {
      try {
        const trajectory = window.ThisOneTrajectory.getSession();
        // 검색어가 2개 이상일 때만 서버 추론 (첫 검색은 로컬 힌트로)
        if (trajectory.queries.length >= 2) {
          intentProfile = await window.ThisOneAPI.requestIntentInfer(queryText, trajectory);
        } else {
          intentProfile = window.ThisOneTrajectory.getLocalIntentHint();
        }
        _lastIntentProfile = intentProfile;
      } catch (_) {
        intentProfile = window.ThisOneTrajectory?.getLocalIntentHint() || null;
      }
    }

    // intentProfile을 ranking에 전달 (랭킹 가중치 조정)
    if (intentProfile && window.ThisOneRanking?.setIntentProfile) {
      window.ThisOneRanking.setIntentProfile(intentProfile);
    }

    const aiData = await window.ThisOneAPI.requestChat({
      model: MODEL,
      max_tokens: 1400,
      system: RANKING_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `사용자 질문:
${queryText}

후보 상품 목록(JSON):
${JSON.stringify(prunedCandidates, null, 2)}

사용자 의도 분석:
${intentProfile ? `의도 태그: ${intentProfile.intentTag} (신뢰도 ${((intentProfile.confidence || 0) * 100).toFixed(0)}%)` : '분석 없음'}

지시:
- 반드시 후보 상품 목록 안에서만 선택하세요.
- cards 배열로만 답하세요.
- 허용 카드 type: "price", "review", "popular", "trust"
- 각 카드의 sourceId는 반드시 후보 상품의 id를 그대로 사용하세요.
- aiPickSourceType은 반드시 "price", "review", "popular", "trust" 중 하나만 사용하세요.
- cards 4개는 가능하면 서로 다른 sourceId를 사용하세요.
- bonusScore, specPenalty, finalScore를 꼭 참고하세요.
- excludeFromPriceRank가 true인 후보는 "price" 카드와 AI추천에서 절대 선택하지 마세요.
- badges에 "옵션가 주의"가 있으면 price 카드로 선택하지 마세요.
- priceRiskReason이 있으면 반드시 참고하세요.
- totalPriceNum을 참고하여 가격 판단은 대표가보다 실구매 총액 기준으로 보수적으로 판단하세요.
- AI추천은 finalScore가 높은 후보를 우선 고려하세요.
- 사용자 의도가 price_focus이면 price 카드를 aiPickSourceType으로 우선 고려하세요.
- name, price, store, image, link는 직접 생성하지 말고 sourceId로 연결만 하세요.
- JSON만 출력하세요.`
            }
          ]
        }
      ]
    });

    typingEl?.remove();

    if (aiData?.error) {
  const errCode =
    typeof aiData.error === 'string'
      ? aiData.error
      : JSON.stringify(aiData.error);

  const isBusy = errCode === 'AI_SERVER_BUSY' || errCode === 'AI_TIMEOUT';

  if (isBusy) {
    window.ThisOneUI?.addFallback?.('AI 분석 서버가 혼잡하여 빠른 추천 결과로 대신 보여줍니다.');

    if (window.ThisOneUI?.renderRawResults) {
      window.ThisOneUI.renderRawResults(candidates);
    }

    return;
  }

  window.ThisOneUI?.addFallback?.('API 오류: ' + (aiData.detail || errCode));
  return;
}

    const raw = Array.isArray(aiData?.content)
      ? aiData.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('')
      : '';

    try {
      let clean = raw.replace(/```json|```/g, '').trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) clean = jsonMatch[0];

      const parsed = JSON.parse(clean);
      const cleaned = deepClean(parsed);

      const merged = window.ThisOneRanking?.mergeAiWithCandidates
        ? window.ThisOneRanking.mergeAiWithCandidates(cleaned, candidates)
        : cleaned;

      window.ThisOneUI?.addResultCard?.(merged);
    } catch (e) {
      console.error('AI parse error:', e);
      window.ThisOneUI?.addFallback?.(raw || '응답을 파싱할 수 없습니다.');
    }
  } catch (err) {
  console.error('search error:', err);
  typingEl?.remove();

  const msg = String(err?.message || '');
  const isAiBusy = /503|Service Unavailable|high demand|overloaded/i.test(msg);

  if (isAiBusy) {
    window.ThisOneUI?.addFallback?.('AI 분석 서버가 혼잡해서 원본 후보 결과로 대신 보여줍니다.');

    if (window.ThisOneUI?.renderRawResults) {
      window.ThisOneUI.renderRawResults(candidates);
    } else {
      window.ThisOneUI?.addFallback?.('원본 결과 렌더 함수가 없습니다.');
    }
  } else {
    let displayMsg = msg;
    try {
      // JSON 형태의 에러인 경우 파싱 시도
      const parsedErr = JSON.parse(msg);
      if (parsedErr.detail) displayMsg = parsedErr.detail;
      else if (parsedErr.error) displayMsg = parsedErr.error;
    } catch (e) {
      // JSON이 아니면 그대로 사용
    }
    window.ThisOneUI?.addFallback?.('검색 중 오류: ' + displayMsg);
  }
} finally {
    loading = false;
    const btn2 = getSendBtn();
    if (btn2) btn2.disabled = false;
    getInput()?.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('thisoneSearchBtn')?.addEventListener('click', () => {
    setSearchMode('thisone');
    sendMsg('thisone');
  });

  document.getElementById('rawSearchBtn')?.addEventListener('click', () => {
    setSearchMode('raw');
    sendMsg('raw');
  });
});
