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
    try{
      let box=document.getElementById('thisoneVisionDebugBox');
      if(!box){
        box=document.createElement('div');
        box.id='thisoneVisionDebugBox';
        box.style.cssText='position:fixed;left:10px;right:10px;bottom:10px;z-index:99999;background:rgba(17,24,39,.94);color:#fff;border-radius:12px;padding:12px 14px;font-size:12px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.25);white-space:pre-wrap;';
        document.body.appendChild(box);
      }
      const body=(rows||[]).map(r=>Array.isArray(r)?r.join(': '):String(r)).join('\n');
      box.textContent=title+'\n'+body;
      clearTimeout(box.__timer);
      box.__timer=setTimeout(()=>{try{box.remove();}catch(e){}},12000);
    }catch(e){}
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
    const replacements=[
      ['직구제외','해외직구 제외'],
      ['대행제외','구매대행 제외'],
      ['렌탈제외','렌탈/구독 제외']
    ];
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

  function installSortButtonsPatch(){
    const activeKeyFromText=(text)=>{
      if(/가성비|최저/.test(text||'')) return 'value';
      if(/인기/.test(text||'')) return 'popular';
      if(/판매/.test(text||'')) return 'sales';
      return global.ThisOneSortMode || 'total';
    };
    const buttons=(activeKey)=>{
      const btn=(key,label,sort)=>`<button class="sort-btn ${activeKey===key?'active':''}" onclick="window.ThisOneSortMode='${key}'; window.changeSort && window.changeSort('${sort}')">${label}</button>`;
      return [
        btn('total','종합추천','sim'),
        btn('value','가성비','asc'),
        btn('popular','인기순','sim'),
        btn('sales','판매순','sim')
      ].join('');
    };
    const apply=()=>{
      // 일반 검색 결과 헤드
      document.querySelectorAll('.sort-options').forEach(wrap=>{
        if(wrap.classList.contains('thisone-rec-sort')) return;
        if(wrap.dataset.thisoneSortPatchApplied==='true') return;
        const text=wrap.textContent||'';
        if(!text.includes('관련도순')&&!text.includes('최저가순')&&!text.includes('종합추천')) return;
        wrap.dataset.thisoneSortPatchApplied='true';
        wrap.innerHTML=buttons(activeKeyFromText(text));
      });

      // 지능형 추천 리포트 헤드
      document.querySelectorAll('.ai-result > .ai-label').forEach(label=>{
        const text=label.textContent||'';
        if(!text.includes('지능형 추천 리포트')) return;
        const parent=label.parentElement;
        if(!parent||parent.querySelector('.thisone-rec-sort')) return;
        const sort=document.createElement('div');
        sort.className='sort-options thisone-rec-sort';
        sort.dataset.thisoneSortPatchApplied='true';
        sort.innerHTML=buttons(global.ThisOneSortMode||'total');
        label.insertAdjacentElement('afterend',sort);
      });
    };
    apply();
    const observer=new MutationObserver(apply);
    observer.observe(document.body,{childList:true,subtree:true});
    global.__thisOneApplySortButtonLabels=apply;
  }

  function isSupportedVisionType(type){
    return /image\/(jpeg|jpg|png|webp)/i.test(String(type||''));
  }

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
          const maxSide=1600;
          const w=img.naturalWidth||img.width;
          const h=img.naturalHeight||img.height;
          const scale=Math.min(1,maxSide/Math.max(w,h));
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(w*scale));
          canvas.height=Math.max(1,Math.round(h*scale));
          const ctx=canvas.getContext('2d');
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
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
    installSortButtonsPatch();
    installProcessFilePolicy();
    installIntentHintPolicy();
    installRemoveImagePolicy();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installAll); else installAll();
  global.addEventListener('load',installAll);
})(window);
