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
    if(mode==='value') return 'asc';
    return 'sim';
  }

  function setSortActive(mode){
    global.ThisOneSortMode=mode||'total';
    document.querySelectorAll('.sort-options .sort-btn').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.sortMode===global.ThisOneSortMode);
    });
  }

  function getCurrentGeneralQuery(){
    try{ if(global.GeneralSearchState&&global.GeneralSearchState.query) return global.GeneralSearchState.query; }catch(e){}
    try{ if(currentQuery) return currentQuery; }catch(e){}
    return getPrimaryInputValue();
  }

  function installSortExecutionPatch(){
    global.changeSort=async function(sortOrMode){
      const mode=['total','value','popular','sales'].includes(sortOrMode)?sortOrMode:(global.ThisOneSortMode||'total');
      const apiSort=mapSortModeToApi(mode);
      setSortActive(mode);
      try{
        if(global.GeneralSearchState){
          global.GeneralSearchState.currentSort=apiSort;
          global.GeneralSearchState.currentPage=1;
        }
        const q=getCurrentGeneralQuery();
        if(!q||!global.ThisOneAPI||!global.ThisOneAPI.requestSearch||!global.ThisOneUI||!global.ThisOneUI.renderResults){
          console.warn('[ThisOne][sort]', 'sort click ignored: missing query or API', {q, apiSort, mode});
          return;
        }
        console.debug('[ThisOne][sort]', 'reload general results', {q, apiSort, mode});
        const data=await global.ThisOneAPI.requestSearch(q, {}, 1, 30, apiSort);
        const items=data&&data.items||[];
        if(global.GeneralSearchState){
          global.GeneralSearchState.query=q;
          global.GeneralSearchState.total=data&&data.total||items.length;
          global.GeneralSearchState.resultMode=global.GeneralSearchState.resultMode||'fallback_general';
        }
        global.ThisOneUI.renderResults(items, data&&data.total||items.length, 1, apiSort, global.GeneralSearchState&&global.GeneralSearchState.resultMode||'fallback_general');
        setTimeout(()=>setSortActive(mode),0);
      }catch(e){
        console.error('[ThisOne][sort] failed:', e);
      }
    };
  }

  function installSortButtonsPatch(){
    const activeKeyFromText=(text)=>{
      if(/가성비|최저/.test(text||'')) return 'value';
      if(/인기/.test(text||'')) return 'popular';
      if(/판매/.test(text||'')) return 'sales';
      return global.ThisOneSortMode || 'total';
    };
    const buttons=(activeKey)=>{
      const btn=(key,label)=>`<button class="sort-btn ${activeKey===key?'active':''}" data-sort-mode="${key}" onclick="window.ThisOneSortMode='${key}'; window.changeSort('${key}')">${label}</button>`;
      return [btn('total','종합추천'),btn('value','가성비'),btn('popular','인기순'),btn('sales','판매순')].join('');
    };
    const apply=()=>{
      document.querySelectorAll('.sort-options').forEach(wrap=>{
        if(wrap.classList.contains('thisone-rec-sort')) return;
        if(wrap.dataset.thisoneSortPatchApplied==='true') return;
        const text=wrap.textContent||'';
        if(!text.includes('관련도순')&&!text.includes('최저가순')&&!text.includes('종합추천')) return;
        wrap.dataset.thisoneSortPatchApplied='true';
        wrap.innerHTML=buttons(activeKeyFromText(text));
      });

      document.querySelectorAll('.ai-result > .ai-label').forEach(label=>{
        const text=label.textContent||'';
        if(!text.includes('지능형 추천 리포트')) return;
        const parent=label.parentElement;
        if(!parent||parent.querySelector('.thisone-rec-sort')) return;
        const row=document.createElement('div');
        row.className='ai-label-row thisone-rec-label-row';
        const sort=document.createElement('div');
        sort.className='sort-options thisone-rec-sort';
        sort.dataset.thisoneSortPatchApplied='true';
        sort.innerHTML=buttons(global.ThisOneSortMode||'total');
        parent.insertBefore(row,label);
        row.appendChild(label);
        row.appendChild(sort);
      });
      setSortActive(global.ThisOneSortMode||'total');
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
