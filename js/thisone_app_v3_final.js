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
      window.ThisOneUI?.showNotice?.(result.message || '인증 실패', { tone: 'warning' });
    }
  } catch(e) { window.ThisOneUI?.showNotice?.('통계 로딩 실패', { tone: 'warning' }); }
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
const SearchDropdown = window.ThisOneSearchDropdown;
// currentQuery는 index.html에서 이미 선언되었습니다.
let searchMode = 'thisone';
let _lastIntentProfile = null;

// 일반 검색 상태 관리
const GeneralSearchState = {
  currentPage: 1,
  currentSort: 'sim',
  sortMode: 'relevant',
  total: 0,
  query: '',
  resultMode: 'normal',
  lastItems: []
};
window.GeneralSearchState = GeneralSearchState;

const RANKING_PROMPT = `당신은 ThisOne 구매결정 AI입니다.
반드시 다음 순서로 출력하세요:
1. [Thought]: 사용자의 의도 분석 기준 (1~2문장)
2. [JSON]: 상품 분류 결과 (JSON 블록)

JSON 스키마:
{
  "cards": [
    { 
      "sourceId": "후보의 id", 
      "label": "짧은 분류 태그 (예: 추천, 최저가, 브랜드 우선)" 
    }
  ],
  "rejects": [
    { "name": "제외 상품명", "reason": "제외 이유" }
  ]
}

JSON 외의 다른 텍스트는 [Thought] 섹션에만 포함하세요.`;


const V2_ACCESSORY_KEYWORDS = [
  '필터', '교체용', '리필', '정수필터', '헤파', '활성탄',
  '노즐', '봉투', '호스',
  '커버', '패드', '시트', '천갈이', '덮개',
  '부품', '액세서리', '악세서리',
  '브러시', '솔', '걸레'
];
const V2_CONTEXT_KEYWORDS = ['가정용', '차량용', '자동차', '실내용', '업무용', '사무용'];
const V2_CATEGORY_ROLE_MAP = {
  "마스크": {
    "main": [
      {
        "category3": "먼지차단마스크",
        "productType": "1"
      }
    ],
    "accessory": [
      {
        "category3": "먼지차단마스크",
        "productType": "2"
      }
    ]
  },
  "정수기": {
    "main": [
      {
        "category3": "정수기",
        "category4": "냉온정수기"
      }
    ],
    "accessory": [
      {
        "category3": "정수기",
        "category4": "정수기필터"
      }
    ]
  },
  "로봇청소기": {
    "main": [
      {
        "category3": "로봇청소기"
      }
    ],
    "accessory": [
      {
        "category3": "청소기액세서리"
      }
    ]
  },
  "비데": {
    "main": [
      {
        "category3": "비데/비데용품",
        "category4": "전자식비데"
      }
    ],
    "accessory": [
      {
        "category3": "비데/비데용품",
        "category4": "비데필터"
      }
    ]
  },
  "음식물처리기": {
    "main": [
      {
        "category3": "음식물처리기"
      }
    ],
    "accessory": [
      {
        "category3": "기타주방가전부속품"
      }
    ]
  },
  "안마의자": {
    "main": [
      {
        "category3": "안마의자"
      }
    ],
    "accessory": [
      {
        "category3": "기타안마용품"
      }
    ]
  },
  "공기청정기": {
    "main": [
      {
        "category3": "공기정화기",
        "category4": "공기청정기"
      }
    ],
    "accessory": [
      {
        "category3": "공기정화기",
        "category4": "공기정화기필터"
      }
    ]
  },
  "에어컨_가정용": {
    "main": [
      {
        "category3": "에어컨"
      }
    ],
    "accessory": [
      {
        "category3": "에어컨주변기기"
      }
    ],
    "irrelevant": [
      {
        "category3": "오일/소모품",
        "category4": "에어컨필터"
      }
    ]
  }
};
const V2_ROLE_ORDER = ['main', 'accessory', 'irrelevant'];

function getAccessoryKeywords() {
  return [...V2_ACCESSORY_KEYWORDS];
}

function detectIntent(query) {
  const normalized = String(query || '').trim();
  if (!normalized) return 'main';

  if (normalized.includes('김서방마스크') && normalized.includes('리필')) {
    const withoutRefill = normalized.replace(/\s*리필\s*/g, ' ').trim().replace(/\s+/g, ' ');
    return getAccessoryKeywords().some((kw) => kw !== '리필' && withoutRefill.includes(kw)) ? 'accessory' : 'main';
  }

  if (normalized.includes('비데') && normalized.includes('노즐')) {
    const withoutNozzle = normalized.replace(/\s*노즐\s*/g, ' ').trim().replace(/\s+/g, ' ');
    return getAccessoryKeywords().some((kw) => kw !== '노즐' && withoutNozzle.includes(kw)) ? 'accessory' : 'main';
  }

  return getAccessoryKeywords().some((kw) => normalized.includes(kw)) ? 'accessory' : 'main';
}

function stripAccessoryKeywords(query) {
  const keywords = getAccessoryKeywords();
  let result = String(query || '');
  for (const kw of keywords) {
    result = result.replace(new RegExp(`\\s*${kw}\\s*`, 'g'), ' ');
  }
  return result.trim().replace(/\s+/g, ' ');
}

function v2MatchesRule(item, rule) {
  return Object.keys(rule).every((field) => item?.[field] === rule[field]);
}

function v2MatchesRole(item, categoryKey, role) {
  const rules = V2_CATEGORY_ROLE_MAP[categoryKey]?.[role] || [];
  return rules.some((rule) => v2MatchesRule(item, rule));
}

function getCategoryRole(item) {
  const categoryKey = Object.keys(V2_CATEGORY_ROLE_MAP).find((key) => (
    V2_ROLE_ORDER.some((role) => v2MatchesRole(item, key, role))
  ));
  if (!categoryKey) return 'unknown';
  return V2_ROLE_ORDER.find((role) => v2MatchesRole(item, categoryKey, role)) || 'unknown';
}

function isAmbiguousQuery(query, allCandidates) {
  const normalized = String(query || '').trim();
  if (detectIntent(normalized) !== 'accessory') return false;
  if (V2_CONTEXT_KEYWORDS.some((keyword) => normalized.includes(keyword))) return false;

  const accessoryCategoryKeys = new Set();
  let hasAccessoryCandidate = false;
  let hasIrrelevantCandidate = false;

  for (const item of (allCandidates || [])) {
    for (const categoryKey of Object.keys(V2_CATEGORY_ROLE_MAP)) {
      if (v2MatchesRole(item, categoryKey, 'accessory')) {
        accessoryCategoryKeys.add(categoryKey);
        hasAccessoryCandidate = true;
      }
      if (v2MatchesRole(item, categoryKey, 'irrelevant')) {
        hasIrrelevantCandidate = true;
      }
    }
  }

  return accessoryCategoryKeys.size >= 2 || (hasAccessoryCandidate && hasIrrelevantCandidate);
}

function addRoleScore(item, role, userIntent) {
  if (role !== userIntent) return { ...item };
  const boosted = { ...item, roleScoreBoost: (Number(item?.roleScoreBoost) || 0) + 20 };
  ['bonusScore', 'finalScore', 'totalScore', 'valueScore'].forEach((field) => {
    if (typeof boosted[field] === 'number' && Number.isFinite(boosted[field])) boosted[field] += 20;
  });
  return boosted;
}

function sortByRoleScore(items) {
  return [...items].sort((a, b) => {
    const as = Number(a?.finalScore ?? a?.totalScore ?? a?.bonusScore ?? 0);
    const bs = Number(b?.finalScore ?? b?.totalScore ?? b?.bonusScore ?? 0);
    return bs - as;
  });
}

function applyRoleFilter(finalCards, userIntent, isAmbiguous) {
  const filtered = [];
  for (const item of (finalCards || [])) {
    const role = getCategoryRole(item);
    if (role === 'irrelevant' && !isAmbiguous) continue;
    if (role === 'accessory' && userIntent === 'main') continue;
    if (role === 'main' && userIntent === 'accessory' && filtered.length >= 5) continue;
    filtered.push(addRoleScore(item, role, userIntent));
  }
  return sortByRoleScore(filtered);
}

function applyRoleFilterRelaxed(allCandidates, userIntent, isAmbiguous) {
  const filtered = [];
  for (const item of (allCandidates || [])) {
    const role = getCategoryRole(item);
    if (role === 'irrelevant' && !isAmbiguous) continue;
    filtered.push(addRoleScore(item, role, userIntent));
  }
  return sortByRoleScore(filtered);
}

function getCandidateUniqueKey(item = {}) {
  return String(item.productId || item.link || item.id || item.sourceId || item.name || '').trim();
}

function mergeUniqueCandidates(arr1, arr2) {
  const seen = new Set();
  const merged = [];
  for (const item of [...(arr1 || []), ...(arr2 || [])]) {
    const key = getCandidateUniqueKey(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(item);
  }
  return merged;
}

async function applyCategoryRoleToFinalCards(finalCards, query, allCandidates) {
  const userIntent = detectIntent(query);
  const isAmbiguous = isAmbiguousQuery(query, allCandidates);

  let filtered = applyRoleFilter(finalCards, userIntent, isAmbiguous);

  if (filtered.length < 5) {
    console.log('[v2 fallback] 단계 1 발동', { beforeCount: filtered.length });
    filtered = applyRoleFilterRelaxed(allCandidates, userIntent, isAmbiguous);
  } else {
    console.log('[v2 fallback] 단계 1 미발동', { count: filtered.length });
  }

  if (filtered.length < 5) {
    const simplifiedQuery = stripAccessoryKeywords(query);
    if (simplifiedQuery && simplifiedQuery !== query && simplifiedQuery.length > 0) {
      console.log('[v2 fallback] 단계 2 발동', { simplifiedQuery, beforeCount: filtered.length });
      try {
        const additionalItems = await window.ThisOneAPI.requestSearch(simplifiedQuery, {});
        const additionalArray = (additionalItems && additionalItems.items) || [];
        const additionalCandidates = window.ThisOneRanking?.buildCandidates
          ? window.ThisOneRanking.buildCandidates(additionalArray, simplifiedQuery, null)
          : additionalArray;
        const merged = mergeUniqueCandidates(allCandidates, additionalCandidates);
        filtered = applyRoleFilterRelaxed(merged, userIntent, isAmbiguous);
      } catch (e) {
        console.warn('[v2 fallback] 단계 2 단순화 재검색 실패:', e);
      }
    } else {
      console.log('[v2 fallback] 단계 2 미발동', { simplifiedQuery, count: filtered.length });
    }
  } else {
    console.log('[v2 fallback] 단계 2 미발동', { count: filtered.length });
  }

  if (filtered.length < 5) {
    console.log('[v2 fallback] 단계 3 발동', { beforeCount: filtered.length });
    filtered = (allCandidates || []).slice(0, 10);
  } else {
    console.log('[v2 fallback] 단계 3 미발동', { count: filtered.length });
  }

  console.log('[v2] userIntent:', userIntent, 'isAmbiguous:', isAmbiguous, 'finalCount:', filtered.length);

  return filtered.slice(0, 10);
}

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
  const img = document.getElementById('previewImg');
  const fileInput = document.getElementById('fileInput');

  if (pv) pv.classList.remove('show');
  if (img) img.removeAttribute('src');
  if (fileInput) fileInput.value = '';
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
    console.warn("JSON extraction failed", e);
    return null;
  }
}

function createExpertSettings() {
  // 설정값이 존재하지 않을 경우(모달을 열지 않았을 때 등)를 위한 샌니타이징
  const getVal = (id) => document.getElementById(id)?.value || '';
  const getCheck = (id) => document.getElementById(id)?.checked || false;

  return {
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
}

function prepareSendContext(forceMode) {
  if (loading) return null;
  SearchDropdown?.hideAndLockRecentSearches?.();
  if (forceMode) setSearchMode(forceMode);

  const inp = getInput();
  const txt = inp ? inp.value.trim() : "";
  if (!txt && !pendingImg) return null;
  currentQuery = txt; // 쿼리 저장 복구

  // 모바일 스크롤 진압 1단계: 즉시 포커스 해제 및 키보드 닫기
  SearchDropdown?.blurSearchInput?.();

  // 모바일 스크롤 진압 2단계: 여러 번에 걸쳐 상단 고정 (키보드 닫힘 애니메이션 대응)
  const fixScroll = () => {
    // 강제 상단 이동 제거 (사용자 불편 호소)
    // document.body.scrollTop = 0;
  };
  fixScroll();
  setTimeout(fixScroll, 100);
  setTimeout(fixScroll, 300);
  setTimeout(fixScroll, 600);
  if (!currentQuery && !pendingImg) return null;

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
  window.ThisOneUI?.clearErrorState?.('search');
  if (txt) {
    searchHistory.push(txt);
    SearchDropdown?.pushRecentSearch?.(txt);
    SearchDropdown?.renderRecentSearches?.();
  }
  syncQueryInputs(currentQuery);
  // 구버전 역사의 잔재(HistoryBar) 제거
  // if (window.ThisOneUI?.renderHistoryBar) window.ThisOneUI.renderHistoryBar();

  const queryText = currentQuery || '이미지 기반 상품 검색';
  const searchStartedAt = Date.now();
  window.ThisOneAPI?.trackSearchEvent?.({
    type: 'search_start',
    q: queryText,
    mode: 'normal'
  });
  const queryImage = pendingImg;
  removeImg();

  loading = true;
  SearchDropdown?.setResultsRendering?.(false);
  const btn = getSendBtn(); if (btn) btn.disabled = true;
  const typingEl = window.ThisOneUI?.addThinking?.();
  const searchQuery = window.ThisOneRanking?.rewriteSearchQuery
    ? window.ThisOneRanking.rewriteSearchQuery(queryText)
    : queryText;

  return {
    forceMode,
    txt,
    queryText,
    queryImage,
    searchQuery,
    finalSearchQuery: searchQuery,
    expertSettings: createExpertSettings(),
    trajectory: window.ThisOneTrajectory?.getSession() || {},
    typingEl,
    searchStartedAt,
    intentProfile: null,
    searchData: null,
    items: [],
    candidates: null,
    stop: false
  };
}

async function sendMsg(forceMode) {
  let context = null;

  try {
    context = prepareSendContext(forceMode);
    if (!context) return;

    try {
      GeneralSearchState.resultMode = 'normal';
      context.typingEl?.updateThought?.('이미지 분석 및 검색 의도 파악 중...');

      if (context.queryImage) {
        await handleImageSearch(context);
        if (context.stop) return;
      }

      await handleNormalSearch(context);
      if (context.stop) return;

      await handleAIAnalysis(context);
    } catch (err) {
      trackSearchError(context, err);
      await handleFallback(context, err);
    }
  } catch (globalErr) {
    trackSearchError(context, globalErr);
    console.warn("[ThisOne] Global sendMsg Error:", globalErr);
    window.ThisOneUI?.addErrorState?.('apiFail');
    loading = false;
  } finally {
    if (context) {
      loading = false;
      SearchDropdown?.setResultsRendering?.(false);
      SearchDropdown?.hideAndLockRecentSearches?.();
      const b = getSendBtn(); if (b) b.disabled = false;
      SearchDropdown?.blurSearchInput?.();
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    }
  }
}

async function handleImageSearch(context) {
  const { queryImage, trajectory, typingEl } = context;

  console.log("[Vision] 1차 이미지 분석 시작...");
  try {
    // [방향 A] 이미지 검색 시 입력창 텍스트 격리 (비전 인식 오염 방지)
    const intentProfile = await window.ThisOneAPI.requestIntentInfer('', trajectory, queryImage);
    context.intentProfile = intentProfile;

    if (intentProfile?.refinedSearchTerm) {
      context.finalSearchQuery = intentProfile.refinedSearchTerm;
      console.log(`%c[Vision] 분석 성공: ${context.finalSearchQuery}`, "color: #10b981; font-weight: bold;");
      typingEl?.updateThought?.(`식별된 상품("${context.finalSearchQuery}") 데이터 수집 중...`);
      return;
    }

    console.warn("[Vision] AI가 상품명을 식별하지 못함. 이미지 전용 검색 중단.");
    typingEl?.remove();
    window.ThisOneUI?.addErrorState?.('imageFail');
    context.stop = true;
  } catch (e) {
    console.warn("[Vision] 이미지 분석 치명적 실패:", e);
    typingEl?.remove();
    window.ThisOneUI?.addErrorState?.('imageFail');
    context.stop = true;
  }
}

async function handleNormalSearch(context) {
  const { expertSettings, queryImage, searchQuery, typingEl } = context;

  console.log(`[Search] 병렬 트랙 실행: ${context.finalSearchQuery}`);
  window.ThisOneUI?.renderAnalysisProgress?.();
  typingEl?.updateThought?.('일반 검색과 디스원 분석을 동시에 시작했습니다...');

  const rawSearchPromise = window.ThisOneAPI.requestSearchRaw(context.finalSearchQuery, expertSettings);
  context.fullSearchPromise = window.ThisOneAPI.requestSearchFull(context.finalSearchQuery, expertSettings);

  let searchData;
  try {
    searchData = await rawSearchPromise;
  } catch (rawErr) {
    console.warn('[ThisOne] raw search failed, falling back to legacy search endpoint:', rawErr);
    searchData = await window.ThisOneAPI.requestSearch(context.finalSearchQuery, expertSettings);
  }

  // [신규] 결과가 0건일 경우 재시도 로직 (다단계 검색)
  if ((!searchData?.items || searchData.items.length === 0) && context.finalSearchQuery !== searchQuery) {
    if (searchQuery === '이미지 기반 상품 검색') {
      console.warn(`[ThisOne] "${context.finalSearchQuery}" 결과 없음. 이미지 검색만으로는 결과를 찾을 수 없습니다.`);
      typingEl?.remove();
      window.ThisOneUI?.addErrorState?.('imageFail');
      context.stop = true;
      return;
    }
    console.warn(`[ThisOne] "${context.finalSearchQuery}" raw 결과 없음. 원본 쿼리 "${searchQuery}"로 재시도...`);
    typingEl?.updateThought?.(`정밀 검색 결과가 부족하여 범위를 넓혀 재검색 중...`);
    searchData = await window.ThisOneAPI.requestSearchRaw(searchQuery, expertSettings);
    context.fullSearchPromise = window.ThisOneAPI.requestSearchFull(searchQuery, expertSettings);
    context.finalSearchQuery = searchQuery;
  }

  context.rawSearchData = searchData;
  context.searchData = searchData;
  context.items = searchData?.items || [];
  window.ThisOneAPI?.trackSearchEvent?.({
    type: 'search_raw_done',
    q: context.queryText,
    mode: 'normal',
    rawCount: context.items.length,
    resultCount: context.items.length,
    elapsedMs: Date.now() - (context.searchStartedAt || Date.now())
  });
  window.ThisOneUI?.updateAnalysisProgress?.('collect', 'done');
  window.ThisOneUI?.updateAnalysisProgress?.('ai', 'active');
  window.ThisOneUI?.updateAnalysisProgress?.('reputation', 'active');

  // raw 일반 검색 결과는 full/AI 분석을 기다리지 않고 즉시 먼저 보여준다.
  if (!queryImage && context.items && context.items.length > 0) {
    const earlyCandidates = window.ThisOneRanking?.buildCandidates
      ? window.ThisOneRanking.buildCandidates(context.items, context.finalSearchQuery, null)
      : context.items;

    if (earlyCandidates && earlyCandidates.length > 0) {
      GeneralSearchState.query = context.finalSearchQuery;
      GeneralSearchState.currentPage = 1;
      GeneralSearchState.total = context.searchData?.total || 0;
      GeneralSearchState.resultMode = 'fallback_general';
      GeneralSearchState.lastItems = earlyCandidates;

      SearchDropdown?.setResultsRendering?.(true);
      window.ThisOneUI?.renderResults?.(
        earlyCandidates,
        GeneralSearchState.total,
        GeneralSearchState.currentPage,
        GeneralSearchState.currentSort,
        GeneralSearchState.resultMode
      );

      typingEl?.updateThought?.('일반 검색 결과를 먼저 보여드리고, 디스원 분석을 계속 진행 중입니다...');
    }
  }
}

async function handleAIAnalysis(context) {
  const { expertSettings, queryImage, queryText, typingEl, trajectory } = context;

  // [개선] intentProfile이 이미 있다면 중복 호출 방지
  if (!context.intentProfile && !queryImage) {
    context.intentProfile = await window.ThisOneAPI.requestIntentInfer(queryText, trajectory, null).catch(() => null);
  }

  if (context.fullSearchPromise) {
    try {
      let fullSearchData = await context.fullSearchPromise;
      if ((!fullSearchData?.items || fullSearchData.items.length === 0) && context.finalSearchQuery !== context.searchQuery && context.searchQuery !== '이미지 기반 상품 검색') {
        fullSearchData = await window.ThisOneAPI.requestSearchFull(context.searchQuery, expertSettings);
        context.finalSearchQuery = context.searchQuery;
      }
      context.fullSearchData = fullSearchData;
      context.searchData = fullSearchData;
      context.items = fullSearchData?.items || [];
      window.ThisOneAPI?.trackSearchEvent?.({
        type: 'search_full_done',
        q: context.queryText,
        mode: 'normal',
        fullCount: context.items.length,
        resultCount: context.items.length,
        elapsedMs: Date.now() - (context.searchStartedAt || Date.now())
      });
      window.ThisOneUI?.updateAnalysisProgress?.('reputation', 'done');
    } catch (fullErr) {
      trackSearchError(context, fullErr);
      console.warn('[ThisOne] full search failed; raw results remain visible:', fullErr);
      typingEl?.remove();
      window.ThisOneUI?.showAnalysisFailure?.('AI 분석에 실패했습니다. 일반 검색 결과는 그대로 확인할 수 있습니다.');
      context.stop = true;
      return;
    }
  }

  _lastIntentProfile = context.intentProfile;
  window._lastIntentProfile = context.intentProfile;

  typingEl?.updateThought?.('상품 데이터 및 형상 분석 선별 중...');
  context.candidates = window.ThisOneRanking?.buildCandidates
    ? window.ThisOneRanking.buildCandidates(context.items, context.finalSearchQuery, context.intentProfile)
    : context.items;

  if (!context.candidates || !context.candidates.length) {
    typingEl?.remove();
    window.ThisOneUI?.addErrorState?.('noResults');
    context.stop = true;
    return;
  }

  // [삭제] 구버전으로 오해받을 수 있는 Raw Results 렌더링 제거
  // window.ThisOneUI?.renderRawResults?.(context.candidates);

  // if (searchMode === 'raw') {
  //   typingEl?.remove();
  //   window.ThisOneUI?.renderRawResults?.(context.candidates);
  //   return;
  // }

  const prunedCandidates = context.candidates.map(c => ({
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
      text: `사용자 질문: ${queryText}\n\n후보 상품 목록(JSON): ${JSON.stringify(prunedCandidates, null, 2)}\n\n의도분석: ${JSON.stringify(context.intentProfile)}\n\n설정: ${JSON.stringify(expertSettings)}\n\n전문가 분석을 바탕으로 cards ${count}개를 분류하세요. 각 card에는 sourceId와 label만 포함하세요.`
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

    handleFallback(context, null, { reason, elapsed: Math.round((Date.now() - searchStartTime) / 1000) });
  };

  // 8초 지연 타이머: 분석 진행 상태만 갱신
  delayTimer = setTimeout(() => {
    if (!isFallbackShown && loading) {
      typingEl?.updateThought?.('디스원 분석이 계속 진행 중입니다. 일반 검색 결과를 먼저 확인하실 수 있습니다.');
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
        return;
      }

      const thoughtMatch = fullText.match(/\[?Thought\]?:?(.*?)(?=\[?JSON\]?|$)/si);
      if (thoughtMatch && thoughtMatch[1]) {
        typingEl?.updateThought?.(thoughtMatch[1].trim());
      }
      window.ThisOneUI?.purgeProgressLeak?.();
    });

    // 타이머 해제
    if (delayTimer) clearTimeout(delayTimer);
    if (autoFallbackTimer) clearTimeout(autoFallbackTimer);

    if (isFallbackShown) return; // 이미 폴백이 노출되었다면 AI 결과 렌더링 스킵

    typingEl?.remove();
    window.ThisOneUI?.purgeProgressLeak?.();

    if (!aiDataText || !aiDataText.trim()) {
      triggerFallback('error');
      return;
    }

    const thoughtMatchFromFinal = aiDataText.match(/\[?Thought\]?:?(.*?)(?=\[?JSON\]?|$)/si);
    const aiComment = '';

    const jsonMatch = aiDataText.match(/\[JSON\]:?\s*(\{[\s\S]*\})/);
    const rawJson = jsonMatch ? jsonMatch[1] : aiDataText;
    const parsed = extractJSON(rawJson);

    if (!parsed) throw new Error('Valid JSON block not found');

    const merged = window.ThisOneRanking?.mergeAiWithCandidates ? window.ThisOneRanking.mergeAiWithCandidates(deepClean(parsed), context.candidates) : parsed;

    const targetCount = Math.max(5, expertSettings.resultCount || 5);
    const mergedCards = Array.isArray(merged?.cards) ? merged.cards : [];
    const mergedRejects = Array.isArray(merged?.rejects) ? merged.rejects : [];
    const rejectSourceIds = new Set(
      mergedRejects
        .map((r) => String(r?.sourceId || r?.id || '').trim())
        .filter(Boolean)
    );

    const usedSourceIds = new Set();
    const usedNames = new Set();
    mergedCards.forEach((card) => {
      const sid = String(card?.sourceId || card?.id || '').trim();
      if (sid) usedSourceIds.add(sid);
      const n = String(card?.name || '').trim().toLowerCase();
      if (n) usedNames.add(n);
    });

    const supplements = [];
    for (const candidate of (context.candidates || [])) {
      if (mergedCards.length + supplements.length >= targetCount) break;

      const cid = String(candidate?.id || '').trim();
      const cname = String(candidate?.name || '').trim().toLowerCase();
      if (cid && rejectSourceIds.has(cid)) continue;
      if (cid && usedSourceIds.has(cid)) continue;
      if (cname && usedNames.has(cname)) continue;

      supplements.push({
        ...candidate,
        sourceId: candidate?.id || '',
        label: '추가',
        type: candidate?.type || 'extra'
      });

      if (cid) usedSourceIds.add(cid);
      if (cname) usedNames.add(cname);
    }

    let finalCards = [...mergedCards, ...supplements].slice(0, targetCount);
    finalCards = await applyCategoryRoleToFinalCards(finalCards, context.finalSearchQuery, context.candidates || []);

    // AI 분석 리포트 아래에 일반 검색 결과를 함께 표시
    const normalizeName = (v) => String(v || '').trim().toLowerCase();
    const resolveModelKey = (item = {}) => {
      if (item.modelKey) return String(item.modelKey).trim().toLowerCase();
      if (window.ThisOneRanking?.getModelKey) {
        return String(window.ThisOneRanking.getModelKey(item.name || '') || '').trim().toLowerCase();
      }
      return '';
    };

    const pickedSourceIds = new Set();
    const pickedIds = new Set();
    const pickedNames = new Set();
    const pickedModelKeys = new Set();

    finalCards.forEach((card) => {
      const sid = String(card?.sourceId || '').trim();
      const cid = String(card?.id || '').trim();
      const name = normalizeName(card?.name);
      const modelKey = resolveModelKey(card);

      if (sid) pickedSourceIds.add(sid);
      if (cid) pickedIds.add(cid);
      if (name) pickedNames.add(name);
      if (modelKey) pickedModelKeys.add(modelKey);
    });

    let generalCandidates = (context.candidates || []).filter((candidate) => {
      const sid = String(candidate?.sourceId || '').trim();
      const cid = String(candidate?.id || '').trim();
      const name = normalizeName(candidate?.name);
      const modelKey = resolveModelKey(candidate);

      if (sid && pickedSourceIds.has(sid)) return false;
      if (cid && pickedIds.has(cid)) return false;
      if (name && pickedNames.has(name)) return false;
      if (modelKey && pickedModelKeys.has(modelKey)) return false;
      return true;
    });

    const rawItems = context.searchData?.items || [];
    const rawCount = rawItems.length;
    const finalRecommendedCount = finalCards.length;

    if (generalCandidates.length === 0) {
      const rawGeneralItems = buildSafeFallbackGeneralItems(rawItems, context.finalSearchQuery, context.intentProfile, 100);

      if (rawGeneralItems.length > 0) {
        const nonDuplicateRawItems = rawGeneralItems.filter((item) => {
          const sid = String(item?.sourceId || '').trim();
          const cid = String(item?.id || '').trim();
          const name = normalizeName(item?.name);
          const modelKey = resolveModelKey(item);

          if (sid && pickedSourceIds.has(sid)) return false;
          if (cid && pickedIds.has(cid)) return false;
          if (name && pickedNames.has(name)) return false;
          if (modelKey && pickedModelKeys.has(modelKey)) return false;
          return true;
        });
        generalCandidates = (nonDuplicateRawItems.length ? nonDuplicateRawItems : rawGeneralItems).slice(0, 30);
      }
    }

    let fallbackReason = '';
    let fallbackCount = 0;
    if (rawCount > 0 && finalRecommendedCount === 0 && generalCandidates.length === 0) {
      generalCandidates = buildSafeFallbackGeneralItems(rawItems, context.finalSearchQuery, context.intentProfile, 30);
      fallbackCount = generalCandidates.length;
      fallbackReason = 'raw_exists_but_final_empty';
    }

    const finalGeneralCount = generalCandidates.length;
    console.debug('[ThisOne][safe-fallback]', {
      rawCount,
      finalRecommendedCount,
      finalGeneralCount,
      fallbackCount,
      fallbackReason
    });

    GeneralSearchState.query = context.finalSearchQuery;
    GeneralSearchState.currentPage = 1;
    GeneralSearchState.total = context.searchData?.total || 0;
    GeneralSearchState.resultMode = 'fallback_general';
    GeneralSearchState.lastItems = generalCandidates;

    const allowedSorts = ['sim'];
    const preservedSort = allowedSorts.includes(GeneralSearchState.currentSort)
      ? GeneralSearchState.currentSort
      : 'sim';
    GeneralSearchState.currentSort = preservedSort;

    SearchDropdown?.setResultsRendering?.(true);
    if (finalRecommendedCount > 0) {
      window.ThisOneUI?.addResultCard?.({ ...merged, cards: finalCards, aiComment }, context.intentProfile);
    }
    window.ThisOneUI?.renderResults?.(
      generalCandidates,
      GeneralSearchState.total,
      GeneralSearchState.currentPage,
      GeneralSearchState.currentSort,
      GeneralSearchState.resultMode
    );

    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 10);
  } catch (e) {
    trackSearchError(context, e);
    if (delayTimer) clearTimeout(delayTimer);
    if (autoFallbackTimer) clearTimeout(autoFallbackTimer);
    console.warn("AI Analysis Failed/Interrupted", e);
    triggerFallback('error');
  }
}


function trackSearchError(context, error) {
  if (!context || context.__searchErrorTracked) return;
  context.__searchErrorTracked = true;
  window.ThisOneAPI?.trackSearchEvent?.({
    type: 'search_error',
    q: context.queryText || context.searchQuery || '',
    mode: 'normal',
    hasError: true,
    errorMessage: String(error?.message || error || '').slice(0, 160),
    elapsedMs: Date.now() - (context.searchStartedAt || Date.now())
  });
}

async function handleFallback(context, err, options = {}) {
  if (!context) return;

  if (err) {
    console.warn("[ThisOne] Search flow error:", err);
  }

  const candidates = context.candidates;
  const typingEl = context.typingEl;
  const elapsed = options.elapsed;

  typingEl?.remove();
  window.ThisOneUI?.purgeProgressLeak?.();
  SearchDropdown?.setResultsRendering?.(true);

  if (candidates && candidates.length > 0) {
    if (options.reason) {
      let msg = `데이터 분석이 지연되고 있어(${elapsed}초), 디스원 AI 분석이 아닌 일반 검색 결과를 먼저 보여드립니다.`;
      if (options.reason === 'error') msg = `AI 분석 중 오류가 발생하여(${elapsed}초), 디스원 AI 분석이 아닌 일반 검색 결과를 먼저 보여드립니다.`;
      window.ThisOneUI?.addErrorState?.(options.reason === 'error' ? 'apiFail' : 'aiDelay', { replace: false });

      GeneralSearchState.query = context.finalSearchQuery;
      GeneralSearchState.currentPage = 1;
      GeneralSearchState.total = context.searchData?.total || 0;
      GeneralSearchState.resultMode = 'fallback_general';
      GeneralSearchState.lastItems = candidates;

      const allowedSorts = ['sim'];
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
      return;
    }

    window.ThisOneUI?.renderResults?.(candidates, 0, 1, GeneralSearchState.currentSort, GeneralSearchState.resultMode || 'normal');
  } else {
    window.ThisOneUI?.addErrorState?.('apiFail');
  }
}

async function loadTrendingChips() {
  const container = document.getElementById('trendingList');
  if (!container) return;

  // fallback 하드코딩
  const fallback = [
    { text: '로보락 S8 MaxV Ultra', query: '로보락 S8 MaxV Ultra' },
    { text: '비스포크 AI 콤보', query: '비스포크 AI 콤보' },
    { text: '다이슨 에어랩 멀티 스타일러', query: '다이슨 에어랩 멀티 스타일러' },
    { text: '스탠바이미 Go', query: '스탠바이미 Go' },
    { text: '아이패드 프로 M4', query: '아이패드 프로 M4' }
  ];

  let chips = fallback;

  try {
    const res = await fetch('/api/trends');
    const data = await res.json();
    if (Array.isArray(data.chips) && data.chips.length > 0) {
      chips = data.chips.map(c => ({ text: c.label, query: c.query }));
    }
  } catch (e) {
    // fallback 유지
  }

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

window.changeSort = async function(sortOrMode) {
  if (loading) return;
  const mode = ['relevant', 'low', 'high'].includes(sortOrMode) ? sortOrMode : 'relevant';
  GeneralSearchState.currentSort = 'sim';
  GeneralSearchState.sortMode = mode;
  GeneralSearchState.currentPage = 1; // 정렬 변경 시 1페이지로
  await refreshGeneralResults();
};

function normalizeGeneralSearchItem(item = {}) {
  if (!item || typeof item !== 'object') return {};

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

  const numberToWon = (value) => {
    const num = Number(String(value ?? '').replace(/[^0-9]/g, ''));
    if (!Number.isFinite(num) || num <= 0) return '';
    return `${num.toLocaleString('ko-KR')}원`;
  };

  const normalizedPrice = pick(
    item.price,
    item.formattedPrice,
    numberToWon(item.lprice),
    numberToWon(item.lowPrice),
    numberToWon(item.salePrice)
  );

  return {
    ...item,
    name: pick(item.name, item.title, item.productName, item.product_title, item.goodsName, '상품명 없음'),
    price: normalizedPrice,
    store: pick(item.store, item.mallName, item.mall, item.seller, item.sellerName, item.shopName),
    delivery: pick(item.delivery, item.shipping, item.deliveryInfo, item.deliveryFeeText, item.shippingInfo),
    review: pick(item.review, item.reviewText, item.reviewCountText, item.ratingText),
    image: pick(item.image, item.imageUrl, item.thumbnail, item.thumbnailUrl),
    link: pick(item.link, item.productUrl, item.url, item.mallProductUrl, item.mobileLink),
    badges: Array.isArray(item.badges) ? item.badges : []
  };
}

function shouldExcludeFromSafeFallback(item = {}, query = '', intentProfile = null) {
  const title = String(item?.name || '').toLowerCase();
  const q = String(query || '').toLowerCase();
  if (!title) return false;

  const weakSingleWords = ['필터', '단품', '세트', '실리콘', '패드', '리필', '교체'];
  const accessoryIntentWords = [
    '사이드브러시', '사이드브러쉬', '메인브러시', '메인브러쉬', '브러시', '브러쉬',
    '먼지봉투', '더스트백', '물걸레패드', '물걸레', '배터리', '충전기', '거치대',
    '호환', '액세서리', '악세사리', '소모품', '부품', '필터'
  ];

  const queryWantsAccessory = accessoryIntentWords.some((word) => q.includes(word));
  if (queryWantsAccessory) return false;

  const titleAccessoryHits = accessoryIntentWords.filter((word) => title.includes(word));
  const strongAccessoryWords = titleAccessoryHits.filter((word) => !weakSingleWords.includes(word));
  const hasAccessoryCombo =
    strongAccessoryWords.length >= 2 ||
    /(호환|소모품|부품).*(세트|교체|리필)|((사이드|메인)\s*브러시)|물걸레\s*패드|먼지\s*봉투/i.test(title);

  const queryIsMainProduct =
    /(로보락|다이슨|비스포크|에어랩|청소기|로봇청소기|세탁기|건조기|노트북|모니터|아이폰|갤럭시|태블릿|프린터|유모차|선풍기|공기청정기)/i.test(q) ||
    (intentProfile?.categoryHint && /(가전|기기|디지털|스마트)/i.test(String(intentProfile.categoryHint)));

  return hasAccessoryCombo && queryIsMainProduct;
}

function buildSafeFallbackGeneralItems(rawItems = [], query = '', intentProfile = null, limit = 30) {
  const normalized = (rawItems || []).map(normalizeGeneralSearchItem).filter((item) => item?.name);
  const filtered = normalized.filter((item) => !shouldExcludeFromSafeFallback(item, query, intentProfile));
  const source = filtered.length > 0 ? filtered : normalized;
  return source.slice(0, limit);
}

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
    
    const rawItems = searchData?.items || [];
    const normalizedItems = rawItems.map(normalizeGeneralSearchItem);
    const rankMode = GeneralSearchState.sortMode || 'relevant';
    const rankedItems = window.ThisOneRanking?.buildCandidates
      ? window.ThisOneRanking.buildCandidates(normalizedItems, GeneralSearchState.query, window._lastIntentProfile || null)
      : normalizedItems;
    const items = window.ThisOneRanking?.sortCandidatesByMode
      ? window.ThisOneRanking.sortCandidatesByMode(rankedItems, rankMode)
      : rankedItems;
    GeneralSearchState.total = searchData?.total || 0;
    GeneralSearchState.lastItems = items;
    
    // UI 업데이트
    window.ThisOneUI?.renderResults?.(
      items, 
      GeneralSearchState.total, 
      GeneralSearchState.currentPage, 
      GeneralSearchState.currentSort,
      GeneralSearchState.resultMode
    );
  } catch (e) {
    console.warn("Failed to refresh general results", e);
    window.ThisOneUI?.addErrorState?.('apiFail');
  } finally {
    loading = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyPcView();
  loadTrendingChips();
  SearchDropdown?.init?.({
    getInput,
    getSearchWrap: () => document.getElementById('landingSearch'),
    autoResize,
    isLoading: () => loading,
    onSearch: (query, options = {}) => {
      const input = getInput();
      if (input && options.updateInput) {
        input.value = query;
        autoResize(input);
      }
      currentQuery = query;
      sendMsg('thisone');
    }
  });
  document.getElementById('sendBtn')?.addEventListener('click', () => sendMsg('thisone'));
});
