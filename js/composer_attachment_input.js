(function (global) {
  if (global.__thisOneComposerAttachmentInputApplied) return;
  global.__thisOneComposerAttachmentInputApplied = true;

  const COMMON_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,text/plain,.jpg,.jpeg,.png,.webp,.pdf,.txt';
  const DEFAULT_UNSUPPORTED_MESSAGE = 'JPG, PNG, WebP, PDF, 텍스트 파일만 추가할 수 있습니다.';

  const MODE_ATTACHMENT_POLICIES = {
    shopping: {
      canUseText: true,
      canUseImage: true,
      canUsePdf: false,
      canUsePlainTextFile: false,
      maxFiles: 1,
      unsupportedPdfMessage: 'PDF는 쇼핑 검색에서 읽지 않습니다. 상품명이나 상품 사진으로 검색해 주세요.',
      unsupportedPlainTextFileMessage: '쇼핑 검색에서는 텍스트 파일을 읽지 않습니다. 상품명을 검색창에 직접 입력해 주세요.'
    },
    documentAi: {
      canUseText: true,
      canUseImage: true,
      canUsePdf: true,
      canUsePlainTextFile: true,
      maxFiles: 10
    },
    instantAnswer: {
      canUseText: true,
      canUseImage: false,
      canUsePdf: false,
      canUsePlainTextFile: false,
      maxFiles: 1,
      unsupportedImageMessage: '즉답은 현재 텍스트 질문 중심입니다. 사진 해석은 해석 탭에서 도와드릴게요.',
      unsupportedPdfMessage: '즉답에서는 PDF 문서를 읽지 않습니다. 해석 탭에서 문서를 올려주세요.'
    },
    webSearch: {
      canUseText: true,
      canUseImage: true,
      canUsePdf: false,
      canUsePlainTextFile: false,
      maxFiles: 1,
      unsupportedPdfMessage: '서치에서는 PDF 문서를 읽지 않습니다. 웹에서 찾을 키워드를 입력해 주세요.'
    },
    loveme: {
      canUseText: true,
      canUseImage: true,
      canUsePdf: false,
      canUsePlainTextFile: false,
      maxFiles: 1,
      unsupportedPdfMessage: '럽미는 사진 상담 중심입니다. 문서 해석은 해석 탭에서 도와드릴게요.'
    },
    homeMeal: {
      canUseText: true,
      canUseImage: true,
      canUsePdf: false,
      canUsePlainTextFile: false,
      maxFiles: 1,
      unsupportedPdfMessage: '이건 음식 재료가 아니라 문서에 가까워요. 해석 탭에서 풀어드릴 수 있습니다.'
    }
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeMimeType(type) {
    return String(type || '').toLowerCase();
  }

  function normalizeName(name) {
    return String(name || '').toLowerCase();
  }

  function classifyFile(file) {
    const type = normalizeMimeType(file?.type);
    const name = normalizeName(file?.name);
    if (/^image\/(jpeg|png|webp)$/.test(type) || /\.(jpe?g|png|webp)$/.test(name)) return 'image';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (type === 'text/plain' || name.endsWith('.txt')) return 'plainTextFile';
    return 'unknown';
  }

  function isAcceptedByToken(file, token) {
    const rule = String(token || '').trim().toLowerCase();
    if (!rule) return false;
    const type = normalizeMimeType(file?.type);
    const name = normalizeName(file?.name);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    if (rule.startsWith('.')) return name.endsWith(rule);
    return type === rule;
  }

  function isAcceptedFile(file, accept) {
    if (!file) return false;
    return String(accept || COMMON_ACCEPT)
      .split(',')
      .some((token) => isAcceptedByToken(file, token));
  }

  function isImageFile(file) {
    return classifyFile(file) === 'image';
  }

  function getPolicy(modeOrPolicy) {
    if (!modeOrPolicy) return null;
    if (typeof modeOrPolicy === 'string') return MODE_ATTACHMENT_POLICIES[modeOrPolicy] || null;
    return modeOrPolicy;
  }

  function canProcessAttachment(modeOrPolicy, file) {
    const policy = getPolicy(modeOrPolicy);
    if (!policy || !file) return true;
    const kind = classifyFile(file);
    if (kind === 'image') return policy.canUseImage !== false;
    if (kind === 'pdf') return policy.canUsePdf === true;
    if (kind === 'plainTextFile') return policy.canUsePlainTextFile === true;
    return false;
  }

  function getUnsupportedMessage(modeOrPolicy, file) {
    const policy = getPolicy(modeOrPolicy);
    const kind = classifyFile(file);
    if (!policy) return DEFAULT_UNSUPPORTED_MESSAGE;
    if (kind === 'image') return policy.unsupportedImageMessage || '이 모드에서는 이미지를 처리하지 않습니다. 텍스트로 입력해 주세요.';
    if (kind === 'pdf') return policy.unsupportedPdfMessage || '이 모드에서는 PDF 문서를 읽지 않습니다. 해석 탭에서 문서를 올려주세요.';
    if (kind === 'plainTextFile') return policy.unsupportedPlainTextFileMessage || '이 모드에서는 텍스트 파일을 읽지 않습니다. 내용을 입력창에 붙여넣어 주세요.';
    return policy.unsupportedMessage || DEFAULT_UNSUPPORTED_MESSAGE;
  }

  function getFileLabel(file) {
    const kind = classifyFile(file);
    if (kind === 'image') return '이미지';
    if (kind === 'pdf') return 'PDF 문서';
    if (kind === 'plainTextFile') return '텍스트 파일';
    return '첨부 파일';
  }

  function getClipboardFiles(clipboardData) {
    if (!clipboardData) return [];
    const files = Array.from(clipboardData.files || []).filter(Boolean);
    if (files.length > 0) return files;
    return Array.from(clipboardData.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);
  }


  function render(options = {}) {
    const id = options.id || 'composerAttachment';
    return `
      <div class="composer-attachment-preview composer-img-preview img-preview" id="${escapeHtml(id)}Preview" aria-live="polite">
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
    const id = options.id || 'composerAttachment';
    const uploadLabel = isMobileLike()
      ? (options.mobileUploadLabel || options.uploadLabel || '파일 추가')
      : (options.uploadLabel || '파일 추가');
    return `
      <div class="composer-plus-wrap ${escapeHtml(options.wrapClass || '')}">
        <button class="ai-tool-icon-button ai-tool-plus-button composer-plus-button ${escapeHtml(options.plusClass || '')}" id="${escapeHtml(id)}PlusButton" type="button" aria-label="입력 방식 선택" aria-expanded="false" aria-controls="${escapeHtml(id)}Menu" title="입력 방식 선택">+</button>
        <div class="composer-plus-menu ${escapeHtml(options.menuClass || '')}" id="${escapeHtml(id)}Menu" role="menu" hidden>
          <button class="composer-plus-menu-item ${escapeHtml(options.itemClass || '')}" id="${escapeHtml(id)}UploadButton" type="button" role="menuitem"><span aria-hidden="true">📎</span><span>${escapeHtml(uploadLabel)}</span></button>
        </div>
        <input class="composer-attachment-file-input" id="${escapeHtml(id)}UploadInput" type="file" accept="${escapeHtml(options.accept || COMMON_ACCEPT)}" multiple hidden>
      </div>
    `;
  }

  function attach(root, options = {}) {
    if (!root) return null;
    const id = options.id || 'composerAttachment';
    const active = typeof options.isActive === 'function' ? options.isActive : () => root.isConnected;
    const modePolicy = options.modePolicy || options.mode || null;
    const plusButton = root.querySelector(`#${id}PlusButton`);
    const plusMenu = root.querySelector(`#${id}Menu`);
    const uploadButton = root.querySelector(`#${id}UploadButton`);
    const uploadInput = root.querySelector(`#${id}UploadInput`);
    const preview = root.querySelector(`#${id}Preview`);
    const previewList = root.querySelector(`#${id}PreviewList`);
    const textInput = options.textInput || null;
    const maxFiles = Math.max(1, Number(options.maxFiles || getPolicy(modePolicy)?.maxFiles || 1));
    let selectedFileInput = null;
    let selectedFiles = [];
    let selectedFilePreviewUrls = [];

    function setPlusMenuOpen(isOpen) {
      if (!plusButton || !plusMenu) return;
      plusMenu.hidden = !isOpen;
      plusButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function revokePreviewUrls() {
      selectedFilePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
      selectedFilePreviewUrls = [];
    }

    function getFiles() {
      return selectedFiles.slice();
    }

    function getFirstUnsupportedFile() {
      return selectedFiles.find((file) => !canProcessAttachment(modePolicy, file)) || null;
    }

    function buildChangeMeta() {
      const files = getFiles();
      const unsupportedFile = getFirstUnsupportedFile();
      return {
        files,
        processable: !unsupportedFile,
        kind: files.length === 1 ? classifyFile(files[0]) : 'bundle',
        maxFiles,
        unsupportedFile
      };
    }

    function resetPreview() {
      revokePreviewUrls();
      if (previewList) previewList.innerHTML = '';
      if (preview) preview.classList.remove('show');
    }

    function showNotice(message, file) {
      if (typeof options.onNotice === 'function') options.onNotice(message, file);
    }

    function emitChange() {
      if (typeof options.onChange === 'function') {
        options.onChange(selectedFiles[0] || null, buildChangeMeta());
      }
    }

    function clear() {
      if (selectedFileInput) selectedFileInput.value = '';
      selectedFileInput = null;
      selectedFiles = [];
      resetPreview();
      emitChange();
    }

    function renderSelectedFiles() {
      resetPreview();
      if (!selectedFiles.length) return;
      selectedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'pv-item composer-attachment-item';
        const fileName = escapeHtml(file.name || '업로드 파일');
        const fileType = escapeHtml(file.type || getFileLabel(file));
        const removeLabel = escapeHtml(`${file.name || '첨부 파일'} 제거`);

        if (isImageFile(file) && options.previewMode !== 'file') {
          const previewUrl = URL.createObjectURL(file);
          selectedFilePreviewUrls.push(previewUrl);
          item.innerHTML = `
            <img class="pv-img" src="${escapeHtml(previewUrl)}" alt="${fileName} 미리보기">
            <span class="composer-attachment-order" aria-label="첨부 순서">${index + 1}</span>
            <button class="pv-del" type="button" data-attachment-remove-index="${index}" aria-label="${removeLabel}" title="${removeLabel}">✕</button>
          `;
        } else {
          item.classList.add('is-file-chip');
          const icon = classifyFile(file) === 'pdf' ? '📕' : '📄';
          item.innerHTML = `
            <div class="composer-file-chip">
              <span class="composer-file-chip-icon" aria-hidden="true">${icon}</span>
              <span class="composer-file-chip-text">
                <span class="composer-file-chip-label">${escapeHtml(getFileLabel(file))}</span>
                <span class="composer-file-chip-name">${fileName}</span>
                <span class="composer-file-chip-type">${fileType}</span>
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

    function normalizeIncomingFiles(files) {
      return Array.from(files || []).filter(Boolean);
    }

    function setFiles(files, fileInput) {
      const incoming = normalizeIncomingFiles(files);
      if (!incoming.length) {
        clear();
        return false;
      }
      if (!fileInput && uploadInput) uploadInput.value = '';
      selectedFileInput = fileInput || null;
      selectedFiles = incoming.slice(0, maxFiles);
      renderSelectedFiles();
      setPlusMenuOpen(false);
      const unsupportedFile = getFirstUnsupportedFile();
      if (unsupportedFile) showNotice(getUnsupportedMessage(modePolicy, unsupportedFile), unsupportedFile);
      emitChange();
      return true;
    }

    function addFiles(files, fileInput) {
      const incoming = normalizeIncomingFiles(files);
      if (!incoming.length) return false;
      if (maxFiles <= 1) return setFiles(incoming.slice(0, 1), fileInput);
      if (!fileInput && uploadInput) uploadInput.value = '';
      selectedFileInput = fileInput || selectedFileInput;
      selectedFiles = selectedFiles.concat(incoming).slice(0, maxFiles);
      renderSelectedFiles();
      setPlusMenuOpen(false);
      const unsupportedFile = getFirstUnsupportedFile();
      if (unsupportedFile) showNotice(getUnsupportedMessage(modePolicy, unsupportedFile), unsupportedFile);
      emitChange();
      return true;
    }

    function handlePaste(event) {
      if (!active()) return;
      const files = getClipboardFiles(event.clipboardData);
      if (files.length) {
        event.preventDefault();
        addFiles(files, null);
        return;
      }
      const pastedText = event.clipboardData?.getData?.('text/plain') || '';
      if (!pastedText.trim() || !textInput || event.target === textInput) return;
      if (getPolicy(modePolicy)?.canUseText === false) return;
      event.preventDefault();
      textInput.value = `${textInput.value || ''}${pastedText}`;
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof options.onTextPaste === 'function') options.onTextPaste(pastedText);
    }

    function handleDocumentClick(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !root.isConnected) return;
      if (!plusMenu?.hidden && !target.closest('.composer-plus-wrap')) setPlusMenuOpen(false);
    }

    function setDragOver(isDragOver) {
      root.classList.toggle('is-drag-over', isDragOver);
      if (typeof options.onDragStateChange === 'function') options.onDragStateChange(isDragOver);
    }

    plusButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (typeof options.beforeOpen === 'function') options.beforeOpen();
      setPlusMenuOpen(!!plusMenu?.hidden);
    });
    uploadButton?.addEventListener('click', () => {
      setPlusMenuOpen(false);
      if (!uploadInput) return;
      uploadInput.value = '';
      uploadInput.click();
    });
    uploadInput?.addEventListener('change', () => setFiles(uploadInput.files || [], uploadInput));
    previewList?.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-attachment-remove-index]') : null;
      if (!target) return;
      removeFile(Number(target.getAttribute('data-attachment-remove-index')));
    });
    document.addEventListener('paste', handlePaste);
    document.addEventListener('click', handleDocumentClick);

    root.addEventListener('dragenter', (event) => {
      if (!active()) return;
      event.preventDefault();
      setDragOver(true);
    });
    root.addEventListener('dragover', (event) => {
      if (!active()) return;
      event.preventDefault();
      setDragOver(true);
    });
    root.addEventListener('dragleave', () => setDragOver(false));
    root.addEventListener('dragend', () => setDragOver(false));
    root.addEventListener('drop', (event) => {
      if (!active()) return;
      event.preventDefault();
      setDragOver(false);
      addFiles(event.dataTransfer?.files || [], null);
    });

    return {
      clear,
      closeMenu: () => setPlusMenuOpen(false),
      getFiles,
      getFile: () => selectedFiles[0] || null,
      getAttachment: () => selectedFiles[0] || null,
      isProcessable: () => !getFirstUnsupportedFile(),
      getUnsupportedMessage: () => {
        const unsupportedFile = getFirstUnsupportedFile();
        return unsupportedFile ? getUnsupportedMessage(modePolicy, unsupportedFile) : '';
      },
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


  global.ThisOneComposerAttachmentInput = {
    COMMON_ACCEPT,
    MODE_ATTACHMENT_POLICIES,
    classifyFile,
    canProcessAttachment,
    getUnsupportedMessage,
    render,
    renderControls,
    attach
  };
})(window);
