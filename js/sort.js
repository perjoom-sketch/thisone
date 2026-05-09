(function(global){
  function normalizeSortMode(sortOrMode){
    if(sortOrMode==='relevant'||sortOrMode==='low'||sortOrMode==='high') return sortOrMode;
    return 'relevant';
  }

  function sortCandidatesByMode(candidates = [], mode = 'relevant') {
    const list = Array.isArray(candidates) ? [...candidates] : [];
    const sortMode = normalizeSortMode(mode);

    if (sortMode === 'low') {
      return list.sort((a, b) => {
        const ap = Number(a.totalPriceNum || a.priceNum || 0);
        const bp = Number(b.totalPriceNum || b.priceNum || 0);
        if (ap && bp && ap !== bp) return ap - bp;
        if (ap && !bp) return -1;
        if (!ap && bp) return 1;
        return Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0);
      });
    }

    if (sortMode === 'high') {
      return list.sort((a, b) => {
        const ap = Number(a.totalPriceNum || a.priceNum || 0);
        const bp = Number(b.totalPriceNum || b.priceNum || 0);
        if (ap && bp && ap !== bp) return bp - ap;
        if (ap && !bp) return -1;
        if (!ap && bp) return 1;
        return Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0);
      });
    }

    return list.sort((a, b) => {
      const at = Number(a.totalScore ?? a.finalScore ?? 0);
      const bt = Number(b.totalScore ?? b.finalScore ?? 0);
      if (bt !== at) return bt - at;
      const ap = Number(a.totalPriceNum || a.priceNum || 0);
      const bp = Number(b.totalPriceNum || b.priceNum || 0);
      if (ap && bp) return ap - bp;
      return 0;
    });
  }

  function getGeneralSortMode(){
    if(global.GeneralSearchState&&global.GeneralSearchState.sortMode) return normalizeSortMode(global.GeneralSearchState.sortMode);
    if(global.ThisOneGeneralSortMode) return normalizeSortMode(global.ThisOneGeneralSortMode);
    return normalizeSortMode(global.ThisOneSortMode);
  }

  function setWrapSortActive(wrap, mode){
    if(!wrap) return;
    const activeMode=normalizeSortMode(mode);
    wrap.querySelectorAll('.sort-btn').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.sortMode===activeMode);
    });
  }

  function setSortActive(mode, sourceBtn){
    const activeMode=normalizeSortMode(mode);
    const labels = {
      relevant: '관련순',
      low: '낮은가격순',
      high: '높은가격순'
    };
    const iconBtn = document.querySelector('.sort-icon-btn');
    if (iconBtn) {
      iconBtn.textContent = (labels[activeMode] || '관련순') + ' ▾';
      iconBtn.dataset.sortMode = activeMode;
    }
    const sourceWrap=sourceBtn&&sourceBtn.closest?sourceBtn.closest('.sort-options'):null;
    if(sourceWrap){
      if(sourceWrap.classList.contains('thisone-rec-sort')){
        global.ThisOneRecSortMode=activeMode;
      }else{
        global.ThisOneGeneralSortMode=activeMode;
        global.ThisOneSortMode=activeMode;
      }
      setWrapSortActive(sourceWrap, activeMode);
      return;
    }

    global.ThisOneGeneralSortMode=activeMode;
    global.ThisOneSortMode=activeMode;
    document.querySelectorAll('.sort-options:not(.thisone-rec-sort)').forEach(wrap=>setWrapSortActive(wrap, activeMode));
  }

  function openSortModal(sourceBtn) {
    document.querySelectorAll('.sort-modal-wrap').forEach(el => el.remove());

    const currentMode = normalizeSortMode(sourceBtn?.dataset?.sortMode || 'relevant');
    const options = [
      { mode: 'relevant', label: '관련순' },
      { mode: 'low', label: '낮은가격순' },
      { mode: 'high', label: '높은가격순' }
    ];

    const wrap = document.createElement('div');
    wrap.className = 'sort-modal-wrap';
    wrap.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;';

    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);';
    backdrop.onclick = () => wrap.remove();

    const modal = document.createElement('div');
    modal.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:8px;padding:16px;min-width:160px;box-shadow:0 4px 12px rgba(0,0,0,0.15);';

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      btn.style.cssText = `display:block;width:100%;padding:10px 16px;border:none;background:${opt.mode === currentMode ? '#f0f0f0' : '#fff'};text-align:left;cursor:pointer;font-size:14px;font-weight:${opt.mode === currentMode ? 'bold' : 'normal'};`;
      btn.onclick = () => {
        wrap.remove();
        global.changeSort(opt.mode, sourceBtn);
      };
      modal.appendChild(btn);
    });

    wrap.appendChild(backdrop);
    wrap.appendChild(modal);
    document.body.appendChild(wrap);
  }

  function buttons(activeKey) {
    activeKey=normalizeSortMode(activeKey);
    const labels = {
      relevant: '관련순',
      low: '낮은가격순',
      high: '높은가격순'
    };
    const label = labels[activeKey] || '관련순';
    return `<button class="sort-icon-btn"
      onclick="window.openSortModal(this)"
      data-sort-mode="${activeKey}"
      style="cursor:pointer;padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:#fff;font-size:13px;">
      ${label} ▾</button>`;
  }

  global.ThisOneSort = {
    normalizeSortMode,
    sortCandidatesByMode,
    openSortModal,
    setSortActive,
    buttons,
    getGeneralSortMode,
    setWrapSortActive
  };

  global.openSortModal = openSortModal;
})(window);
