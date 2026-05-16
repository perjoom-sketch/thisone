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
  const PLACEHOLDER_DEFAULT = '문서나 사진을 올리고 궁금한 점을 물어보세요';
  const PLACEHOLDER_CONTEXT = '이 문서를 기준으로 이어서 물어보세요';
  let removePasteListener = null;
  let currentDocContext = null;

  function updateComposerPlaceholder(textarea, context) {
    if (!textarea) return;
    textarea.placeholder = context ? PLACEHOLDER_CONTEXT : PLACEHOLDER_DEFAULT;
  }

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
    unsupportedMessage: UNSUPPORTED_FILE_MESSAGE,
    maxFiles: 10
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

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        return resolve(file);
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        
        let width = img.width;
        let height = img.height;
        const maxEdge = 1600;

        if (width <= maxEdge && height <= maxEdge) {
          return resolve(file);
        }

        if (width > height) {
          height = Math.round((height * maxEdge) / width);
          width = maxEdge;
        } else {
          width = Math.round((width * maxEdge) / height);
          height = maxEdge;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) {
            return reject(new Error('이미지 처리 중 오류가 발생했습니다.'));
          }
          const compressedFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now()
          });
          resolve(compressedFile);
        }, file.type, 0.82);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('이미지를 읽을 수 없습니다.'));
      };

      img.src = objectUrl;
    });
  }

  async function uploadFileToR2(file) {
    const response = await fetch('/api/documentAiPresignUpload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        type: file.type,
        size: file.size
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || '업로드 준비에 실패했습니다.');
    }

    const { uploadUrl, fileKey } = await response.json();

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });

    if (!uploadRes.ok) {
      throw new Error('저장소 업로드에 실패했습니다.');
    }

    return fileKey;
  }

  async function filesToPayloads(files) {
    const payloads = [];
    const MAX_LEGACY_UPLOAD_BYTES = 4 * 1024 * 1024;

    for (const file of Array.from(files || [])) {
      try {
        // Try R2 upload first
        const fileKey = await uploadFileToR2(file);
        payloads.push({
          name: file.name || 'upload',
          type: file.type || 'application/octet-stream',
          fileKey,
          size: file.size
        });
      } catch (error) {
        // Restore legacy base64 fallback if R2 upload fails and file is small enough
        if (file.size <= MAX_LEGACY_UPLOAD_BYTES) {
          console.warn('[Document AI] R2 upload failed, falling back to base64:', error);
          const processedFile = await compressImage(file);
          const dataUrl = await fileToDataUrl(processedFile);
          payloads.push({
            name: processedFile.name || 'upload',
            type: processedFile.type || 'application/octet-stream',
            dataUrl,
            size: processedFile.size
          });
        } else {
          // If too large for base64 fallback, we must propagate the R2 error
          throw error;
        }
      }
    }
    return payloads;
  }

  function renderAnswerText(answer) {
    return escapeHtml(answer || '')
      .split(/\n{2,}/)
      .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function renderSources(sources, options = {}) {
    const usableSources = (Array.isArray(sources) ? sources : [])
      .map((source) => ({
        title: String(source?.title || '').trim(),
        domain: String(source?.domain || '').trim(),
        link: normalizeUrl(source?.link)
      }))
      .filter((source) => source.title || source.domain || source.link)
      .slice(0, 5);

    if (!usableSources.length) {
      return options.pdfReadFailed
        ? '<p class="document-ai-no-sources">PDF 내용을 읽지 못해 공개 출처나 업로드 내용 기반 정리를 표시하지 않습니다.</p>'
        : '<p class="document-ai-no-sources">공개 출처는 확인하지 못했고, 업로드된 내용 기준으로 정리했습니다.</p>';
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

  function getDocumentAIStatusMessage(status) {
    switch (status) {
      case 400:
        return '요청 내용을 확인할 수 없습니다. 파일 형식과 질문을 확인해 주세요.';
      case 413:
        return '파일이 너무 큽니다. 용량을 줄이거나 필요한 페이지만 캡처해서 올려주세요.';
      case 500:
        return 'PDF 해석 중 오류가 발생했습니다. 이미지로 캡처하거나 텍스트를 복사해 다시 시도해 주세요.';
      case 504:
        return 'PDF 해석 시간이 초과되었습니다. 필요한 페이지만 나누어 올려주세요.';
      default:
        if (status >= 500) {
          return '문서 해석 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.';
        }
        return '문서 해석 요청을 처리하지 못했습니다. 파일과 질문을 확인해 주세요.';
    }
  }

  function getSafeDocumentAIServerMessage(data) {
    const message = String(data?.error || data?.pdfReadFailureMessage || '').trim();
    if (!message || /[<>]/.test(message) || message.length > 220) return '';
    return message;
  }

  async function requestDocumentAI(question, filesPayload) {
    const response = await fetch('/api/documentAi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        files: filesPayload || null
      })
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      if (!response.ok) {
        throw new Error(getDocumentAIStatusMessage(response.status));
      }
      throw new Error('해석 응답 형식이 올바르지 않습니다.');
    }

    if (!response.ok) {
      const serverMessage = getSafeDocumentAIServerMessage(data);
      if (response.status === 400 && serverMessage) {
        throw new Error(serverMessage);
      }
      if ((response.status === 413 || response.status === 504) && serverMessage) {
        throw new Error(serverMessage);
      }
      throw new Error(getDocumentAIStatusMessage(response.status));
    }

    if (data?.pdfReadStatus === 'failed') {
      const serverMessage = getSafeDocumentAIServerMessage(data);
      const answer = String(data?.answer || '').trim();
      if (serverMessage && !answer.startsWith(serverMessage)) {
        data.answer = answer ? `${serverMessage}\n\n${answer}` : serverMessage;
      }
    }

    return data || { answer: '', sources: [], usedSearch: false };
  }

  function renderDocumentAIFollowUp(context) {
    if (!context) return '';
    return `
      <section class="document-ai-follow-up">
        <h4 class="document-ai-follow-up-title">이 문서를 기준으로 이어서 물어보세요.</h4>
        <div class="document-ai-follow-up-chips">
          <button type="button" class="document-ai-chip" data-follow-up="핵심만 다시 요약해줘">핵심만 다시 요약해줘</button>
          <button type="button" class="document-ai-chip" data-follow-up="설정 방법 다시 설명해줘">설정 방법 다시 설명해줘</button>
          <button type="button" class="document-ai-chip" data-follow-up="작업자에게 쉽게 설명해줘">작업자에게 쉽게 설명해줘</button>
        </div>
        <div class="document-ai-follow-up-footer">
          <button type="button" class="document-ai-text-button" id="documentAiFollowUpReset">새 문서로 시작</button>
        </div>
      </section>
    `;
  }

  function renderDocumentAIResult(result, answer, sources, options = {}) {
    if (!result) return;
    const safeAnswer = String(answer || '').trim();
    result.innerHTML = `
      <article class="document-ai-answer">
        ${safeAnswer ? renderAnswerText(safeAnswer) : '<p>해석 결과가 비어 있습니다. 다시 시도해주세요.</p>'}
      </article>
      ${renderSources(sources, options)}
      ${options.attachmentContext && !options.pdfReadFailed ? renderDocumentAIFollowUp(options.attachmentContext) : ''}
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
          <p class="document-ai-sub-copy">설명서, 계약서, 약관, 법규, 진단서 등을 올리면 AI가 쉽게 해석해 드립니다.</p>
        </div>

        <div class="ai-tool-composer document-ai-composer" id="documentAiUpload">
          ${global.ThisOneComposerAttachmentInput?.render?.(DOCUMENT_AI_UPLOAD_POLICY) || ''}
          <div class="ai-tool-input document-ai-composer-top">
            <textarea class="document-ai-question" id="documentAiQuestion" rows="4" aria-label="해석 질문 입력창" placeholder="문서나 사진을 올리고 궁금한 점을 물어보세요"></textarea>
          </div>
          <div class="ai-tool-control-row document-ai-composer-bottom">
            <div class="ai-tool-left-controls document-ai-composer-left-actions">
              ${global.ThisOneComposerAttachmentInput?.renderControls?.({ ...DOCUMENT_AI_UPLOAD_POLICY, plusClass: 'document-ai-upload-action' }) || ''}
            </div>
            <div class="ai-tool-right-controls document-ai-composer-right-actions">
              <button class="ai-tool-icon-button ai-tool-help-button document-ai-help-button" id="documentAiHelpButton" type="button" aria-expanded="false" aria-controls="documentAiHelpPanel" aria-label="이렇게 물어보세요" title="이렇게 물어보세요">?</button>
              <button class="ai-tool-icon-button ai-tool-mic-button" id="documentAiMicButton" type="button" aria-label="음성으로 입력" title="음성으로 입력"></button>
              <button class="ai-tool-action-button document-ai-submit" id="documentAiSubmit" type="button">해석하기</button>
            </div>
          </div>
        </div>
        <div class="document-ai-help-panel" id="documentAiHelpPanel" hidden>
          <div class="document-ai-help-info" style="font-size: 13px; color: #64748b; margin-bottom: 12px; line-height: 1.5;">
            <p style="margin: 0;">• 개인정보는 꼭 가리고 올려주세요.</p>
            <p style="margin: 4px 0 0;">• 여러 장을 올려도 하나의 문서 묶음으로 해석합니다.</p>
            <p style="margin: 4px 0 0;">• 설명서, 계약서, 약관, 법규, 진단서 등 모두 가능합니다.</p>
          </div>
          <p class="document-ai-help-title">이렇게 물어보세요</p>
          <div class="document-ai-help-examples">
            <button type="button" data-document-ai-example="이 문서에서 내가 해야 할 일만 정리해줘">이 문서에서 내가 해야 할 일만 정리해줘</button>
            <button type="button" data-document-ai-example="이 계약서에서 조심할 부분 알려줘">이 계약서에서 조심할 부분 알려줘</button>
            <button type="button" data-document-ai-example="이 고지서가 무슨 뜻인지 쉽게 설명해줘">이 고지서가 무슨 뜻인지 쉽게 설명해줘</button>
            <button type="button" data-document-ai-example="이 설명서 사진 보고 설정 방법 알려줘">이 설명서 사진 보고 설정 방법 알려줘</button>
          </div>
        </div>

        <p class="ai-tool-voice-status" id="documentAiVoiceStatus" aria-live="polite" hidden></p>

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
    let imageInput = null;
    let stopActiveLoadingStatus = null;
    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input: question,
      status: voiceStatus,
      appendMode: 'newline'
    });
    global.ThisOneModeTabs?.bind?.(root);

    imageInput = global.ThisOneComposerAttachmentInput?.attach?.(upload, {
      ...DOCUMENT_AI_UPLOAD_POLICY,
      mode: 'documentAi',
      textInput: question,
      isActive: () => root.isConnected && document.body.classList.contains('document-ai-mode'),
      beforeOpen: () => {
        if (helpPanel && helpButton) {
          helpPanel.hidden = true;
          helpButton.setAttribute('aria-expanded', 'false');
        }
      },
      onChange: () => {
        hideStatus(placeholder);
        const files = imageInput?.getFiles?.() || [];
        if (files.length === 0) {
          currentDocContext = null;
          updateComposerPlaceholder(question, null);
        } else if (currentDocContext) {
          // New attachments added while context exists — will reset on submit
          updateComposerPlaceholder(question, null);
        }
      },
      onReject: (_file, message) => setStatus(placeholder, message || UNSUPPORTED_FILE_MESSAGE)
    });

    button?.addEventListener('click', async () => {
      const text = question?.value?.trim?.() || '';
      const files = imageInput?.getFiles?.() || [];
      const hasNewAttachments = files.length > 0;
      const isFollowUp = !hasNewAttachments && currentDocContext;

      if (!text && !hasNewAttachments && !isFollowUp) {
        setStatus(placeholder, EMPTY_INPUT_MESSAGE);
        if (result) result.hidden = true;
        if (result) result.innerHTML = '';
        question?.focus?.();
        return;
      }

      if (!isFollowUp && !text && !hasNewAttachments) {
        setStatus(placeholder, EMPTY_INPUT_MESSAGE);
        question?.focus?.();
        return;
      }

      if (hasNewAttachments && !imageInput?.isProcessable?.()) {
        setStatus(placeholder, imageInput?.getUnsupportedMessage?.() || UNSUPPORTED_FILE_MESSAGE);
        return;
      }

      // New attachments reset old context
      if (hasNewAttachments) {
        currentDocContext = null;
      }

      button.disabled = true;
      if (result) result.hidden = true;
      if (result) result.innerHTML = '';

      stopActiveLoadingStatus?.();
      stopActiveLoadingStatus = startStagedLoadingStatus(placeholder, DOCUMENT_AI_LOADING_STAGES);

      try {
        const filesPayload = hasNewAttachments ? await filesToPayloads(files) : [];
        const data = await requestDocumentAI(text, filesPayload);
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;

        if (data.attachmentContext) {
          currentDocContext = {
            documentType: data.attachmentContext.documentType,
            safeSummary: data.attachmentContext.safeSummary,
            publicKeywords: data.attachmentContext.publicKeywords,
            fileCount: data.attachmentContext.fileCount,
            lastAnswer: data.answer || ''
          };
        } else if (!isFollowUp) {
          currentDocContext = null;
        }

        renderDocumentAIResult(result, data.answer, data.sources, {
          pdfReadFailed: data.pdfReadStatus === 'failed',
          attachmentContext: currentDocContext
        });
        hideStatus(placeholder);
        updateComposerPlaceholder(question, currentDocContext);

        // Clear textarea after successful submit but keep composer visible
        if (question) question.value = '';
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

    result?.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;

      // Chip click → fill main composer textarea, focus it
      const chip = event.target.closest('.document-ai-chip');
      if (chip) {
        if (question) {
          question.value = chip.dataset.followUp || '';
          question.focus();
          question.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // "새 문서로 시작" → full reset
      if (event.target.id === 'documentAiFollowUpReset') {
        currentDocContext = null;
        result.innerHTML = '';
        result.hidden = true;

        imageInput?.clear?.();
        if (question) {
          question.value = '';
          updateComposerPlaceholder(question, null);
          question.focus();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    removePasteListener = () => {
      stopActiveLoadingStatus?.();
      stopActiveLoadingStatus = null;
      currentDocContext = null;
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
