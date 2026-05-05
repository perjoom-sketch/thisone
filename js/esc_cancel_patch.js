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

(function loadInquiryManagerScript() {
  if (document.getElementById('thisoneInquiryManagerScript')) return;
  const script = document.createElement('script');
  script.id = 'thisoneInquiryManagerScript';
  script.src = 'js/inquiry_manager.js?v=3.4.5';
  script.defer = true;
  document.head.appendChild(script);
})();

(function loadVoiceSearchScript() {
  if (document.getElementById('thisoneVoiceSearchScript')) return;
  const script = document.createElement('script');
  script.id = 'thisoneVoiceSearchScript';
  script.src = 'js/voice_search.js?v=3.4.5';
  script.defer = true;
  document.head.appendChild(script);
})();
