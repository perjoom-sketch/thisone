(function (global) {
  if (global.__thisOneSearchInputToolsApplied) return;
  global.__thisOneSearchInputToolsApplied = true;

  function ensureStyle() {
    if (document.getElementById('thisoneSearchInputToolsStyle')) return;
    const style = document.createElement('style');
    style.id = 'thisoneSearchInputToolsStyle';
    style.textContent = `
      .search-box .input-row{position:relative}
      .search-tools-left{position:relative;display:flex;align-items:center;flex:0 0 auto}
      .search-plus-btn{width:45px;height:45px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:41px;line-height:1;font-weight:400;color:#334155;background:transparent;border:0;cursor:pointer}
      .search-plus-btn:hover,.search-plus-btn.is-open{background:transparent;color:#2563eb;border-color:transparent}
      .search-tools-menu{position:absolute;left:0;top:44px;min-width:168px;padding:6px;border-radius:16px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 16px 40px rgba(15,23,42,.14);z-index:30;display:none}
      .search-tools-menu.show{display:block}
      .search-tool-item{width:100%;border:0;background:transparent;padding:10px 12px;border-radius:12px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:#334155;cursor:pointer;text-align:left}
      .search-tool-item:hover{background:#f8fafc;color:#2563eb}
      .search-tool-separator{height:1px;margin:5px 6px;background:#e2e8f0}
      .footer-right .img-btn{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function isMobileLike() {
    try {
      return global.matchMedia('(max-width: 640px), (pointer: coarse)').matches;
    } catch (e) {
      return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    }
  }

  function closeMenu() {
    const wrap = document.getElementById('thisoneSearchToolsLeft');
    if (!wrap) return;
    wrap.querySelector('.search-plus-btn')?.classList.remove('is-open');
    wrap.querySelector('.search-tools-menu')?.classList.remove('show');
  }

  function toggleMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const wrap = document.getElementById('thisoneSearchToolsLeft');
    const btn = wrap?.querySelector('.search-plus-btn');
    const menu = wrap?.querySelector('.search-tools-menu');
    if (!btn || !menu) return;
    const open = !menu.classList.contains('show');
    btn.classList.toggle('is-open', open);
    menu.classList.toggle('show', open);
  }

  function openImageInput(event) {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    document.getElementById('fileInput')?.click();
  }

  function openSearchSettings(event) {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    try { global.toggleFilterModal?.(); } catch (e) {}
  }

  function renderMenuItems() {
    if (isMobileLike()) {
      return `
        <button class="search-tool-item" type="button" role="menuitem" data-tool="image"><span aria-hidden="true">🖼️</span><span>사진보관함</span></button>
        <div class="search-tool-separator" aria-hidden="true"></div>
        <button class="search-tool-item" type="button" role="menuitem" data-tool="settings"><span aria-hidden="true">⚙️</span><span>검색설정</span></button>
      `;
    }

    return `
      <button class="search-tool-item" type="button" role="menuitem" data-tool="image"><span aria-hidden="true">🖼️</span><span>이미지 업로드</span></button>
      <div class="search-tool-separator" aria-hidden="true"></div>
      <button class="search-tool-item" type="button" role="menuitem" data-tool="settings"><span aria-hidden="true">⚙️</span><span>검색설정</span></button>
    `;
  }

  function createToolsLeft() {
    const wrap = document.createElement('div');
    wrap.id = 'thisoneSearchToolsLeft';
    wrap.className = 'search-tools-left';
    wrap.innerHTML = `
      <button class="search-plus-btn" type="button" aria-label="입력 방식 선택" title="입력 방식 선택">+</button>
      <div class="search-tools-menu" role="menu">
        ${renderMenuItems()}
      </div>
    `;
    wrap.querySelector('.search-plus-btn')?.addEventListener('click', toggleMenu);
    wrap.querySelector('[data-tool="image"]')?.addEventListener('click', openImageInput);
    wrap.querySelector('[data-tool="settings"]')?.addEventListener('click', openSearchSettings);
    return wrap;
  }

  function install() {
    ensureStyle();
    const inputRow = document.querySelector('.search-box .input-row');
    const msgInput = document.getElementById('msgInput');
    if (!inputRow || !msgInput || document.getElementById('thisoneSearchToolsLeft')) return;
    inputRow.insertBefore(createToolsLeft(), msgInput);
  }

  document.addEventListener('click', (event) => {
    const wrap = document.getElementById('thisoneSearchToolsLeft');
    if (!wrap || wrap.contains(event.target)) return;
    closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  const observer = new MutationObserver(install);
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  global.addEventListener('load', install);
})(window);
