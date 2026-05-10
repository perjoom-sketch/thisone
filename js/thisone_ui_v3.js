// --- UI Constants (Defensive) ---
if (typeof window.MODEL === 'undefined') window.MODEL = 'gemini-2.5-flash';
if (typeof window.NOEL === 'undefined') window.NOEL = window.MODEL;
var MODEL = window.MODEL;
var NOEL = window.NOEL;
// index.html에서 이미 선언된 전역 상수를 사용합니다.

function getContentEl() {
  return document.getElementById('msgContainer');
}

function appendAndScroll(node) {
  try {
    const content = getContentEl();
    if (!content) return;
    content.appendChild(node);
    
    // 부드러운 스크롤 제거 (사용자 요청: 검색 후 강제 스크롤 방지)
    /*
    setTimeout(() => {
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
    */
  } catch(e) { console.warn("Render append failed", e); }
}


const ERROR_STATE_MESSAGES = {
  noResults: '조건을 바꿔서 다시 검색해볼까요?',
  aiDelay: '분석 중입니다. 일반 결과를 먼저 확인해주세요',
  apiFail: '잠시 후 다시 시도해주세요',
  imageFail: '이미지를 인식하지 못했어요. 텍스트로 검색해보세요'
};

function clearErrorState(target = 'results') {
  const selector = target === 'search' ? '.search-error-state' : '.result-error-state';
  document.querySelectorAll(selector).forEach((node) => node.remove());
}

function buildErrorStateNode(type, options = {}) {
  const message = options.message || ERROR_STATE_MESSAGES[type] || ERROR_STATE_MESSAGES.apiFail;
  const node = document.createElement('div');
  const location = options.location || (type === 'imageFail' ? 'search' : 'results');
  const variant = type === 'aiDelay' ? 'inline' : 'center';
  node.className = location === 'search'
    ? `search-error-state error-state error-state-${type}`
    : `result-error-state error-state error-state-${type} error-state-${variant}`;
  node.setAttribute('role', type === 'aiDelay' ? 'status' : 'alert');
  node.setAttribute('aria-live', 'polite');
  node.dataset.errorState = type;
  node.innerHTML = `
    <span class="error-state-icon" aria-hidden="true">${window.MINI_SCOPE || '✦'}</span>
    <span class="error-state-message">${esc(message)}</span>
  `;
  return node;
}

function addErrorState(type, options = {}) {
  const location = options.location || (type === 'imageFail' ? 'search' : 'results');
  clearErrorState(location);
  const node = buildErrorStateNode(type, { ...options, location });

  if (location === 'search') {
    const searchWrap = document.getElementById('landingSearch');
    if (!searchWrap) return null;
    searchWrap.insertAdjacentElement('afterend', node);
    return node;
  }

  const content = getContentEl();
  if (!content) return null;
  if (options.replace !== false) {
    content.innerHTML = '';
    appendAndScroll(node);
    return node;
  }

  const generalWrap = content.querySelector('.general-results-wrap');
  if (type === 'aiDelay' && generalWrap) {
    content.insertBefore(node, generalWrap);
  } else {
    appendAndScroll(node);
  }
  return node;
}

function showNotice(message, options = {}) {
  const text = String(message || '').trim();
  if (!text) return null;
  const root = document.body;
  if (!root) return null;
  let stack = document.getElementById('noticeStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'noticeStack';
    stack.className = 'notice-stack';
    root.appendChild(stack);
  }
  const node = document.createElement('div');
  node.className = `notice-toast notice-${options.tone || 'info'}`;
  node.setAttribute('role', 'status');
  node.textContent = text;
  stack.appendChild(node);
  const duration = Number(options.duration || 3200);
  window.setTimeout(() => node.remove(), duration);
  return node;
}

function renderHistoryBar() {
  if (!Array.isArray(searchHistory) || searchHistory.length < 2) return;

  const content = getContentEl();
  if (!content) return;

  const existing = document.getElementById('historyBar');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.className = 'history-bar';
  bar.id = 'historyBar';

  const uniqueHistory = [];
  const seen = new Set();
  // 뒤에서부터 중복 제거하여 최신 검색어 순서 유지
  for (let i = searchHistory.length - 1; i >= 0; i--) {
    const q = searchHistory[i];
    if (q && !seen.has(q)) {
      uniqueHistory.unshift(q);
      seen.add(q);
    }
  }

  uniqueHistory.slice(-5).forEach((q) => {
    // [보안/운영] '플라스틱 날개' 등 부적절하거나 교체된 구형 키워드 필터링
    if (q.includes('플라스틱 날개')) return;

    const c = document.createElement('div');
    c.className = 'history-chip';
    c.textContent = '🔍 ' + q;
    c.onclick = () => {
      if (typeof quick === 'function') {
        quick(q);
      } else {
        const inp = document.getElementById('msgInput2') || document.getElementById('msgInput');
        if (inp) {
          inp.value = q;
          if (typeof autoResize === 'function') autoResize(inp);
        }
        if (typeof currentQuery !== 'undefined') currentQuery = q;
        if (typeof sendMsg === 'function') sendMsg();
      }
    };
    bar.appendChild(c);
  });

  content.appendChild(bar);
}

function addUserMsg(txt, imgSrc) {
  const d = document.createElement('div');
  d.className = 'user-msg-wrap';
  d.innerHTML = `
    <div class="user-msg-label">🔍 검색</div>
    <div class="user-msg">
      ${imgSrc ? `<img src="${escAttr(imgSrc)}" style="max-width:160px;border-radius:8px;margin-bottom:8px;display:block;" alt="preview">` : ''}
      ${esc(txt)}
    </div>
  `;
  appendAndScroll(d);
}

function addFallback(txt, options = {}) {
  const message = typeof txt === 'string' ? txt.trim() : '';
  const normalized = message.replace(/\s+/g, ' ');
  const stateByMessage = [
    ['imageFail', /이미지|식별|인식/],
    ['noResults', /검색 결과가 없습니다|결과를 찾을 수 없습니다|결과 없음|0건/],
    ['apiFail', /오류|문제|실패|잠시 후|가져오는 중/]
  ].find(([, pattern]) => pattern.test(normalized));

  if (stateByMessage && !options.keepComment) {
    return addErrorState(stateByMessage[0], options);
  }

  const d = document.createElement('div');
  d.className = 'ai-result';
  const fallbackMessage = message || '잠시 후 다시 시도해주세요';
  let contentTxt = fallbackMessage;

  if (typeof stripCitations === 'function') {
    contentTxt = stripCitations(contentTxt);
  }

  const fmt = String(contentTxt)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  d.innerHTML = `
    <div class="ai-label">
      <div class="dot">${window.MINI_SCOPE || '✦'}</div>
      <span>안내</span>
    </div>
    <div class="error-state error-state-inline" role="status" aria-live="polite">
      <span class="error-state-icon" aria-hidden="true">${window.MINI_SCOPE || '✦'}</span>
      <span class="error-state-message">${fmt}</span>
    </div>
  `;
  appendAndScroll(d);
  return d;
}

function removeLegacyProgressUi(root = document) {
  const selectors = [
    '.live-response',
    '#liveResponse',
    '.typing',
    '.typing-text',
    '.thinking',
    '.thinking-card',
    '.progress-text'
  ];

  selectors.forEach((sel) => {
    root.querySelectorAll(sel).forEach((node) => node.remove());
  });
}

function addThinking() {
  removeLegacyProgressUi();

  const d = document.createElement('div');
  d.className = 'ai-result intelligence-mode';
  d.innerHTML = `
    <div class="status-line" id="thinkContainerV2">
      <span class="thinking-icon">✦</span>
      <span class="status-text" id="statusTextV2">디스원이 분석 중입니다...</span>
      <button type="button" class="fallback-inline-btn hidden" id="fallbackInlineBtn">일반 결과 먼저 보기</button>
    </div>
  `;
  appendAndScroll(d);

  const state = { lastThought: '' };
  const nativeRemove = d.remove.bind(d);

   d.updateThought = (msg) => {
    const next = String(msg || '').trim();
    state.lastThought = next;
    removeLegacyProgressUi(d);

    const status = d.querySelector('#statusTextV2');
    if (status && next) {
      status.textContent = next;
    }
  };

  d.updateLiveResponse = () => {
    // no-op: 본문 진행 텍스트 렌더링 금지
  };

  d.showFallbackButton = (callback) => {
    const btn = d.querySelector('#fallbackInlineBtn');
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof callback === 'function') callback();
    };
  };

  d.remove = () => {
    removeLegacyProgressUi();
    nativeRemove();
  };

  d.getLastThought = () => state.lastThought;

  return d;
}

function renderBadgeList(badges) {
  if (!Array.isArray(badges) || !badges.length) return '';

  return `
    <div class="pick-badges">
      ${badges.map((b) => `<span class="pick-mini-badge">${esc(b)}</span>`).join('')}
    </div>
  `;
}

function normalizeRawItem(p = {}) {
  const pick = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'string') {
        if (value.trim()) return value;
        continue;
      }
      if (typeof value === 'number') return String(value);
      const asString = String(value || '').trim();
      if (asString) return asString;
    }
    return '';
  };

  const formatPrice = (...values) => {
    const direct = pick(...values);
    if (!direct) return '가격 정보 없음';
    if (/원|₩|KRW/i.test(direct)) return direct;
    const onlyNum = Number(String(direct).replace(/[^0-9]/g, ''));
    if (!Number.isFinite(onlyNum) || onlyNum <= 0) return '가격 정보 없음';
    return `${onlyNum.toLocaleString('ko-KR')}원`;
  };

  return {
    name: pick(p.name, p.title, p.productName, '상품명 없음'),
    price: formatPrice(p.price, p.lprice, p.lowPrice, p.salePrice),
    store: pick(p.store, p.mallName, p.mall, p.seller, p.sellerName, p.shopName, '판매처 정보 없음'),
    delivery: pick(p.delivery, p.shipping, p.deliveryInfo, p.deliveryFeeText, p.shippingInfo, '배송 정보 확인 필요'),
    review: pick(p.review, p.reviewText, p.reviewCountText, p.ratingText),
    image: pick(p.image, p.imageUrl, p.thumbnail, p.thumbnailUrl),
    link: pick(p.link, p.productUrl, p.url, p.mallProductUrl, '#'),
    badges: Array.isArray(p.badges) ? p.badges : [],
    reason: p.reason || '',
    rankReason: p.rankReason || '',
    excludeFromPriceRank: !!p.excludeFromPriceRank
  };
}

function renderRawResults(items = [], total = 0, currentPage = 1, currentSort = 'sim', resultMode = 'normal') {
  const content = document.getElementById('msgContainer');
  if (!content) return;

  // 기존 일반 결과가 있다면 제거 (페이지 전환 시 교체)
  const existing = document.querySelector('.general-results-wrap');
  if (existing) existing.remove();

  const isFallbackGeneral = resultMode === 'fallback_general';
  const cardsHtml = (items || [])
    .map((item) => normalizeRawItem(item))
    .map((item, idx) => window.ThisOneResultCards?.renderPickCard?.(item, idx === 0, { hideRecommendationUi: isFallbackGeneral }) || '')
    .join('');

  const totalPages = Math.min(Math.ceil(total / 30), 10); // 최대 10페이지까지만 지원
  
  let paginationHtml = '';
  if (totalPages > 1) {
    paginationHtml = `
      <div class="pagination">
        <button class="page-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="window.changePage(${currentPage - 1})">이전</button>
        <span class="page-info">${currentPage} / ${totalPages}</span>
        <button class="page-btn" ${currentPage >= totalPages ? 'disabled' : ''} onclick="window.changePage(${currentPage + 1})">다음</button>
      </div>
    `;
  }

  const headerTitle = isFallbackGeneral
    ? `일반 검색 결과(디스원 AI 분석 아님) ${total > 0 ? `(총 ${total.toLocaleString()}개)` : ''}`
    : `일반 검색 결과 ${total > 0 ? `(총 ${total.toLocaleString()}개)` : ''}`;

  const html = `
    <div class="ai-result general-results-wrap">
      <div class="ai-label-row">
        <div class="ai-label">
          <span class="dot">${window.MINI_SCOPE || '✦'}</span>
          <span>${headerTitle}</span>
        </div>
        <div class="sort-options">
          ${window.ThisOneSort?.buttons?.(currentSort) || ''}
        </div>
      </div>
      <div class="pick-list">
        ${cardsHtml}
      </div>
      ${paginationHtml}
      ${renderResultInquiryButton()}
    </div>
  `;

  const generalWrap = content.querySelector('.general-results-wrap');
  if (generalWrap) generalWrap.insertAdjacentHTML('beforebegin', html);
  else content.insertAdjacentHTML('beforeend', html);
  
  // 페이지 전환 시에만 결과 영역으로 이동하고, 첫 검색 렌더링에서는 현재 스크롤을 유지한다.
  if (currentPage > 1) {
    const wrap = document.querySelector('.general-results-wrap');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderAnalysisProgress() {
  const content = getContentEl();
  if (!content) return null;
  const existing = document.querySelector('.analysis-progress-wrap');
  if (existing) existing.remove();

  const node = document.createElement('div');
  node.className = 'ai-result analysis-progress-wrap';
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.innerHTML = `
    <div class="analysis-progress-panel">
      <div class="ai-label analysis-progress-title">
        <span class="dot">${window.MINI_SCOPE || '✦'}</span>
        <span>지능형 분석 리포트</span>
      </div>
      <ol class="analysis-step-list">
        <li class="analysis-step is-active" data-analysis-step="collect">
          <span class="analysis-step-mark" aria-hidden="true"></span>
          <span class="analysis-step-text">후보 수집</span>
        </li>
        <li class="analysis-step is-active" data-analysis-step="ai">
          <span class="analysis-step-mark" aria-hidden="true"></span>
          <span class="analysis-step-text">AI 분석 중</span>
        </li>
        <li class="analysis-step" data-analysis-step="reputation">
          <span class="analysis-step-mark" aria-hidden="true"></span>
          <span class="analysis-step-text">평판 확인</span>
        </li>
      </ol>
      <div class="analysis-ad-slot" aria-label="ThisOne 자체 광고" data-ad-slot="analysis" data-ad-size="leaderboard">
        <a class="thisone-ad-link" href="#inquiry" aria-label="ThisOne 광고 제휴 문의하기" onclick="window.ThisOneUI?.openAdInquiryFromBanner?.(event)">
          <div class="thisone-ad-crossfade" aria-hidden="true">
          <picture class="thisone-ad-frame thisone-ad-frame-a">
            <source
              media="(max-width: 640px)"
              srcset="/ads/thisone_banner_A_mobile_320x100.png 1x, /ads/thisone_banner_A_mobile_320x100@2x.png 2x"
            >
            <img
              src="/ads/thisone_banner_A_pc_728x90.png"
              srcset="/ads/thisone_banner_A_pc_728x90.png 1x, /ads/thisone_banner_A_pc_728x90@2x.png 2x"
              width="728"
              height="90"
              alt=""
              loading="eager"
              decoding="async"
            >
          </picture>
          <picture class="thisone-ad-frame thisone-ad-frame-b">
            <source
              media="(max-width: 640px)"
              srcset="/ads/thisone_banner_B_mobile_320x100.png 1x, /ads/thisone_banner_B_mobile_320x100@2x.png 2x"
            >
            <img
              src="/ads/thisone_banner_B_pc_728x90.png"
              srcset="/ads/thisone_banner_B_pc_728x90.png 1x, /ads/thisone_banner_B_pc_728x90@2x.png 2x"
              width="728"
              height="90"
              alt=""
              loading="eager"
              decoding="async"
            >
          </picture>
          </div>
        </a>
      </div>
    </div>
  `;
  const generalWrap = content.querySelector('.general-results-wrap');
  if (generalWrap) content.insertBefore(node, generalWrap);
  else appendAndScroll(node);
  return node;
}

function updateAnalysisProgress(step, state = 'done') {
  const wrap = document.querySelector('.analysis-progress-wrap');
  if (!wrap) return;
  const node = wrap.querySelector(`[data-analysis-step="${step}"]`);
  if (!node) return;
  node.classList.toggle('is-done', state === 'done');
  node.classList.toggle('is-active', state === 'active');
  node.classList.toggle('is-failed', state === 'failed');
}

function showAnalysisFailure(message = 'AI 분석에 실패했습니다. 일반 검색 결과는 그대로 확인할 수 있습니다.') {
  const wrap = document.querySelector('.analysis-progress-wrap') || renderAnalysisProgress();
  if (!wrap) return;
  wrap.classList.add('analysis-progress-failed');
  updateAnalysisProgress('ai', 'failed');
  const panel = wrap.querySelector('.analysis-progress-panel');
  const existing = wrap.querySelector('.analysis-failure-message');
  if (existing) existing.remove();
  panel?.insertAdjacentHTML('beforeend', `<div class="analysis-failure-message">${esc(message)}</div>`);
}

function clearAnalysisProgress() {
  document.querySelectorAll('.analysis-progress-wrap').forEach((node) => node.remove());
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


function formatInquiryContent(content) {
  const raw = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';

  const hasLineBreak = /\n/.test(raw);
  const blocks = hasLineBreak
    ? raw.split(/\n{2,}/)
    : raw.split(/(?<=[.!?。！？])\s+/);

  return blocks
    .map((block) => {
      const lines = String(block || '')
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (!lines.length) return '';

      return `<p class="inq-body-paragraph">${lines.map((line) => esc(line)).join('<br>')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderResultInquiryButton() {
  return `
    <div class="result-inquiry-wrap">
      <button type="button" class="result-inquiry-btn" onclick="window.ThisOneUI?.openInquiryBoard?.()">결과가 이상한가요? 문의 남기기</button>
    </div>
  `;
}

function addResultCard(result) {
  const content = document.getElementById('msgContainer');
  if (!content) return;

  const cards = Array.isArray(result?.cards) ? result.cards : [];
  const rejects = Array.isArray(result?.rejects) ? result.rejects : [];
  const aiComment = String(result?.aiComment || '').trim();

  const cardsHtml = cards
    .map((card, idx) => window.ThisOneResultCards?.renderPickCard?.(card, idx === 0) || '')
    .join('');

  const aiCommentHtml = window.ThisOneResultCards?.renderAiComment?.(aiComment) || '';

  const rejectsHtml = rejects.length
    ? `
      <details class="fold-box reject-card">
        <summary>제외 후보</summary>
        <div class="fold-content">
          ${rejects.map((r) => `
            <div class="reject-item">
              <div class="reject-dot">•</div>
              <div class="reject-text">
                <span class="reject-name">${esc(r.name || '후보')}</span>
                ${r.reason ? ` — ${esc(r.reason)}` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </details>
    `
    : '';

  clearAnalysisProgress();

  const html = `
    <div class="ai-result ai-recommendation-wrap">
      <div class="ai-label">
        <span class="dot">✦</span>
        <span>지능형 분석 리포트</span>
      </div>
      <div class="pick-list">
        ${cardsHtml}
      </div>
      ${aiCommentHtml}
      ${rejectsHtml}
      ${renderResultInquiryButton()}
    </div>
  `;

  const generalWrap = content.querySelector('.general-results-wrap');
  if (generalWrap) generalWrap.insertAdjacentHTML('beforebegin', html);
  else content.insertAdjacentHTML('beforeend', html);
  // 강제 스크롤 제거: 사용자 시야 방해 방지
}


async function loadDynamicTrends() {
  const container = document.getElementById('trendingChips');
  if (!container) return;
  // 기존 프리미엄 칩이 이미 있다면 덮어쓰지 않음 (우선순위: 프리미엄 랭킹)
  if (container.children.length > 0) return;

  try {
    const response = await fetch('/api/trends');
    const data = await response.json();

    if (data.status === 'success' && data.chips) {
      container.innerHTML = ''; 
      data.chips.forEach((chip, i) => {
        const chipEl = document.createElement('button');
        chipEl.className = 'chip';
        chipEl.innerHTML = `<span>${i + 1}</span> ${chip.label}`;
        chipEl.onclick = () => {
          if (typeof window.quick === 'function') window.quick(chip.query);
        };
        container.appendChild(chipEl);
      });
    }
  } catch (err) {
    console.warn('트렌드 칩 로딩 실패:', err);
  }
}

// --- 문의게시판 관련 로직 ---
async function openInquiryBoard() {
  const modal = document.getElementById('inquiryModal');
  if (modal) {
    modal.classList.add('show');
    fetchInquiries();
  }
}

function closeInquiryBoard() {
  const modal = document.getElementById('inquiryModal');
  if (modal) modal.classList.remove('show');
  hideInquiryForm();
}

function showInquiryForm() {
  document.getElementById('inquiryListArea').classList.add('hidden');
  document.getElementById('inquiryFormArea').classList.add('show');
}

function hideInquiryForm() {
  document.getElementById('inquiryListArea').classList.remove('hidden');
  document.getElementById('inquiryFormArea').classList.remove('show');
  // 수정 모드 초기화
  window._editModeId = null;
  const submitBtn = document.getElementById('inqSubmitBtn');
  if (submitBtn) submitBtn.textContent = '등록하기';
}

function openAdInquiryFromBanner(event) {
  if (event) event.preventDefault();

  openInquiryBoard();
  showInquiryForm();
  window._editModeId = null;

  const titleEl = document.getElementById('inqTitle');
  const authorEl = document.getElementById('inqAuthor');
  const passwordEl = document.getElementById('inqPassword');
  const contentEl = document.getElementById('inqContent');
  const submitBtn = document.getElementById('inqSubmitBtn');

  if (titleEl && (!titleEl.value.trim() || titleEl.value.trim() === '광고/제휴 문의')) {
    titleEl.value = '광고/제휴 문의';
  }

  if (authorEl && (!authorEl.value.trim() || authorEl.value.trim() === '광고주')) {
    authorEl.value = '광고주';
  }

  if (contentEl && !contentEl.value.trim()) {
    contentEl.value = `안녕하세요. ThisOne 광고/제휴 문의드립니다.

업체명:
담당자:
연락처:
광고 희망 상품/카테고리:
문의 내용:`;
  }

  if (submitBtn) submitBtn.textContent = '등록하기';
  if (passwordEl) passwordEl.focus();
  else if (contentEl) contentEl.focus();
}


function isAdInquiry(inq) {
  const title = String(inq?.title || '');
  const content = String(inq?.content || '');
  return /\[?광고\/제휴\]?|광고|제휴/.test(title) || /광고\/제휴 문의/.test(content);
}

function isInquiryManagerMode() {
  try {
    return !!String(sessionStorage.getItem('thisone_inquiry_manager_key') || '').trim();
  } catch (e) {
    return false;
  }
}

function sortInquiriesForDisplay(inquiries = []) {
  const list = Array.isArray(inquiries) ? inquiries.slice() : [];
  if (!isInquiryManagerMode()) return list;

  return list.sort((a, b) => {
    const aAd = isAdInquiry(a);
    const bAd = isAdInquiry(b);
    if (aAd === bAd) return 0;
    return aAd ? -1 : 1;
  });
}

async function fetchInquiries() {
  const list = document.getElementById('inquiryList');
  if (!list) return;

  try {
    const res = await fetch('/api/inquiry');
    const result = await res.json();

    if (result.status === 'success' && Array.isArray(result.data)) {
      // 전역 캐시에 데이터 저장 (데이터 바인딩 버그 방지)
      window._inquiryCache = result.data;

      if (result.data.length === 0) {
        list.innerHTML = '<div class="loading-text">등록된 문의가 없습니다. 첫 문의를 남겨보세요!</div>';
        return;
      }

      const displayInquiries = sortInquiriesForDisplay(result.data);
      const managerMode = isInquiryManagerMode();

      list.innerHTML = displayInquiries.map(inq => `
        <div class="inquiry-item ${managerMode && isAdInquiry(inq) ? 'is-ad-inquiry' : ''}">
          <div class="inq-header" onclick="window.toggleInquiry('${inq.id}')">
            <div class="inq-title-group">
              <div class="inq-badge">Q</div>
              <div class="inq-info">
                <div class="inq-title">${isAdInquiry(inq) ? '<span class="inq-badge-ad">광고/제휴</span>' : ''}${esc(inq.title)}</div>
                <div class="inq-meta">${esc(inq.author || '익명')} • ${new Date(inq.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
            <div class="inq-arrow">▼</div>
          </div>
          <div class="inq-content-area" id="inqContent_${inq.id}">
            <div class="inq-body">${formatInquiryContent(inq.content)}</div>
            <div class="action-row right">
              <button class="btn btn-secondary" style="padding: 8px 16px; font-size: 12px;" onclick="event.stopPropagation(); window.ThisOneUI.prepareEdit('${inq.id}')">수정하기</button>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    list.innerHTML = '<div class="loading-text">목록 로딩 실패</div>';
  }
}

function prepareEdit(id) {
  // 캐시에서 해당 데이터 찾기
  const item = (window._inquiryCache || []).find(inq => String(inq.id) === String(id));
  if (!item) {
    showNotice('데이터를 찾을 수 없습니다.', { tone: 'warning' });
    return;
  }

  const pw = prompt('글 작성 시 설정한 비밀번호를 입력해주세요.');
  if (!pw) return;

  window._editModeId = id;
  const titleEl = document.getElementById('inqTitle');
  const authorEl = document.getElementById('inqAuthor');
  const contentEl = document.getElementById('inqContent');
  const passwordEl = document.getElementById('inqPassword');

  if (titleEl) titleEl.value = item.title;
  if (authorEl) authorEl.value = item.author || '익명';
  if (contentEl) contentEl.value = item.content;
  if (passwordEl) passwordEl.value = pw;
  
  showInquiryForm();
  const submitBtn = document.getElementById('inqSubmitBtn');
  if (submitBtn) submitBtn.textContent = '수정 완료';
}

let lastSubmitTime = 0;

async function submitInquiry() {
  const now = Date.now();
  if (now - lastSubmitTime < 10000) { // 10초 쿨타임
    const remaining = Math.ceil((10000 - (now - lastSubmitTime)) / 1000);
    showNotice(`도배 방지를 위해 ${remaining}초 후 다시 시도해주세요.`, { tone: 'warning' });
    return;
  }

  const title = document.getElementById('inqTitle')?.value.trim();
  const author = document.getElementById('inqAuthor')?.value.trim() || '익명';
  const password = document.getElementById('inqPassword')?.value.trim();
  const content = document.getElementById('inqContent')?.value.trim();

  console.log('[Inquiry] Attempting submission...');

  if (!title || !password || !content) {
    showNotice('제목, 비밀번호, 내용을 모두 입력해주세요.', { tone: 'warning' });
    return;
  }

  if (title.length < 2 || content.length < 5) {
    showNotice('너무 짧은 내용은 등록할 수 없습니다. (제목 2자, 내용 5자 이상)', { tone: 'warning' });
    return;
  }

  if (author.length > 20) {
    showNotice('닉네임은 20자 이하로 입력해주세요.', { tone: 'warning' });
    return;
  }

  const btn = document.getElementById('inqSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.textContent = '등록 중...';
  }

  try {
    const isEdit = !!window._editModeId;
    const url = '/api/inquiry';
    const method = isEdit ? 'PUT' : 'POST';
    const body = { title, author, password, content };
    if (isEdit) body.id = window._editModeId;

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    console.log('[Inquiry] Status:', res.status);
    const result = await res.json();
    console.log('[Inquiry] Result:', result);

    if (res.ok && result.status === 'success') {
      showNotice(isEdit ? '문의가 수정되었습니다.' : '문의가 성공적으로 등록되었습니다.', { tone: 'success' });
      lastSubmitTime = Date.now(); 
      if (document.getElementById('inqTitle')) document.getElementById('inqTitle').value = '';
      if (document.getElementById('inqAuthor')) document.getElementById('inqAuthor').value = '';
      if (document.getElementById('inqPassword')) document.getElementById('inqPassword').value = '';
      if (document.getElementById('inqContent')) document.getElementById('inqContent').value = '';
      hideInquiryForm();
      fetchInquiries();
    } else {
      showNotice('처리 실패: ' + (result.message || '비밀번호를 확인해주세요.'), { tone: 'warning' });
    }
  } catch (err) {
    console.warn('[Inquiry] Critical Error:', err);
    showNotice('등록 중 오류가 발생했습니다.', { tone: 'warning' });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = '등록하기';
    }
  }
}


function purgeProgressLeak() {
  const root = document.getElementById('msgContainer');
  if (!root) return;
  const banned = '최종 분석 리포트를 생성하고 있습니다';

  root.querySelectorAll('*').forEach((el) => {
    if (el.id === 'statusTextV2') return;
    if ((el.textContent || '').includes(banned)) {
      el.textContent = (el.textContent || '').replaceAll(banned, '').trim();
      if (!el.textContent && !el.children.length) {
        el.remove();
      }
    }
  });
}

window.ThisOneDebug = window.ThisOneDebug || {};
window.ThisOneDebug.forceErrorState = (type) => addErrorState(type);

window.ThisOneUI = {
  renderHistoryBar,
  addUserMsg,
  addFallback,
  addErrorState,
  clearErrorState,
  showNotice,
  addThinking,
  renderBadgeList,
  renderAnalysisProgress,
  updateAnalysisProgress,
  showAnalysisFailure,
  clearAnalysisProgress,
  renderRawResults,
  renderResults: renderRawResults,
  addResultCard,
  purgeProgressLeak,
  removeLegacyProgressUi,
  loadDynamicTrends,
  openInquiryBoard,
  openAdInquiryFromBanner,
  closeInquiryBoard,
  showInquiryForm,
  hideInquiryForm,
  submitInquiry,
  prepareEdit,
  showAdminStats
};

function showAdminStats(data) {
  const modalId = 'adminStatsModal';
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();

  const m = document.createElement('div');
  m.id = modalId;
  m.className = 'modal-overlay';
  m.style.cssText = 'display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.8); z-index:9999999; align-items:center; justify-content:center;';
  
  const maxVal = Math.max(...data.history.map(h => h.count), 1);
  
  m.innerHTML = `
    <div class="modal-content" style="background:#fff; border-radius:24px; padding:32px; width:90%; max-width:450px; box-shadow:0 20px 50px rgba(0,0,0,0.3); position:relative;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h3 style="margin:0; font-size:19px; font-weight:800; color:#0f172a;">📊 방문자 통계 리포트</h3>
        <button onclick="this.closest('#adminStatsModal').remove()" style="background:#f1f5f9; border:none; width:30px; height:30px; border-radius:50%; cursor:pointer;">✕</button>
      </div>
      
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:28px;">
        <div style="background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding:20px; border-radius:18px; text-align:center;">
          <div style="font-size:12px; color:#3b82f6; font-weight:700; margin-bottom:6px;">오늘 유입</div>
          <div style="font-size:28px; font-weight:900; color:#1e40af;">${data.daily}</div>
        </div>
        <div style="background:#f8fafc; padding:20px; border-radius:18px; text-align:center; border:1px solid #e2e8f0;">
          <div style="font-size:12px; color:#64748b; font-weight:700; margin-bottom:6px;">누적 방문</div>
          <div style="font-size:28px; font-weight:900; color:#0f172a;">${data.total}</div>
        </div>
      </div>

      <div style="background:#fff; border:1px solid #f1f5f9; padding:20px; border-radius:18px;">
        <div style="font-size:14px; font-weight:800; color:#334155; margin-bottom:16px;">주간 방문 트렌드</div>
        <div style="display:flex; align-items:flex-end; gap:10px; height:120px; padding-bottom:24px;">
          ${data.history.map(h => {
            const hRatio = (h.count / maxVal) * 80;
            return `
              <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:8px;">
                <div style="width:100%; background:#3b82f6; height:${hRatio}px; border-radius:6px 6px 2px 2px; position:relative; min-height:4px; opacity:${h.count === data.daily ? '1' : '0.4'}">
                  <span style="position:absolute; top:-18px; left:50%; transform:translateX(-50%); font-size:10px; font-weight:700; color:#3b82f6;">${h.count}</span>
                </div>
                <span style="font-size:10px; color:#94a3b8; font-weight:600;">${h.date.split('-')[2]}일</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <button onclick="this.closest('#adminStatsModal').remove()" style="width:100%; margin-top:24px; background:#0f172a; color:#fff; border:none; padding:16px; border-radius:14px; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(15,23,42,0.2);">닫기</button>
    </div>
  `;
  document.body.appendChild(m);
}
