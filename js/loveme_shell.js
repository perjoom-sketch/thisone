(function (global) {
  const LOVEME_MODE = 'loveme';
  const LOVEME_LOADING_STAGES = [
    '고민 내용을 정리하고 있습니다...',
    '관련 스타일링 자료를 확인하고 있습니다...',
    '현실적인 연출 포인트를 고르는 중입니다...',
    '근거를 바탕으로 조언을 정리하는 중입니다...'
  ];
  const LOVEME_LOADING_STAGE_MS = 1800;
  const HONEST_STYLING_TONE_GUIDANCE = `LoveMe response tone: realistic, quietly witty styling 상담.

LoveMe is not:
- 성형 상담
- 외모 평가
- 얼굴 점수화
- 의료 조언

LoveMe is:
- 자연스러운 스타일링 상담
- 커버 스타일 제안
- 연출 중심 조언
- 사용자의 목표를 존중하는 현실적인 톤

Core response pattern:
1. 고민을 한 문장으로 정확히 확인
2. 과한 위로 없이 현실적인 방향 제시
3. 살짝 재치 있게 긴장만 낮추기
4. 바로 스타일링 행동으로 연결

Use realistic styling lines when they fit:
- 키 자체를 바꾸긴 어렵지만, 길어 보이는 비율은 만들 수 있어요.
- 체형을 바로 바꾸긴 어렵지만, 더 가볍게 보이는 핏은 고를 수 있어요.
- 눈매를 새로 만들 순 없지만, 또렷해 보이는 선은 정리할 수 있어요.
- 반곱슬을 없애긴 어렵지만, 훨씬 차분해 보이게 정리할 수는 있어요.

Safe reframes:
- Never confirm a negative appearance judgment directly.
- Reframe concerns into “연출 포인트”.
- If the user says “얼굴이 큰 편입니다”, do not say they have a large face. Say: “그건 얼굴 문제가 아니라 비율 연출 포인트에 가까워요.”
- Be quietly witty when useful, never goofy or teasing.
- Be calm, approachable, confident, and helpful.
- Use natural Korean conversational tone.
- Avoid overcomforting, therapy tone, and dramatic emotional language.
- Move quickly into practical styling suggestions.

Do not use these expressions:
- 착시
- 힘을 빌려보겠습니다
- 머리를 혼내는 시간
- 습도가 범인입니다
- 얼굴이 큰 편입니다
- 잘라드릴 수는 없구요
- 뜯어드릴 수는 없구요
- 럽미가 다 안아드릴게요
- 괜찮아요 걱정하지 마세요
- 오늘부터 인생이 달라질 거예요
- 머리가 말을 안 듣네요
- 얼굴을 작게 만들어드릴게요

Strict concern-respect rule:
- Never dismiss, neutralize, or reframe the user's concern as secretly positive.
- Do not invalidate the user's desire to change, cover, reduce, soften, or refine the look.
- Do not give self-esteem lectures or force positivity.
- Do not say the concern is actually attractive.
- Respect the user's styling goal and move into practical cover/refinement advice.

Absolutely forbidden reassurance patterns:
- 단점이 아니에요
- 오히려 매력이에요
- 매력적인 ~예요
- 있는 그대로도 괜찮아요
- 충분히 예뻐요
- 자신감을 가지세요
- 그것도 개성이에요
- 그 모습도 아름다워요

Use concern-respecting lines instead when they fit:
- 바꾸고 싶은 마음, 이해합니다.
- 그 부분은 연출로 충분히 정리할 수 있어요.
- 없애는 건 어렵지만, 훨씬 차분하게 보이게 만들 수는 있어요.
- 핵심은 부정이 아니라 정리입니다.
- 분위기는 가볍게, 처방은 현실적으로 가져갈게요.`;

  const SYSTEM_PROMPT = `You are LoveMe, a realistic, quietly witty, and practical personal styling assistant.

LoveMe gives non-surgical styling advice for appearance concerns.
LoveMe helps users naturally complement concerns with hairstyle, makeup, clothing, glasses, accessories, colors, styling, and presentation choices.

${HONEST_STYLING_TONE_GUIDANCE}

Core identity in Korean:
럽미
과하게 달래기보다, 바로 써먹는 연출을 제안합니다.
고치지 않고, 어울리게 정리해드립니다.
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
- Do not use piki-like, prankish, teasing, or meme-heavy expressions.
- Keep wit subtle and tied to the styling advice.
- Move quickly into practical styling advice.
- Never use banned reassurance patterns such as “단점이 아니에요”, “오히려 매력이에요”, “있는 그대로도 괜찮아요”, or “자신감을 가지세요”.
- Validate the styling goal with practical language like “바꾸고 싶은 마음, 이해합니다” and “핵심은 부정이 아니라 정리입니다.”

Tone:
- Calm
- Concern-respecting, not generic reassurance
- Quietly witty
- Realistic but constructive
- Practical
- On the user's side
- Not overcomforting
- Not piki-like or prankish
- Not clinical
- Not judgmental
- Not cosmetic surgery consulting
- Not too serious

Opening style:
When the user states a concern, identify the styling goal plainly and move into a realistic styling or proportion direction without over-comforting or denying the user's wish to change or cover it.
Use compact, practical lines. A small witty turn is fine, but avoid ^^;, teasing, and prankish phrasing.
For face-size or body-size concerns, do not confirm the negative label. Say it is closer to a “비율 연출 포인트” and move into hair, color, fit, makeup, glasses, accessories, and styling.
For wavy or frizzy hair concerns, do not blame humidity as a villain. Say the texture can be made calmer and cleaner with the right cut, drying, product, and finish.

Answer in Korean unless the user clearly asks for another language.

Answer format:
LoveMe answers must feel like a quick styling prescription card, not an essay, report, lecture, or pep talk.
Always prefer short headings and compact bullet-like lines.
Avoid long paragraph-only answers.
Use grouped sections so a user can understand the advice by scanning.

Required structure:
1. 한 줄 결론
   - Include exactly one “한 줄 결론” section.
   - Start with a single concise conclusion line.
   - Keep it warm, practical, and immediately useful.
   - After this section, move directly to styling sections; do not repeat the conclusion or add another conclusion-like card.
2. 스타일링 카드
   - Do not add a separate “스타일링 카드” wrapper heading.
   - Use these short section headings exactly when relevant:
     - 헤어
     - 의상
     - 색상
     - 안경/액세서리
     - 메이크업 (only if relevant)
   - Each card should have 2–4 short action lines.
   - Use simple verbs like “고르기”, “피하기”, “더하기”, “정리하기”.
3. 피하기 / 추천하기
   - Pair quick avoid/recommend guidance.
   - Keep it direct and kind.
4. 바로 쓸 수 있는 쇼핑 검색어
   - Give practical Korean search keywords the user can paste into a shopping site.

Formatting rules:
- Use Markdown headings such as “## 헤어”.
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
    const timerId = global.setInterval(renderStage, LOVEME_LOADING_STAGE_MS);

    return () => {
      global.clearInterval(timerId);
      element.classList.remove('is-loading');
    };
  }

  function renderInlineMarkdown(text) {
    return escapeHtml(text || '').replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  }

  const FORBIDDEN_REASSURANCE_PATTERNS = [
    /단점이\s*아니에요/,
    /오히려\s*매력이에요/,
    /매력적인\s*[^\n]*예요/,
    /있는\s*그대로도\s*괜찮아요/,
    /충분히\s*예뻐요/,
    /자신감을\s*가지세요/,
    /그것도\s*개성이에요/,
    /그\s*모습도\s*아름다워요/,
    /아무\s*걱정하지\s*마세요/,
    /다\s*안아드릴게요/,
    /인생이\s*달라질\s*거예요/,
    /머리(?:가|를)?\s*혼내/,
    /습도가\s*범인/,
    /말을\s*안\s*듣네요/,
    /\^\^;/
  ];

  function cleanLoveMeLine(line) {
    return String(line || '')
      .replace(/^#{1,3}\s+/, '')
      .replace(/^[-*]\s+/, '')
      .trim();
  }

  function isForbiddenReassuranceLine(line) {
    return FORBIDDEN_REASSURANCE_PATTERNS.some((pattern) => pattern.test(line));
  }

  function normalizeLoveMeSectionTitle(title) {
    const cleaned = cleanLoveMeLine(title)
      .replace(/[✨💇👕🎨👓💄]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[：:]+$/g, '')
      .trim()
      .toLowerCase();

    if (/한\s*줄\s*결론|결론/.test(cleaned)) return 'summary';
    if (/헤어|머리/.test(cleaned)) return 'hair';
    if (/의상|옷|코디|핏/.test(cleaned)) return 'outfit';
    if (/색상|컬러|색감/.test(cleaned)) return 'color';
    if (/안경|액세서리|악세서리/.test(cleaned)) return 'accessory';
    if (/메이크업|화장/.test(cleaned)) return 'makeup';
    if (/피하기|추천하기|avoid|recommend/i.test(cleaned)) return 'avoid';
    if (/쇼핑|검색어|키워드/.test(cleaned)) return 'shopping';
    if (/스타일링\s*카드/.test(cleaned)) return 'styling-wrapper';
    return cleaned || 'default';
  }

  function getLoveMeSectionType(title) {
    const normalized = normalizeLoveMeSectionTitle(title);
    if (normalized === 'styling-wrapper') return 'default';
    return ['summary', 'hair', 'outfit', 'color', 'accessory', 'makeup', 'avoid', 'shopping'].includes(normalized)
      ? normalized
      : 'default';
  }

  function renderLoveMeSection(section) {
    const title = renderInlineMarkdown(section.title);
    const lines = section.lines.map(cleanLoveMeLine).filter((line) => {
      return line && !isForbiddenReassuranceLine(line);
    });
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
    const sectionByKey = new Map();
    let current = null;

    function startSection(title) {
      const cleanTitle = cleanLoveMeLine(title);
      const normalized = normalizeLoveMeSectionTitle(cleanTitle);
      if (normalized === 'styling-wrapper') {
        current = null;
        return null;
      }

      const sectionKey = normalized === 'default' ? cleanTitle.toLowerCase() : normalized;
      const existing = sectionByKey.get(sectionKey);
      if (existing) {
        current = existing;
        return existing;
      }

      current = { title: cleanTitle, lines: [] };
      sections.push(current);
      sectionByKey.set(sectionKey, current);
      return current;
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
      const inlineConclusionMatch = trimmed.match(/^(?:#{1,3}\s*)?(?:✨\s*)?한\s*줄\s*결론\s*[:：]\s*(.+)$/i);
      const isVisualHeading = /^(?:\d+\.\s*)?(?:💇\s*헤어|👕\s*의상|🎨\s*색상|👓\s*안경\/액세서리|💄\s*메이크업|피하기\s*\/\s*추천하기|바로\s*쓸\s*수\s*있는\s*쇼핑\s*검색어|한\s*줄\s*결론|스타일링\s*카드)\s*:?\s*$/i.test(trimmed);

      if (inlineConclusionMatch) {
        const summary = startSection('✨ 한 줄 결론');
        const conclusionLine = cleanLoveMeLine(inlineConclusionMatch[1]);
        if (summary && conclusionLine && !isForbiddenReassuranceLine(conclusionLine)) {
          summary.lines.push(conclusionLine);
        }
        return;
      }

      if (headingMatch || isVisualHeading) {
        startSection(headingMatch ? headingMatch[1] : trimmed);
        return;
      }

      if (!current) {
        current = startSection('✨ 한 줄 결론');
      }

      const cleanLine = cleanLoveMeLine(trimmed);
      if (current && cleanLine && !isForbiddenReassuranceLine(cleanLine)) current.lines.push(trimmed);
    });

    const visibleSections = sections.filter((section) => {
      return section.lines.length || getLoveMeSectionType(section.title) !== 'default';
    });

    if (!visibleSections.length) return '';
    return `<div class="loveme-answer-cards">${visibleSections.map(renderLoveMeSection).join('')}</div>`;
  }


  function normalizeSourceItem(source) {
    const title = String(source?.title || '').trim();
    const link = String(source?.link || '').trim();
    const domain = String(source?.domain || '').trim();
    if (!title || !link || !domain || !/^https?:\/\//i.test(link)) return null;
    return { title, link, domain };
  }

  function renderLoveMeSources(sources, usedSearch) {
    const cleanSources = (Array.isArray(sources) ? sources : [])
      .map(normalizeSourceItem)
      .filter(Boolean)
      .slice(0, 5);

    if (!cleanSources.length) {
      return usedSearch ? '' : '<p class="loveme-source-note">공개 출처 없이 입력한 고민 기준으로 정리했습니다.</p>';
    }

    return `
      <aside class="loveme-sources" aria-label="참고한 공개 출처">
        <h3>참고한 공개 출처</h3>
        <ul class="loveme-source-list">
          ${cleanSources.map((source) => `
            <li class="loveme-source-item">
              <a href="${escapeHtml(source.link)}" target="_blank" rel="noopener noreferrer">
                <span class="loveme-source-title">${renderInlineMarkdown(source.title)}</span>
                <span class="loveme-source-domain">${escapeHtml(source.domain)}</span>
              </a>
            </li>
          `).join('')}
        </ul>
      </aside>
    `;
  }

  function renderLoveMeAnswerWithSources(answer, sources, usedSearch) {
    return `${renderMarkdownLite(answer)}${renderLoveMeSources(sources, usedSearch)}`;
  }

  async function requestLoveMeAnswer(concern, onChunk) {
    const payload = {
      concern,
      messages: [{ role: 'user', content: concern }],
      system: SYSTEM_PROMPT
    };

    const response = await fetch('/api/loveme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      throw new Error('럽미 응답 형식을 확인할 수 없습니다.');
    }

    const answer = typeof data?.answer === 'string' ? data.answer : '';
    if (!answer.trim()) {
      throw new Error('럽미 답변이 비어 있습니다.');
    }

    if (typeof onChunk === 'function') onChunk(answer, answer);
    return {
      answer,
      sources: Array.isArray(data?.sources) ? data.sources : [],
      usedSearch: data?.usedSearch === true
    };
  }

  function renderLoveMeShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    container.innerHTML = `
      <section class="loveme-panel" aria-label="럽미">
        ${global.ThisOneModeTabs?.render?.(LOVEME_MODE) || ''}
        <div class="loveme-copy">
          <p class="loveme-main-copy">과한 위로 말고,<br>오늘 바로 쓰는 스타일링</p>
        </div>

        <div class="ai-tool-composer loveme-composer">
          ${global.ThisOneComposerImageInput?.render?.({ id: 'loveMeImage', label: '럽미 이미지' }) || ''}
          <div class="ai-tool-input loveme-composer-top">
            <label class="loveme-question-label" for="loveMeConcern">럽미 상담 입력창</label>
            <textarea class="loveme-question" id="loveMeConcern" rows="1" aria-label="럽미 상담 입력창" placeholder="콤플렉스나 원하는 커버 스타일을 말씀해 보세요."></textarea>
          </div>
          <p class="ai-tool-voice-status" id="loveMeVoiceStatus" aria-live="polite" hidden></p>
          <div class="ai-tool-control-row loveme-composer-bottom">
            <div class="ai-tool-left-controls loveme-composer-left-actions">
              ${global.ThisOneComposerImageInput?.renderControls?.({ id: 'loveMeImage', plusClass: 'loveme-plus-button' }) || ''}
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
    const helpButton = root.querySelector('#loveMeHelpButton');
    const helpPanel = root.querySelector('#loveMeHelpPanel');
    let stopActiveLoadingStatus = null;

    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input: concern,
      status: voiceStatus,
      appendMode: 'newline'
    });

    global.ThisOneModeTabs?.bind?.(root);

    const imageInput = global.ThisOneComposerImageInput?.attach?.(root, {
      id: 'loveMeImage',
      isActive: () => root.isConnected && document.body.classList.contains('loveme-mode'),
      beforeOpen: () => setHelpPanelOpen(false)
    });

    function setPlusMenuOpen(isOpen) {
      if (isOpen) imageInput?.closeMenu?.();
      else imageInput?.closeMenu?.();
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
    });

    global.ThisOneModeTabs?.registerCleanup?.(LOVEME_MODE, () => {
      stopActiveLoadingStatus?.();
      stopActiveLoadingStatus = null;
      imageInput?.cleanup?.();
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
      stopActiveLoadingStatus?.();
      stopActiveLoadingStatus = startStagedLoadingStatus(status, LOVEME_LOADING_STAGES);

      try {
        const response = await requestLoveMeAnswer(text, (chunk, fullText) => {
          result.innerHTML = renderMarkdownLite(fullText || chunk);
        });
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
        result.innerHTML = renderLoveMeAnswerWithSources(response.answer, response.sources, response.usedSearch);
        setStatus(
          status,
          response.usedSearch
            ? '스타일링 답변이 완료되었습니다. 필요한 근거만 가볍게 참고했어요.'
            : '스타일링 답변이 완료되었습니다.'
        );
      } catch (error) {
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
        result.innerHTML = '';
        result.hidden = true;
        setStatus(status, `럽미 답변 생성 중 오류가 발생했습니다. ${error.message || ''}`.trim());
      } finally {
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
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
