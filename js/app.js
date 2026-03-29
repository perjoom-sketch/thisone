const MODEL = 'claude-sonnet-4-20250514';
    const MINI_SCOPE = '<svg width="10" height="10" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="14" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/><circle cx="32" cy="32" r="5" fill="#fff"/><line x1="32" y1="6" x2="32" y2="18" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="32" y1="46" x2="32" y2="58" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="6" y1="32" x2="18" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="46" y1="32" x2="58" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/></svg>';

    let pendingImg = null;
    let loading = false;
    let isSearchMode = false;
    let searchHistory = [];

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
      document.getElementById('msgInput').value = t;
      autoResize(document.getElementById('msgInput'));
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
unction stripCitations(text) {
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

    function renderHistoryBar() {
      if (searchHistory.length < 2) return;

      let existing = document.getElementById('historyBar');
      if (existing) existing.remove();

      const bar = document.createElement('div');
      bar.className = 'history-bar';
      bar.id = 'historyBar';

      searchHistory.slice(-10).forEach((q) => {
        const c = document.createElement('div');
        c.className = 'history-chip';
        c.textContent = '🔍 ' + q;
        c.onclick = () => {
          document.getElementById('msgInput2').value = q;
          autoResize(document.getElementById('msgInput2'));
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
function parsePriceNumber(text) {
  return Number(String(text || '').replace(/[^\d]/g, '')) || 0;
}

function inferIntentProfile(query) {
  const q = String(query || '').toLowerCase();

  return {
    strollerNewbornStable:
      q.includes('신생아') ||
      q.includes('안정감 좋은 유모차') ||
      q.includes('맘카페') ||
      q.includes('반응 좋은 유모차'),

    purifierEnergy:
      q.includes('전기요금') ||
      q.includes('전기료') ||
      q.includes('저전력') ||
      q.includes('공기청정기'),

    printerMaintenance:
      q.includes('유지비 적은 프린터') ||
      q.includes('유지비') ||
      q.includes('프린터'),

    earphoneCall:
      q.includes('통화품질') ||
      q.includes('통화') ||
      q.includes('이어폰') ||
      q.includes('에어팟'),

    fanLowNoise:
      q.includes('소음 적은') ||
      q.includes('저소음') ||
      q.includes('산업용 선풍기')
  };
}

function getCandidateBonus(candidate, profile) {
  const name = String(candidate.name || '').toLowerCase();
  const price = parsePriceNumber(candidate.price);

  let bonusScore = 0;
  const bonusReasons = [];

  // 유모차: 신생아/맘카페/안정감용
 if (profile.strollerNewbornStable) {
  const isLight =
    name.includes('휴대용') ||
    name.includes('초경량') ||
    name.includes('경량') ||
    name.includes('기내반입') ||
    name.includes('접이식') ||
    name.includes('여행용');

  const isStable =
    name.includes('절충형') ||
    name.includes('디럭스') ||
    name.includes('신생아') ||
    name.includes('양대면') ||
    name.includes('리클라이닝') ||
    name.includes('서스펜션');

  const isTrikeLike =
    name.includes('트라이크') ||
    name.includes('유모카');

  if (isStable) {
    bonusScore += 3;
    bonusReasons.push('안정형 키워드');
  }

  if (isLight) {
    bonusScore -= 2;
    bonusReasons.push('경량형 감점');
  }

  if (isTrikeLike) {
    bonusScore -= 4;
    bonusReasons.push('트라이크형 감점');
  }

  if (price > 0 && price < 150000) {
    bonusScore -= 3;
    bonusReasons.push('저가형 감점');
  }

  if (price >= 300000) {
    bonusScore += 1;
    bonusReasons.push('품질 기대 가격대');
  }
}
  // 공기청정기: 전기료/절전
  if (profile.purifierEnergy) {
    if (
      name.includes('저전력') ||
      name.includes('절전') ||
      name.includes('에너지') ||
      name.includes('1등급') ||
      name.includes('인버터') ||
      name.includes('dc')
    ) {
      bonusScore += 3;
      bonusReasons.push('절전 힌트');
    }

    if (
      name.includes('필터포함') ||
      name.includes('정품필터') ||
      name.includes('교체필터')
    ) {
      bonusScore += 1;
      bonusReasons.push('유지비 힌트');
    }

    if (/\d+\s*(㎡|m²|평)/i.test(name)) {
      bonusScore += 1;
      bonusReasons.push('면적 정보');
    }
  }

  // 프린터: 유지비
  if (profile.printerMaintenance) {
    if (
      name.includes('무한잉크') ||
      name.includes('정품무한') ||
      name.includes('ink tank') ||
      name.includes('tank')
    ) {
      bonusScore += 4;
      bonusReasons.push('무한잉크');
    }

    if (name.includes('레이저')) {
      bonusScore += 2;
      bonusReasons.push('레이저 계열');
    }

    if (
      name.includes('토너') ||
      name.includes('카트리지')
    ) {
      bonusScore -= 3;
      bonusReasons.push('소모품형 감점');
    }
  }

  // 이어폰: 통화품질
  if (profile.earphoneCall) {
    if (
      name.includes('enc') ||
      name.includes('통화') ||
      name.includes('마이크') ||
      name.includes('cvc') ||
      name.includes('노이즈캔슬링')
    ) {
      bonusScore += 4;
      bonusReasons.push('통화 기능');
    }

    if (name.includes('게이밍')) {
      bonusScore -= 1;
      bonusReasons.push('게이밍 치우침');
    }
  }

  // 선풍기: 저소음
  if (profile.fanLowNoise) {
    if (
      name.includes('저소음') ||
      name.includes('bldc') ||
      name.includes('dc모터')
    ) {
      bonusScore += 4;
      bonusReasons.push('저소음 힌트');
    }

    if (
      name.includes('고출력') ||
      name.includes('터보') ||
      name.includes('초강력')
    ) {
      bonusScore -= 1;
      bonusReasons.push('소음 우려');
    }
  }

  return {
    bonusScore,
    bonusReasons: bonusReasons.join(', ')
  };
}
    function buildCandidates(items, queryText = '') {
  const profile = inferIntentProfile(queryText);

  return (items || []).slice(0, 12).map((item, idx) => {
    const candidate = {
      id: String(item.id ?? (idx + 1)),
      name: String(item.name || '').trim(),
      price: String(item.priceText || item.price || '').trim(),
      store: String(item.store || '').trim(),
      delivery: String(item.delivery || '상세페이지 확인').trim(),
      review: String(item.review || '').trim(),
      image: String(item.image || '').trim(),
      link: String(item.link || '').trim()
    };

    const bonus = getCandidateBonus(candidate, profile);

    return {
      ...candidate,
      bonusScore: bonus.bonusScore,
      bonusReasons: bonus.bonusReasons
    };
  }).sort((a, b) => {
    if (b.bonusScore !== a.bonusScore) return b.bonusScore - a.bonusScore;

    const ap = parsePriceNumber(a.price);
    const bp = parsePriceNumber(b.price);
    if (ap && bp) return ap - bp;

    return 0;
  });
}
    function mergeAiWithCandidates(aiJson, candidates) {
      const byId = {};
      candidates.forEach((c) => { byId[c.id] = c; });

      const cards = (aiJson.cards || []).map((p) => {
        const source = byId[p.sourceId] || null;

        return {
          type: p.type || '',
          label:
            p.type === 'price' ? '가격순' :
            p.type === 'review' ? '리뷰순' :
            p.type === 'popular' ? '인기순' :
            p.type === 'trust' ? '신뢰순' :
            (p.label || ''),
          name: source ? source.name : '',
          price: source ? source.price : '',
          store: source ? source.store : '',
          delivery: source ? source.delivery : '',
          review: source ? source.review : '',
          reason: p.reason || '',
          image: source ? source.image : '',
          link: source ? source.link : '',
          sourceId: p.sourceId || ''
        };
      });

      const aiPickSourceType = aiJson.aiPickSourceType || '';
      const aiBase = cards.find(card => card.type === aiPickSourceType) || cards[0] || null;

      const aiPick = aiBase ? {
        ...aiBase,
        type: 'ai',
        label: 'AI추천'
      } : null;

      const orderedCards = [
        ...(aiPick ? [aiPick] : []),
        ...cards
      ];

      return {
        cards: orderedCards,
        rejects: aiJson.rejects || []
      };
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

    async function sendMsg() {
  if (loading) return;

  const inp = getInput();
  const txt = inp.value.trim();
  if (!txt && !pendingImg) return;

  switchToSearchMode();
  document.getElementById('content').innerHTML = '';

  if (txt) searchHistory.push(txt);

  renderHistoryBar();
  addUserMsg(txt || '📷 이미지로 검색', pendingImg?.src);

  const queryText = txt || '이미지 기반 상품 검색';
  const searchQuery = queryText;

  inp.value = '';
  autoResize(inp);
  removeImg();

  loading = true;
  getSendBtn().disabled = true;
  const typingEl = addTyping();

  try {
    const searchData = await window.ThisOneAPI.requestSearch(searchQuery);
    const candidates = buildCandidates(searchData.items || [], queryText);

    if (!candidates.length) {
      typingEl.remove();
      addFallback('검색 결과가 없습니다.');
      loading = false;
      getSendBtn().disabled = false;
      getInput().focus();
      return;
    }

    const aiData = await window.ThisOneAPI.requestChat({
      model: MODEL,
      max_tokens: 1200,
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
- bonusScore와 bonusReasons를 꼭 참고하세요.
- AI추천은 bonusScore가 높은 후보를 우선 고려하세요.
- name, price, store, image, link는 직접 생성하지 말고 sourceId로 연결만 하세요.
- JSON만 출력하세요.`
            }
          ]
        }
      ]
    });

    typingEl.remove();

    if (aiData.error) {
      addFallback('API 오류: ' + (typeof aiData.error === 'string' ? aiData.error : JSON.stringify(aiData.error)));
    } else {
      const raw = Array.isArray(aiData.content)
        ? aiData.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
        : '';

      try {
        let clean = raw.replace(/```json|```/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) clean = jsonMatch[0];

        const parsed = JSON.parse(clean);
        const cleaned = deepClean(parsed);
        const merged = mergeAiWithCandidates(cleaned, candidates);
        addResultCard(merged);
      } catch (e) {
        addFallback(raw || '응답을 파싱할 수 없습니다.');
      }
    }
  } catch (err) {
    typingEl.remove();
    addFallback('검색 중 오류: ' + err.message);
  }

  loading = false;
  getSendBtn().disabled = false;
  getInput().focus();
}

        const aiData = await window.ThisOneAPI.requestChat({
  model: MODEL,
  max_tokens: 1200,
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
- bonusScore와 bonusReasons를 꼭 참고하세요.
- AI추천은 bonusScore가 높은 후보를 우선 고려하세요.
- name, price, store, image, link는 직접 생성하지 말고 sourceId로 연결만 하세요.
- JSON만 출력하세요.`
        }
      ]
    }
  ]
});

        typingEl.remove();

        if (aiData.error) {
          addFallback('API 오류: ' + (typeof aiData.error === 'string' ? aiData.error : JSON.stringify(aiData.error)));
        } else {
          const raw = Array.isArray(aiData.content)
            ? aiData.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
            : '';

          try {
            let clean = raw.replace(/```json|```/g, '').trim();
            const jsonMatch = clean.match(/\{[\s\S]*\}/);
            if (jsonMatch) clean = jsonMatch[0];

            const parsed = JSON.parse(clean);
            const cleaned = deepClean(parsed);
            const merged = mergeAiWithCandidates(cleaned, candidates);
            addResultCard(merged);
          } catch (e) {
            addFallback(raw || '응답을 파싱할 수 없습니다.');
          }
        }
      } catch (err) {
        typingEl.remove();
        addFallback('검색 중 오류: ' + err.message);
      }

      loading = false;
      getSendBtn().disabled = false;
      getInput().focus();
    }
