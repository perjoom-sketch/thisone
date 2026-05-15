(function (global) {
  'use strict';

  const INTERNAL_STORAGE_KEY = 'thisone_internal_user';
  const VISITOR_STORAGE_KEY = 'thisone_visitor_id';
  const ENDPOINT = '/api/trackEvent';
  const ALLOWED_EVENT_NAMES = new Set([
    'page_view',
    'mode_open',
    'shopping_search_submit',
    'ai_tool_submit',
    'source_click',
    'product_click'
  ]);
  const AI_SUBMIT_BUTTON_MODES = {
    documentAiSubmit: 'document-ai',
    instantAnswerSubmit: 'instant-answer',
    loveMeSubmit: 'loveme',
    homeMealSubmit: 'home-meal'
  };
  const SENSITIVE_METADATA_KEY_PATTERN = /(image|photo|base64|document|content|body|text|prompt|password|passwd|pwd|address|addr|phone|tel|rrn|resident|account)/i;
  let lastModeOpen = { mode: '', at: 0 };

  function safeLocalStorage() {
    try {
      return global.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function setInternalUser(enabled) {
    const storage = safeLocalStorage();
    if (!storage) return false;

    try {
      if (enabled) storage.setItem(INTERNAL_STORAGE_KEY, 'true');
      else storage.removeItem(INTERNAL_STORAGE_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  function isInternalUser() {
    const storage = safeLocalStorage();
    if (!storage) return false;

    try {
      return storage.getItem(INTERNAL_STORAGE_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }


  function createVisitorId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
    } catch (error) {
      // Fall through to anonymous random string fallback.
    }

    return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function getVisitorId() {
    const storage = safeLocalStorage();
    if (!storage) return createVisitorId();

    try {
      const existing = limitString(storage.getItem(VISITOR_STORAGE_KEY), 80);
      if (existing) return existing;

      const visitorId = createVisitorId();
      storage.setItem(VISITOR_STORAGE_KEY, visitorId);
      return visitorId;
    } catch (error) {
      return createVisitorId();
    }
  }

  function limitString(value, maxLength) {
    return String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function sanitizeQuery(value) {
    return limitString(value, 500)
      .replace(/\b\d{6}-?\d{7}\b/g, '[removed-id]')
      .replace(/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[removed-phone]')
      .replace(/\b\d{4,}([-.\s]?\d{2,}){1,}\b/g, '[removed-number]')
      .replace(/\b\d{7,}\b/g, '[removed-number]')
      .replace(/\b(?:password|passwd|pwd|비밀번호)\s*[:=]\s*\S+/gi, '[removed-password]')
      .replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, '[removed-base64]')
      .replace(/[가-힣A-Za-z0-9\s.-]+(?:시|도)\s+[가-힣A-Za-z0-9\s.-]+(?:구|군)\s+[가-힣A-Za-z0-9\s.-]+(?:로|길)(?:\s*\d+[가-힣A-Za-z0-9\s.-]*)?/g, '[removed-address]')
      .replace(/\b\d{1,6}\s+[A-Za-z0-9 .'-]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\b/gi, '[removed-address]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  function sanitizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;

    const output = {};
    Object.entries(metadata).slice(0, 20).forEach(([rawKey, rawValue]) => {
      const key = limitString(rawKey, 40);
      if (!key || SENSITIVE_METADATA_KEY_PATTERN.test(key)) return;

      if (rawValue === null || rawValue === undefined) {
        output[key] = null;
      } else if (typeof rawValue === 'boolean') {
        output[key] = rawValue;
      } else if (typeof rawValue === 'number') {
        output[key] = Number.isFinite(rawValue) ? rawValue : null;
      } else if (typeof rawValue === 'string') {
        output[key] = sanitizeQuery(rawValue).slice(0, 160);
      }
    });

    return Object.keys(output).length ? output : undefined;
  }

  function getPath() {
    try {
      return `${global.location.pathname || '/'}${global.location.search || ''}`.slice(0, 120);
    } catch (error) {
      return '/';
    }
  }

  function buildEvent(eventName, payload) {
    const name = limitString(eventName, 60);
    if (!ALLOWED_EVENT_NAMES.has(name)) return null;

    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const event = {
      eventName: name,
      isInternal: isInternalUser(),
      visitorId: getVisitorId(),
      timestamp: new Date().toISOString(),
      path: getPath()
    };

    const mode = limitString(safePayload.mode, 40);
    if (mode) event.mode = mode;

    const query = sanitizeQuery(safePayload.query);
    if (query) event.query = query;

    const metadata = sanitizeMetadata(safePayload.metadata);
    if (metadata) event.metadata = metadata;

    return event;
  }

  function sendEvent(event) {
    if (!event || typeof global.fetch !== 'function') return;

    try {
      const body = JSON.stringify(event);
      global.fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: body.length < 60000
      }).catch(() => {});
    } catch (error) {
      // Tracking must never block or surface errors to users.
    }
  }

  function track(eventName, payload) {
    const event = buildEvent(eventName, payload);
    sendEvent(event);
  }


  function getCurrentMode() {
    const activeMode = global.ThisOneModeTabs?.getActiveMode?.();
    return limitString(activeMode, 40) || 'unknown';
  }

  function trackPageView() {
    if (global.document?.__thisonePageViewTracked) return;
    if (global.document) global.document.__thisonePageViewTracked = true;
    track('page_view', {
      mode: getCurrentMode(),
      metadata: { path: getPath() }
    });
  }

  function trackModeOpen(mode) {
    const safeMode = limitString(mode, 40) || 'shopping';
    const now = Date.now();
    if (lastModeOpen.mode === safeMode && now - lastModeOpen.at < 800) return;
    lastModeOpen = { mode: safeMode, at: now };
    track('mode_open', { mode: safeMode, metadata: { mode: safeMode } });
  }

  function wrapModeTabs() {
    const tabs = global.ThisOneModeTabs;
    if (!tabs || typeof tabs.open !== 'function' || tabs.__thisoneEventTrackerWrapped) return;

    const originalOpen = tabs.open.bind(tabs);
    tabs.open = function trackedOpen(mode) {
      const before = typeof tabs.getActiveMode === 'function' ? tabs.getActiveMode() : '';
      const result = originalOpen(mode);
      const after = typeof tabs.getActiveMode === 'function' ? tabs.getActiveMode() : mode;
      if (after && after !== before) trackModeOpen(after);
      return result;
    };
    tabs.__thisoneEventTrackerWrapped = true;
  }

  function modeFromElement(element) {
    const root = element?.closest?.('[data-mode]');
    return root?.dataset?.mode || '';
  }

  function domainFromUrl(href) {
    try {
      return new URL(href, global.location.href).hostname.replace(/^www\./, '').slice(0, 80);
    } catch (error) {
      return '';
    }
  }

  function bindDelegatedTracking() {
    if (!global.document || global.document.__thisoneEventTrackerBound) return;
    global.document.__thisoneEventTrackerBound = true;

    global.document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const aiButton = target.closest('button');
      const aiMode = aiButton?.id ? AI_SUBMIT_BUTTON_MODES[aiButton.id] : '';
      if (aiMode) {
        track('ai_tool_submit', { mode: aiMode, metadata: { mode: aiMode } });
        return;
      }

      if (target.closest('#sendBtn')) {
        const input = global.document.getElementById('msgInput');
        const query = input?.value || '';
        const hasImage = Boolean(global.document.querySelector('#imgPreview.show, [data-shopping-image-preview].show'));
        if (query.trim() || hasImage) {
          track('shopping_search_submit', {
            mode: 'shopping',
            query,
            metadata: { mode: 'shopping' }
          });
        }
        return;
      }

      const sourceLink = target.closest('a[href]');
      if (sourceLink && sourceLink.closest('.instant-answer-sources, .document-ai-sources, .home-meal-sources, .loveme-sources, .web-search-results')) {
        const mode = modeFromElement(sourceLink) || global.ThisOneModeTabs?.getActiveMode?.() || '';
        track('source_click', {
          mode,
          metadata: { mode, domain: domainFromUrl(sourceLink.href) }
        });
        return;
      }

      const productLink = target.closest('a[href]');
      if (productLink && productLink.closest('.pick-row-link, .product-card, .result-card, .product-row, .result-row, [data-product-id], [data-product-url]')) {
        track('product_click', {
          mode: 'shopping',
          metadata: { mode: 'shopping', domain: domainFromUrl(productLink.href) }
        });
      }
    }, true);

    global.document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target.id === 'msgInput' && target.value?.trim?.()) {
        track('shopping_search_submit', {
          mode: 'shopping',
          query: target.value,
          metadata: { mode: 'shopping' }
        });
      }
    }, true);
  }

  global.ThisOneEventTracker = {
    setInternalUser,
    isInternalUser,
    getVisitorId,
    track,
    _private: {
      sanitizeQuery,
      buildEvent,
      trackModeOpen,
      trackPageView
    }
  };

  wrapModeTabs();
  bindDelegatedTracking();
  trackPageView();
})(window);
