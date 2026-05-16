(function (global) {
  if (global.__thisOneDocumentAIShellApplied) return;
  global.__thisOneDocumentAIShellApplied = true;

  const DOCUMENT_AI_MODE = 'document-ai';
  const DOCUMENT_AI_LOADING_STAGES = [
    '문서 내용을 확인하고 있습니다...',
    '개인정보를 가리고 핵심을 추리는 중입니다...',
    '관련 공개 정보를 확인하고 있습니다...',
    '근거를 바탕으로 쉽게 정리하는 중입니다...'
  ];
  const DOCUMENT_AI_LOADING_STAGE_MS = 1800;
  const EMPTY_INPUT_MESSAGE = '문서나 사진, 질문을 입력해주세요.';
  const UNSUPPORTED_FILE_MESSAGE = '현재는 PDF, JPG, PNG, WebP, 텍스트만 해석할 수 있습니다.';
  const UNSUPPORTED_PASTE_MESSAGE = 'PDF, 이미지, 텍스트만 붙여넣을 수 있습니다.';
  const PASTED_IMAGE_MESSAGE = '붙여넣은 이미지가 추가되었습니다.';
  const PASTED_TEXT_MESSAGE = '붙여넣은 텍스트가 추가되었습니다.';
  let removePasteListener = null;

  const DOCUMENT_AI_UPLOAD_POLICY = {
    id: 'documentAiImage',
    label: '해석 파일',
    uploadLabel: '문서·사진 업로드',
    mobileUploadLabel: '문서·사진 업로드',
    accept: 'application/pdf,image/jpeg,image/png,image/webp,text/plain,.pdf,.txt',
    allowImages: true,
    allowDocuments: true,
    previewMode: 'auto',
    fileChipLabel: '해석 파일',
    unsupportedMessage: UNSUPPORTED_FILE_MESSAGE
  };

  const SUPPORTED_FILE_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
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
    element.classList.remove('is-loading');
    element.textContent = message || '';
    element.hidden = !message;
  }

  function startStagedLoadingStatus(element, stages) {
    if (!element || !Array.isArray(stages) || !stages.length) {
      return () => {};
    }

    let stageIndex = 0;

    function renderStage() {
      const message = stages[stageIndex % stages.length];
      element.classList.add('is-loading');
      element.innerHTML = `
        <span class="ai-tool-source-loading-signal" aria-hidden="true"></span>
        <span>${escapeHtml(message)}</span>
      `;
      element.hidden = false;
      stageIndex += 1;
    }

    renderStage();
    const timerId = global.setInterval(renderStage, DOCUMENT_AI_LOADING_STAGE_MS);

    return () => {
      global.clearInterval(timerId);
      element.classList.remove('is-loading');
    };
  }

  function hideStatus(element) {
    if (!element) return;
    element.classList.remove('is-loading');
    element.textContent = '';
    element.hidden = true;
  }


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
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.href;
    } catch (e) {
      return '';
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
      reader.readAsDataURL(file);
    });
  }

  function renderAnswerText(answer) {
    return escapeHtml(answer || '')
      .split(/\n{2,}/)
      .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function renderSources(sources) {
    const usableSources = (Array.isArray(sources) ? sources : [])
      .map((source) => ({
        title: String(source?.title || '').trim(),
        domain: String(source?.domain || '').trim(),
        link: normalizeUrl(source?.link)
      }))
      .filter((source) => source.title || source.domain || source.link)
      .slice(0, 5);

    if (!usableSources.length) {
      return '<p class="document-ai-no-sources">공개 출처는 확인하지 못했고, 업로드된 내용 기준으로 정리했습니다.</p>';
    }

    return `
      <section class="document-ai-sources" aria-label="참고한 공개 출처">
        <h3>참고한 공개 출처</h3>
        <div class="web-search-results document-ai-source-list">
          ${usableSources.map((source) => {
            const title = escapeHtml(source.title || source.domain || source.link || '공개 출처');
            const domain = escapeHtml(source.domain || '');
            const linkAttrs = source.link
              ? `href="${escapeHtml(source.link)}" target="_blank" rel="noopener noreferrer"`
              : 'aria-disabled="true" tabindex="-1"';
            return `
              <article class="web-search-result-row document-ai-source-row">
                <a class="web-search-result-title" ${linkAttrs}>${title}</a>
                ${domain ? `<p class="web-search-result-source">${domain}</p>` : ''}
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function normalizeDocumentSession(session) {
    if (!session || typeof session !== 'object') return null;
    const documentSessionId = String(session.documentSessionId || '').trim();
    const safeSummary = String(session.safeSummary || '').trim();
    if (!documentSessionId || !safeSummary) return null;
    return {
      documentSessionId,
      fileName: String(session.fileName || '업로드 문서').slice(0, 160),
      fileType: String(session.fileType || '').slice(0, 120),
      documentType: String(session.documentType || '문서/사진').slice(0, 80),
      safeSummary: safeSummary.slice(0, 1800),
      publicKeywords: Array.isArray(session.publicKeywords) ? session.publicKeywords.map((item) => String(item || '').slice(0, 80)).filter(Boolean).slice(0, 6) : [],
      createdAt: String(session.createdAt || ''),
      lastUsedAt: String(session.lastUsedAt || '')
    };
  }

  async function requestDocumentAI(question, filePayload, documentSession) {
    const response = await fetch('/api/documentAi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        file: filePayload || null,
        documentSession: filePayload ? null : (normalizeDocumentSession(documentSession) || null),
        imageDataUrl: filePayload?.type?.startsWith?.('image/') ? filePayload.dataUrl : ''
      })
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      throw new Error('해석 응답을 읽을 수 없습니다.');
    }

    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    return data || { answer: '', sources: [], usedSearch: false };
  }

  function renderDocumentAIResult(result, answer, sources) {
    if (!result) return;
    const safeAnswer = String(answer || '').trim();
    result.innerHTML = `
      <article class="document-ai-answer">
        ${safeAnswer ? renderAnswerText(safeAnswer) : '<p>해석 결과가 비어 있습니다. 다시 시도해주세요.</p>'}
      </article>
      ${renderSources(sources)}
    `;
    result.hidden = false;
  }

  function enterDocumentAIMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'document-ai-mode');
    document.body.classList.remove('instant-answer-mode', 'web-search-mode', 'loveme-mode');
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
          ${global.ThisOneComposerImageInput?.render?.(DOCUMENT_AI_UPLOAD_POLICY) || ''}
          <div class="ai-tool-input document-ai-composer-top">
            <textarea class="document-ai-question" id="documentAiQuestion" rows="4" aria-label="해석 질문 입력창" placeholder="문서나 사진을 올리면 쉽게 풀어드려요"></textarea>
          </div>
          <div class="ai-tool-control-row document-ai-composer-bottom">
            <div class="ai-tool-left-controls document-ai-composer-left-actions">
              ${global.ThisOneComposerImageInput?.renderControls?.({ ...DOCUMENT_AI_UPLOAD_POLICY, plusClass: 'document-ai-upload-action' }) || ''}
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

        <div class="document-ai-session" id="documentAiSession" aria-live="polite" hidden></div>

        <div class="document-ai-privacy" role="note" aria-label="개인정보 안내">
          <strong>개인정보 안내</strong>
          <p>개인정보는 가리고 올려주세요.</p>
          <p>디스원은 이름이 아니라 문서의 뜻을 풀어드립니다.</p>
          <p>주민번호, 주소, 전화번호, 계좌번호는 해석에 필요하지 않습니다.</p>
        </div>
        <p class="document-ai-placeholder" id="documentAiPlaceholder" role="status" aria-live="polite" hidden></p>
        <div class="document-ai-result" id="documentAiResult" aria-live="polite" hidden></div>
      </section>
    `;

    const root = container.querySelector('.document-ai-panel');
    const button = document.getElementById('documentAiSubmit');
    const placeholder = document.getElementById('documentAiPlaceholder');
    const result = document.getElementById('documentAiResult');
    const upload = document.getElementById('documentAiUpload');
    const question = document.getElementById('documentAiQuestion');
    const helpButton = document.getElementById('documentAiHelpButton');
    const helpPanel = document.getElementById('documentAiHelpPanel');
    const micButton = document.getElementById('documentAiMicButton');
    const voiceStatus = document.getElementById('documentAiVoiceStatus');
    const sessionChip = document.getElementById('documentAiSession');
    let activeDocumentSession = null;
    let imageInput = null;
    let stopActiveLoadingStatus = null;
    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input: question,
      status: voiceStatus,
      appendMode: 'newline'
    });
    function setDragOver(isDragOver) {
      upload?.classList.toggle('is-drag-over', isDragOver);
    }

    function updateQuestionPlaceholder() {
      if (!question) return;
      question.placeholder = activeDocumentSession
        ? '이 문서에 대해 궁금한 점을 이어서 물어보세요'
        : '문서나 사진을 올리면 쉽게 풀어드려요';
    }

    function renderActiveDocumentSession() {
      if (!sessionChip) return;
      if (!activeDocumentSession) {
        sessionChip.hidden = true;
        sessionChip.innerHTML = '';
        updateQuestionPlaceholder();
        return;
      }
      sessionChip.hidden = false;
      sessionChip.innerHTML = `
        <div class="document-ai-session-text">
          <strong>현재 문서: ${escapeHtml(activeDocumentSession.fileName || '업로드 문서')}</strong>
          <span>이 문서에 대해 이어서 질문할 수 있습니다.</span>
        </div>
        <button class="document-ai-session-clear" id="documentAiSessionClear" type="button">문서 지우기</button>
      `;
      sessionChip.querySelector('#documentAiSessionClear')?.addEventListener('click', () => {
        activeDocumentSession = null;
        imageInput?.clear?.();
        renderActiveDocumentSession();
        setStatus(placeholder, '현재 문서를 지웠습니다. 다시 질문하려면 파일을 올려주세요.');
      });
      updateQuestionPlaceholder();
    }

    global.ThisOneModeTabs?.bind?.(root);

    imageInput = global.ThisOneComposerImageInput?.attach?.(root, {
      ...DOCUMENT_AI_UPLOAD_POLICY,
      isActive: () => root.isConnected && document.body.classList.contains('document-ai-mode'),
      beforeOpen: () => {
        if (helpPanel && helpButton) {
          helpPanel.hidden = true;
          helpButton.setAttribute('aria-expanded', 'false');
        }
      },
      onChange: () => hideStatus(placeholder),
      onReject: (_file, message) => setStatus(placeholder, message || UNSUPPORTED_FILE_MESSAGE)
    });

    renderActiveDocumentSession();

    button?.addEventListener('click', async () => {
      const text = question?.value?.trim?.() || '';
      const file = imageInput?.getFile?.() || null;

      if (!text && !file && !activeDocumentSession) {
        setStatus(placeholder, EMPTY_INPUT_MESSAGE);
        if (result) result.hidden = true;
        if (result) result.innerHTML = '';
        question?.focus?.();
        return;
      }

      button.disabled = true;
      if (result) result.hidden = true;
      if (result) result.innerHTML = '';
      stopActiveLoadingStatus?.();
      stopActiveLoadingStatus = startStagedLoadingStatus(placeholder, DOCUMENT_AI_LOADING_STAGES);

      try {
        const filePayload = file ? {
          name: file.name || 'upload',
          type: file.type || 'application/octet-stream',
          dataUrl: await fileToDataUrl(file)
        } : null;
        if (!filePayload && activeDocumentSession && !normalizeDocumentSession(activeDocumentSession)) {
          throw new Error('현재 문서 정보를 다시 사용할 수 없습니다. 파일을 다시 올려주세요.');
        }
        const data = await requestDocumentAI(text, filePayload, activeDocumentSession);
        if (data.documentSession) {
          activeDocumentSession = normalizeDocumentSession(data.documentSession);
          renderActiveDocumentSession();
          if (filePayload) imageInput?.clear?.();
        }
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
        renderDocumentAIResult(result, data.answer, data.sources);
        hideStatus(placeholder);
      } catch (error) {
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
        if (result) result.hidden = true;
        if (result) result.innerHTML = '';
        setStatus(placeholder, `문서 해석 중 오류가 발생했습니다. ${error.message || ''}`.trim());
      } finally {
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
        button.disabled = false;
      }
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
      stopActiveLoadingStatus?.();
      stopActiveLoadingStatus = null;
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
