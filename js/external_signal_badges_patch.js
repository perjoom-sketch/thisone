// js/external_signal_badges_patch.js
// Keep external signal badges visible even when recommendation UI is hidden.
(function installExternalSignalBadgesPatch(global) {
  if (global.__thisOneExternalSignalBadgesPatchInstalled) return;
  global.__thisOneExternalSignalBadgesPatchInstalled = true;

  function escAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function splitReasonList(value) {
    if (Array.isArray(value)) return value.map(compactText).filter(Boolean);
    return String(value || '')
      .split(/[,\n]/g)
      .map(compactText)
      .filter(Boolean);
  }

  function isYoutubeDisplayText(text) {
    return /youtube|유튜브/i.test(String(text || ''));
  }

  function hasYoutubeSignal(card) {
    const youtubeTextSources = [
      card?.label,
      ...(Array.isArray(card?.badges) ? card.badges : []),
      ...(Array.isArray(card?.positiveSignals) ? card.positiveSignals : []),
      ...splitReasonList(card?.bonusReasons),
      ...splitReasonList(card?.youtubeReasons)
    ];

    return !!(
      card?.youtubeReputation ||
      card?.youtubeReasons ||
      card?.youtubeVideoCount ||
      card?.youtubeAnalyzedVideoCount ||
      youtubeTextSources.some(isYoutubeDisplayText)
    );
  }

  function renderYoutubeReputationBadge(card) {
    if (!hasYoutubeSignal(card)) return '';
    return '<span class="row-badge-item badge-trust row-youtube-badge" title="YouTube 평판 데이터 반영">YouTube 평판</span>';
  }

  function patchRenderer() {
    const cards = global.ThisOneResultCards;
    if (!cards || typeof cards.renderPickCard !== 'function' || cards.__externalSignalBadgesPatched) return;

    const originalRenderPickCard = cards.renderPickCard;
    cards.renderPickCard = function renderPickCardWithExternalSignals(card, isFirst, options) {
      let html = originalRenderPickCard.call(this, card, isFirst, options);
      if (!options?.hideRecommendationUi) return html;
      if (String(html || '').includes('row-youtube-badge')) return html;

      const youtubeBadge = renderYoutubeReputationBadge(card);
      if (!youtubeBadge) return html;

      return String(html).replace(
        /(<div class="row-badges">\s*)/,
        `$1${youtubeBadge}`
      );
    };
    cards.__externalSignalBadgesPatched = true;
  }

  patchRenderer();
  if (global.document?.addEventListener) {
    global.document.addEventListener('DOMContentLoaded', patchRenderer);
  }
})(window);
