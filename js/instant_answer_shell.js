(function (global) {
  const INSTANT_ANSWER_MODE = 'instant-answer';
  const SYSTEM_PROMPT = `You are ThisOne 즉답.
You answer practical everyday questions immediately.

즉답 is not only for product names or search keywords.
It is a general instant Q&A helper, similar to a better version of 지식인.

The user may ask about life problems, shopping, product names, legal situations, health/medicine, repairs, terms, documents, or what to do next.

Answer directly and practically.

Prefer this structure when useful:
1. 결론
2. 이유
3. 지금 할 일
4. 주의할 점
5. 더 확인할 것

Only include ‘검색 추천어’ when it is actually useful.
Do not force search keywords into every answer.

For medical, legal, financial, or safety topics:
- provide general guidance
- avoid definitive diagnosis or legal judgment
- mention when pharmacist/doctor/lawyer/public office confirmation is needed
- include red flags or urgent cases when appropriate.

Do not give long lectures.
Do not answer with irrelevant shopping/product framing.
Focus on what the user should understand or do next.`;

  const EXAMPLES = [
    '배 아플 때 어떤 약 먹어야 해?',
    '월세 보증금 안 돌려주면 어떻게 해?',
    '문 닫힐 때 쾅 안 닫히게 하는 부품 뭐야?',
    '폐기물 스티커 어디서 사?',
    '회사에서 이 서류에 사인하라는데 괜찮아?'
  ];

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function enterInstantAnswerMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'instant-answer-mode');
    document.body.classList.remove('document-ai-mode', 'web-search-mode', 'loveme-mode');
  }


  const SOURCE_LOADING_STAGES = [
    '공개 정보를 확인하고 있습니다...',
    '쓸 만한 출처를 고르는 중입니다...',
    '근거를 바탕으로 답변을 정리하는 중입니다...',
    '출처와 답변을 맞춰보고 있습니다...'
  ];
  const SOURCE_LOADING_STAGE_MS = 1800;

  function setStatus(element, message) {
    if (!element) return;
    element.classList.remove('is-loading');
    element.textContent = message;
    element.hidden = !message;
  }

  function startSourceLoadingStatus(element) {
    if (!element) {
      return () => {};
    }

    let stageIndex = 0;

    function renderStage() {
      const message = SOURCE_LOADING_STAGES[stageIndex % SOURCE_LOADING_STAGES.length];
      element.classList.add('is-loading');
      element.innerHTML = `
        <span class="instant-answer-status-signal" aria-hidden="true"></span>
        <span>${escapeHtml(message)}</span>
      `;
      element.hidden = false;
      stageIndex += 1;
    }

    renderStage();
    const timerId = global.setInterval(renderStage, SOURCE_LOADING_STAGE_MS);

    return () => {
      global.clearInterval(timerId);
      element.classList.remove('is-loading');
    };
  }

  function renderMarkdownLite(text) {
    const safe = escapeHtml(text || '').trim();
    if (!safe) return '';

    const withBold = safe.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    return withBold
      .replace(/^###\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/^##\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/^#\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function extractSearchTerms(answerText) {
    const source = String(answerText || '');
    const terms = [];
    const markerMatch = source.match(/(?:^|\n)\s*(?:#{1,3}\s*)?검색\s*추천어\s*[:：]?\s*\n?([\s\S]{0,240})/i);
    if (!markerMatch) return terms;

    const candidateText = markerMatch[1].split(/\n\s*(?:#{1,3}\s*)?(?:결론|이유|지금 할 일|주의할 점|더 확인할 것)\s*[:：]?/)[0];
    candidateText.split(/[\n,·•]/).forEach((part) => {
      const term = part.replace(/^[-*\d.\s]+/, '').replace(/검색하기/g, '').trim();
      if (term.length >= 2 && term.length <= 30 && !/필요\s*없|없습니다|생략/.test(term) && !terms.includes(term)) terms.push(term);
    });
    return terms.slice(0, 3);
  }

  async function requestInstantAnswer(question) {
    const response = await fetch('/api/instantAnswer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    const text = await response.text();
    if (!response.ok) {
      let message = text || `HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        message = errorData.error || message;
      } catch (e) {}
      throw new Error(message);
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('즉답 응답을 읽을 수 없습니다.');
    }
  }

  function renderSources(sources, usedSearch) {
    const sourceList = Array.isArray(sources) ? sources.filter((source) => source?.link) : [];
    if (!sourceList.length) {
      if (usedSearch) return '';
      return '<div class="instant-answer-source-note">공개 출처 없이 질문 내용 기준으로 정리했습니다.</div>';
    }

    return `
      <section class="instant-answer-sources" aria-label="참고한 공개 출처">
        <div class="instant-answer-sources-title">참고한 공개 출처</div>
        <ul class="instant-answer-source-list">
          ${sourceList.map((source) => `
            <li class="instant-answer-source-item">
              <a href="${escapeHtml(source.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || source.domain || source.link)}</a>
              ${source.domain ? `<span class="instant-answer-source-domain">${escapeHtml(source.domain)}</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </section>
    `;
  }

  function renderInstantAnswerResult(payload) {
    const answer = typeof payload === 'string' ? payload : payload?.answer;
    const sources = typeof payload === 'string' ? [] : payload?.sources;
    const usedSearch = Boolean(typeof payload === 'string' ? false : payload?.usedSearch);
    return `${renderMarkdownLite(answer)}${renderSources(sources, usedSearch)}`;
  }

  function triggerSearch(term) {
    global.ThisOneModeTabs?.open?.('shopping');
    const input = document.getElementById('msgInput');
    if (input) {
      input.value = term;
      global.autoResize?.(input);
    }
    try { global.currentQuery = term; } catch (e) {}
    if (typeof global.syncQueryInputs === 'function') global.syncQueryInputs(term);
    if (typeof global.setSearchMode === 'function') global.setSearchMode('thisone');
    if (typeof global.sendMsg === 'function') {
      global.sendMsg('thisone');
      return;
    }
    document.getElementById('sendBtn')?.click();
  }

  function renderSearchSuggestions(root, terms) {
    const suggestions = root.querySelector('#instantAnswerSuggestions');
    if (!suggestions) return;
    if (!terms.length) {
      suggestions.hidden = true;
      suggestions.innerHTML = '';
      return;
    }
    suggestions.innerHTML = terms.map((term) => (
      `<button class="instant-answer-search-chip" type="button" data-search-term="${escapeHtml(term)}">${escapeHtml(term)} 검색하기</button>`
    )).join('');
    suggestions.hidden = false;
    suggestions.querySelectorAll('[data-search-term]').forEach((button) => {
      button.addEventListener('click', () => triggerSearch(button.dataset.searchTerm || ''));
    });
  }

  function renderInstantAnswerShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    container.innerHTML = `
      <section class="instant-answer-panel" data-mode="${INSTANT_ANSWER_MODE}" aria-label="디스원 즉답">
        ${global.ThisOneModeTabs?.render?.(INSTANT_ANSWER_MODE) || ''}
        <div class="instant-answer-copy">
          <p class="instant-answer-main-copy">검색하지 말고 바로 물어보세요.</p>
          <p class="instant-answer-sub-copy">생활, 제품, 문서, 상황까지 궁금한 점을 바로 정리해드립니다.</p>
        </div>

        <div class="ai-tool-composer instant-answer-composer">
          ${global.ThisOneComposerImageInput?.render?.({ id: 'instantAnswerImage', label: '즉답 이미지' }) || ''}
          <div class="ai-tool-input instant-answer-composer-top">
            <label class="instant-answer-question-label" for="instantAnswerQuestion">질문 입력창</label>
            <textarea class="instant-answer-question" id="instantAnswerQuestion" rows="1" aria-label="즉답 질문 입력창" placeholder="배 아플 때 어떤 약 먹어야 해?"></textarea>
          </div>
          <p class="ai-tool-voice-status" id="instantAnswerVoiceStatus" aria-live="polite" hidden></p>
          <div class="ai-tool-control-row instant-answer-composer-bottom">
            <div class="ai-tool-left-controls instant-answer-composer-left-actions">
              ${global.ThisOneComposerImageInput?.renderControls?.({ id: 'instantAnswerImage', plusClass: 'instant-answer-plus-button' }) || ''}
            </div>
            <div class="ai-tool-right-controls instant-answer-composer-actions">
              <button class="ai-tool-icon-button ai-tool-help-button instant-answer-help-button" id="instantAnswerHelpButton" type="button" aria-label="즉답 예시 보기" aria-controls="instantAnswerExamples" aria-expanded="false" title="즉답 예시 보기">?</button>
              <button class="ai-tool-icon-button ai-tool-mic-button" id="instantAnswerMicButton" type="button" aria-label="음성으로 입력" title="음성으로 입력"></button>
              <button class="ai-tool-action-button instant-answer-submit" id="instantAnswerSubmit" type="button">바로 답변</button>
            </div>
          </div>
        </div>

        <div class="instant-answer-examples" id="instantAnswerExamples" aria-label="즉답 예시 질문" hidden>
          <div class="instant-answer-examples-title">즉답 예시</div>
          <div class="instant-answer-examples-list">
            ${EXAMPLES.map((example) => `<button class="instant-answer-example-chip" type="button" data-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join('')}
          </div>
        </div>
        <p class="instant-answer-status" id="instantAnswerStatus" role="status" aria-live="polite" hidden></p>
        <div class="instant-answer-result" id="instantAnswerResult" aria-live="polite" hidden></div>
        <div class="instant-answer-suggestions" id="instantAnswerSuggestions" aria-label="검색 추천어" hidden></div>
      </section>
    `;

    const root = container.querySelector('.instant-answer-panel');
    const question = root.querySelector('#instantAnswerQuestion');
    const submit = root.querySelector('#instantAnswerSubmit');
    const helpButton = root.querySelector('#instantAnswerHelpButton');
    const examplesPanel = root.querySelector('#instantAnswerExamples');
    const status = root.querySelector('#instantAnswerStatus');
    const result = root.querySelector('#instantAnswerResult');
    const micButton = root.querySelector('#instantAnswerMicButton');
    const voiceStatus = root.querySelector('#instantAnswerVoiceStatus');
    let stopActiveSourceLoadingStatus = null;
    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input: question,
      status: voiceStatus,
      appendMode: 'newline'
    });

    global.ThisOneModeTabs?.bind?.(root);

    const imageInput = global.ThisOneComposerImageInput?.attach?.(root, {
      id: 'instantAnswerImage',
      isActive: () => root.isConnected && document.body.classList.contains('instant-answer-mode'),
      beforeOpen: () => setExamplesPanelOpen(false)
    });

    function setPlusMenuOpen(isOpen) {
      if (isOpen) imageInput?.closeMenu?.();
      else imageInput?.closeMenu?.();
    }

    function setExamplesPanelOpen(isOpen) {
      if (!helpButton || !examplesPanel) return;
      examplesPanel.hidden = !isOpen;
      helpButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function cleanupInstantAnswer() {
      stopActiveSourceLoadingStatus?.();
      stopActiveSourceLoadingStatus = null;
      imageInput?.cleanup?.();
    }

    global.ThisOneModeTabs?.registerCleanup?.(INSTANT_ANSWER_MODE, cleanupInstantAnswer);

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setPlusMenuOpen(false);
        setExamplesPanelOpen(false);
      }
    });

    helpButton?.addEventListener('click', () => {
      setPlusMenuOpen(false);
      setExamplesPanelOpen(Boolean(examplesPanel?.hidden));
    });

    root.querySelectorAll('[data-example]').forEach((button) => {
      button.addEventListener('click', () => {
        question.value = button.dataset.example || '';
        question.focus();
        setExamplesPanelOpen(false);
      });
    });

    submit.addEventListener('click', async () => {
      const text = question.value.trim();
      if (!text) {
        setStatus(status, '질문을 입력해주세요.');
        question.focus();
        return;
      }

      submit.disabled = true;
      result.hidden = false;
      result.innerHTML = '';
      renderSearchSuggestions(root, []);
      stopActiveSourceLoadingStatus?.();
      stopActiveSourceLoadingStatus = startSourceLoadingStatus(status);

      try {
        const payload = await requestInstantAnswer(text);
        stopActiveSourceLoadingStatus?.();
        stopActiveSourceLoadingStatus = null;
        result.innerHTML = renderInstantAnswerResult(payload);
        renderSearchSuggestions(root, extractSearchTerms(payload?.answer || ''));
        setStatus(status, '답변이 완료되었습니다.');
      } catch (error) {
        stopActiveSourceLoadingStatus?.();
        stopActiveSourceLoadingStatus = null;
        result.innerHTML = '';
        result.hidden = true;
        setStatus(status, `즉답 생성 중 오류가 발생했습니다. ${error.message || ''}`.trim());
      } finally {
        stopActiveSourceLoadingStatus?.();
        stopActiveSourceLoadingStatus = null;
        submit.disabled = false;
      }
    });
  }

  function openInstantAnswer() {
    enterInstantAnswerMode();
    renderInstantAnswerShell();
  }

  global.ThisOneInstantAnswer = {
    open: openInstantAnswer,
    mode: INSTANT_ANSWER_MODE
  };
})(window);
