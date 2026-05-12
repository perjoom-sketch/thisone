(function (global) {
  const WEB_SEARCH_MODE = 'web-search';
  const IMAGE_INPUT_PENDING_MESSAGE = '이미지 입력은 다음 단계에서 지원됩니다.';
  let removeInputMenuListener = null;

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

  function closeInputMenu(root) {
    const button = root?.querySelector('#webSearchPlusButton');
    const menu = root?.querySelector('#webSearchInputMenu');
    if (!button || !menu) return;
    button.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  }

  function toggleInputMenu(root) {
    const button = root?.querySelector('#webSearchPlusButton');
    const menu = root?.querySelector('#webSearchInputMenu');
    if (!button || !menu) return;
    const willOpen = menu.hidden;
    button.setAttribute('aria-expanded', String(willOpen));
    menu.hidden = !willOpen;
  }

  function openImagePicker(fileInput, captureMode) {
    if (!fileInput) return;
    if (captureMode) fileInput.setAttribute('capture', captureMode);
    else fileInput.removeAttribute('capture');
    fileInput.value = '';
    fileInput.click();
  }

  function enterWebSearchMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'web-search-mode');
    document.body.classList.remove('document-ai-mode', 'instant-answer-mode');
  }

  function exitWebSearchMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.remove('ai-tool-mode', 'document-ai-mode', 'instant-answer-mode', 'web-search-mode');
    if (removeInputMenuListener) {
      removeInputMenuListener();
      removeInputMenuListener = null;
    }
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

    if (removeInputMenuListener) {
      removeInputMenuListener();
      removeInputMenuListener = null;
    }

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
          <div class="web-search-input-options">
            <button class="web-search-plus-button" id="webSearchPlusButton" type="button" aria-label="입력 옵션 열기" aria-haspopup="menu" aria-expanded="false" aria-controls="webSearchInputMenu">+</button>
            <div class="web-search-input-menu" id="webSearchInputMenu" role="menu" hidden>
              <button class="web-search-input-menu-item" id="webSearchUploadButton" type="button" role="menuitem">이미지 업로드</button>
              <button class="web-search-input-menu-item" id="webSearchCameraButton" type="button" role="menuitem">사진 찍기</button>
            </div>
          </div>
          <label class="web-search-label" for="webSearchInput">검색어 입력창</label>
          <input class="web-search-input" id="webSearchInput" type="search" placeholder="검색어를 입력하세요" autocomplete="off">
          <button class="ai-tool-mic-button" id="webSearchMicButton" type="button" aria-label="음성으로 입력" title="음성으로 입력"></button>
          <button class="web-search-submit" id="webSearchSubmit" type="button">검색</button>
          <input class="web-search-image-input" id="webSearchImageInput" type="file" accept="image/*" aria-label="서치 이미지 입력">
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
    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input,
      status: voiceStatus,
      appendMode: 'space'
    });
    const plusButton = root.querySelector('#webSearchPlusButton');
    const menu = root.querySelector('#webSearchInputMenu');
    const fileInput = root.querySelector('#webSearchImageInput');
    const uploadButton = root.querySelector('#webSearchUploadButton');
    const cameraButton = root.querySelector('#webSearchCameraButton');

    returnButton?.addEventListener('click', exitWebSearchMode);

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

    plusButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleInputMenu(root);
    });

    menu?.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    uploadButton?.addEventListener('click', () => {
      closeInputMenu(root);
      openImagePicker(fileInput, '');
    });

    cameraButton?.addEventListener('click', () => {
      closeInputMenu(root);
      openImagePicker(fileInput, 'environment');
    });

    fileInput?.addEventListener('change', () => {
      setStatus(status, IMAGE_INPUT_PENDING_MESSAGE);
      if (fileInput) fileInput.value = '';
    });

    const handleDocumentClick = () => closeInputMenu(root);
    document.addEventListener('click', handleDocumentClick);
    removeInputMenuListener = () => document.removeEventListener('click', handleDocumentClick);
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
