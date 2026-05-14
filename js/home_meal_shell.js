(function (global) {
  const HOME_MEAL_MODE = 'home-meal';

  /**
   * Future source-backed 집밥 flow:
   * user-provided ingredients stay the primary evidence layer.
   * Public recipe/cooking/safety information will be added only as a later public evidence layer.
   * user ingredients / fridge photo
   * → safe ingredient summary
   * → Serper public recipe/context search
   * → AI menu candidates
   * → missing ingredients
   * → shopping search connection
   *
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

  function setStatus(element, message) {
    if (!element) return;
    element.textContent = message || '';
    element.hidden = !message;
  }

  function setHelpPanelOpen(helpButton, helpPanel, isOpen) {
    if (!helpButton || !helpPanel) return;
    helpPanel.hidden = !isOpen;
    helpButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function renderHomeMealShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    container.innerHTML = `
      <section class="home-meal-panel" data-mode="${HOME_MEAL_MODE}" aria-label="디스원 집밥">
        ${global.ThisOneModeTabs?.render?.(HOME_MEAL_MODE) || ''}
        <div class="home-meal-copy">
          <p class="home-meal-main-copy">있는 재료만 말하면,</p>
          <p class="home-meal-sub-copy">오늘 집밥을 골라드립니다.</p>
        </div>

        <div class="ai-tool-composer home-meal-composer">
          ${global.ThisOneComposerImageInput?.render?.({ id: 'homeMealImage', label: '집밥 재료 사진' }) || ''}
          <div class="ai-tool-input home-meal-composer-top">
            <label class="home-meal-question-label" for="homeMealQuestion">재료 입력창</label>
            <textarea class="home-meal-question" id="homeMealQuestion" rows="1" aria-label="집밥 재료 입력창" placeholder="냉장고에 있는 재료를 적어보세요. 예: 돼지고기, 양파, 계란"></textarea>
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
          <p class="home-meal-help-copy">있는 재료를 적으면 만들 수 있는 집밥 후보를 골라드릴 예정입니다.</p>
          <p class="home-meal-help-copy">없는 재료는 나중에 쇼핑검색으로 연결할 수 있습니다.</p>
          <p class="home-meal-help-copy">반려동물 집밥은 별도 안전 기준이 필요합니다.</p>
        </div>
        <p class="home-meal-status" id="homeMealStatus" role="status" aria-live="polite" hidden></p>
      </section>
    `;

    const root = container.querySelector('.home-meal-panel');
    const question = root.querySelector('#homeMealQuestion');
    const submit = root.querySelector('#homeMealSubmit');
    const helpButton = root.querySelector('#homeMealHelpButton');
    const helpPanel = root.querySelector('#homeMealHelpPanel');
    const status = root.querySelector('#homeMealStatus');
    const micButton = root.querySelector('#homeMealMicButton');
    const voiceStatus = root.querySelector('#homeMealVoiceStatus');

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

    submit?.addEventListener('click', () => {
      const text = question.value.trim();
      const image = imageInput?.getFile?.() || null;
      if (!text && !image) {
        setStatus(status, '재료를 입력하거나 사진을 올려주세요.');
        question.focus();
        return;
      }

      setStatus(status, '집밥 추천 기능은 준비 중입니다. 곧 재료 기반으로 메뉴를 골라드릴게요.');
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
