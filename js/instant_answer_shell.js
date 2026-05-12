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
    document.body.classList.remove('document-ai-mode', 'web-search-mode');
  }

  function exitAIToolMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.remove('ai-tool-mode', 'document-ai-mode', 'instant-answer-mode', 'web-search-mode');
    const container = document.getElementById('msgContainer');
    if (container) container.innerHTML = '';
  }

  function setStatus(element, message) {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
  }

  function renderMarkdownLite(text) {
    const safe = escapeHtml(text || '').trim();
    if (!safe) return '';
    return safe
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

  async function requestInstantAnswer(question, onChunk) {
    const payload = {
      model: global.MODEL || 'gemini-2.5-flash',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: question }]
    };

    if (global.ThisOneAPI?.requestChat) {
      return global.ThisOneAPI.requestChat(payload, onChunk);
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return response.text();

    const decoder = new TextDecoder();
    let fullText = '';
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        const chunk = decoder.decode(result.value, { stream: true });
        fullText += chunk;
        if (typeof onChunk === 'function') onChunk(chunk, fullText);
      }
    }
    return fullText;
  }

  function triggerSearch(term) {
    exitAIToolMode();
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
      <section class="instant-answer-panel" data-mode="${INSTANT_ANSWER_MODE}" aria-labelledby="instantAnswerTitle">
        <button class="ai-tool-return" type="button" data-ai-tool-return>← 쇼핑검색으로 돌아가기</button>
        <div class="instant-answer-copy">
          <p class="instant-answer-eyebrow">즉답</p>
          <h2 id="instantAnswerTitle">디스원 즉답</h2>
          <p class="instant-answer-main-copy">검색하지 말고 바로 물어보세요.</p>
          <p class="instant-answer-sub-copy">생활, 제품, 문서, 상황까지 궁금한 점을 바로 정리해드립니다.</p>
        </div>

        <div class="instant-answer-examples" aria-label="즉답 예시 질문">
          ${EXAMPLES.map((example) => `<button class="instant-answer-example-chip" type="button" data-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join('')}
        </div>

        <div class="ai-tool-input-heading">
          <label class="instant-answer-question-label" for="instantAnswerQuestion">질문 입력창</label>
          <button class="ai-tool-mic-button" id="instantAnswerMicButton" type="button" aria-label="음성으로 입력" title="브라우저 음성 인식을 사용합니다. 음성 파일은 저장하지 않습니다.">🎙️</button>
        </div>
        <textarea class="instant-answer-question" id="instantAnswerQuestion" rows="4" placeholder="예: 배 아플 때 어떤 약 먹어야 해?"></textarea>
        <p class="ai-tool-voice-status" id="instantAnswerVoiceStatus" aria-live="polite" hidden></p>

        <button class="instant-answer-submit" id="instantAnswerSubmit" type="button">바로 답변</button>
        <p class="instant-answer-status" id="instantAnswerStatus" role="status" aria-live="polite" hidden></p>
        <div class="instant-answer-result" id="instantAnswerResult" aria-live="polite" hidden></div>
        <div class="instant-answer-suggestions" id="instantAnswerSuggestions" aria-label="검색 추천어" hidden></div>
      </section>
    `;

    const root = container.querySelector('.instant-answer-panel');
    const returnButton = root.querySelector('[data-ai-tool-return]');
    const question = root.querySelector('#instantAnswerQuestion');
    const submit = root.querySelector('#instantAnswerSubmit');
    const status = root.querySelector('#instantAnswerStatus');
    const result = root.querySelector('#instantAnswerResult');
    const micButton = root.querySelector('#instantAnswerMicButton');
    const voiceStatus = root.querySelector('#instantAnswerVoiceStatus');
    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input: question,
      status: voiceStatus,
      appendMode: 'newline'
    });

    returnButton?.addEventListener('click', exitAIToolMode);

    root.querySelectorAll('[data-example]').forEach((button) => {
      button.addEventListener('click', () => {
        question.value = button.dataset.example || '';
        question.focus();
      });
    });

    submit.addEventListener('click', async () => {
      const text = question.value.trim();
      if (!text) {
        setStatus(status, '상황이나 질문을 먼저 입력해주세요.');
        question.focus();
        return;
      }

      submit.disabled = true;
      result.hidden = false;
      result.innerHTML = '';
      renderSearchSuggestions(root, []);
      setStatus(status, '즉답을 정리하고 있습니다...');

      try {
        const answer = await requestInstantAnswer(text, (chunk, fullText) => {
          result.innerHTML = renderMarkdownLite(fullText || chunk);
        });
        result.innerHTML = renderMarkdownLite(answer);
        renderSearchSuggestions(root, extractSearchTerms(answer));
        setStatus(status, '답변이 완료되었습니다.');
      } catch (error) {
        result.innerHTML = '';
        result.hidden = true;
        setStatus(status, `즉답 생성 중 오류가 발생했습니다. ${error.message || ''}`.trim());
      } finally {
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
