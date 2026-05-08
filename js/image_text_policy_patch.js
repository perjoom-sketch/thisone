(function(global){
  function getPrimaryInputValue(){
    for(const id of ['msgInput','msgInput2']){
      const el=document.getElementById(id);
      const v=String(el&&el.value||'').trim();
      if(v) return v;
    }
    try{return String(currentQuery||'').trim();}catch(e){return '';}
  }

function showMobileVisionDebug(title, rows){
  return;
}

  function clearQueryInputs(){
    ['msgInput','msgInput2'].forEach(id=>{
      const el=document.getElementById(id);
      if(!el) return;
      el.value='';
      if(typeof autoResize==='function') autoResize(el);
    });
    try{currentQuery='';}catch(e){}
  }

  function hasVisibleImagePreview(){
    const preview=document.getElementById('imgPreview');
    return !!(preview&&preview.classList.contains('show'));
  }

  function ensureDefaultSearchSettings(){
    [['patienceTime',global.ThisOneExpertSettings&&global.ThisOneExpertSettings.patienceTime||'45'],['resultCount',global.ThisOneExpertSettings&&global.ThisOneExpertSettings.resultCount||'5']].forEach(([id,value])=>{
      if(document.getElementById(id)) return;
      const input=document.createElement('input');
      input.type='hidden';
      input.id=id;
      input.value=value;
      input.dataset.thisoneDefaultSetting='true';
      document.body.appendChild(input);
    });
    console.debug('[ThisOne][default-patience]',{patienceTime:document.getElementById('patienceTime')&&document.getElementById('patienceTime').value,resultCount:document.getElementById('resultCount')&&document.getElementById('resultCount').value});
  }

  function installFilterModalCleanup(){
    if(typeof global.toggleFilterModal!=='function'||global.toggleFilterModal.__defaultSettingPatchApplied) return;
    const originalToggle=global.toggleFilterModal;
    const patchedToggle=function(){
      document.querySelectorAll('[data-thisone-default-setting="true"]').forEach(el=>el.remove());
      const result=originalToggle.apply(this,arguments);
      setTimeout(applyFilterLabelText,0);
      return result;
    };
    patchedToggle.__defaultSettingPatchApplied=true;
    global.toggleFilterModal=patchedToggle;
  }

  function applyFilterLabelText(){
    const replacements=[['직구제외','해외직구 제외'],['대행제외','구매대행 제외'],['렌탈제외','렌탈/구독 제외']];
    document.querySelectorAll('label.check-btn').forEach(label=>{
      replacements.forEach(([from,to])=>{
        if((label.textContent||'').includes(from)){
          const input=label.querySelector('input');
          label.textContent=' ' + to;
          if(input) label.prepend(input);
        }
      });
    });
  }

  function mapSortModeToApi(mode){
    return 'sim';
  }

  function rankItemsForMode(items, query, mode){
    const ranking=global.ThisOneRanking;
    if(!ranking||typeof ranking.buildCandidates!=='function') return items||[];
    const profile=global._lastIntentProfile||null;
    const candidates=ranking.buildCandidates(items||[], query||'', profile);
    if(typeof ranking.sortCandidatesByMode==='function') return ranking.sortCandidatesByMode(candidates, mode);
    return candidates;
  }

  function getGeneralSortMode(){
    if(global.GeneralSearchState&&global.GeneralSearchState.sortMode) return normalizeSortMode(global.GeneralSearchState.sortMode);
    if(global.ThisOneGeneralSortMode) return normalizeSortMode(global.ThisOneGeneralSortMode);
    return normalizeSortMode(global.ThisOneSortMode);
  }

  function getRecSortMode(){
    return normalizeSortMode(global.ThisOneRecSortMode);
  }

  function getSortLabel(mode){
    return {
      relevant: '관련순',
      low: '낮은가격순',
      high: '높은가격순'
    }[mode] || '관련순';
  }

  function setWrapSortActive(wrap, mode){
    if(!wrap) return;
    const activeMode=mode||'relevant';
    wrap.querySelectorAll('.sort-btn,.sort-icon-btn').forEach(btn=>{
      if(btn.classList.contains('sort-icon-btn')){
        btn.dataset.sortMode=activeMode;
        btn.textContent=getSortLabel(activeMode)+' ▾';
        btn.classList.add('active');
        return;
      }
      btn.classList.toggle('active',btn.dataset.sortMode===activeMode);
    });
    wrap.querySelectorAll('.sort-modal-option').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.sortMode===activeMode);
    });
  }

  function setSortActive(mode, sourceBtn){
    const activeMode=mode||'relevant';
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

  function getCurrentGeneralQuery(){
    try{ if(global.GeneralSearchState&&global.GeneralSearchState.query) return global.GeneralSearchState.query; }catch(e){}
    try{ if(currentQuery) return currentQuery; }catch(e){}
    return getPrimaryInputValue();
  }

  function normalizeSortMode(sortOrMode){
    if(sortOrMode==='relevant'||sortOrMode==='low'||sortOrMode==='high') return sortOrMode;
    return 'relevant';
  }

  function installSortExecutionPatch(){
    global.changeSort=async function(sortOrMode, sourceBtn){
      const mode=normalizeSortMode(sortOrMode);
      const apiSort=mapSortModeToApi(mode);
      setSortActive(mode, sourceBtn);
      try{
        if(global.GeneralSearchState){
          global.GeneralSearchState.currentSort=apiSort;
          global.GeneralSearchState.sortMode=mode;
          global.GeneralSearchState.currentPage=1;
        }
        const q=getCurrentGeneralQuery();
        if(!q||!global.ThisOneAPI||!global.ThisOneAPI.requestSearch||!global.ThisOneUI||!global.ThisOneUI.renderResults){
          console.warn('[ThisOne][sort]', 'sort click ignored: missing query or API', {q, apiSort, mode});
          return;
        }
        console.debug('[ThisOne][sort]', 'reload general results', {q, apiSort, mode});
        const data=await global.ThisOneAPI.requestSearch(q, {}, 1, 30, apiSort);
        const rawItems=data&&data.items||[];
        const items=rankItemsForMode(rawItems, q, mode);
        if(global.GeneralSearchState){
          global.GeneralSearchState.query=q;
          global.GeneralSearchState.total=data&&data.total||items.length;
          global.GeneralSearchState.lastItems=items;
          global.GeneralSearchState.resultMode=global.GeneralSearchState.resultMode||'fallback_general';
        }
        const scrollY=window.scrollY;
        await global.ThisOneUI.renderResults(items, data&&data.total||items.length, 1, apiSort, global.GeneralSearchState&&global.GeneralSearchState.resultMode||'fallback_general');
        setTimeout(()=>window.scrollTo({top:scrollY}),150);
        setTimeout(()=>setSortActive(mode),0);
      }catch(e){
        console.error('[ThisOne][sort] failed:', e);
      }
    };
  }

  function installSortButtonsPatch(){
    const activeKeyFromText=(text)=>{
      if(/낮은가격|최저/.test(text||'')) return 'low';
      if(/높은가격|최고/.test(text||'')) return 'high';
      return getGeneralSortMode();
    };
    const buttons=(activeKey)=>{
      const label = {
        relevant: '관련순',
        low: '낮은가격순',
        high: '높은가격순'
      }[activeKey] || '관련순';
      return `<button class="sort-icon-btn"
        onclick="window.openSortModal(this)"
        data-sort-mode="${activeKey}">${label} ▾</button>`;
    };

    global.openSortModal=function(sourceBtn){
      const activeKey=normalizeSortMode(sourceBtn&&sourceBtn.dataset&&sourceBtn.dataset.sortMode);
      document.querySelectorAll('.sort-modal-backdrop').forEach(el=>el.remove());
      const backdrop=document.createElement('div');
      backdrop.className='sort-modal-backdrop';
      const modal=document.createElement('div');
      modal.className='sort-modal';
      modal.setAttribute('role','dialog');
      modal.setAttribute('aria-modal','true');
      modal.setAttribute('aria-label','정렬 선택');

      ['relevant','low','high'].forEach(key=>{
        const option=document.createElement('button');
        option.type='button';
        option.className='sort-modal-option'+(key===activeKey?' active':'');
        option.dataset.sortMode=key;
        option.textContent=getSortLabel(key);
        option.addEventListener('click',()=>{
          global.changeSort(key, sourceBtn);
          backdrop.remove();
        });
        modal.appendChild(option);
      });

      backdrop.addEventListener('click',(event)=>{
        if(event.target===backdrop) backdrop.remove();
      });
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    };

    const apply=()=>{
      document.querySelectorAll('.sort-options').forEach(wrap=>{
        if(wrap.classList.contains('thisone-rec-sort')) return;
        if(wrap.dataset.thisoneSortPatchApplied==='true') return;
        const text=wrap.textContent||'';
        if(!text.includes('관련도순')&&!text.includes('관련순')&&!text.includes('최저가순')&&!text.includes('낮은가격순')&&!text.includes('높은가격순')) return;
        wrap.dataset.thisoneSortPatchApplied='true';
        wrap.innerHTML=buttons(activeKeyFromText(text));
      });

      document.querySelectorAll('.sort-options:not(.thisone-rec-sort)').forEach(wrap=>setWrapSortActive(wrap,getGeneralSortMode()));
    };
    apply();
    const observer=new MutationObserver(apply);
    observer.observe(document.body,{childList:true,subtree:true});
    global.__thisOneApplySortButtonLabels=apply;
  }

  function isSupportedVisionType(type){return /image\/(jpeg|jpg|png|webp)/i.test(String(type||''));}

  function normalizeImageForVision(image){
    return new Promise(resolve=>{
      if(!image||!image.data) return resolve(image||null);
      const src=image.src||('data:'+(image.type||'image/jpeg')+';base64,'+image.data);
      const shouldTryCanvas=!isSupportedVisionType(image.type)||String(src).length>2200000;
      showMobileVisionDebug('사진 진단',[[ '원본 타입', image.type||'(없음)' ],[ '원본 크기', Math.round(String(src).length/1024)+'KB' ],[ 'JPEG 변환시도', shouldTryCanvas?'예':'아니오' ]]);
      if(!shouldTryCanvas) return resolve(image);
      const img=new Image();
      img.onload=function(){
        try{
          const maxSide=1600,w=img.naturalWidth||img.width,h=img.naturalHeight||img.height,scale=Math.min(1,maxSide/Math.max(w,h));
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(w*scale));
          canvas.height=Math.max(1,Math.round(h*scale));
          canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
          const dataUrl=canvas.toDataURL('image/jpeg',0.88);
          const out={data:dataUrl.split(',')[1],src:dataUrl,type:'image/jpeg'};
          showMobileVisionDebug('사진 진단',[[ '원본 타입', image.type||'(없음)' ],[ '변환 결과','image/jpeg' ],[ '전송 크기', Math.round(dataUrl.length/1024)+'KB' ]]);
          console.debug('[ThisOne][vision-image-normalize]',{from:image.type||'',to:out.type,reason:!isSupportedVisionType(image.type)?'unsupported-type':'large-image'});
          resolve(out);
        }catch(e){
          showMobileVisionDebug('사진 진단',[[ '원본 타입', image.type||'(없음)' ],[ '변환 실패', e.message ],[ '전송','원본 그대로' ]]);
          console.warn('[ThisOne][vision-image-normalize] failed, using original image:',e.message);
          resolve(image);
        }
      };
      img.onerror=function(){
        showMobileVisionDebug('사진 진단',[[ '원본 타입', image.type||'(없음)' ],[ '브라우저 디코딩','실패' ],[ '전송','원본 그대로' ]]);
        console.warn('[ThisOne][vision-image-normalize] browser decode failed, using original image',{type:image.type||'',bytes:String(src).length});
        resolve(image);
      };
      img.src=src;
    });
  }

  function installProcessFilePolicy(){
    if(typeof processFile!=='function'||processFile.__imageTextPolicyApplied) return;
    const originalProcessFile=processFile;
    const patchedProcessFile=function(file){
      global.__thisOneLastImageFileMeta={type:file&&file.type||'',size:file&&file.size||0,name:file&&file.name||''};
      showMobileVisionDebug('사진 첨부됨',[[ '파일 타입', global.__thisOneLastImageFileMeta.type||'(없음)' ],[ '파일 크기', Math.round((global.__thisOneLastImageFileMeta.size||0)/1024)+'KB' ]]);
      const textBeforeImage=getPrimaryInputValue();
      if(textBeforeImage){
        clearQueryInputs();
        console.debug('[ThisOne][image-text-policy]','text cleared because image was attached after text input',{clearedText:textBeforeImage});
      }
      return originalProcessFile.call(this,file);
    };
    patchedProcessFile.__imageTextPolicyApplied=true;
    processFile=patchedProcessFile;
    global.processFile=patchedProcessFile;
  }

  function installIntentHintPolicy(){
    const api=global.ThisOneAPI||{};
    if(typeof api.requestIntentInfer!=='function'||api.requestIntentInfer.__imageTextPolicyApplied) return;
    const originalRequestIntentInfer=api.requestIntentInfer;
    const patchedRequestIntentInfer=async function(query,trajectory,image){
      let nextImage=image||null;
      if(nextImage) nextImage=await normalizeImageForVision(nextImage);
      let result;
      if(nextImage&&(!query||!String(query).trim())&&hasVisibleImagePreview()){
        const hint=getPrimaryInputValue();
        if(hint){
          console.debug('[ThisOne][image-text-policy]','text used as image search hint',{hint});
          result=await originalRequestIntentInfer.call(this,hint,trajectory,nextImage);
        }else{
          result=await originalRequestIntentInfer.call(this,query,trajectory,nextImage);
        }
      }else{
        result=await originalRequestIntentInfer.call(this,query,trajectory,nextImage);
      }
      if(nextImage){
        showMobileVisionDebug('AI 인식 결과',[[ '전송 타입', nextImage.type||'(없음)' ],[ '상품명', result&&result.refinedSearchTerm?result.refinedSearchTerm:'식별 실패' ],[ 'source', result&&result.source?result.source:'(없음)' ]]);
      }
      return result;
    };
    patchedRequestIntentInfer.__imageTextPolicyApplied=true;
    global.ThisOneAPI={...api,requestIntentInfer:patchedRequestIntentInfer};
  }

  function installRemoveImagePolicy(){
    if(typeof removeImg!=='function'||removeImg.__imageTextPolicyApplied) return;
    const originalRemoveImg=removeImg;
    const patchedRemoveImg=function(){
      const result=originalRemoveImg.apply(this,arguments);
      try{pendingImg=null;}catch(e){}
      console.debug('[ThisOne][image-text-policy]','image state cleared by removeImg');
      return result;
    };
    patchedRemoveImg.__imageTextPolicyApplied=true;
    removeImg=patchedRemoveImg;
    global.removeImg=patchedRemoveImg;
  }

  function installAll(){
    ensureDefaultSearchSettings();
    installFilterModalCleanup();
    applyFilterLabelText();
    installSortExecutionPatch();
    installSortButtonsPatch();
    installProcessFilePolicy();
    installIntentHintPolicy();
    installRemoveImagePolicy();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installAll); else installAll();
  global.addEventListener('load',installAll);
})(window);
