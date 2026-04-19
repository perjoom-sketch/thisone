function getContentEl() {
  return document.getElementById('content');
}

function appendAndScroll(node) {
  const content = getContentEl();
  if (!content) return;
  content.appendChild(node);
  node.scrollIntoView({ behavior: 'smooth' });
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

function addFallback(txt) {
  if (typeof stripCitations === 'function') {
    txt = stripCitations(txt);
  }

  const d = document.createElement('div');
  d.className = 'ai-result';

  const fmt = String(txt || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  d.innerHTML = `
    <div class="ai-label"><div class="dot">${MINI_SCOPE}</div> 지능형 분석 리포트</div>
    <div class="pick-card" style="border-color:var(--border)">${fmt}</div>
  `;

  appendAndScroll(d);
}

function addTyping() {
  const d = document.createElement('div');
  d.className = 'ai-result';
  d.innerHTML = `
    <div class="ai-label"><div class="dot">${MINI_SCOPE}</div> 지능형 분석 중...</div>
    <div class="typing-wrap">
      <div class="typing-steps">
        <div class="typing-spinner"></div>
        <div class="typing-msg">사용자의 검색 의도를 정밀 분석하고 있습니다...</div>
        <div class="typing-sub">지능형 쇼핑 엔진 '디스원'이 최적의 해답을 찾고 있습니다.</div>
      </div>
    </div>
  `;
  appendAndScroll(d);

  const msgs = [
    '의도에 부합하는 최적의 카테고리 필터링 중...',
    '빅데이터 기반 후보군 수집 및 정제 중...',
    '지능형 알고리즘으로 부적합 상품을 선별 중...',
    '실구매가 혜택 및 사용자 만족도 데이터 비교 중...',
    '결정의 고통을 끝낼 지능형 리포트를 구성 중...'
  ];

  const subs = [
    '단순 검색어를 넘어 사용자의 진짜 요구사항을 파악합니다.',
    '실시간 시장 데이터와 사용자 트렌드를 결합합니다.',
    '최저가 낚시 및 품질 미달 상품을 철저히 차단합니다.',
    '렌탈, 구매, AS 신뢰도를 종합적으로 랭킹화합니다.',
    '이제 고민을 멈추셔도 좋습니다. 최적의 5가지를 선정했습니다.'
  ];

  let idx = 0;
  d._timer = setInterval(() => {
    idx = (idx + 1) % msgs.length;
    const m = d.querySelector('.typing-msg');
    const s = d.querySelector('.typing-sub');
    if (m) m.textContent = msgs[idx];
    if (s) s.textContent = subs[idx];
  }, 3500);

  // 외부에서 상태를 직접 업데이트할 수 있는 함수 추가
  d.updateStatus = (msg, sub) => {
    clearInterval(d._timer); // 수동 업데이트 시 자동 롤링 중지
    const m = d.querySelector('.typing-msg');
    const s = d.querySelector('.typing-sub');
    if (m) m.textContent = msg;
    if (s) s.textContent = sub;
  };

  const origRemove = d.remove.bind(d);
  d.remove = () => {
    clearInterval(d._timer);
    origRemove();
  };

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
  return {
    name: p.name || p.title || p.productName || '상품명 없음',
    price: p.price || p.lprice || '',
    store: p.store || p.mallName || p.mall || '',
    delivery: p.delivery || p.shipping || '',
    review: p.review || p.reviewText || '',
    image: p.image || p.imageUrl || '',
    link: p.link || p.productUrl || p.url || '',
    badges: Array.isArray(p.badges) ? p.badges : [],
    reason: p.reason || '',
    rankReason: p.rankReason || '',
    excludeFromPriceRank: !!p.excludeFromPriceRank
  };
}

function renderRawResults(items = []) {
  const d = document.createElement('div');
  d.className = 'ai-result';

  let html = `<div class="ai-label"><div class="dot">${MINI_SCOPE}</div> 원본 검색 결과</div>`;

  if (!Array.isArray(items) || !items.length) {
    html += `<div class="pick-card">원본 검색 결과가 없습니다.</div>`;
    d.innerHTML = html;
    appendAndScroll(d);
    return;
  }

  items.forEach((raw, idx) => {
    const p = normalizeRawItem(raw);
    const initial = p.name ? p.name.charAt(0) : '?';

    const placeholderHtml = `
      <div class="pick-img-placeholder" style="background:#f3f4f6;color:#374151;font-weight:700;font-size:22px;">
        ${esc(initial)}
      </div>
    `;

    const imgHtml = p.image
      ? `
        <div class="pick-media">
          <img
            class="pick-img"
            src="${escAttr(p.image)}"
            alt="${escAttr(p.name)}"
            referrerpolicy="no-referrer"
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          >
          <div class="pick-img-placeholder" style="display:none;background:#f3f4f6;color:#374151;font-weight:700;font-size:22px;">
            ${esc(initial)}
          </div>
        </div>
      `
      : `<div class="pick-media">${placeholderHtml}</div>`;

    const cardStart = p.link
      ? `<a class="pick-card-link" href="${escAttr(p.link)}" target="_blank" rel="noopener noreferrer">`
      : '';
    const cardEnd = p.link ? '</a>' : '';

    const rawBadges = [...p.badges];
    if (p.excludeFromPriceRank && !rawBadges.includes('가격순 제외')) {
      rawBadges.push('가격순 제외');
    }

    html += `
      ${cardStart}
      <div class="pick-card">
        <div class="pick-badge" style="background:#6b7280;box-shadow:none">📦 원본 ${idx + 1}</div>
        <div class="pick-body">
          ${imgHtml}
          <div class="pick-info">
            <div class="pick-title">${esc(p.name)}</div>
            <div class="pick-meta">
              ${p.price ? `<span class="pick-price">${esc(p.price)}</span>` : ''}
              ${p.store ? `<span class="pick-store">${esc(p.store)}</span>` : ''}
              ${p.delivery ? `<span class="pick-delivery">🚚 ${esc(p.delivery)}</span>` : ''}
              ${p.review ? `<span class="pick-review">${esc(p.review)}</span>` : ''}
            </div>
            ${renderBadgeList(rawBadges)}
          </div>
        </div>
        ${p.reason ? `<div class="pick-reason-text">${esc(p.reason)}</div>` : ''}
      </div>
      ${cardEnd}
    `;
  });

  d.innerHTML = html;
  appendAndScroll(d);
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

function renderPickCard(card, isFirst = false) {
  const imageHtml = card.image
    ? `<img class="pick-img" src="${escAttr(card.image)}" alt="${escAttr(card.name || '상품')}">`
    : `<div class="pick-img-placeholder">상품</div>`;

  const badgesHtml = Array.isArray(card.badges) && card.badges.length
    ? `
      <div class="pick-badges">
        ${card.badges.map((b) => `<span class="pick-mini-badge">${esc(b)}</span>`).join('')}
      </div>
    `
    : '';

  return `
    <a class="pick-card-link" href="${escAttr(card.link || '#')}" target="_blank" rel="noopener noreferrer">
      <article class="pick-card ${isFirst ? 'pick-first' : ''}">
        <div class="pick-badge">${esc(card.label || '')}</div>

        <div class="pick-body">
          <div class="pick-media">
            ${imageHtml}
          </div>

          <div class="pick-info">
            <h3 class="pick-title">${esc(card.name || '상품명 없음')}</h3>

            <div class="pick-meta">
              ${card.price ? `<span class="pick-price">${esc(card.price)}</span>` : ''}
              ${card.store ? `<span class="pick-store">${esc(card.store)}</span>` : ''}
              ${card.delivery ? `<span class="pick-delivery">${esc(card.delivery)}</span>` : ''}
              ${card.review ? `<span class="pick-review">${esc(card.review)}</span>` : ''}
            </div>

            ${badgesHtml}

            ${card.reason ? `<div class="pick-reason-text">${esc(card.reason)}</div>` : ''}
          </div>
        </div>
      </article>
    </a>
  `;
}

function addResultCard(result) {
  const content = document.getElementById('content');
  if (!content) return;

  const cards = Array.isArray(result?.cards) ? result.cards : [];
  const rejects = Array.isArray(result?.rejects) ? result.rejects : [];

  const cardsHtml = cards
    .map((card, idx) => renderPickCard(card, idx === 0))
    .join('');

  const rejectsHtml = rejects.length
    ? `
      <div class="reject-card">
        <div class="reject-title">제외된 후보</div>
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
    `
    : '';

  const html = `
    <div class="ai-result">
      <div class="ai-label">
        <span class="dot">✦</span>
        <span>지능형 추천 리포트</span>
      </div>
      ${cardsHtml}
      ${rejectsHtml}
      
      <div class="feedback-wrap" id="feedback_${Date.now()}">
        <div class="feedback-title">이 추천이 도움이 되었나요?</div>
        <div class="feedback-btns">
          <button class="fb-btn like" onclick="ThisOneUI.handleFeedback(this, 'positive')">👍 도움이 됐어요</button>
          <button class="fb-btn dislike" onclick="ThisOneUI.handleFeedback(this, 'negative')">👎 아쉬워요</button>
        </div>
      </div>
    </div>
  `;

  content.insertAdjacentHTML('beforeend', html);
  content.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function handleFeedback(btn, type) {
  const wrap = btn.closest('.feedback-wrap');
  if (!wrap) return;

  // 로그 전송
  if (window.ThisOneTrajectory?.logEvent) {
    window.ThisOneTrajectory.logEvent('user_feedback', {
      query: window.currentQuery || '',
      feedback_type: type,
      timestamp: new Date().toISOString()
    });
  }

  // UI 전환
  wrap.innerHTML = `
    <div class="feedback-thanks">
      ✨ 소중한 피드백 감사합니다!<br>
      덕분에 디스원이 더 똑똑해지고 있어요.
    </div>
  `;
}

async function loadTrendingChips() {
  const container = document.getElementById('chips');
  if (!container) return;

  try {
    const response = await fetch('/api/trends');
    const data = await response.json();

    if (data.status === 'success' && data.chips) {
      container.innerHTML = ''; // 기존 칩 제거
      data.chips.forEach(chip => {
        const chipEl = document.createElement('div');
        chipEl.className = 'chip';
        chipEl.textContent = chip.label;
        chipEl.onclick = () => {
          if (typeof window.quick === 'function') {
            window.quick(chip.query);
          }
        };
        container.appendChild(chipEl);
      });
    }
  } catch (err) {
    console.error('트렌드 칩 로딩 실패:', err);
    // 폴백 기본 칩
    container.innerHTML = `
      <div class="chip" onclick="quick('로봇청소기 추천')">🤖 로봇청소기</div>
      <div class="chip" onclick="quick('스탠바이미')">📺 스탠바이미</div>
    `;
  }
}

window.ThisOneUI = {
  renderHistoryBar,
  addUserMsg,
  addFallback,
  addTyping,
  renderBadgeList,
  renderRawResults,
  addResultCard,
  handleFeedback,
  loadTrendingChips
};
