(function applyEscCancelPatch(global) {
  if (global.__thisOneEscCancelPatchApplied) return;
  global.__thisOneEscCancelPatchApplied = true;

  let activeController = null;
  const originalFetch = global.fetch.bind(global);

  function isSearchApiRequest(input) {
    const url = typeof input === 'string'
      ? input
      : (input && input.url ? input.url : '');
    return /\/api\/(search|chat|intentInfer)(\?|$)/.test(String(url));
  }

  function createCombinedSignal(signalA, signalB) {
    if (!signalA) return signalB;
    if (!signalB) return signalA;

    const controller = new AbortController();
    const abort = () => {
      if (!controller.signal.aborted) controller.abort();
    };

    if (signalA.aborted || signalB.aborted) {
      abort();
    } else {
      signalA.addEventListener('abort', abort, { once: true });
      signalB.addEventListener('abort', abort, { once: true });
    }

    return controller.signal;
  }

  function ensureController() {
    if (!activeController || activeController.signal.aborted) {
      activeController = new AbortController();
      global.__thisOneSearchAbortController = activeController;
    }
    return activeController;
  }

  global.fetch = function patchedThisOneFetch(input, options = {}) {
    const shouldAttach = isSearchApiRequest(input);
    if (!shouldAttach) return originalFetch(input, options);

    const controller = ensureController();
    const nextOptions = {
      ...options,
      signal: createCombinedSignal(options && options.signal, controller.signal)
    };

    return originalFetch(input, nextOptions);
  };

  function resetSearchUiAfterAbort() {
    try { loading = false; } catch (e) {}

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = false;

    try { window.ThisOneSearchDropdown?.setResultsRendering?.(false); } catch (e) {}
    try { window.ThisOneSearchDropdown?.hideAndLockRecentSearches?.(); } catch (e) {}
    try { window.ThisOneSearchDropdown?.blurSearchInput?.(); } catch (e) {}

    const thinkingSelectors = [
      '.thinking',
      '.typing',
      '.typing-indicator',
      '.ai-thinking',
      '.analysis-loading',
      '.loading-card',
      '.progress-card',
      '[data-thinking]',
      '[data-loading]'
    ];

    thinkingSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        const text = String(el.textContent || '');
        if (/분석|검색|생성|기다|로딩|중입니다|진행/i.test(text) || el.matches('[data-thinking], [data-loading]')) {
          el.remove();
        }
      });
    });

    try { window.ThisOneUI?.purgeProgressLeak?.(); } catch (e) {}
  }

  function cancelSearch(reason = 'esc') {
    const isLoading = (() => {
      try { return !!loading; } catch (e) { return false; }
    })();

    if (!isLoading && (!activeController || activeController.signal.aborted)) return;

    if (activeController && !activeController.signal.aborted) {
      activeController.abort();
    }

    activeController = new AbortController();
    global.__thisOneSearchAbortController = activeController;
    resetSearchUiAfterAbort();

    console.debug('[ThisOne][esc-cancel]', 'search aborted', { reason });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancelSearch('escape-key');
  }, true);

  global.ThisOneCancelSearch = cancelSearch;
})(window);

(function applyInquiryTextAlignPatch() {
  if (document.getElementById('thisoneInquiryTextAlignPatch')) return;
  const style = document.createElement('style');
  style.id = 'thisoneInquiryTextAlignPatch';
  style.textContent = `
    #inquiryModal .inq-body {
      text-align: left !important;
      white-space: pre-line;
      word-break: keep-all;
    }
  `;
  document.head.appendChild(style);
})();

(function applyInquiryManagerPatch(global) {
  if (global.__thisOneInquiryManagerPatchApplied) return;
  global.__thisOneInquiryManagerPatchApplied = true;

  const STORAGE_KEY = 'thisone_inquiry_manager_key';

  function getManagerKey() {
    try { return String(sessionStorage.getItem(STORAGE_KEY) || '').trim(); } catch (e) { return ''; }
  }

  function setManagerKey(value) {
    try { sessionStorage.setItem(STORAGE_KEY, String(value || '').trim()); } catch (e) {}
  }

  function clearManagerKey() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function getActionKey() {
    const managerKey = getManagerKey();
    if (managerKey) return managerKey;
    return prompt('글 작성 시 설정한 비밀번호를 입력해주세요.');
  }

  async function verifyManagerKey(key) {
    const res = await fetch('/api/inquiry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'manager_check', password: key })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.status !== 'success') {
      throw new Error(result.message || '관리자 키가 일치하지 않습니다.');
    }
    return true;
  }

  function addManagerButton() {
    const modal = document.getElementById('inquiryModal');
    const header = modal && modal.querySelector('.modal-header');
    if (!header || header.querySelector('#thisoneInquiryManagerBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'thisoneInquiryManagerBtn';
    btn.type = 'button';
    btn.className = 'btn btn-secondary';
    btn.style.cssText = 'margin-left:auto;margin-right:10px;padding:7px 12px;font-size:12px;border-radius:999px;';

    function render() {
      const on = !!getManagerKey();
      btn.textContent = on ? '관리자 ON' : '관리자';
      btn.style.background = on ? '#0f172a' : '#f8fafc';
      btn.style.color = on ? '#fff' : '#334155';
    }

    btn.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (getManagerKey()) {
        if (confirm('관리자 모드를 해제할까요?')) clearManagerKey();
        render();
        return;
      }
      const key = prompt('관리자 키를 입력해주세요.');
      if (!key) return;
      btn.disabled = true;
      btn.textContent = '확인 중...';
      try {
        await verifyManagerKey(key);
        setManagerKey(key);
        render();
        alert('관리자 모드가 켜졌습니다.');
      } catch (err) {
        clearManagerKey();
        render();
        alert('관리자 모드 실패: ' + (err.message || '관리자 키를 확인해주세요.'));
      } finally {
        btn.disabled = false;
      }
    };

    const closeBtn = header.querySelector('.close-btn');
    if (closeBtn) header.insertBefore(btn, closeBtn);
    else header.appendChild(btn);
    render();
  }

  function addButtons() {
    const inquiries = Array.isArray(global._inquiryCache) ? global._inquiryCache : [];
    inquiries.forEach((inq) => {
      const id = String(inq && inq.id || '');
      if (!id) return;

      const area = document.getElementById('inqContent_' + id);
      if (!area) return;
      const row = area.querySelector('.action-row.right');
      if (!row) return;

      if (!row.querySelector('[data-thisone-reset-password="true"]')) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'btn btn-secondary';
        resetBtn.dataset.thisoneResetPassword = 'true';
        resetBtn.textContent = '비번 재설정';
        resetBtn.style.cssText = 'padding:8px 16px;font-size:12px;color:#334155;border-color:#cbd5e1;background:#f8fafc;';
        resetBtn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          resetPassword(id);
        };
        row.insertBefore(resetBtn, row.firstChild);
      }

      if (!row.querySelector('[data-thisone-delete-inquiry="true"]')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-secondary';
        deleteBtn.dataset.thisoneDeleteInquiry = 'true';
        deleteBtn.textContent = '삭제하기';
        deleteBtn.style.cssText = 'padding:8px 16px;font-size:12px;color:#dc2626;border-color:#fecaca;background:#fff5f5;';
        deleteBtn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteInquiry(id);
        };
        row.insertBefore(deleteBtn, row.firstChild);
      }
    });
  }

  async function deleteInquiry(id) {
    const item = (global._inquiryCache || []).find((inq) => String(inq.id) === String(id));
    if (!item) return alert('삭제할 글을 찾을 수 없습니다.');

    const password = getActionKey();
    if (!password) return;

    const title = String(item.title || '이 글');
    if (!confirm('정말 삭제할까요?\n\n' + title)) return;

    try {
      const res = await fetch('/api/inquiry', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password })
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.status === 'success') {
        alert('문의가 삭제되었습니다.');
        const area = document.getElementById('inqContent_' + id);
        const itemEl = area && area.closest('.inquiry-item');
        if (itemEl) itemEl.remove();
      } else {
        alert('삭제 실패: ' + (result.message || '비밀번호를 확인해주세요.'));
      }
    } catch (err) {
      console.error('[Inquiry] Delete failed:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  }

  async function resetPassword(id) {
    const managerKey = getManagerKey() || prompt('관리자 키를 입력해주세요.');
    if (!managerKey) return;

    const newPassword = prompt('새 글 비밀번호를 입력해주세요.');
    if (!newPassword) return;
    if (String(newPassword).trim().length < 4) return alert('새 비밀번호는 4자리 이상 입력해주세요.');

    try {
      const res = await fetch('/api/inquiry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: managerKey, newPassword: String(newPassword).trim() })
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.status === 'success') {
        setManagerKey(managerKey);
        alert('글 비밀번호가 새로 설정되었습니다.');
      } else {
        if (result.message && result.message.includes('관리자')) clearManagerKey();
        alert('비밀번호 재설정 실패: ' + (result.message || '관리자 키를 확인해주세요.'));
      }
    } catch (err) {
      console.error('[Inquiry] Password reset failed:', err);
      alert('비밀번호 재설정 중 오류가 발생했습니다.');
    }
  }

  function patchEdit() {
    if (!global.ThisOneUI || global.ThisOneUI.prepareEdit?.__managerPatchApplied) return;
    const patchedPrepareEdit = function(id) {
      const item = (global._inquiryCache || []).find((inq) => String(inq.id) === String(id));
      if (!item) return alert('데이터를 찾을 수 없습니다.');
      const password = getActionKey();
      if (!password) return;
      global._editModeId = id;
      const titleEl = document.getElementById('inqTitle');
      const authorEl = document.getElementById('inqAuthor');
      const contentEl = document.getElementById('inqContent');
      const passwordEl = document.getElementById('inqPassword');
      if (titleEl) titleEl.value = item.title || '';
      if (authorEl) authorEl.value = item.author || '익명';
      if (contentEl) contentEl.value = item.content || '';
      if (passwordEl) passwordEl.value = password;
      global.ThisOneUI.showInquiryForm?.();
      const submitBtn = document.getElementById('inqSubmitBtn');
      if (submitBtn) submitBtn.textContent = '수정 완료';
    };
    patchedPrepareEdit.__managerPatchApplied = true;
    global.ThisOneUI.prepareEdit = patchedPrepareEdit;
  }

  function install() {
    addManagerButton();
    addButtons();
    patchEdit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  const observer = new MutationObserver(install);
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  global.addEventListener('load', install);
})(window);
