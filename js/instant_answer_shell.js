(function (global) {
  const INSTANT_ANSWER_MODE = 'instant-answer';
  const SYSTEM_PROMPT = `ThisOne 즉답 should answer practical questions immediately.
The user may not know the correct name, term, product name, legal term, or search keyword.
Answer with:
- 결론
- 이유
- 지금 할 일
- 주의할 점
- 검색 추천어, if useful`;
  const EXAMPLES = [
    '이거 뭐라고 검색해야 해?',
    '월세 보증금 안 돌려주면 어떻게 해?',
    '문 닫힐 때 쾅 안 닫히게 하는 부품 뭐야?',
    '이 증상은 무슨 문제야?'
  ];

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setSearchModeShell() {
    document.body.classList.add('search-mode');
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.classList.add('hidden');
    const landingSearch = document.getElementById('landingSearch');
    if (landingSearch) landingSearch.scrollIntoView({ block: 'start' });
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
    const markerMatch = source.match(/검색\s*추천어\s*[:：]?([\s\S]{0,240})/i);
    const candidateText = markerMatch ? markerMatch[1] : '';
    candidateText.split(/[\n,·•]/).forEach((part) => {
      const term = part.replace(/^[-*\d.\s]+/, '').replace(/검색하기/g, '').trim();
      if (term.length >= 2 && term.length <= 30 && !terms.includes(term)) terms.push(term);
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
        <div class="instant-answer-copy">
          <p class="instant-answer-eyebrow">즉답</p>
          <h2 id="instantAnswerTitle">디스원 즉답</h2>
          <p class="instant-answer-main-copy">검색하지 말고 바로 물어보세요.</p>
          <p class="instant-answer-sub-copy">이름을 몰라도, 상황만 말하면 지금 필요한 답을 정리해드립니다.</p>
        </div>

        <div class="instant-answer-examples" aria-label="즉답 예시 질문">
          ${EXAMPLES.map((example) => `<button class="instant-answer-example-chip" type="button" data-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`).join('')}
        </div>

        <label class="instant-answer-question-label" for="instantAnswerQuestion">질문 입력창</label>
        <textarea class="instant-answer-question" id="instantAnswerQuestion" rows="4" placeholder="예: 문 닫힐 때 쾅 안 닫히게 하는 부품 이름이 뭐야?"></textarea>

        <button class="instant-answer-submit" id="instantAnswerSubmit" type="button">바로 답변</button>
        <p class="instant-answer-status" id="instantAnswerStatus" role="status" aria-live="polite" hidden></p>
        <div class="instant-answer-result" id="instantAnswerResult" aria-live="polite" hidden></div>
        <div class="instant-answer-suggestions" id="instantAnswerSuggestions" aria-label="검색 추천어" hidden></div>
      </section>
    `;

    const root = container.querySelector('.instant-answer-panel');
    const question = root.querySelector('#instantAnswerQuestion');
    const submit = root.querySelector('#instantAnswerSubmit');
    const status = root.querySelector('#instantAnswerStatus');
    const result = root.querySelector('#instantAnswerResult');

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
    setSearchModeShell();
    renderInstantAnswerShell();
  }

  global.ThisOneInstantAnswer = {
    open: openInstantAnswer,
    mode: INSTANT_ANSWER_MODE
  };
})(window);
