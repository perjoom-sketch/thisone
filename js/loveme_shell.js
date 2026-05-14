(function (global) {
  const LOVEME_MODE = 'loveme';
  const HONEST_STYLING_TONE_GUIDANCE = `LoveMe response tone: honest-but-hopeful styling 상담.

LoveMe is not:
- 성형 상담
- 외모 평가
- 얼굴 점수화
- 의료 조언

LoveMe is:
- 자연스러운 스타일링 상담
- 커버 스타일 제안
- 연출 중심 조언
- 사용자를 편들어주는 톤

Core response pattern:
1. 공감
2. 가볍게 편들기
3. 솔직하지만 희망 주기
4. 바로 스타일링 방향 제시

Use honest-but-hopeful lines when they fit:
- 키를 늘려드릴 수는 없구요^^; 하지만 길어 보이게 연출할 수는 있죠.
- 살을 빼드릴 수는 없구요^^; 하지만 날씬해 보이게 연출할 수는 있죠.
- 쌍꺼풀을 만들어드릴 수는 없구요^^; 하지만 눈매가 또렷해 보이게 연출할 수는 있죠.
- 반곱슬을 없애드릴 수는 없구요^^; 하지만 훨씬 차분해 보이게 정리할 수는 있죠.

Safe reframes:
- Never confirm a negative appearance judgment directly.
- Reframe concerns into “연출 포인트”.
- If the user says “얼굴이 큰 편입니다”, do not say they have a large face. Say: “그건 얼굴 문제가 아니라 비율 연출 포인트에 가까워요.”
- Be slightly playful, never mocking.
- Be warm, approachable, confident, and helpful.
- Use natural Korean conversational tone.
- Avoid overexplaining, therapy tone, and dramatic emotional language.
- Move quickly into practical styling suggestions.

Do not use these expressions:
- 착시
- 힘을 빌려보겠습니다
- 머리를 혼내는 시간
- 습도가 범인입니다
- 얼굴이 큰 편입니다
- 잘라드릴 수는 없구요
- 뜯어드릴 수는 없구요`;

  const SYSTEM_PROMPT = `You are LoveMe, a warm, lightly playful, honest, and hopeful personal styling assistant.

LoveMe gives non-surgical styling advice for appearance concerns.
LoveMe helps users naturally complement concerns with hairstyle, makeup, clothing, glasses, accessories, colors, styling, and presentation choices.

${HONEST_STYLING_TONE_GUIDANCE}

Core identity in Korean:
럽미
아무 걱정하지 마세요.
고치지 않고, 어울리게 연출해드립니다.
수술은 병원에서
연출은 럽미에서.

Rules:
- Do not recommend plastic surgery.
- Do not suggest medical procedures.
- Do not diagnose the face or body.
- Do not rate appearance.
- Do not insult or directly confirm negative appearance concerns.
- Do not joke at the user's expense.
- Humor should reduce tension, not attack the user.
- Do not ask for photo uploads or face analysis.
- Do not use forbidden expressions listed in the LoveMe tone guidance.
- Do not give medical or cosmetic-surgery advice.
- Use “연출”, “스타일링”, “자연스럽게 보완”, and “연출 포인트”.
- Keep jokes soft and natural.
- Move quickly into practical styling advice.

Tone:
- Warm
- Reassuring
- Lightly playful
- Honest but hopeful
- Practical
- On the user's side
- Not clinical
- Not judgmental
- Not cosmetic surgery consulting
- Not too serious

Opening style:
When the user states a concern, acknowledge it warmly, take the user's side lightly, and reframe it as a styling or proportion direction rather than a flaw.
Use a compact line like “바꿔드릴 수는 없구요^^; 하지만 훨씬 좋아 보이게 연출할 수는 있죠.” only when it sounds natural for the concern.
For face-size or body-size concerns, do not confirm the negative label. Say it is closer to a “비율 연출 포인트” and move into hair, color, fit, makeup, glasses, accessories, and styling.
For wavy or frizzy hair concerns, do not blame humidity as a villain. Say the texture can be made calmer and cleaner with the right cut, drying, product, and finish.

Answer in Korean unless the user clearly asks for another language.

Answer format:
LoveMe answers must feel like a quick styling prescription card, not an essay, report, or lecture.
Always prefer short headings, emoji visual anchors, and compact bullet-like lines.
Avoid long paragraph-only answers.
Use grouped sections so a user can understand the advice by scanning.

Required structure:
1. 한 줄 결론
   - Start with a single concise conclusion line.
   - Keep it warm, practical, and immediately useful.
2. 스타일링 카드
   - Do not add a separate “스타일링 카드” wrapper heading.
   - Use these short section headings exactly when relevant:
     - 💇 헤어
     - 👕 의상
     - 🎨 색상
     - 👓 안경/액세서리
     - 💄 메이크업 (only if relevant)
   - Each card should have 2–4 short action lines.
   - Use simple verbs like “고르기”, “피하기”, “더하기”, “정리하기”.
3. 피하기 / 추천하기
   - Pair quick avoid/recommend guidance.
   - Keep it direct and kind.
4. 바로 쓸 수 있는 쇼핑 검색어
   - Give practical Korean search keywords the user can paste into a shopping site.

Formatting rules:
- Use Markdown headings such as “## 💇 헤어”.
- Use short bullets, not long paragraphs.
- Keep each section compact.
- Prefer concrete styling prescriptions over explanations.
- No appearance scores.
- No cosmetic surgery or medical advice.
- No photo analysis or photo upload requests.

Keep it practical and kind. Avoid long lectures.`;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function enterLoveMeMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'loveme-mode');
    document.body.classList.remove('document-ai-mode', 'instant-answer-mode', 'web-search-mode');
  }

  function setStatus(element, message) {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
  }

  function renderInlineMarkdown(text) {
    return escapeHtml(text || '').replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  }

  function cleanLoveMeLine(line) {
    return String(line || '')
      .replace(/^#{1,3}\s+/, '')
      .replace(/^[-*]\s+/, '')
      .trim();
  }

  function getLoveMeSectionType(title) {
    if (/한\s*줄\s*결론|결론/.test(title)) return 'summary';
    if (/💇|헤어|머리/.test(title)) return 'hair';
    if (/👕|의상|옷|코디|핏/.test(title)) return 'outfit';
    if (/🎨|색상|컬러|색감/.test(title)) return 'color';
    if (/👓|안경|액세서리|악세서리/.test(title)) return 'accessory';
    if (/💄|메이크업|화장/.test(title)) return 'makeup';
    if (/피하기|추천하기|avoid|recommend/i.test(title)) return 'avoid';
    if (/쇼핑|검색어|키워드/.test(title)) return 'shopping';
    return 'default';
  }

  function renderLoveMeSection(section) {
    const title = renderInlineMarkdown(section.title);
    const lines = section.lines.map(cleanLoveMeLine).filter(Boolean);
    const type = getLoveMeSectionType(section.title);
    const tag = type === 'summary' ? 'loveme-answer-summary' : 'loveme-answer-card';
    const body = lines.length
      ? `<ul class="loveme-answer-list">${lines.map((line) => `<li>${renderInlineMarkdown(line)}</li>`).join('')}</ul>`
      : '';

    return `<section class="${tag} loveme-answer-${type}"><h3>${title}</h3>${body}</section>`;
  }

  function renderMarkdownLite(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';

    const lines = raw.split(/\r?\n/);
    const sections = [];
    let current = null;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
      const isVisualHeading = /^(?:\d+\.\s*)?(?:💇\s*헤어|👕\s*의상|🎨\s*색상|👓\s*안경\/액세서리|💄\s*메이크업|피하기\s*\/\s*추천하기|바로\s*쓸\s*수\s*있는\s*쇼핑\s*검색어|한\s*줄\s*결론)\s*:?\s*$/i.test(trimmed);

      if (headingMatch || isVisualHeading) {
        current = {
          title: cleanLoveMeLine(headingMatch ? headingMatch[1] : trimmed),
          lines: []
        };
        sections.push(current);
        return;
      }

      if (!current) {
        current = { title: '✨ 한 줄 결론', lines: [] };
        sections.push(current);
      }

      current.lines.push(trimmed);
    });

    const visibleSections = sections.filter((section) => {
      return section.lines.length || getLoveMeSectionType(section.title) !== 'default';
    });

    if (!visibleSections.length) return '';
    return `<div class="loveme-answer-cards">${visibleSections.map(renderLoveMeSection).join('')}</div>`;
  }

  async function requestLoveMeAnswer(concern, onChunk) {
    const payload = {
      model: 'gemini-2.5-flash',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: concern }]
    };

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

  function renderLoveMeShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    container.innerHTML = `
      <section class="loveme-panel" aria-label="럽미">
        ${global.ThisOneModeTabs?.render?.(LOVEME_MODE) || ''}
        <div class="loveme-copy">
          <p class="loveme-main-copy">수술은 의사에게<br>연출은 럽미에게</p>
        </div>

        <div class="ai-tool-composer loveme-composer">
          <div class="ai-tool-input loveme-composer-top">
            <label class="loveme-question-label" for="loveMeConcern">럽미 상담 입력창</label>
            <textarea class="loveme-question" id="loveMeConcern" rows="1" aria-label="럽미 상담 입력창" placeholder="콤플렉스나 원하는 커버 스타일을 말씀해 보세요."></textarea>
          </div>
          <p class="ai-tool-voice-status" id="loveMeVoiceStatus" aria-live="polite" hidden></p>
          <div class="ai-tool-control-row loveme-composer-bottom">
            <div class="ai-tool-left-controls loveme-composer-left-actions">
              <div class="loveme-plus-wrap">
                <button class="ai-tool-icon-button ai-tool-plus-button loveme-plus-button" id="loveMePlusButton" type="button" aria-label="입력 메뉴 열기" aria-expanded="false" aria-controls="loveMePlusMenu" title="입력 메뉴 열기">+</button>
                <div class="loveme-plus-menu" id="loveMePlusMenu" role="menu" hidden>
                  <button class="loveme-plus-menu-item" type="button" role="menuitem" disabled>파일 추가 준비 중</button>
                  <button class="loveme-plus-menu-item" type="button" role="menuitem" disabled>사진 기능 준비 중</button>
                </div>
              </div>
            </div>
            <div class="ai-tool-right-controls loveme-composer-actions">
              <button class="ai-tool-icon-button ai-tool-help-button loveme-help-button" id="loveMeHelpButton" type="button" aria-label="럽미 상담 예시 보기" aria-expanded="false" aria-controls="loveMeHelpPanel" title="럽미 상담 예시 보기">?</button>
              <button class="ai-tool-icon-button ai-tool-mic-button" id="loveMeMicButton" type="button" aria-label="음성으로 입력" title="음성으로 입력"></button>
              <button class="ai-tool-action-button loveme-submit" id="loveMeSubmit" type="button">상담하기</button>
            </div>
          </div>
        </div>

        <div class="loveme-help-panel" id="loveMeHelpPanel" hidden>
          <p class="loveme-help-title">예시:</p>
          <div class="loveme-help-examples">
            <button type="button" data-loveme-example="얼굴이 큰 편입니다">얼굴이 큰 편입니다</button>
            <button type="button" data-loveme-example="이마가 넓어 보여요">이마가 넓어 보여요</button>
            <button type="button" data-loveme-example="반곱슬이라 비 오는 날 머리가 부스스해요">반곱슬이라 비 오는 날 머리가 부스스해요</button>
            <button type="button" data-loveme-example="키가 작아서 코디가 고민이에요">키가 작아서 코디가 고민이에요</button>
            <button type="button" data-loveme-example="어깨가 넓어 보여요">어깨가 넓어 보여요</button>
          </div>
        </div>

        <p class="loveme-status" id="loveMeStatus" role="status" aria-live="polite" hidden></p>
        <div class="loveme-result" id="loveMeResult" aria-live="polite" hidden></div>
      </section>
    `;

    const root = container.querySelector('.loveme-panel');
    const concern = root.querySelector('#loveMeConcern');
    const submit = root.querySelector('#loveMeSubmit');
    const status = root.querySelector('#loveMeStatus');
    const result = root.querySelector('#loveMeResult');
    const micButton = root.querySelector('#loveMeMicButton');
    const voiceStatus = root.querySelector('#loveMeVoiceStatus');
    const plusButton = root.querySelector('#loveMePlusButton');
    const plusMenu = root.querySelector('#loveMePlusMenu');
    const helpButton = root.querySelector('#loveMeHelpButton');
    const helpPanel = root.querySelector('#loveMeHelpPanel');

    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input: concern,
      status: voiceStatus,
      appendMode: 'newline'
    });

    global.ThisOneModeTabs?.bind?.(root);

    function setPlusMenuOpen(isOpen) {
      if (!plusButton || !plusMenu) return;
      plusMenu.hidden = !isOpen;
      plusButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function setHelpPanelOpen(isOpen) {
      if (!helpButton || !helpPanel) return;
      helpPanel.hidden = !isOpen;
      helpButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    concern?.addEventListener('input', () => {
      concern.style.height = 'auto';
      concern.style.height = `${concern.scrollHeight / 16}rem`;
    });

    concern?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit?.click();
      }
    });

    plusButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      setHelpPanelOpen(false);
      setPlusMenuOpen(!!plusMenu?.hidden);
    });

    helpButton?.addEventListener('click', () => {
      setPlusMenuOpen(false);
      setHelpPanelOpen(!!helpPanel?.hidden);
    });

    root.querySelectorAll('[data-loveme-example]').forEach((button) => {
      button.addEventListener('click', () => {
        concern.value = button.dataset.lovemeExample || '';
        concern.dispatchEvent(new Event('input', { bubbles: true }));
        concern.focus();
        setHelpPanelOpen(false);
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !root.contains(target)) return;
      if (!plusMenu?.hidden && !target.closest('.loveme-plus-wrap')) setPlusMenuOpen(false);
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setPlusMenuOpen(false);
        setHelpPanelOpen(false);
      }
    });

    submit?.addEventListener('click', async () => {
      const text = concern.value.trim();
      if (!text) {
        setStatus(status, '신경 쓰이는 부분을 편하게 적어주세요. 럽미는 편입니다.');
        concern.focus();
        return;
      }

      submit.disabled = true;
      result.hidden = false;
      result.innerHTML = '';
      setStatus(status, '럽미가 어울리는 스타일링을 찾는 중입니다...');

      try {
        const answer = await requestLoveMeAnswer(text, (chunk, fullText) => {
          result.innerHTML = renderMarkdownLite(fullText || chunk);
        });
        result.innerHTML = renderMarkdownLite(answer);
        setStatus(status, '스타일링 답변이 완료되었습니다.');
      } catch (error) {
        result.innerHTML = '';
        result.hidden = true;
        setStatus(status, `럽미 답변 생성 중 오류가 발생했습니다. ${error.message || ''}`.trim());
      } finally {
        submit.disabled = false;
      }
    });
  }

  function openLoveMe() {
    enterLoveMeMode();
    renderLoveMeShell();
  }

  global.ThisOneLoveMe = {
    open: openLoveMe,
    mode: LOVEME_MODE
  };
})(window);
