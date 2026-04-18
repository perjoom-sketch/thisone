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

  searchHistory.slice(-10).forEach((q) => {
    const c = document.createElement('div');
    c.className = 'history-chip';
    c.textContent = '🔍 ' + q;
    c.onclick = () => {
      const inp = document.getElementById('msgInput2');
      if (!inp) return;

      inp.value = q;
      if (typeof autoResize === 'function') autoResize(inp);

      if (typeof currentQuery !== 'undefined') {
        currentQuery = q;
      }

      if (typeof sendMsg === 'function') {
        sendMsg();
      } else {
        console.error('sendMsg is not defined');
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
    <div class="ai-label"><div class="dot">${MINI_SCOPE}</div> ThisOne 분석</div>
    <div class="pick-card" style="border-color:var(--border)">${fmt}</div>
  `;

  appendAndScroll(d);
}

function addTyping() {
  const d = document.createElement('div');
  d.className = 'ai-result';
  d.innerHTML = `
    <div class="ai-label"><div class="dot">${MINI_SCOPE}</div> 검색 중...</div>
    <div class="typing-wrap">
      <div class="typing-steps">
        <div class="typing-spinner"></div>
        <div class="typing-msg">상품을 검색하고 있어요...</div>
        <div class="typing-sub">가격, 링크, 이미지를 수집하는 중</div>
      </div>
    </div>
  `;
  appendAndScroll(d);

  const msgs = [
    '상품을 검색하고 있어요...',
    '네이버 쇼핑 결과를 정리하는 중...',
    'AI가 5개 카드를 고르는 중...',
    '결과를 표시하는 중...'
  ];

  const subs = [
    '가격, 링크, 이미지를 수집하는 중',
    '후보 상품 목록을 정리하는 중',
    'AI추천·가격순·리뷰순·인기순·신뢰순을 고르는 중',
    '결과 카드를 준비하는 중'
  ];

  let idx = 0;
  d._timer = setInterval(() => {
    idx = (idx + 1) % msgs.length;
    const m = d.querySelector('.typing-msg');
    const s = d.querySelector('.typing-sub');
    if (m) m.textContent = msgs[idx];
    if (s) s.textContent = subs[idx];
  }, 2500);

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
        <span>ThisOne 분석</span>
      </div>
      ${cardsHtml}
      ${rejectsHtml}
    </div>
  `;

  content.insertAdjacentHTML('beforeend', html);
}

window.ThisOneUI = {
  renderHistoryBar,
  addUserMsg,
  addFallback,
  addTyping,
  renderBadgeList,
  renderRawResults,
  addResultCard
};
