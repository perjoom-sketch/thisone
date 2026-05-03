(function applyImageTextPolicyPatch(global) {
  function getPrimaryInputValue() {
    const ids = ['msgInput', 'msgInput2'];
    for (const id of ids) {
      const el = document.getElementById(id);
      const value = String(el?.value || '').trim();
      if (value) return value;
    }
    return String(typeof currentQuery !== 'undefined' ? currentQuery || '' : '').trim();
  }

  function clearQueryInputs() {
    ['msgInput', 'msgInput2'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = '';
      if (typeof autoResize === 'function') autoResize(el);
    });
    try { currentQuery = ''; } catch (e) {}
  }

  function hasVisibleImagePreview() {
    const preview = document.getElementById('imgPreview');
    return !!(preview && preview.classList.contains('show'));
  }

  function ensureDefaultSearchSettings() {
    // thisone_app_v3_final.js는 검색설정 모달을 열지 않으면 DOM에서 값을 못 읽어 20초로 fallback된다.
    // 모달 미오픈 상태에서도 기본 45초/5개 값이 읽히도록 hidden input을 공급한다.
    const defaults = [
      ['patienceTime', global.ThisOneExpertSettings?.patienceTime || '45'],
      ['resultCount', global.ThisOneExpertSettings?.resultCount || '5']
    ];

    defaults.forEach(([id, value]) => {
      if (document.getElementById(id)) return;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.id = id;
      input.value = value;
      input.dataset.thisoneDefaultSetting = 'true';
      document.body.appendChild(input);
    });

    console.debug('[ThisOne][default-patience]', {
      patienceTime: document.getElementById('patienceTime')?.value,
      resultCount: document.getElementById('resultCount')?.value
    });
  }

  function installFilterModalCleanup() {
    if (typeof global.toggleFilterModal !== 'function' || global.toggleFilterModal.__defaultSettingPatchApplied) return;
    const originalToggle = global.toggleFilterModal;
    const patchedToggle = function(...args) {
      document.querySelectorAll('[data-thisone-default-setting="true"]').forEach((el) => el.remove());
      return originalToggle.apply(this, args);
    };
    patchedToggle.__defaultSettingPatchApplied = true;
    global.toggleFilterModal = patchedToggle;
  }

  function updatePreviewAndPending(dataUrl, sourceMeta) {
    try {
      pendingImg = {
        data: dataUrl.split(',')[1],
        src: dataUrl,
        type: 'image/jpeg'
      };
    } catch (e) {
      console.warn('[ThisOne][camera-image-normalize] pending image set failed:', e.message);
      return;
    }

    const pv = document.getElementById('imgPreview');
    const el = document.getElementById('previewImg');
    if (el) el.src = dataUrl;
    if (pv) pv.classList.add('show');

    console.debug('[ThisOne][camera-image-normalize]', {
      status: 'ready',
      originalType: sourceMeta?.type || '',
      originalSize: sourceMeta?.size || 0,
      outputType: 'image/jpeg',
      outputBytesApprox: Math.round((dataUrl.length * 3) / 4)
    });
  }

  function normalizeImageFileToJpeg(file, fallbackProcessFile) {
    const reader = new FileReader();

    reader.onload = (ev) => {
      const originalDataUrl = ev.target.result;
      const img = new Image();

      img.onload = () => {
        try {
          const maxSide = 1600;
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          const scale = Math.min(1, maxSide / Math.max(width, height));
          const targetWidth = Math.max(1, Math.round(width * scale));
          const targetHeight = Math.max(1, Math.round(height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.88);
          updatePreviewAndPending(jpegDataUrl, file);
        } catch (e) {
          console.warn('[ThisOne][camera-image-normalize] canvas conversion failed, using original flow:', e.message);
          fallbackProcessFile.call(global, file);
        }
      };

      img.onerror = () => {
        // 일부 브라우저는 HEIC 미리보기 디코딩이 안 될 수 있다. 이때는 기존 흐름으로 fallback한다.
        console.warn('[ThisOne][camera-image-normalize] browser could not decode image, using original flow', {
          type: file?.type || '',
          size: file?.size || 0
        });
        fallbackProcessFile.call(global, file);
      };

      img.src = originalDataUrl;
    };

    reader.onerror = () => {
      console.warn('[ThisOne][camera-image-normalize] file read failed, using original flow');
      fallbackProcessFile.call(global, file);
    };

    reader.readAsDataURL(file);
  }

  function installProcessFilePolicy() {
    if (typeof processFile !== 'function' || processFile.__imageTextPolicyApplied) return;

    const originalProcessFile = processFile;
    const patchedProcessFile = function(file) {
      const textBeforeImage = getPrimaryInputValue();

      // 정책 2: 텍스트가 먼저 입력된 상태에서 이미지를 첨부하면 이미지가 주 검색이므로 텍스트 초기화
      if (textBeforeImage) {
        clearQueryInputs();
        console.debug('[ThisOne][image-text-policy]', 'text cleared because image was attached after text input', {
          clearedText: textBeforeImage
        });
      }

      if (file && /^image\//i.test(file.type || '')) {
        normalizeImageFileToJpeg(file, originalProcessFile);
        return;
      }

      return originalProcessFile.call(this, file);
    };

    patchedProcessFile.__imageTextPolicyApplied = true;
    processFile = patchedProcessFile;
    global.processFile = patchedProcessFile;
  }

  function installIntentHintPolicy() {
    const api = global.ThisOneAPI || {};
    if (typeof api.requestIntentInfer !== 'function' || api.requestIntentInfer.__imageTextPolicyApplied) return;

    const originalRequestIntentInfer = api.requestIntentInfer;
    const patchedRequestIntentInfer = function(query, trajectory, image = null) {
      // 정책 1: 이미지를 먼저 첨부한 뒤 텍스트를 입력하면 텍스트는 이미지 분석 힌트로 사용
      if (image && (!query || !String(query).trim()) && hasVisibleImagePreview()) {
        const hint = getPrimaryInputValue();
        if (hint) {
          console.debug('[ThisOne][image-text-policy]', 'text used as image search hint', { hint });
          return originalRequestIntentInfer.call(this, hint, trajectory, image);
        }
      }

      return originalRequestIntentInfer.call(this, query, trajectory, image);
    };

    patchedRequestIntentInfer.__imageTextPolicyApplied = true;
    global.ThisOneAPI = {
      ...api,
      requestIntentInfer: patchedRequestIntentInfer
    };
  }

  function installRemoveImagePolicy() {
    if (typeof removeImg !== 'function' || removeImg.__imageTextPolicyApplied) return;

    const originalRemoveImg = removeImg;
    const patchedRemoveImg = function(...args) {
      const result = originalRemoveImg.apply(this, args);
      try { pendingImg = null; } catch (e) {}
      console.debug('[ThisOne][image-text-policy]', 'image state cleared by removeImg');
      return result;
    };

    patchedRemoveImg.__imageTextPolicyApplied = true;
    removeImg = patchedRemoveImg;
    global.removeImg = patchedRemoveImg;
  }

  function installAll() {
    ensureDefaultSearchSettings();
    installFilterModalCleanup();
    installProcessFilePolicy();
    installIntentHintPolicy();
    installRemoveImagePolicy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installAll);
  } else {
    installAll();
  }

  global.addEventListener('load', installAll);
})(window);
