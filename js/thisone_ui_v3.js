function getContentEl() {
  return document.getElementById('content');
}

function appendAndScroll(node) {
  const content = getContentEl();
  if (!content) return;
  content.appendChild(node);
  // 강제 스크롤 제거: 사용자 시야 방해 방지
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

function addFallback() {
  const d = document.createElement('div');
  d.className = 'ai-result';
  d.innerHTML = `
    <div class="ai-label"><div class="dot">✦</div> 분석 완료</div>
    <div class="pick-card" style="border-left: 4px solid var(--accent); background: #f8fafc;">
      데이터 분석을 바탕으로 최적의 후보군 선별을 마쳤습니다. 아래 리스트에서 사용자님의 환경에 가장 적합한 상품을 확인해 보세요.
    </div>
  `;
  appendAndScroll(d);
}

function addThinking() {
  const d = document.createElement('div');
  d.className = 'ai-result intelligence-mode';
  d.innerHTML = `
    <div class="ai-label">
      <span class="thinking-icon">✦</span>
      <span>디스원이 지능적으로 분석 중...</span>
    </div>
    <div class="thought-container" id="thinkContainerV2">
      <div class="thought-steps" id="thoughtStepsV2">
        <div class="thought-step active">
          <div class="step-dot"></div>
          <div class="step-text">검색패턴을 관찰하여 원하는 상품 추론 중...</div>
        </div>
      </div>
      <div id="liveResponse" class="live-response"></div>
      <div class="thought-pulse"></div>
    </div>
  `;
  appendAndScroll(d);

  // 사고 단계 업데이트 함수
  d.updateThought = (msg, isFinal = false) => {
    const steps = d.querySelector('#thoughtStepsV2');
    if (!steps) return;
    
    // 이전 단계 완료 처리
    const lastStep = steps.querySelector('.thought-step.active');
    if (lastStep) {
      lastStep.classList.remove('active');
      lastStep.classList.add('completed');
      const dot = lastStep.querySelector('.step-dot');
      if (dot) dot.innerHTML = '✓';
    }

    if (!isFinal) {
      const newStep = document.createElement('div');
      newStep.className = 'thought-step active';
      newStep.innerHTML = `
        <div class="step-dot"></div>
        <div class="step-text">${msg}</div>
      `;
      steps.appendChild(newStep);
    }
  };

  // 실시간 스트리밍 텍스트 업데이트 함수
  d.updateLiveResponse = (txt) => {
    const el = d.querySelector('#liveResponse');
    if (!el) return;
    
    // [최종 검문소] 소스 코드(JSON) 징후가 보이면 아예 숨김
    if (txt.includes('{') || txt.includes('[JSON]') || txt.includes('":') || txt.includes('```') || txt.includes('}')) {
      el.style.display = 'none';
      return;
    }

    // 시스템 태그 및 불필요한 기호 제거
    let cleanText = txt.replace(/\[?Thought\]?:?/gi, '').trim();
    // 만약 남아있는 텍스트에 JSON 특수문자가 섞여있다면 숨김
    if (/[{}[\]"]/.test(cleanText)) {
      el.style.display = 'none';
      return;
    }

    if (cleanText) {
      el.textContent = cleanText;
      el.classList.add('active');
      el.style.display = 'block';
    }
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
      
    </div>
  `;

  content.insertAdjacentHTML('beforeend', html);
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
        chipEl.style = "background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(226, 232, 240, 0.8); padding: 8px 16px; border-radius: 20px; font-size: 14px; color: #475569; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; font-weight: 500;";
        chipEl.innerHTML = `<span style="font-weight: 800; color: #3b82f6; font-size: 12px; opacity: 0.8;">${i + 1}</span> ${chip.label}`;
        chipEl.onclick = () => {
          if (typeof window.quick === 'function') window.quick(chip.query);
        };
        container.appendChild(chipEl);
      });
    }
  } catch (err) {
    console.error('트렌드 칩 로딩 실패:', err);
  }
}

// --- 문의게시판 관련 로직 ---
async function openInquiryBoard() {
  const modal = document.getElementById('inquiryModal');
  if (modal) {
    modal.style.display = 'flex';
    fetchInquiries();
  }
}

function closeInquiryBoard() {
  const modal = document.getElementById('inquiryModal');
  if (modal) modal.style.display = 'none';
  hideInquiryForm();
}

function showInquiryForm() {
  document.getElementById('inquiryListArea').style.display = 'none';
  document.getElementById('inquiryFormArea').style.display = 'block';
}

function hideInquiryForm() {
  document.getElementById('inquiryListArea').style.display = 'block';
  document.getElementById('inquiryFormArea').style.display = 'none';
  // 수정 모드 초기화
  window._editModeId = null;
  const submitBtn = document.getElementById('inqSubmitBtn');
  if (submitBtn) submitBtn.textContent = '등록하기';
}

async function fetchInquiries() {
  const list = document.getElementById('inquiryList');
  if (!list) return;

  try {
    const res = await fetch('/api/inquiry');
    const result = await res.json();

    if (result.status === 'success' && Array.isArray(result.data)) {
      if (result.data.length === 0) {
        list.innerHTML = '<div class="loading-text">등록된 문의가 없습니다. 첫 문의를 남겨보세요!</div>';
        return;
      }

      list.innerHTML = result.data.map(inq => `
        <div class="inquiry-item" style="border-bottom: 1px solid #f1f5f9; padding: 16px 0;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div class="inq-title" style="font-weight:700; color:#1e293b; font-size:15px; margin-bottom:4px;">${esc(inq.title)}</div>
            <button onclick="window.ThisOneUI.prepareEdit('${inq.id}', '${escAttr(inq.title)}', '${escAttr(inq.content)}')" style="font-size:11px; background:#f1f5f9; border:none; padding:4px 8px; border-radius:6px; color:#64748b; cursor:pointer;">수정</button>
          </div>
          <div class="inq-meta" style="font-size:12px; color:#94a3b8;">${inq.author} · ${new Date(inq.createdAt).toLocaleDateString()}</div>
          <div style="font-size:14px; color:#475569; margin-top:8px; line-height:1.5; white-space:pre-wrap;">${esc(inq.content)}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    list.innerHTML = '<div class="loading-text">목록 로딩 실패</div>';
  }
}

function prepareEdit(id, title, content) {
  window._editModeId = id;
  document.getElementById('inqTitle').value = title;
  document.getElementById('inqContent').value = content;
  document.getElementById('inqPassword').value = '';
  
  showInquiryForm();
  const submitBtn = document.getElementById('inqSubmitBtn');
  if (submitBtn) submitBtn.textContent = '수정 완료';
  alert('비밀번호를 입력해야 수정이 완료됩니다.');
}

let lastSubmitTime = 0;

async function submitInquiry() {
  const now = Date.now();
  if (now - lastSubmitTime < 10000) { // 10초 쿨타임
    const remaining = Math.ceil((10000 - (now - lastSubmitTime)) / 1000);
    alert(`도배 방지를 위해 ${remaining}초 후 다시 시도해주세요.`);
    return;
  }

  const title = document.getElementById('inqTitle')?.value.trim();
  const password = document.getElementById('inqPassword')?.value.trim();
  const content = document.getElementById('inqContent')?.value.trim();

  console.log('[Inquiry] Attempting submission...');

  if (!title || !password || !content) {
    alert('제목, 비밀번호, 내용을 모두 입력해주세요.');
    return;
  }

  if (title.length < 2 || content.length < 5) {
    alert('너무 짧은 내용은 등록할 수 없습니다. (제목 2자, 내용 5자 이상)');
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
    const body = { title, password, content };
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
      alert(isEdit ? '문의가 수정되었습니다.' : '문의가 성공적으로 등록되었습니다.');
      lastSubmitTime = Date.now(); 
      if (document.getElementById('inqTitle')) document.getElementById('inqTitle').value = '';
      if (document.getElementById('inqPassword')) document.getElementById('inqPassword').value = '';
      if (document.getElementById('inqContent')) document.getElementById('inqContent').value = '';
      hideInquiryForm();
      fetchInquiries();
    } else {
      alert('처리 실패: ' + (result.message || '비밀번호를 확인해주세요.'));
    }
  } catch (err) {
    console.error('[Inquiry] Critical Error:', err);
    alert('등록 중 오류가 발생했습니다.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.textContent = '등록하기';
    }
  }
}

window.ThisOneUI = {
  renderHistoryBar,
  addUserMsg,
  addFallback,
  addThinking,
  renderBadgeList,
  renderRawResults,
  addResultCard,
  loadDynamicTrends,
  openInquiryBoard,
  closeInquiryBoard,
  showInquiryForm,
  hideInquiryForm,
  submitInquiry,
  prepareEdit
};
