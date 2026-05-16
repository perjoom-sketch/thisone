(function (global) {
  if (global.__thisOneComposerImageInputApplied) return;
  global.__thisOneComposerImageInputApplied = true;

  const DEFAULT_ACCEPT = 'image/*';
  const DEFAULT_UNSUPPORTED_MESSAGE = '지원되는 이미지 파일만 업로드할 수 있습니다.';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getUploadPolicy(options = {}) {
    const accept = options.accept || DEFAULT_ACCEPT;
    const allowImages = options.allowImages !== false;
    const allowDocuments = options.allowDocuments === true;
    return {
      accept,
      allowImages,
      allowDocuments,
      previewMode: options.previewMode || (allowDocuments ? 'auto' : 'image'),
      uploadLabel: options.uploadLabel || '',
      mobileUploadLabel: options.mobileUploadLabel || '',
      unsupportedMessage: options.unsupportedMessage || DEFAULT_UNSUPPORTED_MESSAGE
    };
  }

  function normalizeMimeType(type) {
    return String(type || '').toLowerCase();
  }

  function isAcceptedByToken(file, token) {
    const rule = String(token || '').trim().toLowerCase();
    if (!rule) return false;

    const type = normalizeMimeType(file?.type);
    const name = String(file?.name || '').toLowerCase();
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    if (rule.startsWith('.')) return name.endsWith(rule);
    return type === rule;
  }

  function isAcceptedFile(file, policy) {
    if (!file) return false;
    const type = normalizeMimeType(file.type);
    if (/^image\//.test(type)) return policy.allowImages && isAcceptedByPolicy(file, policy);
    if (!policy.allowDocuments) return false;
    return isAcceptedByPolicy(file, policy);
  }

  function isAcceptedByPolicy(file, policy) {
    return String(policy.accept || '')
      .split(',')
      .some((token) => isAcceptedByToken(file, token));
  }

  function isImageFile(file) {
    return /^image\//.test(file?.type || '');
  }

  function getClipboardFile(clipboardData, policy) {
    if (!clipboardData) return null;

    const files = Array.from(clipboardData.files || []);
    const directFile = files.find((candidate) => isAcceptedFile(candidate, policy));
    if (directFile) return directFile;

    return Array.from(clipboardData.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .find((candidate) => isAcceptedFile(candidate, policy)) || null;
  }

  function render(options = {}) {
    const id = options.id || 'composerImage';
    const label = options.label || '이미지';
    const chipLabel = options.fileChipLabel || '선택한 파일';
    return `
      <div class="composer-img-preview img-preview" id="${escapeHtml(id)}Preview" aria-live="polite">
        <div class="pv-item" id="${escapeHtml(id)}PreviewItem">
          <img class="pv-img" id="${escapeHtml(id)}PreviewImg" src="" alt="${escapeHtml(label)} 미리보기">
          <div class="composer-file-chip" id="${escapeHtml(id)}FileChip" hidden>
            <span class="composer-file-chip-icon" aria-hidden="true">📄</span>
            <span class="composer-file-chip-text">
              <span class="composer-file-chip-label">${escapeHtml(chipLabel)}</span>
              <span class="composer-file-chip-name" id="${escapeHtml(id)}FileName"></span>
              <span class="composer-file-chip-type" id="${escapeHtml(id)}FileType"></span>
            </span>
          </div>
          <button class="pv-del" id="${escapeHtml(id)}Remove" type="button" aria-label="선택한 파일 제거" title="선택한 파일 제거">✕</button>
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
    const policy = getUploadPolicy(options);
    const uploadLabel = isMobileLike()
      ? (policy.mobileUploadLabel || policy.uploadLabel || '사진보관함')
      : (policy.uploadLabel || '이미지 업로드');
    const icon = policy.allowDocuments ? '📎' : '🖼️';
    return `
      <div class="composer-plus-wrap ${escapeHtml(wrapClass)}">
        <button class="ai-tool-icon-button ai-tool-plus-button composer-plus-button ${escapeHtml(plusClass)}" id="${escapeHtml(id)}PlusButton" type="button" aria-label="입력 방식 선택" aria-expanded="false" aria-controls="${escapeHtml(id)}Menu" title="입력 방식 선택">+</button>
        <div class="composer-plus-menu ${escapeHtml(menuClass)}" id="${escapeHtml(id)}Menu" role="menu" hidden>
          <button class="composer-plus-menu-item ${escapeHtml(itemClass)}" id="${escapeHtml(id)}UploadButton" type="button" role="menuitem"><span aria-hidden="true">${icon}</span><span>${escapeHtml(uploadLabel)}</span></button>
        </div>
        <input class="composer-image-file-input" id="${escapeHtml(id)}UploadInput" type="file" accept="${escapeHtml(policy.accept)}" hidden>
      </div>
    `;
  }

  function attach(root, options = {}) {
    if (!root) return null;

    const id = options.id || 'composerImage';
    const policy = getUploadPolicy(options);
    const active = typeof options.isActive === 'function' ? options.isActive : () => root.isConnected;
    const plusButton = root.querySelector(`#${id}PlusButton`);
    const plusMenu = root.querySelector(`#${id}Menu`);
    const uploadButton = root.querySelector(`#${id}UploadButton`);
    const uploadInput = root.querySelector(`#${id}UploadInput`);
    const preview = root.querySelector(`#${id}Preview`);
    const previewItem = root.querySelector(`#${id}PreviewItem`);
    const previewImg = root.querySelector(`#${id}PreviewImg`);
    const fileChip = root.querySelector(`#${id}FileChip`);
    const fileName = root.querySelector(`#${id}FileName`);
    const fileType = root.querySelector(`#${id}FileType`);
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

    function resetPreview() {
      revokePreviewUrl();
      if (previewImg) {
        previewImg.removeAttribute('src');
        previewImg.hidden = false;
      }
      if (fileChip) fileChip.hidden = true;
      if (fileName) fileName.textContent = '';
      if (fileType) fileType.textContent = '';
      if (previewItem) previewItem.classList.remove('is-file-chip');
      if (preview) preview.classList.remove('show');
    }

    function clear() {
      if (selectedFileInput) selectedFileInput.value = '';
      selectedFileInput = null;
      selectedFile = null;
      resetPreview();
      if (typeof options.onChange === 'function') options.onChange(null);
    }

    function reject(file) {
      clear();
      if (typeof options.onReject === 'function') options.onReject(file, policy.unsupportedMessage);
    }

    function renderSelectedFile(file) {
      resetPreview();
      if (isImageFile(file) && policy.previewMode !== 'file') {
        if (previewImg) {
          selectedFilePreviewUrl = URL.createObjectURL(file);
          previewImg.src = selectedFilePreviewUrl;
          previewImg.hidden = false;
        }
        if (fileChip) fileChip.hidden = true;
        if (previewItem) previewItem.classList.remove('is-file-chip');
      } else {
        if (previewImg) previewImg.hidden = true;
        if (fileChip) fileChip.hidden = false;
        if (fileName) fileName.textContent = file.name || '업로드 파일';
        if (fileType) fileType.textContent = file.type || '파일';
        if (previewItem) previewItem.classList.add('is-file-chip');
      }
      if (preview) preview.classList.add('show');
    }

    function setFile(file, fileInput) {
      if (!file) {
        clear();
        return false;
      }

      if (!isAcceptedFile(file, policy)) {
        if (fileInput) fileInput.value = '';
        reject(file);
        return false;
      }

      if (!fileInput && uploadInput) uploadInput.value = '';

      selectedFileInput = fileInput || null;
      selectedFile = file;
      renderSelectedFile(file);
      setPlusMenuOpen(false);
      if (typeof options.onChange === 'function') options.onChange(file);
      return true;
    }

    function handlePaste(event) {
      if (!active()) return;
      const file = getClipboardFile(event.clipboardData, policy);
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
