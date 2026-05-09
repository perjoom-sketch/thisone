(function applyInquiryManagerPatch(global) {
  if (global.__thisOneInquiryManagerPatchApplied) return;
  global.__thisOneInquiryManagerPatchApplied = true;

  const STORAGE_KEY = 'thisone_inquiry_manager_key';

  function getManagerKey() {
    try { return String(sessionStorage.getItem(STORAGE_KEY) || '').trim(); } catch (e) { return ''; }
  }

  function setManagerKey(value) {
    try { sessionStorage.setItem(STORAGE_KEY, String(value || '').trim()); } catch (e) {}
  }

  function clearManagerKey() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function getActionKey() {
    const managerKey = getManagerKey();
    if (managerKey) return managerKey;
    return prompt('글 작성 시 설정한 비밀번호를 입력해주세요.');
  }

  async function verifyManagerKey(key) {
    const res = await fetch('/api/inquiry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'manager_check', password: key })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.status !== 'success') {
      const err = new Error(result.message || '관리자 키가 일치하지 않습니다.');
      err.needsSetup = !!result.needsSetup;
      throw err;
    }
    return true;
  }

  async function setupManagerKey(key) {
    const res = await fetch('/api/inquiry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'manager_setup', newPassword: key })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.status !== 'success') {
      throw new Error(result.message || '관리자 비밀번호 설정에 실패했습니다.');
    }
    return true;
  }

  function addManagerButton() {
    const modal = document.getElementById('inquiryModal');
    const header = modal && modal.querySelector('.modal-header');
    if (!header || header.querySelector('#thisoneInquiryManagerBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'thisoneInquiryManagerBtn';
    btn.type = 'button';
    btn.className = 'btn btn-secondary';
    btn.style.cssText = 'margin-left:auto;margin-right:10px;padding:7px 12px;font-size:12px;border-radius:999px;';

    function render() {
      const on = !!getManagerKey();
      btn.textContent = on ? '관리자 ON' : '관리자';
      btn.style.background = on ? '#0f172a' : '#f8fafc';
      btn.style.color = on ? '#fff' : '#334155';
    }

    btn.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (getManagerKey()) {
        if (confirm('관리자 모드를 해제할까요?')) clearManagerKey();
        render();
        return;
      }

      const key = prompt('관리자 비밀번호를 입력해주세요.\n아직 설정 전이면 이 값으로 새 관리자 비밀번호를 설정합니다.');
      if (!key) return;
      if (String(key).trim().length < 4) return window.ThisOneUI?.showNotice?.('관리자 비밀번호는 4자리 이상 입력해주세요.');

      btn.disabled = true;
      btn.textContent = '확인 중...';
      try {
        await verifyManagerKey(key);
        setManagerKey(key);
        render();
        window.ThisOneUI?.showNotice?.('관리자 모드가 켜졌습니다.');
      } catch (err) {
        if (err.needsSetup || String(err.message || '').includes('아직 설정')) {
          if (!confirm('관리자 비밀번호가 아직 없습니다.\n방금 입력한 값으로 새 관리자 비밀번호를 설정할까요?')) {
            clearManagerKey();
            render();
            return;
          }
          try {
            await setupManagerKey(key);
            setManagerKey(key);
            render();
            window.ThisOneUI?.showNotice?.('관리자 비밀번호가 설정되었고 관리자 모드가 켜졌습니다.');
          } catch (setupErr) {
            clearManagerKey();
            render();
            window.ThisOneUI?.showNotice?.('관리자 비밀번호 설정 실패: ' + (setupErr.message || '다시 시도해주세요.'));
          }
        } else {
          clearManagerKey();
          render();
          window.ThisOneUI?.showNotice?.('관리자 모드 실패: ' + (err.message || '관리자 키를 확인해주세요.'));
        }
      } finally {
        btn.disabled = false;
      }
    };

    const closeBtn = header.querySelector('.close-btn');
    if (closeBtn) header.insertBefore(btn, closeBtn);
    else header.appendChild(btn);
    render();
  }

  function addButtons() {
    const inquiries = Array.isArray(global._inquiryCache) ? global._inquiryCache : [];
    inquiries.forEach((inq) => {
      const id = String(inq && inq.id || '');
      if (!id) return;

      const area = document.getElementById('inqContent_' + id);
      if (!area) return;
      const row = area.querySelector('.action-row.right');
      if (!row) return;

      if (!row.querySelector('[data-thisone-reset-password="true"]')) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'btn btn-secondary';
        resetBtn.dataset.thisoneResetPassword = 'true';
        resetBtn.textContent = '비번 재설정';
        resetBtn.style.cssText = 'padding:8px 16px;font-size:12px;color:#334155;border-color:#cbd5e1;background:#f8fafc;';
        resetBtn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          resetPassword(id);
        };
        row.insertBefore(resetBtn, row.firstChild);
      }

      if (!row.querySelector('[data-thisone-delete-inquiry="true"]')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-secondary';
        deleteBtn.dataset.thisoneDeleteInquiry = 'true';
        deleteBtn.textContent = '삭제하기';
        deleteBtn.style.cssText = 'padding:8px 16px;font-size:12px;color:#dc2626;border-color:#fecaca;background:#fff5f5;';
        deleteBtn.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteInquiry(id);
        };
        row.insertBefore(deleteBtn, row.firstChild);
      }
    });
  }

  async function deleteInquiry(id) {
    const item = (global._inquiryCache || []).find((inq) => String(inq.id) === String(id));
    if (!item) return window.ThisOneUI?.showNotice?.('삭제할 글을 찾을 수 없습니다.');

    const password = getActionKey();
    if (!password) return;

    const title = String(item.title || '이 글');
    if (!confirm('정말 삭제할까요?\n\n' + title)) return;

    try {
      const res = await fetch('/api/inquiry', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password })
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.status === 'success') {
        window.ThisOneUI?.showNotice?.('문의가 삭제되었습니다.');
        const area = document.getElementById('inqContent_' + id);
        const itemEl = area && area.closest('.inquiry-item');
        if (itemEl) itemEl.remove();
      } else {
        window.ThisOneUI?.showNotice?.('삭제 실패: ' + (result.message || '비밀번호를 확인해주세요.'));
      }
    } catch (err) {
      console.warn('[Inquiry] Delete failed:', err);
      window.ThisOneUI?.showNotice?.('삭제 중 오류가 발생했습니다.');
    }
  }

  async function resetPassword(id) {
    const managerKey = getManagerKey() || prompt('관리자 키를 입력해주세요.');
    if (!managerKey) return;

    const newPassword = prompt('새 글 비밀번호를 입력해주세요.');
    if (!newPassword) return;
    if (String(newPassword).trim().length < 4) return window.ThisOneUI?.showNotice?.('새 비밀번호는 4자리 이상 입력해주세요.');

    try {
      const res = await fetch('/api/inquiry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: managerKey, newPassword: String(newPassword).trim() })
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.status === 'success') {
        setManagerKey(managerKey);
        window.ThisOneUI?.showNotice?.('글 비밀번호가 새로 설정되었습니다.');
      } else {
        if (result.message && result.message.includes('관리자')) clearManagerKey();
        window.ThisOneUI?.showNotice?.('비밀번호 재설정 실패: ' + (result.message || '관리자 키를 확인해주세요.'));
      }
    } catch (err) {
      console.warn('[Inquiry] Password reset failed:', err);
      window.ThisOneUI?.showNotice?.('비밀번호 재설정 중 오류가 발생했습니다.');
    }
  }

  function patchEdit() {
    if (!global.ThisOneUI || global.ThisOneUI.prepareEdit?.__managerPatchApplied) return;
    const patchedPrepareEdit = function(id) {
      const item = (global._inquiryCache || []).find((inq) => String(inq.id) === String(id));
      if (!item) return window.ThisOneUI?.showNotice?.('데이터를 찾을 수 없습니다.');
      const password = getActionKey();
      if (!password) return;
      global._editModeId = id;
      const titleEl = document.getElementById('inqTitle');
      const authorEl = document.getElementById('inqAuthor');
      const contentEl = document.getElementById('inqContent');
      const passwordEl = document.getElementById('inqPassword');
      if (titleEl) titleEl.value = item.title || '';
      if (authorEl) authorEl.value = item.author || '익명';
      if (contentEl) contentEl.value = item.content || '';
      if (passwordEl) passwordEl.value = password;
      global.ThisOneUI.showInquiryForm?.();
      const submitBtn = document.getElementById('inqSubmitBtn');
      if (submitBtn) submitBtn.textContent = '수정 완료';
    };
    patchedPrepareEdit.__managerPatchApplied = true;
    global.ThisOneUI.prepareEdit = patchedPrepareEdit;
  }

  function install() {
    addManagerButton();
    addButtons();
    patchEdit();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  const observer = new MutationObserver(install);
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  global.addEventListener('load', install);
})(window);
