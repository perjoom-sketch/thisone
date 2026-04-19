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
반드시 다음 순서로 출력하세요:
1. [Thought]: 사용자의 의도 분석 및 추천 전략 (2~3문장으로 짧게)
2. [JSON]: 상품 추천 결과 (구조화된 JSON 블록)

JSON 외의 다른 텍스트는 [Thought] 섹션에만 포함하세요.
리포트(reason)는 반드시 1~2문장으로 요약하세요.`;

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

function extractJSON(str) {
  if (!str) return null;
  try {
    // 1단계: 가장 흔한 마크다운 블록 제거
    let cleanStr = str.replace(/```json|```/g, '').trim();
    
    // 2단계: 첫 번째 '{'와 마지막 '}' 사이를 추출 (가장 확실한 JSON 구간)
    const firstOpen = cleanStr.indexOf('{');
    const lastClose = cleanStr.lastIndexOf('}');
    if (firstOpen === -1 || lastClose === -1) return null;
    
    const candidate = cleanStr.substring(firstOpen, lastClose + 1);
    
    // 3단계: 일반 파싱 시도
    try {
      return JSON.parse(candidate);
    } catch (e) {
      // 4단계: 만약 잘린 JSON이라면 (끝에 '}'가 부족한 경우 등) 수동 복구 시도 (실험적)
      console.warn("Standard JSON parse failed, attempting recovery...");
      return JSON.parse(candidate + '}'); // 단순 누락 복구 시도
    }
  } catch (e) {
    console.error("JSON extraction failed", e);
    return null;
  }
}

async function sendMsg(forceMode) {
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
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
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
  const typingEl = window.ThisOneUI?.addTyping?.();

  try {
    let searchQuery = queryText;
    if (window.ThisOneRanking?.rewriteSearchQuery) searchQuery = window.ThisOneRanking.rewriteSearchQuery(queryText);

    typingEl?.updateThought?.('의도 분석 및 시장 데이터 수집 중...');
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

    typingEl?.updateThought?.('전문가 안목으로 상품 선별 및 데이터 교차 검증 중...');
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
    typingEl?.updateThought?.(`최종 추천 리포트 생성 중 (정밀도 설정: ${expertSettings.patienceTime || 20}초)...`);

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
      // 실시간 생각 추출 및 표시
      const thoughtMatch = fullText.match(/\[Thought\]:(.*?)(?=\[JSON\]|$)/s);
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
      
      // 모바일 포함 전방위 스크롤 진압: 3중 보안 및 타겟팅
      setTimeout(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        // 헤더 로고 쪽으로 시선 고정
        document.querySelector('.hdr')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200); // 모바일 레이아웃 재계산 시간 확보
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
  if (settings.patienceTime) {
    const pEl = document.getElementById('patienceTime');
    if (pEl) {
      pEl.value = settings.patienceTime;
      // 인덱스 파일에 정의된 라벨 업데이트 함수 호출
      if (typeof window.updatePatienceLabel === 'function') {
        window.updatePatienceLabel(settings.patienceTime);
      } else {
        const vEl = document.getElementById('patienceVal');
        if (vEl) vEl.textContent = settings.patienceTime;
      }
    }
  }
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
    resultCount: document.getElementById('resultCount').value,
    patienceTime: document.getElementById('patienceTime').value
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
