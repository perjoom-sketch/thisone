const MODEL = window.ThisOneConfig?.MODEL_NAME || 'gemini-2.5-flash';
const MINI_SCOPE = '<svg width="10" height="10" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="14" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/><circle cx="32" cy="32" r="5" fill="#fff"/><line x1="32" y1="6" x2="32" y2="18" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="32" y1="46" x2="32" y2="58" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="6" y1="32" x2="18" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="46" y1="32" x2="58" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/></svg>';

let pendingImg = null;
let loading = false;
let isSearchMode = false;
let searchHistory = [];
let currentQuery = '';
let searchMode = 'thisone';
let _lastIntentProfile = null;

const RANKING_PROMPT = `당신은 ThisOne 구매결정 AI입니다.
절대 <cite>, </cite>, <b>, </b> 같은 태그를 출력하지 마세요.
반드시 제공된 후보 상품 목록 안에서만 고르세요.
반드시 JSON만 출력하세요.`;

function getInput() { return document.getElementById(isSearchMode ? 'msgInput2' : 'msgInput'); }
function getSendBtn() { return document.getElementById(isSearchMode ? 'sendBtn2' : 'sendBtn'); }

function goHome() {
  location.href = '/';
}

function switchToSearchMode() {
  if (isSearchMode) return;
  isSearchMode = true;
  const landing = document.getElementById('landing'), stickySearch = document.getElementById('stickySearch'), content = document.getElementById('content');
  if (landing) landing.style.display = 'none';
  if (stickySearch) stickySearch.style.display = 'block';
  if (content) content.style.display = 'block';
}

function autoResize(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 100) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }
function quick(t) { currentQuery = t; syncQueryInputs(t); setSearchMode('thisone'); sendMsg(); }

function handleImg(e) {
  const file = e.target.files[0];
  if (!file) return;
  processFile(file);
}

function handlePaste(e) {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      const file = item.getAsFile();
      processFile(file);
    }
  }
}

function processFile(file) {
  const r = new FileReader();
  r.onload = (ev) => {
    pendingImg = { data: ev.target.result.split(',')[1], src: ev.target.result };
    
    // 두 개의 미리보기 영역 동기화
    ['imgPreview', 'imgPreview2'].forEach(id => {
      const pv = document.getElementById(id);
      const el = document.getElementById(id === 'imgPreview' ? 'previewImg' : 'previewImg2');
      if (el) el.src = ev.target.result;
      if (pv) pv.classList.add('show');
    });
  };
  r.readAsDataURL(file);
}

function removeImg() {
  pendingImg = null;
  ['imgPreview', 'imgPreview2'].forEach(id => {
    const pv = document.getElementById(id);
    if (pv) pv.classList.remove('show');
  });
}

function stripCitations(text) { return String(text || '').replace(/<cite\b[^>]*>|<\/cite>|<b>|<\/b>/gi, '').trim(); }
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

function syncQueryInputs(t) {
  ['msgInput', 'msgInput2'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.value = t; autoResize(el); }
  });
}

function setSearchMode(mode) {
  searchMode = mode;
  const r = document.getElementById('rawSearchBtn'), t = document.getElementById('thisoneSearchBtn');
  if (r) r.classList.toggle('active', mode === 'raw');
  if (t) t.classList.toggle('active', mode === 'thisone');
}

async function sendMsg(forceMode) {
  if (loading) return;
  if (forceMode) setSearchMode(forceMode);
  const inp = getInput();
  if (!inp) return;
  const txt = inp.value.trim();
  if (txt) currentQuery = txt;
  if (!currentQuery && !pendingImg) return;

  switchToSearchMode();
  const contentEl = document.getElementById('content');
  if (contentEl) contentEl.innerHTML = '';
  if (txt) searchHistory.push(txt);
  syncQueryInputs(currentQuery);
  if (window.ThisOneUI?.renderHistoryBar) window.ThisOneUI.renderHistoryBar();

  const queryText = currentQuery || '이미지 기반 상품 검색';
  const queryImage = pendingImg;
  removeImg();

  loading = true;
  const btn = getSendBtn(); if (btn) btn.disabled = true;
  const typingEl = window.ThisOneUI?.addTyping?.();

  try {
    let searchQuery = queryText;
    if (window.ThisOneRanking?.rewriteSearchQuery) searchQuery = window.ThisOneRanking.rewriteSearchQuery(queryText);

    typingEl?.updateStatus?.('의도 분석 및 시장 데이터 수집 중...', '사용자가 진짜 원하는 가치를 추론하고 있습니다.');
    const savedSettings = localStorage.getItem('thisone_expert_settings');
    const expertSettings = savedSettings ? JSON.parse(savedSettings) : {};
    const trajectory = window.ThisOneTrajectory?.getSession() || {};

    const [searchData, intentProfileResult] = await Promise.all([
      window.ThisOneAPI.requestSearch(searchQuery, expertSettings),
      window.ThisOneAPI.requestIntentInfer(queryText, trajectory, queryImage).catch(() => null)
    ]);

    const items = searchData?.items || [];
    let intentProfile = intentProfileResult;
    _lastIntentProfile = intentProfile;

    typingEl?.updateStatus?.('전문가 안목으로 상품 선별 중...', '최저가 낚시 및 부적합 상품을 정밀 필터링합니다.');
    const candidates = window.ThisOneRanking?.buildCandidates ? window.ThisOneRanking.buildCandidates(items, queryText, intentProfile) : items;

    if (!candidates || !candidates.length) {
      typingEl?.remove();
      window.ThisOneUI?.addFallback?.('검색 결과가 없습니다.');
      return;
    }

    if (searchMode === 'raw') {
      typingEl?.remove();
      window.ThisOneUI?.renderRawResults?.(candidates);
      return;
    }

    const prunedCandidates = candidates.map(c => ({
      id: c.id, name: c.name, price: c.price, store: c.store, review: c.review,
      badges: c.badges, bonusScore: c.bonusScore, specPenalty: c.specPenalty,
      finalScore: c.finalScore, totalPriceNum: c.totalPriceNum
    }));

    const count = expertSettings.resultCount || 5;
    typingEl?.updateStatus?.('최종 추천 리포트 작성 중...', `고민을 해결해 줄 최적의 상품 ${count}개를 선정합니다.`);

    const aiMessages = [{
      role: 'user',
      content: [{ 
        type: 'text', 
        text: `사용자 질문: ${queryText}\n\n후보 상품 목록(JSON): ${JSON.stringify(prunedCandidates, null, 2)}\n\n의도분석: ${JSON.stringify(intentProfile)}\n\n설정: ${JSON.stringify(expertSettings)}\n\n전문가 분석을 바탕으로 cards ${count}개를 추천하세요.` 
      }]
    }];
    
    if (queryImage && queryImage.data) {
      aiMessages[0].content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${queryImage.data}` } });
    }

    const aiData = await window.ThisOneAPI.requestChat({ 
      model: MODEL, 
      max_tokens: 1400, 
      system: RANKING_PROMPT, 
      messages: aiMessages 
    });

    typingEl?.remove();

    if (aiData?.error) {
      window.ThisOneUI?.addFallback?.('AI 분석 서버 혼잡으로 검색 결과만 보여줍니다.');
      window.ThisOneUI?.renderRawResults?.(candidates);
      return;
    }

    const raw = Array.isArray(aiData?.content) ? aiData.content.filter(b => b.type === 'text').map(b => b.text).join('') : '';
    
    if (!raw.trim()) {
      console.warn('AI returned empty response.');
      window.ThisOneUI?.addFallback?.('지능형 엔진이 현재 분석 중입니다. 잠시 후 다시 시도하거나 일반 검색 결과를 확인해 주세요.');
      window.ThisOneUI?.renderRawResults?.(candidates);
      return;
    }

    try {
      let clean = raw.replace(/```json|```/g, '').trim();
      
      const jsonMatches = clean.match(/\{[\s\S]*\}/g);
      if (jsonMatches) {
        clean = jsonMatches.reduce((a, b) => {
          if (b.includes('"cards"') && b.length > a.length) return b;
          return a.length > b.length ? a : b;
        }, "");
      }

      if (!clean || !clean.startsWith('{')) throw new Error('Valid JSON block not found');

      const parsed = JSON.parse(clean);
      const merged = window.ThisOneRanking?.mergeAiWithCandidates ? window.ThisOneRanking.mergeAiWithCandidates(deepClean(parsed), candidates) : parsed;
      window.ThisOneUI?.addResultCard?.(merged);
    } catch (e) {
      console.error('Parsing error details:', e, 'Raw content:', raw);
      window.ThisOneUI?.addFallback?.('지능형 리포트 생성 중 데이터 형식이 맞지 않아 일반 결과를 노출합니다.');
      window.ThisOneUI?.renderRawResults?.(candidates);
    }
  } catch (err) {
    console.error(err);
    typingEl?.remove();
    window.ThisOneUI?.addFallback?.('검색 중 오류 발생');
  } finally {
    loading = false;
    const b = getSendBtn(); if (b) b.disabled = false;
    getInput()?.focus();
  }
}

function loadTrendingChips() {
  const container = document.getElementById('trendingChips');
  if (!container) return;
  const chips = [
    { text: '로보락 S8 MaxV', query: '로보락 S8 MaxV' },
    { text: '삼성 비스포크 AI 세탁건조기', query: '삼성 비스포크 AI 세탁건조기' },
    { text: 'LG 트롬 워시콤보', query: 'LG 트롬 워시콤보' },
    { text: '다이슨 에어랩', query: '다이슨 에어랩' },
    { text: '가성비 정수기 렌탈', query: '정수기 렌탈 가격비교' }
  ];
  container.innerHTML = chips.map(c => `<button class="chip" onclick="quick('${c.query}')">${c.text}</button>`).join('');
}

function toggleFilterModal() {
  const el = document.getElementById('inlineFilter');
  if (!el) return;
  const isShow = el.style.display !== 'none';
  
  if (!isShow) {
    loadExpertSettings();
    el.style.display = 'block';
    el.style.animation = 'inlineSlideDown 0.3s ease-out forwards';
  } else {
    el.style.display = 'none';
  }
}

function loadExpertSettings() {
  const saved = localStorage.getItem('thisone_expert_settings');
  if (!saved) return;
  const settings = JSON.parse(saved);
  document.getElementById('minPrice').value = settings.minPrice || '';
  document.getElementById('maxPrice').value = settings.maxPrice || '';
  document.getElementById('freeShipping').checked = !!settings.freeShipping;
  document.getElementById('excludeOverseas').checked = !!settings.excludeOverseas;
  document.getElementById('excludeAgent').checked = !!settings.excludeAgent;
  document.getElementById('excludeUsed').checked = !!settings.excludeUsed;
  document.getElementById('includeRental').checked = !!settings.includeRental;
  if (settings.resultCount) document.getElementById('resultCount').value = settings.resultCount;
}

function saveExpertSettings() {
  const settings = {
    minPrice: document.getElementById('minPrice').value,
    maxPrice: document.getElementById('maxPrice').value,
    freeShipping: document.getElementById('freeShipping').checked,
    excludeOverseas: document.getElementById('excludeOverseas').checked,
    excludeAgent: document.getElementById('excludeAgent').checked,
    excludeUsed: document.getElementById('excludeUsed').checked,
    includeRental: document.getElementById('includeRental').checked,
    resultCount: document.getElementById('resultCount').value
  };
  localStorage.setItem('thisone_expert_settings', JSON.stringify(settings));
  
  // 저장 후 프레임 접기
  const el = document.getElementById('inlineFilter');
  if (el) el.style.display = 'none';
  
  alert('설정이 저장되었습니다.');
}

function applyPcView() {
  const isPc = localStorage.getItem('thisone_pc_view') === 'true';
  const meta = document.querySelector('meta[name="viewport"]');
  const btn = document.getElementById('pcViewBtn');
  if (!meta) return;

  if (isPc) {
    meta.setAttribute('content', 'width=1200, initial-scale=0.3, maximum-scale=2.0');
    if (btn) btn.innerHTML = '📱 모바일 버전으로 보기';
  } else {
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
    if (btn) btn.innerHTML = '💻 PC 버전으로 보기';
  }
}

function togglePcView() {
  const isPc = localStorage.getItem('thisone_pc_view') === 'true';
  localStorage.setItem('thisone_pc_view', !isPc);
  applyPcView();
  // 설정창 닫기
  toggleFilterModal();
}

document.addEventListener('DOMContentLoaded', () => {
  applyPcView();
  loadTrendingChips();
  document.getElementById('thisoneSearchBtn')?.addEventListener('click', () => sendMsg('thisone'));
  document.getElementById('rawSearchBtn')?.addEventListener('click', () => sendMsg('raw'));
  
  // 이미지 붙여넣기 지원
  document.addEventListener('paste', handlePaste);
});
