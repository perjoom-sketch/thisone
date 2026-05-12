(function (global) {
  const WEB_SEARCH_MODE = 'web-search';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw).href;
    } catch (e) {
      return '';
    }
  }

  function getSource(result) {
    const explicit = String(result?.displayLink || result?.source || '').trim();
    if (explicit) return explicit;
    try {
      return new URL(String(result?.link || '')).hostname;
    } catch (e) {
      return String(result?.link || '').trim();
    }
  }

  function setStatus(element, message) {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
  }

  function enterWebSearchMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'web-search-mode');
    document.body.classList.remove('document-ai-mode', 'instant-answer-mode');
  }

  function exitWebSearchMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.remove('ai-tool-mode', 'document-ai-mode', 'instant-answer-mode', 'web-search-mode');
    const container = document.getElementById('msgContainer');
    if (container) container.innerHTML = '';
  }

  async function requestWebSearch(query) {
    const response = await fetch('/api/webSearch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query })
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      throw new Error('검색 응답을 읽을 수 없습니다.');
    }

    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    return Array.isArray(data?.results) ? data.results : [];
  }

  function renderResults(root, results) {
    const list = root.querySelector('#webSearchResults');
    if (!list) return;

    if (!results.length) {
      list.innerHTML = '<p class="web-search-empty">검색 결과가 없습니다.</p>';
      return;
    }

    list.innerHTML = results.map((result) => {
      const href = normalizeUrl(result?.link);
      const title = escapeHtml(result?.title || href || '제목 없음');
      const snippet = escapeHtml(result?.snippet || '');
      const source = escapeHtml(getSource(result));
      const linkAttrs = href ? `href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : 'href="#" aria-disabled="true"';

      return `
        <article class="web-search-result-row">
          <a class="web-search-result-title" ${linkAttrs}>${title}</a>
          ${snippet ? `<p class="web-search-result-snippet">${snippet}</p>` : ''}
          ${source ? `<p class="web-search-result-source">${source}</p>` : ''}
        </article>
      `;
    }).join('');
  }

  function renderWebSearchShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    container.innerHTML = `
      <section class="web-search-panel" data-mode="${WEB_SEARCH_MODE}" aria-labelledby="webSearchTitle">
        <button class="ai-tool-return" type="button" data-ai-tool-return>← 쇼핑검색으로 돌아가기</button>
        <div class="web-search-copy">
          <p class="web-search-eyebrow">서치</p>
          <h2 id="webSearchTitle">디스원 서치</h2>
          <p class="web-search-main-copy">웹에서 바로 검색합니다.</p>
          <p class="web-search-sub-copy">상품이 아니라 일반 정보를 찾을 때 사용하세요.</p>
        </div>

        <div class="web-search-form" role="search">
          <div class="web-search-composer-top">
            <label class="web-search-label" for="webSearchInput">검색어 입력창</label>
            <input class="web-search-input" id="webSearchInput" type="search" placeholder="검색어를 입력하세요" autocomplete="off">
          </div>
          <div class="web-search-composer-bottom">
            <div class="web-search-plus-wrap">
              <button class="web-search-plus-button" id="webSearchPlusButton" type="button" aria-label="이미지 메뉴 열기" aria-expanded="false" aria-controls="webSearchPlusMenu" title="이미지 메뉴 열기">+</button>
              <div class="web-search-plus-menu" id="webSearchPlusMenu" role="menu" hidden>
                <button class="web-search-plus-menu-item" id="webSearchUploadButton" type="button" role="menuitem">이미지 업로드</button>
                <button class="web-search-plus-menu-item" id="webSearchCameraButton" type="button" role="menuitem">사진 찍기</button>
              </div>
              <input class="web-search-file-input" id="webSearchUploadInput" type="file" accept="image/*" hidden>
              <input class="web-search-file-input" id="webSearchCameraInput" type="file" accept="image/*" capture="environment" hidden>
            </div>
            <div class="web-search-composer-actions">
              <button class="ai-tool-mic-button" id="webSearchMicButton" type="button" aria-label="음성으로 입력" title="음성으로 입력"></button>
              <button class="web-search-submit" id="webSearchSubmit" type="button">검색</button>
            </div>
          </div>
        </div>

        <p class="ai-tool-voice-status" id="webSearchVoiceStatus" aria-live="polite" hidden></p>
        <p class="web-search-status" id="webSearchStatus" role="status" aria-live="polite" hidden></p>
        <div class="web-search-results" id="webSearchResults" aria-live="polite"></div>
      </section>
    `;

    const root = container.querySelector('.web-search-panel');
    const returnButton = root.querySelector('[data-ai-tool-return]');
    const input = root.querySelector('#webSearchInput');
    const submit = root.querySelector('#webSearchSubmit');
    const status = root.querySelector('#webSearchStatus');
    const micButton = root.querySelector('#webSearchMicButton');
    const voiceStatus = root.querySelector('#webSearchVoiceStatus');
    const plusButton = root.querySelector('#webSearchPlusButton');
    const plusMenu = root.querySelector('#webSearchPlusMenu');
    const uploadButton = root.querySelector('#webSearchUploadButton');
    const cameraButton = root.querySelector('#webSearchCameraButton');
    const uploadInput = root.querySelector('#webSearchUploadInput');
    const cameraInput = root.querySelector('#webSearchCameraInput');
    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input,
      status: voiceStatus,
      appendMode: 'space'
    });
    returnButton?.addEventListener('click', exitWebSearchMode);

    function setPlusMenuOpen(isOpen) {
      if (!plusButton || !plusMenu) return;
      plusMenu.hidden = !isOpen;
      plusButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function openFilePicker(fileInput) {
      setPlusMenuOpen(false);
      if (!fileInput) return;
      fileInput.value = '';
      fileInput.click();
    }

    plusButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      setPlusMenuOpen(!!plusMenu?.hidden);
    });

    uploadButton?.addEventListener('click', () => openFilePicker(uploadInput));
    cameraButton?.addEventListener('click', () => openFilePicker(cameraInput));

    uploadInput?.addEventListener('change', () => {
      const fileName = uploadInput.files?.[0]?.name;
      if (fileName) setStatus(status, `선택된 이미지: ${fileName}`);
    });

    cameraInput?.addEventListener('change', () => {
      const fileName = cameraInput.files?.[0]?.name;
      if (fileName) setStatus(status, `선택된 사진: ${fileName}`);
    });

    document.addEventListener('click', (event) => {
      if (!root.contains(event.target)) return;
      if (!plusMenu?.hidden && !event.target.closest('.web-search-plus-wrap')) setPlusMenuOpen(false);
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setPlusMenuOpen(false);
    });

    async function runSearch(queryOverride) {
      const query = String(queryOverride || input.value || '').trim();
      if (!query) {
        setStatus(status, '검색어를 입력해주세요.');
        input.focus();
        return;
      }

      input.value = query;
      submit.disabled = true;
      renderResults(root, []);
      setStatus(status, '웹에서 검색하고 있습니다...');

      try {
        const results = await requestWebSearch(query);
        renderResults(root, results);
        setStatus(status, results.length ? '검색 결과를 불러왔습니다.' : '검색 결과가 없습니다.');
      } catch (error) {
        renderResults(root, []);
        setStatus(status, `검색 중 오류가 발생했습니다. ${error.message || ''}`.trim());
      } finally {
        submit.disabled = false;
      }
    }

    submit.addEventListener('click', () => runSearch());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runSearch();
      }
    });

    input.focus();
  }

  function openWebSearch() {
    enterWebSearchMode();
    renderWebSearchShell();
  }

  global.ThisOneWebSearch = {
    open: openWebSearch,
    mode: WEB_SEARCH_MODE
  };
})(window);
