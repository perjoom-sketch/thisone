(function applySearchHelpModal(global) {
  if (global.__thisOneSearchHelpModalApplied) return;
  global.__thisOneSearchHelpModalApplied = true;

  const HELP_SECTIONS = [
    {
      title: '[1] 가격 비교',
      description: '같은 카테고리에서 가격이 합리적인 후보를 찾을 때',
      examples: ['공기청정기', '정수기', '마우스']
    },
    {
      title: '[2] 평수·사이즈 명시',
      description: '공간이나 용도가 분명할 때 더 정확한 후보가 나옵니다',
      examples: ['30평 공기청정기', '1인 가구 정수기', '사무실용 프린터']
    },
    {
      title: '[3] 렌탈 비교',
      description: '관리형 렌탈 후보를 함께 비교할 때',
      examples: ['정수기 렌탈', '공기청정기 렌탈', '비데 렌탈']
    },
    {
      title: '[4] 모델명 검색',
      description: '특정 모델의 가격대를 확인할 때',
      examples: ['삼성 SL-M2030', '로보락 Q8']
    },
    {
      title: '[5] 부속·액세서리',
      description: '본체가 아닌 소모품·부품을 찾을 때',
      examples: ['공기청정기 필터', '로보락 메인브러시', '프린터 토너']
    }
  ];

  function getInput() {
    return document.getElementById('msgInput');
  }

  function createHelpButton() {
    const btn = document.createElement('button');
    btn.className = 'icon-btn search-help-btn';
    btn.id = 'searchHelpBtn';
    btn.type = 'button';
    btn.title = '검색 예시 보기';
    btn.setAttribute('aria-label', '검색 예시 보기');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.textContent = '?';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSearchHelpModal();
    });
    return btn;
  }

  function createSection(section) {
    const wrap = document.createElement('section');
    wrap.className = 'search-help-section';

    const title = document.createElement('h4');
    title.textContent = section.title;
    wrap.appendChild(title);

    const description = document.createElement('p');
    description.textContent = section.description;
    wrap.appendChild(description);

    const list = document.createElement('ul');
    list.className = 'search-help-examples';
    section.examples.forEach((example) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'search-help-example';
      button.type = 'button';
      button.textContent = `- ${example}`;
      button.dataset.example = example;
      button.addEventListener('click', () => selectSearchExample(example));
      item.appendChild(button);
      list.appendChild(item);
    });
    wrap.appendChild(list);

    return wrap;
  }

  function createModal() {
    const overlay = document.createElement('div');
    overlay.className = 'search-help-overlay';
    overlay.id = 'searchHelpModal';
    overlay.hidden = true;
    overlay.setAttribute('role', 'presentation');

    const dialog = document.createElement('div');
    dialog.className = 'search-help-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'searchHelpTitle');

    const header = document.createElement('div');
    header.className = 'search-help-header';

    const title = document.createElement('h3');
    title.className = 'search-help-title';
    title.id = 'searchHelpTitle';
    title.textContent = '디스원 검색 예시';

    const xBtn = document.createElement('button');
    xBtn.className = 'close-btn';
    xBtn.type = 'button';
    xBtn.title = '닫기';
    xBtn.setAttribute('aria-label', '검색 예시 닫기');
    xBtn.textContent = '✕';
    xBtn.addEventListener('click', closeSearchHelpModal);

    header.appendChild(title);
    header.appendChild(xBtn);

    const body = document.createElement('div');
    body.className = 'search-help-body';
    HELP_SECTIONS.forEach((section) => body.appendChild(createSection(section)));

    const footer = document.createElement('div');
    footer.className = 'search-help-footer';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'search-help-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '닫기';
    closeBtn.addEventListener('click', closeSearchHelpModal);
    footer.appendChild(closeBtn);

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeSearchHelpModal();
    });

    return overlay;
  }

  function ensureModal() {
    let modal = document.getElementById('searchHelpModal');
    if (!modal) {
      modal = createModal();
      document.body.appendChild(modal);
    }
    return modal;
  }

  function ensureHelpButton() {
    const existing = document.getElementById('searchHelpBtn');
    if (existing) return existing;

    const footerRight = document.querySelector('.search-box .footer-right');
    if (!footerRight) return null;

    const btn = createHelpButton();
    const micBtn = document.getElementById('micBtn');
    const sendBtn = document.getElementById('sendBtn');
    footerRight.insertBefore(btn, micBtn || sendBtn || null);
    return btn;
  }

  function selectSearchExample(example) {
    const input = getInput();
    if (input) {
      input.value = example;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      try { global.autoResize?.(input); } catch (e) {}
      input.focus();
    }
    closeSearchHelpModal();
  }

  function openSearchHelpModal() {
    const modal = ensureModal();
    modal.hidden = false;
    const button = document.getElementById('searchHelpBtn');
    if (button) button.setAttribute('aria-expanded', 'true');
    modal.querySelector('.search-help-close')?.focus();
  }

  function closeSearchHelpModal() {
    const modal = document.getElementById('searchHelpModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    const button = document.getElementById('searchHelpBtn');
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      button.focus();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') closeSearchHelpModal();
  }

  function install() {
    ensureHelpButton();
    ensureModal();
  }

  global.openSearchHelpModal = openSearchHelpModal;
  global.closeSearchHelpModal = closeSearchHelpModal;

  document.addEventListener('keydown', handleKeydown);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  const observer = new MutationObserver(install);
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  global.addEventListener('load', install);
})(window);
