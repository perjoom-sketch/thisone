(function (global) {
  const WEB_SEARCH_MODE = 'web-search';
  const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const UNSUPPORTED_IMAGE_MESSAGE = 'JPG, PNG, WebP 이미지 1장만 사용할 수 있습니다.';
  const IMAGE_TEXT_REQUIRED_MESSAGE = '이미지에서 검색어를 추출하는 기능은 다음 단계에서 지원됩니다. 검색어를 함께 입력해주세요.';
  let removeDocumentListeners = null;

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

  function isSupportedImage(file) {
    return Boolean(file && SUPPORTED_IMAGE_TYPES.has(file.type));
  }

  function getClipboardFiles(clipboardData) {
    if (!clipboardData) return [];

    const files = Array.from(clipboardData.files || []);
    if (files.length > 0) return files;

    return Array.from(clipboardData.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);
  }

  function hasClipboardImage(clipboardData) {
    return getClipboardFiles(clipboardData).some((file) => file.type?.startsWith('image/'));
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = String(event.target?.result || '');
        const data = src.includes(',') ? src.split(',')[1] : '';
        if (!data) {
          reject(new Error('이미지를 읽을 수 없습니다.'));
          return;
        }
        resolve({ data, src, type: file.type || 'image/jpeg', name: file.name || '붙여넣은 이미지' });
      };
      reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
      reader.readAsDataURL(file);
    });
  }

  function enterWebSearchMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'web-search-mode');
    document.body.classList.remove('document-ai-mode', 'instant-answer-mode');
  }

  function exitWebSearchMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.remove('ai-tool-mode', 'document-ai-mode', 'instant-answer-mode', 'web-search-mode');
    if (removeDocumentListeners) {
      removeDocumentListeners();
      removeDocumentListeners = null;
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

  function clearImagePreview(root) {
    const preview = root.querySelector('#webSearchImagePreview');
    const previewImg = root.querySelector('#webSearchPreviewImg');
    const fileInput = root.querySelector('#webSearchImageInput');
    const cameraInput = root.querySelector('#webSearchCameraInput');

    if (preview) {
      preview.hidden = true;
      preview.removeAttribute('data-has-image');
    }
    if (previewImg) previewImg.removeAttribute('src');
    if (fileInput) fileInput.value = '';
    if (cameraInput) cameraInput.value = '';
  }

  function renderImagePreview(root, imagePayload) {
    const preview = root.querySelector('#webSearchImagePreview');
    const previewImg = root.querySelector('#webSearchPreviewImg');
    const previewName = root.querySelector('#webSearchPreviewName');

    if (!preview || !previewImg) return;
    previewImg.src = imagePayload.src;
    if (previewName) previewName.textContent = imagePayload.name || '선택한 이미지';
    preview.hidden = false;
    preview.setAttribute('data-has-image', 'true');
  }

  function renderWebSearchShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    if (removeDocumentListeners) {
      removeDocumentListeners();
      removeDocumentListeners = null;
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
          <label class="web-search-label" for="webSearchInput">검색어 입력창</label>
          <div class="web-search-composer">
            <div class="web-search-input-row">
              <input class="web-search-input" id="webSearchInput" type="search" placeholder="검색어를 입력하세요..." autocomplete="off">
            </div>
            <div class="web-search-control-row">
              <div class="web-search-menu-wrap">
                <button class="web-search-plus-button" id="webSearchPlusButton" type="button" aria-label="서치 입력 메뉴 열기" aria-expanded="false" aria-controls="webSearchInputMenu">+</button>
                <div class="web-search-input-menu" id="webSearchInputMenu" role="menu" hidden>
                  <button class="web-search-menu-option" id="webSearchUploadButton" type="button" role="menuitem">이미지 업로드</button>
                  <button class="web-search-menu-option" id="webSearchCameraButton" type="button" role="menuitem">사진 찍기</button>
                </div>
              </div>
              <div class="web-search-action-group">
                <button class="ai-tool-mic-button web-search-mic-button" id="webSearchMicButton" type="button" aria-label="음성으로 입력" title="음성으로 입력"></button>
                <button class="web-search-submit" id="webSearchSubmit" type="button">검색</button>
              </div>
            </div>
            <div class="web-search-image-preview" id="webSearchImagePreview" hidden>
              <img id="webSearchPreviewImg" alt="서치 시작 이미지 미리보기">
              <div class="web-search-image-preview-info">
                <p id="webSearchPreviewName">선택한 이미지</p>
                <button class="web-search-image-remove" id="webSearchImageRemove" type="button">이미지 삭제</button>
              </div>
            </div>
          </div>
          <input class="web-search-image-input" id="webSearchImageInput" type="file" accept="image/jpeg,image/png,image/webp" aria-label="서치 이미지 업로드">
          <input class="web-search-image-input" id="webSearchCameraInput" type="file" accept="image/*" capture="environment" aria-label="서치 사진 찍기">
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
    micButton?.setAttribute('title', '음성으로 입력');
    const plusButton = root.querySelector('#webSearchPlusButton');
    const inputMenu = root.querySelector('#webSearchInputMenu');
    const fileInput = root.querySelector('#webSearchImageInput');
    const cameraInput = root.querySelector('#webSearchCameraInput');
    const uploadButton = root.querySelector('#webSearchUploadButton');
    const cameraButton = root.querySelector('#webSearchCameraButton');
    const removeButton = root.querySelector('#webSearchImageRemove');
    let selectedImage = null;

    returnButton?.addEventListener('click', exitWebSearchMode);

    async function runSearch(queryOverride) {
      const query = String(queryOverride || input.value || '').trim();
      if (!query) {
        setStatus(status, selectedImage ? IMAGE_TEXT_REQUIRED_MESSAGE : '검색어를 입력해주세요.');
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

    async function handleImageFile(file, options = {}) {
      const allowAnyImage = Boolean(options.allowAnyImage);
      const isValidImage = allowAnyImage ? Boolean(file?.type?.startsWith('image/')) : isSupportedImage(file);
      if (!isValidImage) {
        setStatus(status, UNSUPPORTED_IMAGE_MESSAGE);
        if (fileInput) fileInput.value = '';
        if (cameraInput) cameraInput.value = '';
        return;
      }

      let imagePayload;
      try {
        imagePayload = await readImageFile(file);
      } catch (error) {
        setStatus(status, error.message || '이미지를 읽을 수 없습니다.');
        return;
      }

      selectedImage = imagePayload;
      renderImagePreview(root, imagePayload);
      setStatus(status, '이미지가 첨부되었습니다. 검색어를 함께 입력해주세요.');
      closeInputMenu();
    }

    function setInputMenuOpen(isOpen) {
      if (!inputMenu || !plusButton) return;
      inputMenu.hidden = !isOpen;
      plusButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function closeInputMenu() {
      setInputMenuOpen(false);
    }

    plusButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setInputMenuOpen(Boolean(inputMenu?.hidden));
    });

    submit.addEventListener('click', () => runSearch());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runSearch();
      }
    });

    uploadButton?.addEventListener('click', () => {
      if (!fileInput) return;
      fileInput.value = '';
      fileInput.click();
    });

    cameraButton?.addEventListener('click', () => {
      if (!cameraInput) return;
      cameraInput.value = '';
      cameraInput.click();
    });

    fileInput?.addEventListener('change', (event) => {
      const files = Array.from(event.target.files || []);
      if (files.length !== 1) {
        setStatus(status, UNSUPPORTED_IMAGE_MESSAGE);
        event.target.value = '';
        return;
      }
      handleImageFile(files[0]);
    });

    cameraInput?.addEventListener('change', (event) => {
      const files = Array.from(event.target.files || []);
      if (files.length !== 1) {
        setStatus(status, UNSUPPORTED_IMAGE_MESSAGE);
        event.target.value = '';
        return;
      }
      handleImageFile(files[0], { allowAnyImage: true });
    });

    removeButton?.addEventListener('click', () => {
      selectedImage = null;
      clearImagePreview(root);
      setStatus(status, '이미지를 삭제했습니다.');
    });

    root.addEventListener('click', (event) => {
      if (!event.target.closest('.web-search-menu-wrap')) closeInputMenu();
    });

    function handleDocumentKeydown(event) {
      if (event.key === 'Escape') closeInputMenu();
    }

    document.addEventListener('keydown', handleDocumentKeydown);

    function handlePaste(event) {
      if (!document.querySelector(`.web-search-panel[data-mode="${WEB_SEARCH_MODE}"]`)) return;
      if (event.target === input) return;

      const clipboardData = event.clipboardData;
      if (!hasClipboardImage(clipboardData)) return;

      event.preventDefault();
      const imageFiles = getClipboardFiles(clipboardData).filter((file) => file.type?.startsWith('image/'));
      if (imageFiles.length !== 1) {
        setStatus(status, UNSUPPORTED_IMAGE_MESSAGE);
        return;
      }
      handleImageFile(imageFiles[0], { allowAnyImage: true });
    }

    document.addEventListener('paste', handlePaste);
    removeDocumentListeners = () => {
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('keydown', handleDocumentKeydown);
    };
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
