// ---- 전역 설정 및 모델 정의 ----
if (typeof window.NOEL === 'undefined') window.NOEL = 'gemini-2.0-flash';
var NOEL = window.NOEL;

// --- 관리자 통계 및 트래킹 로직 ---
async function trackVisit() {
  try { fetch('/api/stats?action=track'); } catch(e) {}
}

let ftrClickCount = 0;
function handleFooterClick() {
  ftrClickCount++;
  if (ftrClickCount >= 3) {
    ftrClickCount = 0;
    const pw = prompt('관리자 비밀번호를 입력하세요.');
    if (pw) openAdminStats(pw);
  }
  setTimeout(() => { ftrClickCount = 0; }, 2000); // 2초 후 초기화
}

async function openAdminStats(pw) {
  try {
    const res = await fetch(`/api/stats?action=get&pw=${pw}`);
    const result = await res.json();
    if (res.ok && result.success) {
      if (window.ThisOneUI && window.ThisOneUI.showAdminStats) {
        window.ThisOneUI.showAdminStats(result.data);
      }
    } else {
      alert(result.message || '인증 실패');
    }
  } catch(e) { alert('통계 로딩 실패'); }
}

window.addEventListener('load', () => {
  trackVisit();
  if (typeof window.ThisOneUI?.loadDynamicTrends === 'function') {
    window.ThisOneUI.loadDynamicTrends();
  }
});
const MINI_SCOPE_ICON = '<svg width="10" height="10" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="14" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/><circle cx="32" cy="32" r="5" fill="#fff"/><line x1="32" y1="6" x2="32" y2="18" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="32" y1="46" x2="32" y2="58" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="6" y1="32" x2="18" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><line x1="46" y1="32" x2="58" y2="32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/></svg>';

let pendingImg = null;
let loading = false;
let isSearchMode = false;
let searchHistory = [];
// currentQuery는 index.html에서 이미 선언되었습니다.
let searchMode = 'thisone';
let _lastIntentProfile = null;

const RANKING_PROMPT = `당신은 ThisOne 구매결정 AI입니다.
반드시 다음 순서로 출력하세요:
1. [Thought]: 사용자의 의도 분석 및 추천 전략 (2~3문장)
2. [JSON]: 상품 추천 결과 (JSON 블록)

JSON 스키마:
{
  "cards": [
    { 
      "sourceId": "후보의 id", 
      "label": "짧은 추천 태그 (예: 🏆 최우수 추천, 💰 최저가 등)", 
      "reason": "추천 이유(1~2문장)" 
    }
  ],
  "rejects": [
    { "name": "제외 상품명", "reason": "제외 이유" }
  ]
}

JSON 외의 다른 텍스트는 [Thought] 섹션에만 포함하세요.`;

function getInput() { return document.getElementById(isSearchMode ? 'msgInput2' : 'msgInput'); }
function getSendBtn() { return document.getElementById(isSearchMode ? 'sendBtn2' : 'sendBtn'); }

function goHome() {
  location.href = '/';
}

function switchToSearchMode() {
  if (isSearchMode) return;
  isSearchMode = true;
  document.body.classList.add('search-mode'); // CSS 제어를 위한 클래스 추가

  const landing = document.getElementById('landing'),
        stickySearch = document.getElementById('stickySearch'),
        content = document.getElementById('content'),
        mainHdr = document.getElementById('mainHeader');
  
  if (landing) landing.style.display = 'none';
  if (mainHdr) mainHdr.classList.add('hidden');
  
  if (stickySearch) {
    stickySearch.style.setProperty('display', 'flex', 'important');
    stickySearch.style.setProperty('position', 'fixed', 'important');
    stickySearch.style.setProperty('top', '0', 'important');
    stickySearch.style.setProperty('z-index', '20000', 'important');
  }
  if (content) {
    content.style.display = 'block';
    content.style.setProperty('padding-top', '80px', 'important');
    content.style.minHeight = '100vh';
  }
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

function extractJSON(str) {
  if (!str) return null;
  try {
    // 1단계: 마크다운 코드 블록 제거
    let cleanStr = str.replace(/```json|```/g, '').trim();
    
    // 2단계: 최외각 중괄호 { } 구간 정밀 추출
    const firstOpen = cleanStr.indexOf('{');
    const lastClose = cleanStr.lastIndexOf('}');
    if (firstOpen === -1 || lastClose === -1) return null;
    
    let candidate = cleanStr.substring(firstOpen, lastClose + 1);
    
    // 3단계: 일반 파싱 시도
    try {
      return JSON.parse(candidate);
    } catch (e) {
      // 4단계: 잘린 JSON 복구 시도 (실험적)
      console.warn("Standard JSON parse failed, attempting recovery...");
      try { return JSON.parse(candidate + '}'); } catch(e2) {}
      try { return JSON.parse(candidate + ']}'); } catch(e3) {}
      try { return JSON.parse(candidate + '"]}'); } catch(e4) {}
      return null;
    }
  } catch (e) {
    console.error("JSON extraction failed", e);
    return null;
  }
}

async function sendMsg(forceMode) {
  try {
    if (loading) return;
    if (forceMode) setSearchMode(forceMode);

    const inp = getInput();
    const txt = inp ? inp.value.trim() : "";
    if (!txt && !pendingImg) return;
    currentQuery = txt; // 쿼리 저장 복구

    // 모바일 스크롤 진압 1단계: 즉시 포커스 해제 및 키보드 닫기
    if (inp) inp.blur();

    // 모바일 스크롤 진압 2단계: 여러 번에 걸쳐 상단 고정 (키보드 닫힘 애니메이션 대응)
    const fixScroll = () => {
      // 강제 상단 이동 제거 (사용자 불편 호소)
      // document.body.scrollTop = 0;
    };
    fixScroll();
    setTimeout(fixScroll, 100);
    setTimeout(fixScroll, 300);
    setTimeout(fixScroll, 600);
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
    const typingEl = window.ThisOneUI?.addThinking?.();

    try {
      let searchQuery = queryText;
      if (window.ThisOneRanking?.rewriteSearchQuery) searchQuery = window.ThisOneRanking.rewriteSearchQuery(queryText);

      // 설정값이 존재하지 않을 경우(모달을 열지 않았을 때 등)를 위한 샌니타이징
      const getVal = (id) => document.getElementById(id)?.value || '';
      const getCheck = (id) => document.getElementById(id)?.checked || false;

      const expertSettings = {
        minPrice: getVal('minPrice'),
        maxPrice: getVal('maxPrice'),
        freeShipping: getCheck('freeShipping'),
        excludeOverseas: getCheck('excludeOverseas'),
        excludeAgent: getCheck('excludeAgent'),
        excludeUsed: getCheck('excludeUsed'),
        excludeRental: getCheck('excludeRental'), // include -> exclude 수정
        resultCount: getVal('resultCount') || 5,
        patienceTime: getVal('patienceTime') || 20
      };
      const trajectory = window.ThisOneTrajectory?.getSession() || {};

      typingEl?.updateThought?.('다양한 상품 데이터 수집 중...');
      const [searchData, intentProfileResult] = await Promise.all([
        window.ThisOneAPI.requestSearch(searchQuery, expertSettings),
        window.ThisOneAPI.requestIntentInfer(queryText, trajectory, queryImage).catch(() => null)
      ]);

      const items = searchData?.items || [];
      let intentProfile = intentProfileResult;
      _lastIntentProfile = intentProfile;

      typingEl?.updateThought?.('상품 데이터 및 형상 분석 선별 중...');
      const candidates = window.ThisOneRanking?.buildCandidates ? window.ThisOneRanking.buildCandidates(items, queryText, intentProfile) : items;

      if (!candidates || !candidates.length) {
        typingEl?.remove();
        window.ThisOneUI?.addFallback?.('검색 결과가 없습니다.');
        return;
      }

      // [Early Rendering] 수집된 결과를 즉시 화면에 노출 (사용자 대기 시간 제거)
      window.ThisOneUI?.renderRawResults?.(candidates);

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
      typingEl?.updateThought?.(`검색결과 생성 중 (분석시간 설정: ${expertSettings.patienceTime || 20}초)...`);

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

      const patience = parseInt(expertSettings.patienceTime || 20);
      const tokens = Math.min(400 + (patience * 20), 2000); // 인내심에 비례하여 응답 길이 조절

      let depthPrompt = " 핵심 위주로 빠르게 요약하세요.";
      if (patience > 30) depthPrompt = " 모든 후보의 스펙, 리뷰, 장단점을 초정밀 대조하여 가장 심도 있는 전문가 분석 리포트를 작성하세요. 분량이 길어져도 괜찮습니다.";
      else if (patience > 10) depthPrompt = " 상품별 주요 차이점을 꼼꼼하게 분석하여 리포트를 작성하세요.";

      const aiDataText = await window.ThisOneAPI.requestChat({ 
        model: MODEL, 
        max_tokens: tokens, 
        system: RANKING_PROMPT + depthPrompt, 
        messages: aiMessages 
      }, (chunk, fullText) => {
        // [보안/UI] JSON 징후가 보이면 즉시 업데이트를 멈추고 고정 메시지 표시
        if (fullText.includes('[JSON]') || fullText.includes('{') || fullText.includes('":') || fullText.includes('```')) {
          typingEl?.updateLiveResponse('최종 추천 리포트를 생성하고 있습니다...'); 
          return;
        }

        // [Thought] 섹션만 정밀하게 추출하여 표시 (대소문자/괄호 유연하게 대응)
        const thoughtMatch = fullText.match(/\[?Thought\]?:?(.*?)(?=\[?JSON\]?|$)/si);
        if (thoughtMatch && thoughtMatch[1]) {
          typingEl?.updateLiveResponse(thoughtMatch[1].trim());
        }
      });

      typingEl?.remove();

      if (!aiDataText || !aiDataText.trim()) {
        console.warn('AI returned empty response.');
        window.ThisOneUI?.addFallback?.('지능형 엔진이 현재 분석 중입니다. 잠시 후 다시 시도하거나 일반 검색 결과를 확인해 주세요.');
        window.ThisOneUI?.renderRawResults?.(candidates);
        return;
      }

      try {
        // JSON 영역 추출 ([JSON]: 이후부터 끝까지)
        const jsonMatch = aiDataText.match(/\[JSON\]:?\s*(\{[\s\S]*\})/);
        const rawJson = jsonMatch ? jsonMatch[1] : aiDataText;
        const parsed = extractJSON(rawJson);
        
        if (!parsed) throw new Error('Valid JSON block not found');
        
        const merged = window.ThisOneRanking?.mergeAiWithCandidates ? window.ThisOneRanking.mergeAiWithCandidates(deepClean(parsed), candidates) : parsed;
        window.ThisOneUI?.addResultCard?.(merged);
        
        // 모바일 포함 전방위 스크롤 진압: 부드럽게 상단 이동
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          // 로고 쪽으로 시선 고정하되, 너무 강제적이지 않게
          const logo = document.querySelector('#stickySearch .logo') || document.querySelector('.hdr .logo');
          if (logo) logo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100); 
      } catch (e) {
        console.warn("Silent Fallback Triggered", e);
        window.ThisOneUI?.addFallback?.(); // 조용하고 우아한 마무리 문구 출력
        
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
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
  } catch (globalErr) {
    console.error("[ThisOne] Global sendMsg Error:", globalErr);
    loading = false;
  }
}

function loadTrendingChips() {
  const container = document.getElementById('trendingChips');
  if (!container) return;
  const chips = [
    { text: '로보락 S8 MaxV Ultra', query: '로보락 S8 MaxV Ultra' },
    { text: '비스포크 AI 콤보', query: '비스포크 AI 콤보' },
    { text: '다이슨 에어랩 멀티 스타일러', query: '다이슨 에어랩 멀티 스타일러' },
    { text: '스탠바이미 Go', query: '스탠바이미 Go' },
    { text: '아이패드 프로 M4', query: '아이패드 프로 M4' }
  ];
  container.innerHTML = chips.map((c, i) => `
    <button class="chip" onclick="quick('${c.query}')" style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(226, 232, 240, 0.8); padding: 8px 16px; border-radius: 20px; font-size: 14px; color: #475569; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; font-weight: 500;">
      <span style="font-weight: 800; color: #3b82f6; font-size: 12px; opacity: 0.8;">${i + 1}</span>
      ${c.text}
    </button>
  `).join('');
}

// window.toggleFilterModal은 index.html에서 통합 관리합니다. (중복 제거)

// 설정 로딩 기능 제거 (새로고침 시 초기화 원칙)
function loadExpertSettings() {
  // 사용하지 않음
}

function saveExpertSettings() {
  const settings = {
    minPrice: document.getElementById('minPrice')?.value || '',
    maxPrice: document.getElementById('maxPrice')?.value || '',
    freeShipping: document.getElementById('freeShipping')?.checked || false,
    excludeOverseas: document.getElementById('excludeOverseas')?.checked || false,
    excludeAgent: document.getElementById('excludeAgent')?.checked || false,
    excludeUsed: document.getElementById('excludeUsed')?.checked || false,
    excludeRental: document.getElementById('excludeRental')?.checked || false,
    resultCount: document.getElementById('resultCount')?.value || 5,
    patienceTime: document.getElementById('patienceTime')?.value || 20
  };

  // UI는 새로고침 시 초기화되더라도, 사용자의 설정 의도는 별도의 메모리(Trajectory)에 기록하여 AI가 참고하게 함
  if (window.ThisOneTrajectory?.logEvent) {
    window.ThisOneTrajectory.logEvent('expert_settings_applied', settings);
  }

  // 설정창 닫기 (최신 토글 함수 호출)
  if (typeof window.toggleFilterModal === 'function') {
    window.toggleFilterModal();
  }
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
  document.getElementById('sendBtn')?.addEventListener('click', () => sendMsg('thisone'));
  document.getElementById('rawSearchBtn')?.addEventListener('click', () => sendMsg('raw'));
  
  // 이미지 붙여넣기 지원
  document.addEventListener('paste', handlePaste);
});
