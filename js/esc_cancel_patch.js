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

(function applyInquiryDeletePatch(global) {
  if (global.__thisOneInquiryDeletePatchApplied) return;
  global.__thisOneInquiryDeletePatchApplied = true;

  function addDeleteButtons() {
    const inquiries = Array.isArray(global._inquiryCache) ? global._inquiryCache : [];
    inquiries.forEach((inq) => {
      const id = String(inq && inq.id || '');
      if (!id) return;
      const area = document.getElementById('inqContent_' + id);
      if (!area || area.querySelector('[data-thisone-delete-inquiry="true"]')) return;

      const row = area.querySelector('.action-row.right');
      if (!row) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.dataset.thisoneDeleteInquiry = 'true';
      btn.textContent = '삭제하기';
      btn.style.cssText = 'padding: 8px 16px; font-size: 12px; color: #dc2626; border-color: #fecaca; background: #fff5f5;';
      btn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        global.ThisOneUI?.deleteInquiry?.(id);
      };

      row.insertBefore(btn, row.firstChild);
    });
  }

  async function deleteInquiry(id) {
    const item = (global._inquiryCache || []).find((inq) => String(inq.id) === String(id));
    if (!item) {
      alert('삭제할 글을 찾을 수 없습니다.');
      return;
    }

    const key = prompt('글 작성 시 설정한 비밀번호를 입력해주세요.');
    if (!key) return;

    const title = String(item.title || '이 글');
    if (!confirm(`정말 삭제할까요?\n\n${title}`)) return;

    try {
      const res = await fetch('/api/inquiry', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: key })
      });
      const result = await res.json().catch(() => ({}));

      if (res.ok && result.status === 'success') {
        alert('문의가 삭제되었습니다.');
        global._inquiryCache = (global._inquiryCache || []).filter((inq) => String(inq.id) !== String(id));
        const area = document.getElementById('inqContent_' + id);
        const itemEl = area && area.closest('.inquiry-item');
        if (itemEl) itemEl.remove();
        if (global.ThisOneUI?.openInquiryBoard) global.ThisOneUI.openInquiryBoard();
      } else {
        alert('삭제 실패: ' + (result.message || '비밀번호를 확인해주세요.'));
      }
    } catch (err) {
      console.error('[Inquiry] Delete failed:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  }

  function installDeletePatch() {
    if (!global.ThisOneUI) return;
    global.ThisOneUI.deleteInquiry = deleteInquiry;

    if (typeof global.ThisOneUI.openInquiryBoard === 'function' && !global.ThisOneUI.openInquiryBoard.__deletePatchApplied) {
      const originalOpenInquiryBoard = global.ThisOneUI.openInquiryBoard;
      const patchedOpenInquiryBoard = function patchedOpenInquiryBoard() {
        const result = originalOpenInquiryBoard.apply(this, arguments);
        setTimeout(addDeleteButtons, 0);
        setTimeout(addDeleteButtons, 300);
        setTimeout(addDeleteButtons, 900);
        return result;
      };
      patchedOpenInquiryBoard.__deletePatchApplied = true;
      global.ThisOneUI.openInquiryBoard = patchedOpenInquiryBoard;
    }

    addDeleteButtons();
  }

  const observer = new MutationObserver(() => {
    installDeletePatch();
    addDeleteButtons();
  });

  function start() {
    installDeletePatch();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  global.addEventListener('load', start);
})(window);
