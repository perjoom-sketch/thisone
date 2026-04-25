// ---- 전역 설정 및 모델 정의 ----
if (typeof window.MODEL === 'undefined') window.MODEL = 'gemini-2.5-flash';
if (typeof window.NOEL === 'undefined') window.NOEL = window.MODEL;
var MODEL = window.MODEL;
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

// 일반 검색 상태 관리
const GeneralSearchState = {
  currentPage: 1,
  currentSort: 'sim',
  total: 0,
  query: '',
  resultMode: 'normal'
};

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

function getInput() { return document.getElementById('msgInput'); }
function getSendBtn() { return document.getElementById('sendBtn'); }

function goHome() {
  location.href = '/';
}

function switchToSearchMode() {
  if (isSearchMode) return;
  isSearchMode = true;
  document.body.classList.add('search-mode');
}

function autoResize(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 100) + 'px'; }
function handleKey(e) {
  if (e.isComposing === true || e.keyCode === 229 || e.which === 229) return;
  if (e.key !== 'Enter') return;
  if (e.shiftKey) return;
  e.preventDefault();
  sendMsg('thisone');
}
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
    pendingImg = { 
      data: ev.target.result.split(',')[1], 
      src: ev.target.result,
      type: file.type || 'image/jpeg'
    };
    
    // 두 개의 미리보기 영역 동기화
    const pv = document.getElementById('imgPreview');
    const el = document.getElementById('previewImg');
    if (el) el.src = ev.target.result;
    if (pv) { pv.classList.add('show'); }
  };
  r.readAsDataURL(file);
}

function removeImg() {
  pendingImg = null;
  const pv = document.getElementById('imgPreview');
  if (pv) pv.classList.remove('show');
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

function setSearchMode(mode) {
  searchMode = mode;
  // 구버전 버튼 스타일링 로직은 제거 (UI 미노출 대응)
}

function syncQueryInputs(t) {
  ['msgInput', 'msgInput2'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.value = t; autoResize(el); }
  });
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
  
  // 3단계 강제 제압: 구버전 요소 완전 소멸
  // 검색 후에도 검색창은 남겨두기 위해 landingSearch 제외
  ['welcome'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
    }
  });

  const contentEl = document.getElementById('msgContainer');
    if (contentEl) contentEl.innerHTML = '';
    if (txt) searchHistory.push(txt);
    syncQueryInputs(currentQuery);
    // 구버전 역사의 잔재(HistoryBar) 제거
    // if (window.ThisOneUI?.renderHistoryBar) window.ThisOneUI.renderHistoryBar();

    const queryText = currentQuery || '이미지 기반 상품 검색';
    const queryImage = pendingImg;
    removeImg();

    loading = true;
    const btn = getSendBtn(); if (btn) btn.disabled = true;
    const typingEl = window.ThisOneUI?.addThinking?.();

    let candidates = null;
    try {
      GeneralSearchState.resultMode = 'normal';
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
        excludeRental: getCheck('excludeRental'),
        resultCount: parseInt(getVal('resultCount')) || 5,
        patienceTime: parseInt(getVal('patienceTime')) || 20
      };
      const trajectory = window.ThisOneTrajectory?.getSession() || {};

      typingEl?.updateThought?.('이미지 분석 및 검색 의도 파악 중...');
      
      let intentProfile = null;
      let finalSearchQuery = searchQuery;

      // 이미지 검색 최적화
      if (queryImage) {
        console.log("[Vision] 1차 이미지 분석 시작...");
        try {
          // [방향 A] 이미지 검색 시 입력창 텍스트 격리 (비전 인식 오염 방지)
          intentProfile = await window.ThisOneAPI.requestIntentInfer('', trajectory, queryImage);
          if (intentProfile?.refinedSearchTerm) {
            finalSearchQuery = intentProfile.refinedSearchTerm;
            console.log(`%c[Vision] 분석 성공: ${finalSearchQuery}`, "color: #10b981; font-weight: bold;");
            typingEl?.updateThought?.(`식별된 상품("${finalSearchQuery}") 데이터 수집 중...`);
          } else {
            console.warn("[Vision] AI가 상품명을 식별하지 못함. 이미지 전용 검색 중단.");
            typingEl?.remove();
            window.ThisOneUI?.addFallback?.('이미지 속 상품을 식별하지 못했습니다. 명확한 사진으로 다시 시도해주세요.');
            return;
          }
        } catch (e) {
          console.error("[Vision] 이미지 분석 치명적 실패:", e);
          typingEl?.remove();
          window.ThisOneUI?.addFallback?.('이미지 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
          return;
        }
      }

      console.log(`[Search] 쿼리 실행: ${finalSearchQuery}`);
      let searchData = await window.ThisOneAPI.requestSearch(finalSearchQuery, expertSettings);
      
      // [신규] 결과가 0건일 경우 재시도 로직 (다단계 검색)
      if ((!searchData?.items || searchData.items.length === 0) && finalSearchQuery !== searchQuery) {
        if (searchQuery === '이미지 기반 상품 검색') {
          console.warn(`[ThisOne] "${finalSearchQuery}" 결과 없음. 이미지 검색만으로는 결과를 찾을 수 없습니다.`);
          typingEl?.remove();
          window.ThisOneUI?.addFallback?.('이미지에 해당하는 상품을 쇼핑 데이터에서 찾을 수 없습니다.');
          return;
        }
        console.warn(`[ThisOne] "${finalSearchQuery}" 결과 없음. 원본 쿼리 "${searchQuery}"로 재시도...`);
        typingEl?.updateThought?.(`정밀 검색 결과가 부족하여 범위를 넓혀 재검색 중...`);
        searchData = await window.ThisOneAPI.requestSearch(searchQuery, expertSettings);
      }

      // [개선] intentProfile이 이미 있다면 중복 호출 방지
      if (!intentProfile && !queryImage) {
        intentProfile = await window.ThisOneAPI.requestIntentInfer(queryText, trajectory, null).catch(() => null);
      }

      const items = searchData?.items || [];
      _lastIntentProfile = intentProfile;

      typingEl?.updateThought?.('상품 데이터 및 형상 분석 선별 중...');
      candidates = window.ThisOneRanking?.buildCandidates ? window.ThisOneRanking.buildCandidates(items, finalSearchQuery, intentProfile) : items;

      if (!candidates || !candidates.length) {
        typingEl?.remove();
        window.ThisOneUI?.addFallback?.('검색 결과가 없습니다.');
        return;
      }

      // [삭제] 구버전으로 오해받을 수 있는 Raw Results 렌더링 제거
      // window.ThisOneUI?.renderRawResults?.(candidates);
      
      // if (searchMode === 'raw') {
      //   typingEl?.remove();
      //   window.ThisOneUI?.renderRawResults?.(candidates);
      //   return;
      // }

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

      let delayTimer = null;
      let autoFallbackTimer = null;
      let isFallbackShown = false;
      const searchStartTime = Date.now();

      const triggerFallback = (reason = 'delay') => {
        if (isFallbackShown || !loading) return;
        isFallbackShown = true;
        
        // 모든 타이머 해제
        if (delayTimer) clearTimeout(delayTimer);
        if (autoFallbackTimer) clearTimeout(autoFallbackTimer);
        
        typingEl?.remove();
        
        const elapsed = Math.round((Date.now() - searchStartTime) / 1000);
        let msg = `데이터 분석이 지연되고 있어(${elapsed}초), 디스원 AI 추천이 아닌 일반 검색 결과를 먼저 보여드립니다.`;
        if (reason === 'error') msg = `AI 분석 중 오류가 발생하여(${elapsed}초), 디스원 AI 추천이 아닌 일반 검색 결과를 먼저 보여드립니다.`;
        
        window.ThisOneUI?.addFallback?.(msg);
        
        GeneralSearchState.query = finalSearchQuery;
        GeneralSearchState.currentPage = 1;
        GeneralSearchState.total = searchData?.total || 0;
        GeneralSearchState.resultMode = 'fallback_general';

        const allowedSorts = ['sim', 'asc'];
        const preservedSort = allowedSorts.includes(GeneralSearchState.currentSort)
          ? GeneralSearchState.currentSort
          : 'sim'; // 정렬 상태가 없으면 관련도 기준으로
        GeneralSearchState.currentSort = preservedSort;

        window.ThisOneUI?.renderResults?.(
          candidates,
          GeneralSearchState.total,
          GeneralSearchState.currentPage,
          GeneralSearchState.currentSort,
          GeneralSearchState.resultMode
        );
      };

      // 8초 지연 타이머: 메시지 변경 및 버튼 노출
      delayTimer = setTimeout(() => {
        if (!isFallbackShown && loading) {
          typingEl?.updateThought?.('분석이 지연되고 있습니다. 조금만 더 기다려주시거나, 일반 결과를 먼저 확인하실 수 있습니다.');
          typingEl?.showFallbackButton?.(() => triggerFallback('manual'));
        }
      }, 8000);

      // 20초 자동 폴백 타이머
      autoFallbackTimer = setTimeout(() => {
        triggerFallback('delay');
      }, patience * 1000);

      try {
        const aiDataText = await window.ThisOneAPI.requestChat({ 
          model: MODEL, 
          max_tokens: tokens, 
          system: RANKING_PROMPT + depthPrompt, 
          messages: aiMessages 
        }, (chunk, fullText) => {
          if (isFallbackShown) return; // 이미 폴백되었다면 업데이트 무시

          // [보안/UI] JSON 징후가 보이면 즉시 업데이트를 멈추고 고정 메시지 표시
          if (fullText.includes('[JSON]') || fullText.includes('{') || fullText.includes('":') || fullText.includes('```')) {
            typingEl?.updateLiveResponse('최종 추천 리포트를 생성하고 있습니다...'); 
            return;
          }

          const thoughtMatch = fullText.match(/\[?Thought\]?:?(.*?)(?=\[?JSON\]?|$)/si);
          if (thoughtMatch && thoughtMatch[1]) {
            typingEl?.updateLiveResponse(thoughtMatch[1].trim());
          }
        });

        // 타이머 해제
        if (delayTimer) clearTimeout(delayTimer);
        if (autoFallbackTimer) clearTimeout(autoFallbackTimer);

        if (isFallbackShown) return; // 이미 폴백이 노출되었다면 AI 결과 렌더링 스킵

        typingEl?.remove();

        if (!aiDataText || !aiDataText.trim()) {
          triggerFallback('error');
          return;
        }

        const jsonMatch = aiDataText.match(/\[JSON\]:?\s*(\{[\s\S]*\})/);
        const rawJson = jsonMatch ? jsonMatch[1] : aiDataText;
        const parsed = extractJSON(rawJson);
        
        if (!parsed) throw new Error('Valid JSON block not found');
        
        const merged = window.ThisOneRanking?.mergeAiWithCandidates ? window.ThisOneRanking.mergeAiWithCandidates(deepClean(parsed), candidates) : parsed;
        window.ThisOneUI?.addResultCard?.(merged, intentProfile);
        
        setTimeout(() => {
          window.scrollTo(0, 0);
        }, 10); 

      } catch (e) {
        console.warn("AI Analysis Failed/Interrupted", e);
        triggerFallback('error');
      }
    } catch (err) {
      console.error("[ThisOne] Search flow error:", err);
      typingEl?.remove();
      
      if (candidates && candidates.length > 0) {
        window.ThisOneUI?.renderResults?.(candidates, 0, 1, GeneralSearchState.currentSort, GeneralSearchState.resultMode || 'normal');
      } else {
        window.ThisOneUI?.addFallback?.('검색 결과를 가져오는 중 문제가 발생했습니다.');
      }
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
  const container = document.getElementById('trendingList');
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

  // 로컬 스토리지 저장 (랭킹 로직 등에서 참조)
  localStorage.setItem('thisone_expert_settings', JSON.stringify(settings));

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

// 전역 함수 등록
window.changePage = async function(page) {
  if (loading) return;
  GeneralSearchState.currentPage = page;
  await refreshGeneralResults();
};

window.changeSort = async function(sort) {
  if (loading) return;
  GeneralSearchState.currentSort = sort;
  GeneralSearchState.currentPage = 1; // 정렬 변경 시 1페이지로
  await refreshGeneralResults();
};

async function refreshGeneralResults() {
  loading = true;
  const start = (GeneralSearchState.currentPage - 1) * 30 + 1;
  
  try {
    if (!GeneralSearchState.resultMode) GeneralSearchState.resultMode = 'normal';
    const searchData = await window.ThisOneAPI.requestSearch(
      GeneralSearchState.query, 
      {}, 
      start, 
      30, 
      GeneralSearchState.currentSort
    );
    
    const items = searchData?.items || [];
    GeneralSearchState.total = searchData?.total || 0;
    
    // UI 업데이트
    window.ThisOneUI?.renderResults?.(
      items, 
      GeneralSearchState.total, 
      GeneralSearchState.currentPage, 
      GeneralSearchState.currentSort,
      GeneralSearchState.resultMode
    );
  } catch (e) {
    console.error("Failed to refresh general results", e);
  } finally {
    loading = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyPcView();
  loadTrendingChips();
  document.getElementById('sendBtn')?.addEventListener('click', () => sendMsg('thisone'));
});
