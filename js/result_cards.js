(function initResultCardsNamespace(global) {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getBadgeClass(text) {
    if (text.includes('가성비')) return 'badge-value';
    if (text.includes('신뢰')) return 'badge-trust';
    if (text.includes('추천')) return 'badge-thisone';
    return 'badge-default';
  }

  function renderPickCard(card, isFirst, options) {
    const opts = options || {};
    const hideRecommendationUi = !!opts.hideRecommendationUi;
    const imageHtml = card.image
      ? `<img class="row-img" src="${escAttr(card.image)}" alt="${escAttr(card.name || '상품')}" onerror="this.onerror=null;this.alt='';this.style.visibility='hidden';">`
      : `<div class="row-img-placeholder">상품</div>`;

    const badgesHtml = !hideRecommendationUi && Array.isArray(card.badges) && card.badges.length
      ? card.badges.map((b) => `<span class="row-badge-item ${getBadgeClass(b)}">${esc(b)}</span>`).join('')
      : '';

    const labelBadge = !hideRecommendationUi && card.label
      ? `<span class="row-badge-item row-label-badge">${esc(card.label)}</span>`
      : '';

    return `
    <a class="pick-row-link" href="${escAttr(card.link || '#')}" target="_blank" rel="noopener noreferrer">
      <article class="pick-row ${isFirst ? 'pick-row-first' : ''}">
        <div class="row-thumb">
          ${imageHtml}
        </div>

        <div class="row-info">
          <div class="row-header">
            <div class="row-title-line">
              <h3 class="row-title">${esc(card.name || '상품명 없음')}</h3>
              <div class="row-badges">
                ${labelBadge}
                ${badgesHtml}
              </div>
            </div>
          </div>

          <div class="row-meta">
            <span class="row-store-name">${esc(card.store || '판매처 정보 없음')}</span>
            <span class="row-delivery">${esc(card.delivery || '배송 정보 확인 필요')}</span>
            ${card.review ? `<span class="row-review">${esc(card.review)}</span>` : ''}
          </div>

          ${card.reason ? `<div class="row-reason-text">${esc(card.reason)}</div>` : ''}
        </div>

        <div class="row-price-area">
          <div class="row-price">${esc(card.price || '가격 정보 없음')}</div>
          <div class="row-cta">상세보기</div>
        </div>
      </article>
    </a>
  `;
  }

  function renderAiComment(aiComment) {
    const content = String(aiComment || '').trim();
    if (!content) return '';

    return `
      <details class="fold-box ai-comment-box">
        <summary>AI 코멘트</summary>
        <div class="fold-content">${esc(content)}</div>
      </details>
    `;
  }

  global.ThisOneResultCards = {
    renderPickCard,
    renderAiComment
  };
})(window);
