(function (global) {
  const HOME_MEAL_MODE = 'home-meal';

  const HOME_MEAL_LOADING_STAGES = [
    '입력한 재료를 정리하고 있습니다...',
    '가능한 집밥 후보를 고르는 중입니다...',
    '부족한 재료를 확인하고 있습니다...',
    '레시피 근거를 가볍게 붙이는 중입니다...'
  ];
  const HOME_MEAL_LOADING_STAGE_MS = 1400;

  const HOME_MEAL_FLOWS = {
    human: {
      icon: '👤',
      label: '사람',
      placeholder: '냉장고에 있는 재료를 적어주세요...',
      helper: '가진 재료로 오늘 먹을 집밥을 골라드립니다.',
      emptyText: '재료를 입력해주세요. 예: 돼지고기, 김치, 두부'
    },
    dog: {
      icon: '🐶',
      label: '강아지',
      placeholder: '강아지 나이, 몸무게, 건강 상태, 가진 재료를 적어주세요...',
      helper: '강아지 집밥은 금지 식재료와 건강 상태 확인이 먼저 필요합니다.',
      emptyText: '강아지 나이, 몸무게, 건강 상태, 가진 재료를 먼저 적어주세요.'
    },
    cat: {
      icon: '🐱',
      label: '고양이',
      placeholder: '고양이 나이, 몸무게, 건강 상태, 가진 재료를 적어주세요...',
      helper: '고양이 집밥은 영양 균형과 금지 식재료 확인이 특히 중요합니다.',
      emptyText: '고양이 나이, 몸무게, 건강 상태, 가진 재료를 먼저 적어주세요.'
    }
  };
  const DEFAULT_HOME_MEAL_FLOW = 'human';
  /**
   * 집밥 1차 flow:
   * user-provided text ingredients stay the primary evidence layer.
   * Serper public recipe results are attached only as a light evidence layer.
   * Shopping search connection is intentionally not enabled yet.
   * Pet meal support must not be mixed into the first human 집밥 implementation.
   * 반려동물 집밥 requires a separate safety layer.
   */

  function enterHomeMealMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'home-meal-mode');
    document.body.classList.remove('document-ai-mode', 'instant-answer-mode', 'web-search-mode', 'loveme-mode');
  }

  function exitHomeMealMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.remove('ai-tool-mode', 'home-meal-mode');
    const container = document.getElementById('msgContainer');
    if (container) container.innerHTML = '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(element, message) {
    if (!element) return;
    element.classList.remove('is-loading');
    element.textContent = message || '';
    element.hidden = !message;
  }

  function startStagedLoadingStatus(element, stages) {
    if (!element || !Array.isArray(stages) || !stages.length) return () => {};

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
    const timerId = global.setInterval(renderStage, HOME_MEAL_LOADING_STAGE_MS);
    return () => {
      global.clearInterval(timerId);
      element.classList.remove('is-loading');
    };
  }

  function setHelpPanelOpen(helpButton, helpPanel, isOpen) {
    if (!helpButton || !helpPanel) return;
    helpPanel.hidden = !isOpen;
    helpButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }


  function renderHomeMealSubTabs(activeFlow) {
    return `
      <div class="home-meal-sub-tabs" role="tablist" aria-label="집밥 대상 선택">
        ${Object.entries(HOME_MEAL_FLOWS).map(([flow, item]) => `
          <button
            class="home-meal-sub-tab${flow === activeFlow ? ' is-active' : ''}"
            type="button"
            role="tab"
            aria-selected="${flow === activeFlow ? 'true' : 'false'}"
            data-home-meal-flow="${flow}"
          >
            <span class="home-meal-sub-tab-icon" aria-hidden="true">${item.icon}</span>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function renderPetMealPending(flow) {
    const isCat = flow === 'cat';
    return `
      <section class="home-meal-result-panel home-meal-pet-pending" aria-label="${isCat ? '고양이' : '강아지'} 집밥 준비 중 안내">
        <p class="home-meal-result-title">${isCat ? '🐱 고양이' : '🐶 강아지'} 집밥은 안전 검토를 먼저 준비 중입니다.</p>
        <p class="home-meal-result-copy">반려동물 집밥은 나이, 몸무게, 질환, 알레르기, 금지 식재료 확인이 필요해서 아직 레시피를 생성하지 않습니다.</p>
        <p class="home-meal-result-copy">지금은 정보를 받아두는 단계이며, 재료 추천이나 급여량 안내는 제공하지 않습니다.</p>
      </section>
    `;
  }

  function renderIngredientList(items, emptyText) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return `<span class="home-meal-muted">${escapeHtml(emptyText || '없음')}</span>`;
    return list.map((item) => `<span class="home-meal-pill">${escapeHtml(item)}</span>`).join('');
  }

  function renderHomeMealResult(data) {
    const ingredients = Array.isArray(data?.ingredients) ? data.ingredients : [];
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

    if (!candidates.length) {
      return `
        <section class="home-meal-result-panel">
          <p class="home-meal-result-title">가능한 메뉴를 찾지 못했어요.</p>
          <p class="home-meal-result-copy">${escapeHtml(data?.message || '재료명을 조금 더 구체적으로 적어주세요.')}</p>
        </section>
      `;
    }

    return `
      <section class="home-meal-result-panel" aria-label="집밥 추천 결과">
        <div class="home-meal-ingredient-summary">
          <span class="home-meal-result-label">입력 재료</span>
          <div class="home-meal-pill-row">${renderIngredientList(ingredients, '정리된 재료 없음')}</div>
        </div>
        <div class="home-meal-menu-list">
          ${candidates.map((candidate) => `
            <article class="home-meal-menu-row">
              <div class="home-meal-menu-main">
                <h3>${escapeHtml(candidate.name)}</h3>
                <p>${escapeHtml(candidate.note || '입력한 재료 기준으로 만들기 쉬운 메뉴입니다.')}</p>
                <div class="home-meal-menu-meta">
                  <span class="home-meal-result-label">있는 재료</span>
                  <div class="home-meal-pill-row">${renderIngredientList(candidate.available, '추가 확인 필요')}</div>
                </div>
                <div class="home-meal-menu-meta">
                  <span class="home-meal-result-label">부족한 재료</span>
                  <div class="home-meal-pill-row home-meal-missing-row">${renderIngredientList(candidate.missing, '바로 가능')}</div>
                </div>
              </div>
              <aside class="home-meal-menu-evidence">
                <span class="home-meal-evidence-badge">레시피 근거</span>
                ${candidate.source ? `
                  <a href="${escapeHtml(candidate.source.link)}" target="_blank" rel="noopener noreferrer">
                    <span>${escapeHtml(candidate.source.title)}</span>
                    <small>${escapeHtml(candidate.source.domain)}</small>
                  </a>
                ` : '<p>공개 레시피 근거는 찾지 못했지만, 재료 매칭 기준으로 제안했어요.</p>'}
              </aside>
            </article>
          `).join('')}
        </div>
        <p class="home-meal-source-note">${data?.usedSearch ? 'Serper로 공개 레시피 결과를 확인해 간단히 붙였습니다.' : 'Serper 근거 없이 재료 매칭 기준으로 정리했습니다.'} 쇼핑 연결은 아직 하지 않습니다.</p>
      </section>
    `;
  }

  async function requestHomeMealRecommendation(ingredients) {
    const response = await fetch('/api/homeMeal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    return response.json();
  }

  function renderHomeMealShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    container.innerHTML = `
      <section class="home-meal-panel" data-mode="${HOME_MEAL_MODE}" aria-label="디스원 집밥">
        ${global.ThisOneModeTabs?.render?.(HOME_MEAL_MODE) || ''}
        <div class="home-meal-copy">
          <p class="home-meal-main-copy">있는 재료만 말하면,</p>
          <p class="home-meal-sub-copy" id="homeMealHelperText">${HOME_MEAL_FLOWS[DEFAULT_HOME_MEAL_FLOW].helper}</p>
        </div>

        ${renderHomeMealSubTabs(DEFAULT_HOME_MEAL_FLOW)}

        <div class="ai-tool-composer home-meal-composer">
          ${global.ThisOneComposerImageInput?.render?.({ id: 'homeMealImage', label: '집밥 재료 사진' }) || ''}
          <div class="ai-tool-input home-meal-composer-top">
            <label class="home-meal-question-label" for="homeMealQuestion">재료 입력창</label>
            <textarea class="home-meal-question" id="homeMealQuestion" rows="1" aria-label="집밥 재료 입력창" placeholder="${HOME_MEAL_FLOWS[DEFAULT_HOME_MEAL_FLOW].placeholder}"></textarea>
          </div>
          <p class="ai-tool-voice-status" id="homeMealVoiceStatus" aria-live="polite" hidden></p>
          <div class="ai-tool-control-row home-meal-composer-bottom">
            <div class="ai-tool-left-controls home-meal-composer-left-actions">
              ${global.ThisOneComposerImageInput?.renderControls?.({ id: 'homeMealImage', plusClass: 'home-meal-plus-button' }) || ''}
            </div>
            <div class="ai-tool-right-controls home-meal-composer-actions">
              <button class="ai-tool-icon-button ai-tool-help-button home-meal-help-button" id="homeMealHelpButton" type="button" aria-label="집밥 안내 보기" aria-controls="homeMealHelpPanel" aria-expanded="false" title="집밥 안내">?</button>
              <button class="ai-tool-icon-button ai-tool-mic-button" id="homeMealMicButton" type="button" aria-label="음성으로 입력" title="음성으로 입력"></button>
              <button class="ai-tool-action-button home-meal-submit" id="homeMealSubmit" type="button">메뉴 고르기</button>
            </div>
          </div>
        </div>

        <div class="home-meal-help-panel" id="homeMealHelpPanel" hidden>
          <p class="home-meal-help-title">집밥 안내</p>
          <p class="home-meal-help-copy">있는 재료를 적으면 만들 수 있는 메뉴 후보와 부족한 재료를 보여드립니다.</p>
          <p class="home-meal-help-copy">레시피 근거는 간단히 붙이고, 쇼핑 연결은 아직 하지 않습니다.</p>
          <p class="home-meal-help-copy">반려동물 집밥은 별도 안전 기준이 필요합니다.</p>
        </div>
        <p class="home-meal-status" id="homeMealStatus" role="status" aria-live="polite" hidden></p>
        <div class="home-meal-result" id="homeMealResult" aria-live="polite" hidden></div>
      </section>
    `;

    const root = container.querySelector('.home-meal-panel');
    const question = root.querySelector('#homeMealQuestion');
    const submit = root.querySelector('#homeMealSubmit');
    const helpButton = root.querySelector('#homeMealHelpButton');
    const helpPanel = root.querySelector('#homeMealHelpPanel');
    const status = root.querySelector('#homeMealStatus');
    const result = root.querySelector('#homeMealResult');
    const helperText = root.querySelector('#homeMealHelperText');
    const subTabs = Array.from(root.querySelectorAll('.home-meal-sub-tab'));
    const micButton = root.querySelector('#homeMealMicButton');
    const voiceStatus = root.querySelector('#homeMealVoiceStatus');
    let stopActiveLoadingStatus = null;
    let activeHomeMealFlow = DEFAULT_HOME_MEAL_FLOW;

    function setHomeMealFlow(flow) {
      const nextFlow = HOME_MEAL_FLOWS[flow] ? flow : DEFAULT_HOME_MEAL_FLOW;
      activeHomeMealFlow = nextFlow;
      const config = HOME_MEAL_FLOWS[nextFlow];
      question.placeholder = config.placeholder;
      if (helperText) helperText.textContent = config.helper;
      subTabs.forEach((tab) => {
        const isActive = tab.dataset.homeMealFlow === nextFlow;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      stopActiveLoadingStatus?.();
      stopActiveLoadingStatus = null;
      setStatus(status, '');
      if (nextFlow === DEFAULT_HOME_MEAL_FLOW) {
        result.innerHTML = '';
        result.hidden = true;
        return;
      }
      result.hidden = false;
      result.innerHTML = renderPetMealPending(nextFlow);
      setStatus(status, config.helper);
    }

    global.ThisOneAIToolVoice?.attach?.({
      button: micButton,
      input: question,
      status: voiceStatus,
      appendMode: 'newline'
    });

    global.ThisOneModeTabs?.bind?.(root);

    const imageInput = global.ThisOneComposerImageInput?.attach?.(root, {
      id: 'homeMealImage',
      isActive: () => root.isConnected && document.body.classList.contains('home-meal-mode'),
      beforeOpen: () => setHelpPanelOpen(helpButton, helpPanel, false)
    });

    function cleanupHomeMeal() {
      stopActiveLoadingStatus?.();
      stopActiveLoadingStatus = null;
      imageInput?.cleanup?.();
      exitHomeMealMode();
    }

    global.ThisOneModeTabs?.registerCleanup?.(HOME_MEAL_MODE, cleanupHomeMeal);

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        imageInput?.closeMenu?.();
        setHelpPanelOpen(helpButton, helpPanel, false);
      }
    });

    helpButton?.addEventListener('click', () => {
      imageInput?.closeMenu?.();
      setHelpPanelOpen(helpButton, helpPanel, Boolean(helpPanel?.hidden));
    });

    subTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        imageInput?.closeMenu?.();
        setHelpPanelOpen(helpButton, helpPanel, false);
        setHomeMealFlow(tab.dataset.homeMealFlow);
      });
    });

    setHomeMealFlow(DEFAULT_HOME_MEAL_FLOW);

    submit?.addEventListener('click', async () => {
      const text = question.value.trim();
      const image = imageInput?.getFile?.() || null;
      const activeConfig = HOME_MEAL_FLOWS[activeHomeMealFlow] || HOME_MEAL_FLOWS[DEFAULT_HOME_MEAL_FLOW];
      if (!text) {
        setStatus(status, image && activeHomeMealFlow === DEFAULT_HOME_MEAL_FLOW ? '집밥 1차 기능은 텍스트 재료 입력부터 지원합니다. 재료명을 적어주세요.' : activeConfig.emptyText);
        question.focus();
        return;
      }

      if (activeHomeMealFlow !== DEFAULT_HOME_MEAL_FLOW) {
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
        result.hidden = false;
        result.innerHTML = renderPetMealPending(activeHomeMealFlow);
        setStatus(status, '반려동물 집밥은 안전 확인 기능을 준비 중이라 아직 레시피를 생성하지 않습니다.');
        return;
      }

      submit.disabled = true;
      result.hidden = false;
      result.innerHTML = '';
      stopActiveLoadingStatus?.();
      stopActiveLoadingStatus = startStagedLoadingStatus(status, HOME_MEAL_LOADING_STAGES);

      try {
        const data = await requestHomeMealRecommendation(text);
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
        result.innerHTML = renderHomeMealResult(data);
        setStatus(status, data?.message || '집밥 후보를 정리했습니다.');
      } catch (error) {
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
        result.innerHTML = '';
        result.hidden = true;
        setStatus(status, `집밥 후보를 가져오지 못했습니다. ${error.message || ''}`.trim());
      } finally {
        stopActiveLoadingStatus?.();
        stopActiveLoadingStatus = null;
        submit.disabled = false;
      }
    });
  }

  function openHomeMeal() {
    enterHomeMealMode();
    renderHomeMealShell();
  }

  global.ThisOneHomeMeal = {
    open: openHomeMeal,
    mode: HOME_MEAL_MODE
  };
})(window);
