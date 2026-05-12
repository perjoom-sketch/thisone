(function (global) {
  const WEB_SEARCH_MODE = 'web-search';
  const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const UNSUPPORTED_IMAGE_MESSAGE = 'JPG, PNG, WebP 이미지 1장만 사용할 수 있습니다.';
  const INFERENCE_UNAVAILABLE_MESSAGE = '이미지에서 검색어를 추출하는 기능은 다음 단계에서 지원됩니다.';
  let removePasteListener = null;
  let activeRecognition = null;

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

  function uniqueTerms(terms) {
    const seen = new Set();
    return terms
      .map((term) => String(term || '').replace(/\s+/g, ' ').trim())
      .filter((term) => {
        if (!term || seen.has(term)) return false;
        seen.add(term);
        return true;
      })
      .slice(0, 4);
  }

  function buildSuggestedTerms(intentProfile) {
    const refined = String(intentProfile?.refinedSearchTerm || '').trim();
    const category = String(intentProfile?.categoryHint || '').trim();
    const categoryTail = category.split('/').map((part) => part.trim()).filter(Boolean).pop() || '';
    const terms = [refined];

    if (categoryTail && categoryTail !== refined) terms.push(categoryTail);
    return uniqueTerms(terms);
  }

  function enterWebSearchMode() {
    document.body.classList.add('ai-tool-mode', 'web-search-mode');
    document.body.classList.remove('document-ai-mode', 'instant-answer-mode');
  }

  function exitWebSearchMode() {
    document.body.classList.remove('ai-tool-mode', 'document-ai-mode', 'instant-answer-mode', 'web-search-mode');
    stopVoiceInput();
    if (removePasteListener) {
      removePasteListener();
      removePasteListener = null;
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

  async function inferImageTerms(imagePayload) {
    if (!imagePayload || typeof global.ThisOneAPI?.requestIntentInfer !== 'function') {
      return [];
    }

    const intentProfile = await global.ThisOneAPI.requestIntentInfer('', { queries: [], clickEvents: [], refinements: 0 }, imagePayload);
    return buildSuggestedTerms(intentProfile);
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

  function renderSuggestedTerms(root, terms) {
    const suggestions = root.querySelector('#webSearchImageSuggestions');
    if (!suggestions) return;

    if (!terms.length) {
      suggestions.hidden = false;
      suggestions.innerHTML = `<p class="web-search-image-fallback">${INFERENCE_UNAVAILABLE_MESSAGE}</p>`;
      return;
    }

    suggestions.hidden = false;
    suggestions.innerHTML = `
      <p class="web-search-suggestion-title">추천 검색어</p>
      <div class="web-search-suggestion-list">
        ${terms.map((term) => `
          <button class="web-search-suggestion-chip" type="button" data-web-search-term="${escapeHtml(term)}">
            ${escapeHtml(term)}로 서치
          </button>
        `).join('')}
      </div>
    `;
  }

  function closeWebSearchMenu(root) {
    const menu = root?.querySelector('#webSearchToolsMenu');
    const button = root?.querySelector('#webSearchPlusButton');
    if (!menu || !button) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function toggleWebSearchMenu(root) {
    const menu = root?.querySelector('#webSearchToolsMenu');
    const button = root?.querySelector('#webSearchPlusButton');
    if (!menu || !button) return;
    const shouldOpen = menu.hidden;
    menu.hidden = !shouldOpen;
    button.setAttribute('aria-expanded', String(shouldOpen));
  }

  function getSpeechRecognition() {
    return global.SpeechRecognition || global.webkitSpeechRecognition || null;
  }

  function stopVoiceInput(button) {
    if (activeRecognition) {
      try { activeRecognition.stop(); } catch (e) {}
      activeRecognition = null;
    }
    if (button) button.classList.remove('is-listening');
  }

  function startVoiceInput(input, status, button) {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setStatus(status, '이 브라우저에서는 음성 입력을 사용할 수 없습니다.');
      return;
    }

    if (activeRecognition) {
      stopVoiceInput(button);
      return;
    }

    const recognition = new SpeechRecognition();
    activeRecognition = recognition;
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      button?.classList.add('is-listening');
      setStatus(status, '음성을 듣고 있습니다...');
    };
    recognition.onresult = (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (transcript && input) input.value = transcript;
      setStatus(status, transcript ? '음성 입력을 검색어로 넣었습니다.' : '음성을 인식하지 못했습니다.');
    };
    recognition.onerror = () => {
      setStatus(status, '음성 입력을 사용할 수 없습니다.');
    };
    recognition.onend = () => {
      if (activeRecognition === recognition) activeRecognition = null;
      button?.classList.remove('is-listening');
    };

    try {
      recognition.start();
    } catch (e) {
      activeRecognition = null;
      button?.classList.remove('is-listening');
      setStatus(status, '음성 입력을 시작할 수 없습니다.');
    }
  }

  function clearImagePreview(root) {
    const preview = root.querySelector('#webSearchImagePreview');
    const previewImg = root.querySelector('#webSearchPreviewImg');
    const suggestions = root.querySelector('#webSearchImageSuggestions');
    const fileInput = root.querySelector('#webSearchImageInput');

    if (preview) {
      preview.hidden = true;
      preview.removeAttribute('data-has-image');
    }
    if (previewImg) previewImg.removeAttribute('src');
    if (suggestions) {
      suggestions.hidden = true;
      suggestions.innerHTML = '';
    }
    if (fileInput) fileInput.value = '';
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

    if (removePasteListener) {
      removePasteListener();
      removePasteListener = null;
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

        <div class="web-search-composer" role="search">
          <label class="web-search-label" for="webSearchInput">검색어 입력창</label>
          <input class="web-search-input" id="webSearchInput" type="search" placeholder="검색어를 입력하세요" autocomplete="off">
          <div class="web-search-control-row">
            <div class="web-search-tools-left">
              <button class="web-search-plus-btn" id="webSearchPlusButton" type="button" aria-label="서치 입력 방식 선택" aria-expanded="false" aria-controls="webSearchToolsMenu">+</button>
              <div class="web-search-tools-menu" id="webSearchToolsMenu" role="menu" hidden>
                <button class="web-search-tool-item" id="webSearchUploadButton" type="button" role="menuitem">이미지 업로드</button>
                <button class="web-search-tool-item" id="webSearchCameraButton" type="button" role="menuitem">사진 찍기</button>
              </div>
            </div>
            <div class="web-search-controls-right">
              <button class="web-search-icon-btn web-search-mic" id="webSearchMicButton" type="button" aria-label="음성 입력" title="음성 입력">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"></path><path d="M19 11a7 7 0 0 1-14 0"></path><path d="M12 18v3"></path><path d="M8 21h8"></path></svg>
              </button>
              <button class="web-search-submit" id="webSearchSubmit" type="button" aria-label="검색">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>
              </button>
            </div>
          </div>
          <input class="web-search-image-input" id="webSearchImageInput" type="file" accept="image/jpeg,image/png,image/webp" aria-label="서치 이미지 업로드">
          <div class="web-search-image-preview" id="webSearchImagePreview" hidden>
            <img id="webSearchPreviewImg" alt="서치 시작 이미지 미리보기">
            <div class="web-search-image-preview-info">
              <p id="webSearchPreviewName">선택한 이미지</p>
              <button class="web-search-image-remove" id="webSearchImageRemove" type="button">이미지 삭제</button>
            </div>
          </div>
          <div class="web-search-image-suggestions" id="webSearchImageSuggestions" aria-live="polite" hidden></div>
        </div>

        <p class="web-search-status" id="webSearchStatus" role="status" aria-live="polite" hidden></p>
        <div class="web-search-results" id="webSearchResults" aria-live="polite"></div>
      </section>
    `;

    const root = container.querySelector('.web-search-panel');
    const returnButton = root.querySelector('[data-ai-tool-return]');
    const input = root.querySelector('#webSearchInput');
    const submit = root.querySelector('#webSearchSubmit');
    const status = root.querySelector('#webSearchStatus');
    const fileInput = root.querySelector('#webSearchImageInput');
    const uploadButton = root.querySelector('#webSearchUploadButton');
    const cameraButton = root.querySelector('#webSearchCameraButton');
    const removeButton = root.querySelector('#webSearchImageRemove');
    const plusButton = root.querySelector('#webSearchPlusButton');
    const micButton = root.querySelector('#webSearchMicButton');

    returnButton?.addEventListener('click', exitWebSearchMode);
    plusButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleWebSearchMenu(root);
    });
    root.addEventListener('click', (event) => {
      if (event.target.closest('.web-search-tools-left')) return;
      closeWebSearchMenu(root);
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

    async function handleImageFile(file) {
      if (!isSupportedImage(file)) {
        setStatus(status, UNSUPPORTED_IMAGE_MESSAGE);
        if (fileInput) fileInput.value = '';
        return;
      }

      setStatus(status, '이미지를 확인하고 검색어를 찾고 있습니다...');
      let imagePayload;
      try {
        imagePayload = await readImageFile(file);
      } catch (error) {
        setStatus(status, error.message || '이미지를 읽을 수 없습니다.');
        return;
      }
      renderImagePreview(root, imagePayload);

      try {
        const terms = await inferImageTerms(imagePayload);
        renderSuggestedTerms(root, terms);
        setStatus(status, terms.length ? '이미지에서 추천 검색어를 찾았습니다.' : INFERENCE_UNAVAILABLE_MESSAGE);
      } catch (error) {
        renderSuggestedTerms(root, []);
        setStatus(status, INFERENCE_UNAVAILABLE_MESSAGE);
      }
    }

    submit.addEventListener('click', () => runSearch());
    micButton?.addEventListener('click', () => startVoiceInput(input, status, micButton));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runSearch();
      }
    });

    uploadButton?.addEventListener('click', () => {
      closeWebSearchMenu(root);
      if (!fileInput) return;
      fileInput.removeAttribute('capture');
      fileInput.value = '';
      fileInput.click();
    });

    cameraButton?.addEventListener('click', () => {
      closeWebSearchMenu(root);
      if (!fileInput) return;
      fileInput.setAttribute('capture', 'environment');
      fileInput.value = '';
      fileInput.click();
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

    removeButton?.addEventListener('click', () => {
      clearImagePreview(root);
      setStatus(status, '이미지를 삭제했습니다.');
    });

    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-web-search-term]');
      if (!button) return;
      runSearch(button.dataset.webSearchTerm || '');
    });

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
      handleImageFile(imageFiles[0]);
    }

    document.addEventListener('paste', handlePaste);
    removePasteListener = () => document.removeEventListener('paste', handlePaste);
    input.focus();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const root = document.querySelector('.web-search-panel');
    closeWebSearchMenu(root);
  });

  function openWebSearch() {
    enterWebSearchMode();
    renderWebSearchShell();
  }

  global.ThisOneWebSearch = {
    open: openWebSearch,
    mode: WEB_SEARCH_MODE
  };
})(window);
