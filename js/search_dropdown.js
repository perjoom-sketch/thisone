(function attachSearchDropdownNamespace(global) {
  const RECENT_SEARCHES_KEY = 'thisone_recent_searches';
  const LOCAL_SEARCH_SUGGESTIONS = [
    // 생활가전
    '다이슨 에어랩',
    '다이슨 청소기',
    '다이슨 드라이기',
    '로보락 S8 MaxV Ultra',
    '로보락 로봇청소기',
    '공기청정기',
    '무선청소기',
    '산업용 선풍기',
    '30인치 산업용 선풍기',
    '세탁건조기',
    '건조기',
    '전기면도기',
    '무한잉크 프린터',

    // 디지털/IT
    '맥미니',
    '맥미니 M4',
    '아이패드 프로 M4',
    '아이폰 17',
    '블루투스 이어폰',
    '통화품질 좋은 블루투스 이어폰',
    '게이밍 노트북',

    // 가구/육아/레저
    '스탠바이미 Go',
    '유모차',
    '카시트',
    '전기자전거',
    '캠핑의자',

    // 펫푸드
    '로얄캐닌',
    '로얄캐닌 하이포알러제닉',
    '강아지 사료',
    '고양이 사료',

    // 주방/대형가전
    '비스포크 AI 콤보'
  ];

  const state = {
    searches: [],
    listEl: null,
    boxEl: null,
    hideLocked: false,
    isResultsRendering: false,
    lastActionByDirectClick: false
  };

  const config = {
    getInput: () => null,
    getSearchWrap: () => null,
    autoResize: () => {},
    onSearch: () => {},
    isLoading: () => false
  };

  function getInput() {
    return config.getInput ? config.getInput() : null;
  }

  function getRecentSearchBox() {
    return document.getElementById('recentSearchBox');
  }

  function blurSearchInput() {
    const input = getInput();
    if (input && document.activeElement === input) {
      input.blur();
    }
  }

  function loadRecentSearches() {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      const parsed = JSON.parse(raw || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .slice(0, 5);
    } catch (_) {
      return [];
    }
  }

  function saveRecentSearches(list) {
    const normalized = (Array.isArray(list) ? list : [])
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .slice(0, 5);
    state.searches = normalized;
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(normalized));
  }

  function pushRecentSearch(query) {
    const q = String(query || '').trim();
    if (!q) return;
    const deduped = state.searches.filter((item) => item !== q);
    deduped.unshift(q);
    saveRecentSearches(deduped);
  }

  function hideRecentSearches() {
    const box = getRecentSearchBox();
    if (!box) return;
    box.classList.remove('show');
  }

  function getMatchedLocalSuggestions(inputValue) {
    const keyword = String(inputValue || '').trim();
    if (keyword.length < 2) return [];
    const matched = LOCAL_SEARCH_SUGGESTIONS.filter((item) => {
      if (!item) return false;
      const suggestion = String(item).trim();
      if (!suggestion) return false;
      return suggestion.startsWith(keyword) || suggestion.includes(keyword);
    });
    return [...new Set(matched)];
  }

  function runSearch(query, options = {}) {
    if (typeof config.onSearch !== 'function') return;
    config.onSearch(query, options);
  }

  function renderRecentSearches() {
    const list = state.listEl;
    const box = state.boxEl;
    const input = getInput();
    const inputValue = input ? input.value.trim() : '';
    if (!list || !box) return;

    list.innerHTML = '';
    if (!inputValue && !state.searches.length) {
      hideRecentSearches();
      return;
    }

    if (inputValue) {
      const searchActionBtn = document.createElement('button');
      searchActionBtn.type = 'button';
      searchActionBtn.className = 'recent-search-item';

      const actionIcon = document.createElement('span');
      actionIcon.className = 'recent-search-icon';
      actionIcon.setAttribute('aria-hidden', 'true');
      actionIcon.innerHTML = `
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="11" cy="11" r="7"></circle>
          <line x1="16.65" y1="16.65" x2="21" y2="21"></line>
        </svg>
      `;

      const actionText = document.createElement('span');
      actionText.className = 'recent-search-text';
      actionText.textContent = `${inputValue} 검색`;

      searchActionBtn.appendChild(actionIcon);
      searchActionBtn.appendChild(actionText);
      searchActionBtn.addEventListener('mousedown', (e) => e.preventDefault());
      searchActionBtn.addEventListener('click', () => {
        hideAndLockRecentSearches();
        runSearch(inputValue, { updateInput: false });
      });
      list.appendChild(searchActionBtn);
    }

    const matchedLocalSuggestions = getMatchedLocalSuggestions(inputValue);
    matchedLocalSuggestions.forEach((query) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-search-item';

      const icon = document.createElement('span');
      icon.className = 'recent-search-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="11" cy="11" r="7"></circle>
          <line x1="16.65" y1="16.65" x2="21" y2="21"></line>
        </svg>
      `;

      const text = document.createElement('span');
      text.className = 'recent-search-text';
      text.textContent = query;

      btn.appendChild(icon);
      btn.appendChild(text);
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        hideAndLockRecentSearches();
        runSearch(query, { updateInput: true });
      });
      list.appendChild(btn);
    });

    state.searches.forEach((query) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-search-item';

      const icon = document.createElement('span');
      icon.className = 'recent-search-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 8v4l3 2"></path>
          <path d="M3 12a9 9 0 1 0 3-6.7"></path>
          <path d="M3 4v3h3"></path>
        </svg>
      `;

      const text = document.createElement('span');
      text.className = 'recent-search-text';
      text.textContent = query;

      btn.appendChild(icon);
      btn.appendChild(text);
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        hideAndLockRecentSearches();
        runSearch(query, { updateInput: true });
      });
      list.appendChild(btn);
    });
  }

  function canShowRecentSearches() {
    const input = getInput();
    if (!input) return false;
    const inputValue = input.value.trim();
    if (config.isLoading()) return false;
    if (state.hideLocked) return false;
    if (state.isResultsRendering) return false;
    if (!inputValue && !state.searches.length) return false;
    const isFocused = document.activeElement === input;
    if (!isFocused) return false;
    return true;
  }

  function showRecentSearchesIfAllowed() {
    const box = getRecentSearchBox();
    if (!box) return;
    if (!canShowRecentSearches()) {
      hideRecentSearches();
      return;
    }
    box.classList.add('show');
  }

  function hideAndLockRecentSearches() {
    state.hideLocked = true;
    state.lastActionByDirectClick = false;
    hideRecentSearches();
  }

  function unlockRecentSearchesByUserAction() {
    state.hideLocked = false;
  }

  function buildRecentSearchUi() {
    const searchWrap = config.getSearchWrap ? config.getSearchWrap() : null;
    if (!searchWrap || getRecentSearchBox()) return;
    const searchBox = searchWrap.querySelector('.search-box');

    const box = document.createElement('div');
    box.id = 'recentSearchBox';
    box.className = 'recent-search-box';
    box.innerHTML = `
      <div class="recent-search-list" id="recentSearchList"></div>
    `;
    if (searchBox) {
      searchBox.insertAdjacentElement('afterend', box);
    } else {
      searchWrap.appendChild(box);
    }

    state.boxEl = box;
    state.listEl = box.querySelector('#recentSearchList');
  }

  function bindRecentSearchEvents() {
    const input = getInput();
    if (!input) return;

    input.addEventListener('click', () => {
      state.lastActionByDirectClick = true;
      unlockRecentSearchesByUserAction();
      renderRecentSearches();
      showRecentSearchesIfAllowed();
    });

    input.addEventListener('focus', () => {
      renderRecentSearches();
      showRecentSearchesIfAllowed();
    });

    input.addEventListener('input', () => {
      state.lastActionByDirectClick = true;
      unlockRecentSearchesByUserAction();
      renderRecentSearches();
      showRecentSearchesIfAllowed();
    });

    input.addEventListener('blur', () => {
      hideRecentSearches();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideRecentSearches();
      }
    });
  }

  function init(options = {}) {
    Object.assign(config, options);
    buildRecentSearchUi();
    state.searches = loadRecentSearches();
    renderRecentSearches();
    bindRecentSearchEvents();
  }

  function setResultsRendering(isRendering) {
    state.isResultsRendering = Boolean(isRendering);
  }

  global.ThisOneSearchDropdown = {
    init,
    blurSearchInput,
    pushRecentSearch,
    renderRecentSearches,
    hideAndLockRecentSearches,
    setResultsRendering
  };
})(window);
