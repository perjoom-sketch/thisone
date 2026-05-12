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

  function enterDocumentAIMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'document-ai-mode');
    document.body.classList.remove('instant-answer-mode', 'web-search-mode');
  }

  function exitAIToolMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.remove('ai-tool-mode', 'document-ai-mode', 'instant-answer-mode', 'web-search-mode');
    if (removePasteListener) {
      removePasteListener();
      removePasteListener = null;
    }
    const container = document.getElementById('msgContainer');
    if (container) container.innerHTML = '';
  }

  function renderDocumentAIShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    if (removePasteListener) {
      removePasteListener();
      removePasteListener = null;
    }

    container.innerHTML = `
      <section class="document-ai-panel" data-mode="${DOCUMENT_AI_MODE}" aria-labelledby="documentAiTitle">
        <button class="ai-tool-return" type="button" data-ai-tool-return>← 쇼핑검색으로 돌아가기</button>
        <div class="document-ai-copy">
          <p class="document-ai-eyebrow">해석</p>
          <h2 id="documentAiTitle">디스원 해석</h2>
          <p class="document-ai-main-copy">어려운 글, 읽지 말고 물어보세요.</p>
          <p class="document-ai-sub-copy">PDF나 사진을 올리면 AI가 쉽게 해석하고, 궁금한 점에 답해드립니다.</p>
        </div>

        <label class="document-ai-upload" id="documentAiUpload" for="documentAiFileInput">
          <span class="document-ai-upload-title">PDF나 사진을 올려주세요</span>
          <span class="document-ai-upload-copy">파일 선택, 드래그앤드롭, 붙여넣기를 지원합니다.</span>
          <span class="document-ai-upload-action">파일 선택</span>
        </label>
        <input class="document-ai-file-input" id="documentAiFileInput" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="문서 파일 업로드">
        <p class="document-ai-upload-status" id="documentAiUploadStatus" aria-live="polite" hidden></p>

        <div class="document-ai-privacy" role="note" aria-label="개인정보 안내">
          <strong>개인정보 안내</strong>
          <p>개인정보는 종이나 손가락으로 가리고 올려주세요.</p>
          <p>디스원은 이름이 아니라 문서의 뜻을 풀어드립니다.</p>
          <p>이름, 주민번호, 주소, 전화번호, 계좌번호, 카드번호는 해석에 필요하지 않습니다.</p>
        </div>

        <label class="document-ai-question-label" for="documentAiQuestion">질문 입력창</label>
        <textarea class="document-ai-question" id="documentAiQuestion" rows="3" placeholder="이 문서에서 궁금한 점을 물어보세요. 예: 내가 해야 할 일만 알려줘"></textarea>
        <p class="ai-tool-voice-status" id="documentAiVoiceStatus" aria-live="polite" hidden></p>

        <div class="ai-tool-action-row">
          <button class="ai-tool-mic-button" id="documentAiMicButton" type="button" aria-label="음성으로 입력" title="브라우저 음성 인식을 사용합니다. 음성 파일은 저장하지 않습니다."></button>
          <button class="document-ai-submit" id="documentAiSubmit" type="button">해석하기</button>
        </div>
        <p class="document-ai-placeholder" id="documentAiPlaceholder" role="status" aria-live="polite" hidden></p>
      </section>
    `;

    const returnButton = container.querySelector('[data-ai-tool-return]');
    const button = document.getElementById('documentAiSubmit');
    const placeholder = document.getElementById('documentAiPlaceholder');
    const uploadStatus = document.getElementById('documentAiUploadStatus');
    const fileInput = document.getElementById('documentAiFileInput');
    const upload = document.getElementById('documentAiUpload');
    const question = document.getElementById('documentAiQuestion');
    const micButton = document.getElementById('documentAiMicButton');
    const voiceStatus = document.getElementById('documentAiVoiceStatus');
    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input: question,
      status: voiceStatus,
      appendMode: 'newline'
    });
    function setDragOver(isDragOver) {
      upload?.classList.toggle('is-drag-over', isDragOver);
    }

    function handleFiles(fileList, options = {}) {
      if (!fileList || fileList.length === 0) return false;

      const file = getFirstSupportedFile(fileList);
      if (!file) {
        setStatus(uploadStatus, UNSUPPORTED_FILE_MESSAGE);
        if (fileInput) fileInput.value = '';
        return false;
      }

      setStatus(uploadStatus, options.pasted ? PASTED_IMAGE_MESSAGE : `선택된 파일: ${file.name || '이미지'}`);
      return true;
    }

    function handlePaste(event) {
      const clipboardData = event.clipboardData;
      if (!document.querySelector(`.document-ai-panel[data-mode="${DOCUMENT_AI_MODE}"]`) || !hasClipboardContent(clipboardData)) {
        return;
      }

      const files = getClipboardFiles(clipboardData);
      const supportedFile = getFirstSupportedFile(files);
      if (supportedFile) {
        event.preventDefault();
        handleFiles([supportedFile], { pasted: true });
        return;
      }

      if (files.length > 0) {
        if (isQuestionTextarea(event.target, question)) return;
        event.preventDefault();
        setStatus(uploadStatus, UNSUPPORTED_PASTE_MESSAGE);
        return;
      }

      const pastedText = getClipboardText(clipboardData);
      if (pastedText) {
        if (isQuestionTextarea(event.target, question)) return;
        event.preventDefault();
        setStatus(uploadStatus, PASTED_TEXT_MESSAGE);
        return;
      }

      if (isQuestionTextarea(event.target, question)) return;
      event.preventDefault();
      setStatus(uploadStatus, UNSUPPORTED_PASTE_MESSAGE);
    }

    returnButton?.addEventListener('click', exitAIToolMode);

    button?.addEventListener('click', () => {
      setStatus(placeholder, READY_MESSAGE);
    });

    fileInput?.addEventListener('change', (event) => {
      handleFiles(event.target.files);
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
      handleFiles(event.dataTransfer?.files);
    });

    document.addEventListener('paste', handlePaste);
    removePasteListener = () => document.removeEventListener('paste', handlePaste);
  }

  function openDocumentAI() {
    enterDocumentAIMode();
    renderDocumentAIShell();
  }

  global.ThisOneDocumentAI = {
    open: openDocumentAI,
    mode: DOCUMENT_AI_MODE
  };
})(window);
