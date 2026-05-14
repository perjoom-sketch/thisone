(function (global) {
  if (global.__thisOneComposerImageInputApplied) return;
  global.__thisOneComposerImageInputApplied = true;

  function getClipboardImageFile(clipboardData) {
    if (!clipboardData) return null;

    const file = Array.from(clipboardData.files || []).find((candidate) => /^image\//.test(candidate?.type || ''));
    if (file) return file;

    return Array.from(clipboardData.items || [])
      .filter((item) => item.kind === 'file' && /^image\//.test(item.type || ''))
      .map((item) => item.getAsFile())
      .find(Boolean) || null;
  }

  function render(options = {}) {
    const id = options.id || 'composerImage';
    const label = options.label || '이미지';
    return `
      <div class="composer-img-preview img-preview" id="${id}Preview" aria-live="polite">
        <div class="pv-item">
          <img class="pv-img" id="${id}PreviewImg" src="" alt="${label} 미리보기">
          <button class="pv-del" id="${id}Remove" type="button" aria-label="선택한 이미지 제거" title="선택한 이미지 제거">✕</button>
        </div>
      </div>
    `;
  }

  function isMobileLike() {
    try {
      return global.matchMedia('(max-width: 640px), (pointer: coarse)').matches;
    } catch (error) {
      return /Android|iPhone|iPad|iPod/i.test(global.navigator?.userAgent || '');
    }
  }

  function renderControls(options = {}) {
    const id = options.id || 'composerImage';
    const plusClass = options.plusClass || '';
    const wrapClass = options.wrapClass || '';
    const menuClass = options.menuClass || '';
    const itemClass = options.itemClass || '';
    const uploadLabel = isMobileLike() ? '사진보관함' : '이미지 업로드';
    return `
      <div class="composer-plus-wrap ${wrapClass}">
        <button class="ai-tool-icon-button ai-tool-plus-button composer-plus-button ${plusClass}" id="${id}PlusButton" type="button" aria-label="입력 방식 선택" aria-expanded="false" aria-controls="${id}Menu" title="입력 방식 선택">+</button>
        <div class="composer-plus-menu ${menuClass}" id="${id}Menu" role="menu" hidden>
          <button class="composer-plus-menu-item ${itemClass}" id="${id}UploadButton" type="button" role="menuitem"><span aria-hidden="true">🖼️</span><span>${uploadLabel}</span></button>
        </div>
        <input class="composer-image-file-input" id="${id}UploadInput" type="file" accept="image/*" hidden>
      </div>
    `;
  }

  function attach(root, options = {}) {
    if (!root) return null;

    const id = options.id || 'composerImage';
    const active = typeof options.isActive === 'function' ? options.isActive : () => root.isConnected;
    const plusButton = root.querySelector(`#${id}PlusButton`);
    const plusMenu = root.querySelector(`#${id}Menu`);
    const uploadButton = root.querySelector(`#${id}UploadButton`);
    const uploadInput = root.querySelector(`#${id}UploadInput`);
    const preview = root.querySelector(`#${id}Preview`);
    const previewImg = root.querySelector(`#${id}PreviewImg`);
    const removeButton = root.querySelector(`#${id}Remove`);
    let selectedFileInput = null;
    let selectedFile = null;
    let selectedFilePreviewUrl = '';

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

    function revokePreviewUrl() {
      if (!selectedFilePreviewUrl) return;
      URL.revokeObjectURL(selectedFilePreviewUrl);
      selectedFilePreviewUrl = '';
    }

    function clear() {
      if (selectedFileInput) selectedFileInput.value = '';
      selectedFileInput = null;
      selectedFile = null;
      revokePreviewUrl();
      if (previewImg) {
        previewImg.removeAttribute('src');
      }
      if (preview) preview.classList.remove('show');
      if (typeof options.onChange === 'function') options.onChange(null);
    }

    function setFile(file, fileInput) {
      if (!file || !/^image\//.test(file.type || '')) {
        clear();
        return;
      }

      if (!fileInput && uploadInput) uploadInput.value = '';

      selectedFileInput = fileInput || null;
      selectedFile = file;
      revokePreviewUrl();
      if (previewImg) {
        selectedFilePreviewUrl = URL.createObjectURL(file);
        previewImg.src = selectedFilePreviewUrl;
      }
      if (preview) preview.classList.add('show');
      setPlusMenuOpen(false);
      if (typeof options.onChange === 'function') options.onChange(file);
    }

    function handlePaste(event) {
      if (!active()) return;
      const file = getClipboardImageFile(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      setFile(file, null);
    }

    function handleDocumentClick(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !root.isConnected) return;
      if (!plusMenu?.hidden && !target.closest('.composer-plus-wrap')) setPlusMenuOpen(false);
    }

    plusButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (typeof options.beforeOpen === 'function') options.beforeOpen();
      setPlusMenuOpen(!!plusMenu?.hidden);
    });
    uploadButton?.addEventListener('click', () => openFilePicker(uploadInput));
    uploadInput?.addEventListener('change', () => setFile(uploadInput.files?.[0] || null, uploadInput));
    removeButton?.addEventListener('click', clear);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('click', handleDocumentClick);

    return {
      clear,
      closeMenu: () => setPlusMenuOpen(false),
      getFile: () => selectedFile,
      setFile: (file) => setFile(file, null),
      cleanup: () => {
        document.removeEventListener('paste', handlePaste);
        document.removeEventListener('click', handleDocumentClick);
        clear();
      }
    };
  }

  global.ThisOneComposerImageInput = { render, renderControls, attach };
})(window);
