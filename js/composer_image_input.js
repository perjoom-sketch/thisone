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
      unsupportedMessage: options.unsupportedMessage || DEFAULT_UNSUPPORTED_MESSAGE,
      maxFiles: Math.max(1, Number(options.maxFiles || 1))
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

  function getClipboardFiles(clipboardData, policy) {
    if (!clipboardData) return [];

    const itemFiles = Array.from(clipboardData.items || [])
      .filter((item) => item?.kind === 'file')
      .map((item) => item.getAsFile?.())
      .filter((candidate) => isAcceptedFile(candidate, policy));
    if (itemFiles.length > 0) return itemFiles;

    return Array.from(clipboardData.files || [])
      .filter((candidate) => isAcceptedFile(candidate, policy));
  }


  function render(options = {}) {
    const id = options.id || 'composerImage';
    return `
      <div class="composer-img-preview img-preview" id="${escapeHtml(id)}Preview" aria-live="polite">
        <div class="composer-attachment-list" id="${escapeHtml(id)}PreviewList"></div>
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
        <input class="composer-image-file-input" id="${escapeHtml(id)}UploadInput" type="file" accept="${escapeHtml(policy.accept)}" multiple hidden>
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
    const previewList = root.querySelector(`#${id}PreviewList`);
    let selectedFileInput = null;
    let selectedFiles = [];
    let selectedFilePreviewUrls = [];

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

    function revokePreviewUrls() {
      selectedFilePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
      selectedFilePreviewUrls = [];
    }

    function resetPreview() {
      revokePreviewUrls();
      if (previewList) previewList.innerHTML = '';
      if (preview) preview.classList.remove('show');
    }

    function getFiles() {
      return selectedFiles.slice();
    }

    function emitChange() {
      if (typeof options.onChange === 'function') options.onChange(selectedFiles[0] || null, { files: getFiles() });
    }

    function clear() {
      if (selectedFileInput) selectedFileInput.value = '';
      selectedFileInput = null;
      selectedFiles = [];
      resetPreview();
      emitChange();
    }

    function reject(file) {
      clear();
      if (typeof options.onReject === 'function') options.onReject(file, policy.unsupportedMessage);
    }

    function renderSelectedFiles() {
      resetPreview();
      if (!selectedFiles.length) return;
      selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'pv-item composer-attachment-item';
        const fileName = escapeHtml(file.name || '업로드 파일');
        const removeLabel = escapeHtml(`${file.name || '첨부 파일'} 제거`);
        if (isImageFile(file) && policy.previewMode !== 'file') {
          const previewUrl = URL.createObjectURL(file);
          selectedFilePreviewUrls.push(previewUrl);
          item.innerHTML = `
            <img class="pv-img" src="${escapeHtml(previewUrl)}" alt="${fileName} 미리보기">
            <span class="composer-attachment-order" aria-label="첨부 순서">${index + 1}</span>
            <button class="pv-del" type="button" data-attachment-remove-index="${index}" aria-label="${removeLabel}" title="${removeLabel}">✕</button>
          `;
        } else {
          item.classList.add('is-file-chip');
          item.innerHTML = `
            <div class="composer-file-chip">
              <span class="composer-file-chip-icon" aria-hidden="true">📄</span>
              <span class="composer-file-chip-text">
                <span class="composer-file-chip-label">선택한 파일</span>
                <span class="composer-file-chip-name">${fileName}</span>
                <span class="composer-file-chip-type">${escapeHtml(file.type || '파일')}</span>
              </span>
              <span class="composer-attachment-order" aria-label="첨부 순서">${index + 1}</span>
            </div>
            <button class="pv-del" type="button" data-attachment-remove-index="${index}" aria-label="${removeLabel}" title="${removeLabel}">✕</button>
          `;
        }
        previewList?.appendChild(item);
      });
      if (preview) preview.classList.add('show');
    }

    function removeFile(index) {
      if (index < 0 || index >= selectedFiles.length) return false;
      selectedFiles = selectedFiles.filter((_file, fileIndex) => fileIndex !== index);
      if (!selectedFiles.length && selectedFileInput) {
        selectedFileInput.value = '';
        selectedFileInput = null;
      }
      renderSelectedFiles();
      emitChange();
      return true;
    }

    function normalizeAcceptedFiles(files) {
      return Array.from(files || []).filter(Boolean);
    }

    function setFiles(files, fileInput) {
      const incoming = normalizeAcceptedFiles(files);
      if (!incoming.length) {
        clear();
        return false;
      }
      const rejectedFile = incoming.find((file) => !isAcceptedFile(file, policy));
      if (rejectedFile) {
        if (fileInput) fileInput.value = '';
        reject(rejectedFile);
        return false;
      }
      if (!fileInput && uploadInput) uploadInput.value = '';
      selectedFileInput = fileInput || null;
      selectedFiles = incoming.slice(0, policy.maxFiles);
      renderSelectedFiles();
      setPlusMenuOpen(false);
      emitChange();
      return true;
    }

    function addFiles(files, fileInput) {
      const incoming = normalizeAcceptedFiles(files);
      if (!incoming.length) return false;
      if (policy.maxFiles <= 1) return setFiles(incoming.slice(0, 1), fileInput);
      const rejectedFile = incoming.find((file) => !isAcceptedFile(file, policy));
      if (rejectedFile) {
        if (fileInput) fileInput.value = '';
        reject(rejectedFile);
        return false;
      }
      if (!fileInput && uploadInput) uploadInput.value = '';
      selectedFileInput = fileInput || selectedFileInput;
      selectedFiles = selectedFiles.concat(incoming).slice(0, policy.maxFiles);
      renderSelectedFiles();
      setPlusMenuOpen(false);
      emitChange();
      return true;
    }

    function handlePaste(event) {
      if (!active()) return;
      const files = getClipboardFiles(event.clipboardData, policy);
      if (!files.length) return;
      event.preventDefault();
      addFiles(files, null);
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
    uploadInput?.addEventListener('change', () => setFiles(uploadInput.files || [], uploadInput));
    previewList?.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-attachment-remove-index]') : null;
      if (!target) return;
      removeFile(Number(target.getAttribute('data-attachment-remove-index')));
    });
    document.addEventListener('paste', handlePaste);
    document.addEventListener('click', handleDocumentClick);

    return {
      clear,
      closeMenu: () => setPlusMenuOpen(false),
      getFiles,
      getFile: () => selectedFiles[0] || null,
      setFiles: (files) => setFiles(files, null),
      addFiles: (files) => addFiles(files, null),
      setFile: (file) => setFiles(file ? [file] : [], null),
      removeFile,
      cleanup: () => {
        document.removeEventListener('paste', handlePaste);
        document.removeEventListener('click', handleDocumentClick);
        clear();
      }
    };
  }


  global.ThisOneComposerImageInput = { render, renderControls, attach };
})(window);
