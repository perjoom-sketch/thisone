(function (global) {
  if (global.__thisOneDocumentAIShellApplied) return;
  global.__thisOneDocumentAIShellApplied = true;

  const DOCUMENT_AI_MODE = 'document-ai';
  const READY_MESSAGE = '해석 기능은 준비 중입니다.\n곧 어려운 내용을 쉽게 해석해드릴게요.';
  const UNSUPPORTED_FILE_MESSAGE = '현재는 PDF, JPG, PNG, WebP, 텍스트만 해석할 수 있습니다.';
  const UNSUPPORTED_PASTE_MESSAGE = 'PDF, 이미지, 텍스트만 붙여넣을 수 있습니다.';
  const PASTED_IMAGE_MESSAGE = '붙여넣은 이미지가 추가되었습니다.';
  const PASTED_TEXT_MESSAGE = '붙여넣은 텍스트가 추가되었습니다.';
  let removePasteListener = null;

  const SUPPORTED_FILE_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);

  function isSupportedFile(file) {
    return file && SUPPORTED_FILE_TYPES.has(file.type);
  }

  function isPreviewableImage(file) {
    return file && /^image\/(jpeg|png|webp)$/.test(file.type || '');
  }

  function getFirstSupportedFile(fileList) {
    return Array.from(fileList || []).find(isSupportedFile) || null;
  }

  function getClipboardText(clipboardData) {
    return clipboardData?.getData('text/plain')?.trim() || '';
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

  function hasClipboardContent(clipboardData) {
    if (!clipboardData) return false;
    return getClipboardFiles(clipboardData).length > 0
      || (clipboardData.items && clipboardData.items.length > 0)
      || Boolean(getClipboardText(clipboardData));
  }

  function isQuestionTextarea(target, question) {
    return Boolean(question && target === question);
  }

  function setStatus(element, message) {
    if (!element) return;
    element.textContent = message;
    element.hidden = false;
  }

  function hideStatus(element) {
    if (!element) return;
    element.textContent = '';
    element.hidden = true;
  }

  function enterDocumentAIMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'document-ai-mode');
    document.body.classList.remove('instant-answer-mode', 'web-search-mode');
  }

  function cleanupDocumentAI() {
    if (removePasteListener) {
      removePasteListener();
      removePasteListener = null;
    }
  }


  function renderDocumentAIShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    if (removePasteListener) {
      removePasteListener();
      removePasteListener = null;
    }

    container.innerHTML = `
      <section class="document-ai-panel" data-mode="${DOCUMENT_AI_MODE}" aria-label="디스원 해석">
        ${global.ThisOneModeTabs?.render?.(DOCUMENT_AI_MODE) || ''}
        <div class="document-ai-copy">
          <p class="document-ai-main-copy">어려운 글, 읽지 말고 물어보세요.</p>
          <p class="document-ai-sub-copy">PDF나 사진을 올리면 AI가 쉽게 해석하고, 궁금한 점에 답해드립니다.</p>
        </div>

        <div class="ai-tool-composer document-ai-composer" id="documentAiUpload">
          ${global.ThisOneComposerImageInput?.render?.({ id: 'documentAiImage', label: '해석 이미지' }) || ''}
          <div class="ai-tool-input document-ai-composer-top">
            <textarea class="document-ai-question" id="documentAiQuestion" rows="4" aria-label="해석 질문 입력창" placeholder="문서나 사진을 올리면 쉽게 풀어드려요"></textarea>
          </div>
          <div class="ai-tool-control-row document-ai-composer-bottom">
            <div class="ai-tool-left-controls document-ai-composer-left-actions">
              ${global.ThisOneComposerImageInput?.renderControls?.({ id: 'documentAiImage', plusClass: 'document-ai-upload-action' }) || ''}
            </div>
            <div class="ai-tool-right-controls document-ai-composer-right-actions">
              <button class="ai-tool-icon-button ai-tool-help-button document-ai-help-button" id="documentAiHelpButton" type="button" aria-expanded="false" aria-controls="documentAiHelpPanel" aria-label="해석 질문 예시 보기" title="도움말">?</button>
              <button class="ai-tool-icon-button ai-tool-mic-button" id="documentAiMicButton" type="button" aria-label="음성으로 입력" title="음성으로 입력"></button>
              <button class="ai-tool-action-button document-ai-submit" id="documentAiSubmit" type="button">해석하기</button>
            </div>
          </div>
        </div>
        <div class="document-ai-help-panel" id="documentAiHelpPanel" hidden>
          <p class="document-ai-help-title">이렇게 물어보세요</p>
          <div class="document-ai-help-examples">
            <button type="button" data-document-ai-example="이 문서에서 내가 해야 할 일만 정리해줘">이 문서에서 내가 해야 할 일만 정리해줘</button>
            <button type="button" data-document-ai-example="이 계약서에서 조심할 부분 알려줘">이 계약서에서 조심할 부분 알려줘</button>
            <button type="button" data-document-ai-example="이 고지서가 무슨 뜻인지 쉽게 설명해줘">이 고지서가 무슨 뜻인지 쉽게 설명해줘</button>
            <button type="button" data-document-ai-example="이 설명서 사진 보고 설정 방법 알려줘">이 설명서 사진 보고 설정 방법 알려줘</button>
          </div>
        </div>

        <p class="ai-tool-voice-status" id="documentAiVoiceStatus" aria-live="polite" hidden></p>

        <div class="document-ai-privacy" role="note" aria-label="개인정보 안내">
          <strong>개인정보 안내</strong>
          <p>개인정보는 가리고 올려주세요.</p>
          <p>디스원은 이름이 아니라 문서의 뜻을 풀어드립니다.</p>
          <p>주민번호, 주소, 전화번호, 계좌번호는 해석에 필요하지 않습니다.</p>
        </div>
        <p class="document-ai-placeholder" id="documentAiPlaceholder" role="status" aria-live="polite" hidden></p>
      </section>
    `;

    const root = container.querySelector('.document-ai-panel');
    const button = document.getElementById('documentAiSubmit');
    const placeholder = document.getElementById('documentAiPlaceholder');
    const upload = document.getElementById('documentAiUpload');
    const question = document.getElementById('documentAiQuestion');
    const helpButton = document.getElementById('documentAiHelpButton');
    const helpPanel = document.getElementById('documentAiHelpPanel');
    const micButton = document.getElementById('documentAiMicButton');
    const voiceStatus = document.getElementById('documentAiVoiceStatus');
    let imageInput = null;
    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input: question,
      status: voiceStatus,
      appendMode: 'newline'
    });
    function setDragOver(isDragOver) {
      upload?.classList.toggle('is-drag-over', isDragOver);
    }

    global.ThisOneModeTabs?.bind?.(root);

    imageInput = global.ThisOneComposerImageInput?.attach?.(root, {
      id: 'documentAiImage',
      isActive: () => root.isConnected && document.body.classList.contains('document-ai-mode'),
      beforeOpen: () => {
        if (helpPanel && helpButton) {
          helpPanel.hidden = true;
          helpButton.setAttribute('aria-expanded', 'false');
        }
      }
    });

    button?.addEventListener('click', () => {
      setStatus(placeholder, READY_MESSAGE);
    });


    helpButton?.addEventListener('click', () => {
      if (!helpPanel) return;
      const willOpen = helpPanel.hidden;
      helpPanel.hidden = !willOpen;
      helpButton.setAttribute('aria-expanded', String(willOpen));
    });

    helpPanel?.addEventListener('click', (event) => {
      const exampleButton = event.target instanceof Element
        ? event.target.closest('[data-document-ai-example]')
        : null;
      if (!exampleButton || !question) return;
      question.value = exampleButton.dataset.documentAiExample || '';
      question.focus();
    });


    upload?.addEventListener('dragenter', (event) => {
      event.preventDefault();
      setDragOver(true);
    });

    upload?.addEventListener('dragover', (event) => {
      event.preventDefault();
      setDragOver(true);
    });

    upload?.addEventListener('dragleave', () => {
      setDragOver(false);
    });

    upload?.addEventListener('dragend', () => {
      setDragOver(false);
    });

    upload?.addEventListener('drop', (event) => {
      event.preventDefault();
      setDragOver(false);
      imageInput?.setFile?.(event.dataTransfer?.files?.[0] || null);
    });

    removePasteListener = () => {
      imageInput?.cleanup?.();
    };
  }

  function openDocumentAI() {
    enterDocumentAIMode();
    renderDocumentAIShell();
  }

  global.ThisOneDocumentAI = {
    open: openDocumentAI,
    mode: DOCUMENT_AI_MODE
  };

  global.ThisOneModeTabs?.registerCleanup?.(DOCUMENT_AI_MODE, cleanupDocumentAI);
})(window);
