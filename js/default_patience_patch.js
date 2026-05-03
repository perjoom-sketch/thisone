(function applyDefaultPatiencePatch(global) {
  if (global.__thisOneDefaultPatiencePatchApplied) return;
  global.__thisOneDefaultPatiencePatchApplied = true;

  const DEFAULT_PATIENCE = '45';
  const DEFAULT_RESULT_COUNT = '5';

  function ensureHiddenDefault(id, value) {
    if (document.getElementById(id)) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.id = id;
    input.value = value;
    input.dataset.thisoneDefaultSetting = 'true';
    document.body.appendChild(input);
  }

  function installDefaults() {
    ensureHiddenDefault('patienceTime', global.ThisOneExpertSettings?.patienceTime || DEFAULT_PATIENCE);
    ensureHiddenDefault('resultCount', global.ThisOneExpertSettings?.resultCount || DEFAULT_RESULT_COUNT);
  }

  function removeHiddenDefaultsBeforeRealFilterOpens() {
    document.querySelectorAll('[data-thisone-default-setting="true"]').forEach((el) => el.remove());
  }

  function patchToggleFilterModal() {
    if (typeof global.toggleFilterModal !== 'function' || global.toggleFilterModal.__defaultPatiencePatchApplied) return;
    const original = global.toggleFilterModal;
    const patched = function(...args) {
      removeHiddenDefaultsBeforeRealFilterOpens();
      const result = original.apply(this, args);
      setTimeout(() => {
        const patience = document.getElementById('patienceTime');
        if (patience && !patience.value) patience.value = global.ThisOneExpertSettings?.patienceTime || DEFAULT_PATIENCE;
        const resultCount = document.getElementById('resultCount');
        if (resultCount && !resultCount.value) resultCount.value = global.ThisOneExpertSettings?.resultCount || DEFAULT_RESULT_COUNT;
      }, 0);
      return result;
    };
    patched.__defaultPatiencePatchApplied = true;
    global.toggleFilterModal = patched;
  }

  function installAll() {
    installDefaults();
    patchToggleFilterModal();
    console.debug('[ThisOne][default-patience]', {
      patienceTime: document.getElementById('patienceTime')?.value,
      resultCount: document.getElementById('resultCount')?.value
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installAll);
  } else {
    installAll();
  }

  global.addEventListener('load', installAll);
})(window);
