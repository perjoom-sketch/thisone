function renderHistoryBar() {
  if (searchHistory.length < 2) return;

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
      if (typeof currentQuery !== 'undefined') currentQuery = q;

      if (typeof syncQueryInputs === 'function') {
        syncQueryInputs(q);
      } else {
        const input = document.getElementById('msgInput2');
        if (input) {
          input.value = q;
          autoResize(input);
        }
      }

      sendMsg();
    };
    bar.appendChild(c);
  });

  document.getElementById('content').appendChild(bar);
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
  document.getElementById('content').appendChild(d);
  d.scrollIntoView({ behavior: 'smooth' });
}

function addFallback(txt) {
  txt = stripCitations(txt);

  const d = document.createElement('div');
  d.className = 'ai-result';

  const fmt = txt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  d.innerHTML = `
    <div class="ai-label"><div class="dot">${MINI_SCOPE}</div> ThisOne 분석</div>
    <div class="pick-card" style="border-color:var(--border)">${fmt}</div>
  `;

  document.getElementById('content').appendChild(d);
  d.scrollIntoView({ behavior: 'smooth' });
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
  document.getElementById('content').appendChild(d);
  d.scrollIntoView({ behavior: 'smooth' });

  const msgs = [
    '상품을 검색하고 있어요...',
    '옵션형 상품 여부를 확인하는 중...',
    '후보 상품 목록을 정리하는 중...',
    'AI가 5개 카드를 고르는 중...',
    '결과를 표시하는 중...'
  ];

  const subs = [
    '가격, 링크, 이미지를 수집하는 중',
    '혼합 규격/옵션가 위험을 체크하는 중',
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
  }, 2200);

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

function renderRawResults(items) {
  const d = document.createElement('div');
  d.className = 'ai-result';

  let html = `<div class="ai-label"><div class="dot">${MINI_SCOPE}</div> 원본 검색 결과</div>`;

  if (items && items.length) {
    items.slice(0, 12).forEach((p) => {
      const initial = p.name ? p.name.charAt(0) : '?';

      const placeholderHtml = `
        <div class="pick-img-placeholder" style="background:#f3f4f6;color:#6b7280;font-weight:700;font-size:22px;">
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
            <div class="pick-img-placeholder" style="display:none;background:#f3f4f6;color:#6b7280;font-weight:700;font-size:22px;">
              ${esc(initial)}
            </div>
          </div>
        `
        : `<div class="pick-media">${placeholderHtml}</div>`;

      const cardStart = p.link
        ? `<a class="pick-card-link" href="${escAttr(p.link)}" target="_blank" rel="noopener noreferrer">`
        : '';
      const cardEnd = p.link ? '</a>' : '';

      html += `
        ${cardStart}
        <div class="pick-card">
          <div class="pick-badge" style="background:#6b7280;box-shadow:none">🔎 원본</div>
          <div class="pick-body">
            ${imgHtml}
            <div class="pick-info">
              <div class="pick-title">${esc(p.name)}</div>
              <div class="pick-meta">
                <span class="pick-price">${esc(p.price)}</span>
                <span class="pick-store">${esc(p.store)}</span>
                ${p.delivery ? `<span class="pick-delivery">🚚 ${esc(p.delivery)}</span>` : ''}
                ${p.review ? `<span class="pick-review">${esc(p.review)}</span>` : ''}
              </div>
              ${renderBadgeList(p.badges)}
            </div>
          </div>
        </div>
        ${cardEnd}
      `;
    });
  } else {
    html += `<div class="pick-card" style="border-color:var(--border)">원본 검색 결과가 없습니다.</div>`;
  }

  d.innerHTML = html;
  document.getElementById('content').appendChild(d);
  d.scrollIntoView({ behavior: 'smooth' });
}

function addResultCard(j) {
  const d = document.createElement('div');
  d.className = 'ai-result';

  const icons = {
    ai: '🎯',
    price: '💰',
    review: '📝',
    popular: '🔥',
    trust: '🛡️'
  };

  const colors = {
    ai: 'var(--accent)',
    price: '#16a34a',
    review: '#2563eb',
    popular: '#ea580c',
    trust: '#0f766e'
  };

  let html = `<div class="ai-label"><div class="dot">${MINI_SCOPE}</div> ThisOne 분석</div>`;

  if (j.cards && j.cards.length) {
    j.cards.forEach((p) => {
      const t = p.type || '';
      const isAI = t === 'ai';
      const initial = p.name ? p.name.charAt(0) : '?';

      const bgColors = {
        ai: '#ede9fe',
        price: '#dcfce7',
        review: '#dbeafe',
        popular: '#ffedd5',
        trust: '#ccfbf1'
      };

      const fgColors = {
        ai: '#4f46e5',
        price: '#16a34a',
        review: '#2563eb',
        popular: '#ea580c',
        trust: '#0f766e'
      };

      const placeholderHtml = `
        <div class="pick-img-placeholder" style="background:${bgColors[t]};color:${fgColors[t]};font-weight:700;font-size:22px;">
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
            <div class="pick-img-placeholder" style="display:none;background:${bgColors[t]};color:${fgColors[t]};font-weight:700;font-size:22px;">
              ${esc(initial)}
            </div>
          </div>
        `
        : `<div class="pick-media">${placeholderHtml}</div>`;

      const cardStart = p.link
        ? `<a class="pick-card-link" href="${escAttr(p.link)}" target="_blank" rel="noopener noreferrer">`
        : '';
      const cardEnd = p.link ? '</a>' : '';

      html += `
        ${cardStart}
        <div class="pick-card ${isAI ? 'pick-first' : ''}">
          <div class="pick-badge" style="${isAI ? '' : 'background:' + colors[t] + ';box-shadow:none'}">${icons[t] || '📦'} ${esc(p.label)}</div>
          <div class="pick-body">
            ${imgHtml}
            <div class="pick-info">
              <div class="pick-title">${esc(p.name)}</div>
              <div class="pick-meta">
                <span class="pick-price">${esc(p.price)}</span>
                <span class="pick-store">${esc(p.store)}</span>
                ${p.delivery ? `<span class="pick-delivery">🚚 ${esc(p.delivery)}</span>` : ''}
                ${p.review ? `<span class="pick-review">${esc(p.review)}</span>` : ''}
              </div>
              ${renderBadgeList(p.badges)}
            </div>
          </div>
          <div class="pick-reason-text">${esc(p.reason)}</div>
        </div>
        ${cardEnd}
      `;
    });
  }

  if (j.rejects && j.rejects.length) {
    html += `<div class="reject-card"><div class="reject-title">ℹ️ 제외 이유</div>`;
    j.rejects.forEach((r) => {
      html += `
        <div class="reject-item">
          <div class="reject-dot">•</div>
          <div class="reject-text"><span class="reject-name">${esc(r.name)}</span> — ${esc(r.reason)}</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  d.innerHTML = html;
  document.getElementById('content').appendChild(d);
  d.scrollIntoView({ behavior: 'smooth' });
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
