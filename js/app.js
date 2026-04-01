const MODEL = 'claude-sonnet-4-20250514';
const MINI_SCOPE = '<svg width="10" height="10" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="14" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/><circle cx="32" cy="32" r="5" fill="#fff"/><line x1="32" y1="6" x2="32" y2="18" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="32" y1="46" x2="32" y2="58" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="6" y1="32" x2="18" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="46" y1="32" x2="58" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/></svg>';

let pendingImg = null;
let loading = false;
let isSearchMode = false;      // landing -> sticky search 전환 여부
let searchHistory = [];
let currentQuery = '';         // 마지막 검색어 유지
let searchMode = 'thisone';    // 'thisone' | 'raw'

const RANKING_PROMPT = `당신은 ThisOne 구매결정 AI입니다.
절대 <cite>, </cite>, <b>, </b> 같은 태그를 출력하지 마세요.
반드시 제공된 후보 상품 목록 안에서만 고르세요.
후보 목록에 없는 상품을 새로 만들지 마세요.
반드시 JSON만 출력하세요.

규칙:
- AI추천은 반드시 아래 4개 후보(가격순, 리뷰순, 인기순, 신뢰순) 중 하나를 선택해야 합니다.
- 즉 aiPickSourceType은 price / review / popular / trust 중 하나여야 합니다.
- sourceId는 반드시 후보 상품 목록의 id를 그대로 써야 합니다.
- 같은 상품이 여러 항목에 중복되어도 됩니다.
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
  document.getElementById('landing').style.display = '';
  document.getElementById('stickySearch').style.display = 'none';
  document.getElementById('content').style.display = 'none';
  document.getElementById('content').innerHTML = '';
}

function switchToSearchMode() {
  if (isSearchMode) return;
  isSearchMode = true;
  document.getElementById('landing').style.display = 'none';
  document.getElementById('stickySearch').style.display = 'block';
  document.getElementById('content').style.display = 'block';
}

function autoResize(el) {
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
    .replace(/<cite\\b[^>]*>/gi, '')
    .replace(/<\\/cite>/gi, '')
    .replace(/<b>/gi, '')
    .replace(/<\\/b>/gi, '')
    .trim();
}

function deepClean(value) {
  if (typeof value === 'string') return stripCitations(value);
  if (Array.isArray(value)) return value.map(deepClean);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key in value) out[key] = deepClean(value[key]);
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
  const txt = inp.value.trim();

  // 새로 입력한 값이 있으면 currentQuery 갱신
  if (txt) currentQuery = txt;

  if (!currentQuery && !pendingImg) return;

  switchToSearchMode();
  document.getElementById('content').innerHTML = '';

  if (txt) searchHistory.push(txt);

  syncQueryInputs(currentQuery);

  if (window.ThisOneUI?.renderHistoryBar) {
    window.ThisOneUI.renderHistoryBar();
  }

  if (window.ThisOneUI?.addUserMsg) {
    window.ThisOneUI.addUserMsg(currentQuery || '📷 이미지로 검색', pendingImg?.src);
  }

  const queryText = currentQuery || '이미지 기반 상품 검색';
  const searchQuery = window.ThisOneRanking.rewriteSearchQuery(queryText);

  // 핵심: 검색 후 입력창을 비우지 않음
  removeImg();

  loading = true;
  getSendBtn().disabled = true;
  const typingEl = window.ThisOneUI?.addTyping ? window.ThisOneUI.addTyping() : null;

  try {
    const searchData = await window.ThisOneAPI.requestSearch(searchQuery);
    const candidates = window.ThisOneRanking.buildCandidates(searchData.items || [], queryText);

    if (!candidates.length) {
      typingEl?.remove();
      window.ThisOneUI.addFallback('검색 결과가 없습니다.');
      loading = false;
      getSendBtn().disabled = false;
      getInput().focus();
      return;
    }

    // 원본 검색 모드: AI 분석 없이 원본 렌더
    if (searchMode === 'raw') {
      typingEl?.remove();

      if (window.ThisOneUI?.renderRawResults) {
        window.ThisOneUI.renderRawResults(candidates);
      } else {
        // ui.js에 renderRawResults 아직 없을 때 임시 fallback
        window.ThisOneUI.addFallback('원본 검색 결과 렌더 함수(renderRawResults)를 ui.js에 추가해야 합니다.');
      }

      loading = false;
      getSendBtn().disabled = false;
      getInput().focus();
      return;
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
${JSON.stringify(candidates, null, 2)}

지시:
- 반드시 후보 상품 목록 안에서만 선택하세요.
- cards 배열로만 답하세요.
- 허용 카드 type: "price", "review", "popular", "trust"
- 각 카드의 sourceId는 반드시 후보 상품의 id를 그대로 사용하세요.
- aiPickSourceType은 반드시 "price", "review", "popular", "trust" 중 하나만 사용하세요.
- bonusScore, specPenalty, finalScore를 꼭 참고하세요.
- excludeFromPriceRank가 true인 후보는 "price" 카드와 AI추천에서 절대 선택하지 마세요.
- badges에 "옵션가 주의"가 있으면 price 카드로 선택하지 마세요.
- priceRiskReason이 있으면 반드시 참고하세요.
- totalPriceNum을 참고하여 가격 판단은 대표가보다 실구매 총액 기준으로 보수적으로 판단하세요.
- AI추천은 finalScore가 높은 후보를 우선 고려하세요.
- name, price, store, image, link는 직접 생성하지 말고 sourceId로 연결만 하세요.
- JSON만 출력하세요.`
            }
          ]
        }
      ]
    });

    typingEl?.remove();

    if (aiData.error) {
      window.ThisOneUI.addFallback(
        'API 오류: ' + (typeof aiData.error === 'string' ? aiData.error : JSON.stringify(aiData.error))
      );
    } else {
      const raw = Array.isArray(aiData.content)
        ? aiData.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
        : '';

      try {
        let clean = raw.replace(/```json|```/g, '').trim();
        const jsonMatch = clean.match(/\\{[\\s\\S]*\\}/);
        if (jsonMatch) clean = jsonMatch[0];

        const parsed = JSON.parse(clean);
        const cleaned = deepClean(parsed);
        const merged = window.ThisOneRanking.mergeAiWithCandidates(cleaned, candidates);
        window.ThisOneUI.addResultCard(merged);
      } catch (e) {
        window.ThisOneUI.addFallback(raw || '응답을 파싱할 수 없습니다.');
      }
    }
  } catch (err) {
    typingEl?.remove();
    window.ThisOneUI.addFallback('검색 중 오류: ' + err.message);
  }

  loading = false;
  getSendBtn().disabled = false;
  getInput().focus();
}

// 선택: 버튼 id가 있으면 자동 연결
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
