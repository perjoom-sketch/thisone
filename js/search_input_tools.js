(function applySearchInputTools(global) {
  if (global.__thisOneSearchInputToolsApplied) return;
  global.__thisOneSearchInputToolsApplied = true;

  function ensureStyle() {
    if (document.getElementById('thisoneSearchInputToolsStyle')) return;

    const style = document.createElement('style');
    style.id = 'thisoneSearchInputToolsStyle';
    style.textContent = `
      .search-box .input-row {
        position: relative;
      }

      .search-tools-left {
        position: relative;
        display: flex;
        align-items: center;
        flex: 0 0 auto;
      }

      .search-plus-btn {
        width: 36px;
        height: 36px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        line-height: 1;
        font-weight: 400;
        color: #334155;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        cursor: pointer;
      }

      .search-plus-btn:hover,
      .search-plus-btn.is-open {
        background: #eef2ff;
        color: #2563eb;
        border-color: #c7d2fe;
      }

      .search-tools-menu {
        position: absolute;
        left: 0;
        bottom: 44px;
        min-width: 150px;
        padding: 6px;
        border-radius: 16px;
        background: #fff;
        border: 1px solid #e2e8f0;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14);
        z-index: 30;
        display: none;
      }

      .search-tools-menu.show {
        display: block;
      }

      .search-tool-item {
        width: 100%;
        border: 0;
        background: transparent;
        padding: 10px 12px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 700;
        color: #334155;
        cursor: pointer;
        text-align: left;
      }

      .search-tool-item:hover {
        background: #f8fafc;
        color: #2563eb;
      }

      .footer-right .img-btn {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function closeMenu() {
    const wrap = document.getElementById('thisoneSearchToolsLeft');
    if (!wrap) return;
    const btn = wrap.querySelector('.search-plus-btn');
    const menu = wrap.querySelector('.search-tools-menu');
    btn?.classList.remove('is-open');
    menu?.classList.remove('show');
  }

  function toggleMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const wrap = document.getElementById('thisoneSearchToolsLeft');
    if (!wrap) return;
    const btn = wrap.querySelector('.search-plus-btn');
    const menu = wrap.querySelector('.search-tools-menu');
    const nextOpen = !menu?.classList.contains('show');
    btn?.classList.toggle('is-open', nextOpen);
    menu?.classList.toggle('show', nextOpen);
  }

  function openImageInput(event) {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.click();
  }

  function createToolsLeft() {
    const wrap = document.createElement('div');
    wrap.id = 'thisoneSearchToolsLeft';
    wrap.className = 'search-tools-left';
    wrap.innerHTML = `
      <button class="search-plus-btn" type="button" aria-label="입력 방식 선택" title="입력 방식 선택">+</button>
      <div class="search-tools-menu" role="menu">
        <button class="search-tool-item" type="button" role="menuitem" data-tool="image">
          <span aria-hidden="true">📷</span>
          <span>이미지로 검색</span>
        </button>
      </div>
    `;
    wrap.querySelector('.search-plus-btn')?.addEventListener('click', toggleMenu);
    wrap.querySelector('[data-tool="image"]')?.addEventListener('click', openImageInput);
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
