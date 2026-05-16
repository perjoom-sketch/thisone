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
      unsupportedPdfMessage: 'PDF는 쇼핑 검색에서 읽지 않습니다. 상품명이나 상품 사진으로 검색해 주세요.',
      unsupportedPlainTextFileMessage: '쇼핑 검색에서는 텍스트 파일을 읽지 않습니다. 상품명을 검색창에 직접 입력해 주세요.'
    },
    documentAi: {
      canUseText: true,
      canUseImage: true,
      canUsePdf: true,
      canUsePlainTextFile: true
    },
    instantAnswer: {
      canUseText: true,
      canUseImage: false,
      canUsePdf: false,
      canUsePlainTextFile: false,
      unsupportedImageMessage: '즉답은 현재 텍스트 질문 중심입니다. 사진 해석은 해석 탭에서 도와드릴게요.',
      unsupportedPdfMessage: '즉답에서는 PDF 문서를 읽지 않습니다. 해석 탭에서 문서를 올려주세요.'
    },
    webSearch: {
      canUseText: true,
      canUseImage: true,
      canUsePdf: false,
      canUsePlainTextFile: false,
      unsupportedPdfMessage: '서치에서는 PDF 문서를 읽지 않습니다. 웹에서 찾을 키워드를 입력해 주세요.'
    },
    loveme: {
      canUseText: true,
      canUseImage: true,
      canUsePdf: false,
      canUsePlainTextFile: false,
      unsupportedPdfMessage: '럽미는 사진 상담 중심입니다. 문서 해석은 해석 탭에서 도와드릴게요.'
    },
    homeMeal: {
      canUseText: true,
      canUseImage: true,
      canUsePdf: false,
      canUsePlainTextFile: false,
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

  function getClipboardFile(clipboardData, accept) {
    if (!clipboardData) return null;
    const files = Array.from(clipboardData.files || []);
    const directFile = files.find((candidate) => isAcceptedFile(candidate, accept));
    if (directFile) return directFile;
    return Array.from(clipboardData.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .find((candidate) => isAcceptedFile(candidate, accept)) || null;
  }

  function render(options = {}) {
    const id = options.id || 'composerAttachment';
    const label = options.label || '첨부 파일';
    const chipLabel = options.fileChipLabel || '선택한 파일';
    return `
      <div class="composer-attachment-preview composer-img-preview img-preview" id="${escapeHtml(id)}Preview" aria-live="polite">
        <div class="pv-item" id="${escapeHtml(id)}PreviewItem">
          <img class="pv-img" id="${escapeHtml(id)}PreviewImg" src="" alt="${escapeHtml(label)} 미리보기">
          <div class="composer-file-chip" id="${escapeHtml(id)}FileChip" hidden>
            <span class="composer-file-chip-icon" id="${escapeHtml(id)}FileIcon" aria-hidden="true">📄</span>
            <span class="composer-file-chip-text">
              <span class="composer-file-chip-label" id="${escapeHtml(id)}FileLabel">${escapeHtml(chipLabel)}</span>
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
        <input class="composer-attachment-file-input" id="${escapeHtml(id)}UploadInput" type="file" accept="${escapeHtml(options.accept || COMMON_ACCEPT)}" hidden>
      </div>
    `;
  }

  function attach(root, options = {}) {
    if (!root) return null;
    const id = options.id || 'composerAttachment';
    const accept = options.accept || COMMON_ACCEPT;
    const active = typeof options.isActive === 'function' ? options.isActive : () => root.isConnected;
    const modePolicy = options.modePolicy || options.mode || null;
    const plusButton = root.querySelector(`#${id}PlusButton`);
    const plusMenu = root.querySelector(`#${id}Menu`);
    const uploadButton = root.querySelector(`#${id}UploadButton`);
    const uploadInput = root.querySelector(`#${id}UploadInput`);
    const preview = root.querySelector(`#${id}Preview`);
    const previewItem = root.querySelector(`#${id}PreviewItem`);
    const previewImg = root.querySelector(`#${id}PreviewImg`);
    const fileChip = root.querySelector(`#${id}FileChip`);
    const fileIcon = root.querySelector(`#${id}FileIcon`);
    const fileLabel = root.querySelector(`#${id}FileLabel`);
    const fileName = root.querySelector(`#${id}FileName`);
    const fileType = root.querySelector(`#${id}FileType`);
    const removeButton = root.querySelector(`#${id}Remove`);
    const textInput = options.textInput || null;
    let selectedFileInput = null;
    let selectedFile = null;
    let selectedFilePreviewUrl = '';

    function setPlusMenuOpen(isOpen) {
      if (!plusButton || !plusMenu) return;
      plusMenu.hidden = !isOpen;
      plusButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
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
      if (typeof options.onChange === 'function') options.onChange(null, { processable: true });
    }

    function showNotice(message, file) {
      if (typeof options.onNotice === 'function') options.onNotice(message, file);
    }

    function reject(file, message) {
      clear();
      if (typeof options.onReject === 'function') options.onReject(file, message || DEFAULT_UNSUPPORTED_MESSAGE);
    }

    function renderSelectedFile(file) {
      resetPreview();
      if (isImageFile(file) && options.previewMode !== 'file') {
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
        if (fileIcon) fileIcon.textContent = classifyFile(file) === 'pdf' ? '📕' : '📄';
        if (fileLabel) fileLabel.textContent = getFileLabel(file);
        if (fileName) fileName.textContent = file.name || '업로드 파일';
        if (fileType) fileType.textContent = file.type || getFileLabel(file);
        if (previewItem) previewItem.classList.add('is-file-chip');
      }
      if (preview) preview.classList.add('show');
    }

    function setFile(file, fileInput) {
      if (!file) {
        clear();
        return false;
      }
      if (!isAcceptedFile(file, accept)) {
        if (fileInput) fileInput.value = '';
        reject(file, options.unsupportedMessage || DEFAULT_UNSUPPORTED_MESSAGE);
        return false;
      }
      if (!fileInput && uploadInput) uploadInput.value = '';
      selectedFileInput = fileInput || null;
      selectedFile = file;
      renderSelectedFile(file);
      setPlusMenuOpen(false);
      const processable = canProcessAttachment(modePolicy, file);
      if (!processable) showNotice(getUnsupportedMessage(modePolicy, file), file);
      if (typeof options.onChange === 'function') options.onChange(file, { processable, kind: classifyFile(file) });
      return true;
    }

    function handlePaste(event) {
      if (!active()) return;
      const file = getClipboardFile(event.clipboardData, accept);
      if (file) {
        event.preventDefault();
        setFile(file, null);
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
    uploadInput?.addEventListener('change', () => setFile(uploadInput.files?.[0] || null, uploadInput));
    removeButton?.addEventListener('click', clear);
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
      setFile(event.dataTransfer?.files?.[0] || null, null);
    });

    return {
      clear,
      closeMenu: () => setPlusMenuOpen(false),
      getFile: () => selectedFile,
      getAttachment: () => selectedFile,
      isProcessable: () => !selectedFile || canProcessAttachment(modePolicy, selectedFile),
      getUnsupportedMessage: () => selectedFile ? getUnsupportedMessage(modePolicy, selectedFile) : '',
      setFile: (file) => setFile(file, null),
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
