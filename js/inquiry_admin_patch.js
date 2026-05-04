(function applyInquiryAdminPatch(global) {
  if (global.__thisOneInquiryAdminPatchApplied) return;
  global.__thisOneInquiryAdminPatchApplied = true;

  const STORAGE_KEY = 'thisone_inquiry_manager_key';

  function getManagerKey() {
    try {
      return String(sessionStorage.getItem(STORAGE_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function setManagerKey(value) {
    try {
      sessionStorage.setItem(STORAGE_KEY, String(value || '').trim());
    } catch (e) {}
  }

  function clearManagerKey() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function isManagerMode() {
    return !!getManagerKey();
  }

  function getWriteKey() {
    const managerKey = getManagerKey();
    if (managerKey) return managerKey;
    return prompt('글 작성 시 설정한 비밀번호를 입력해주세요.');
  }

  function updateManagerButtonState() {
    const btn = document.getElementById('thisoneInquiryManagerBtn');
    if (!btn) return;

    if (isManagerMode()) {
      btn.textContent = '관리자 ON';
      btn.style.background = '#0f172a';
      btn.style.color = '#fff';
      btn.style.borderColor = '#0f172a';
    } else {
      btn.textContent = '관리자';
      btn.style.background = '#f8fafc';
      btn.style.color = '#334155';
      btn.style.borderColor = '#cbd5e1';
    }
  }

  function addManagerButton() {
    const modal = document.getElementById('inquiryModal');
    if (!modal) return;

    const header = modal.querySelector('.modal-header');
    if (!header || header.querySelector('#thisoneInquiryManagerBtn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'thisoneInquiryManagerBtn';
    btn.className = 'btn btn-secondary';
    btn.style.cssText = 'margin-left:auto; margin-right:10px; padding:7px 12px; font-size:12px; border:1px solid #cbd5e1; border-radius:999px; cursor:pointer;';
    btn.onclick = function(event) {
      event.preventDefault();
      event.stopPropagation();

      if (isManagerMode()) {
        if (confirm('관리자 모드를 해제할까요?')) {
          clearManagerKey();
          updateManagerButtonState();
          alert('관리자 모드가 해제되었습니다.');
        }
        return;
      }

      const key = prompt('관리자 키를 입력해주세요.');
      if (!key) return;
      setManagerKey(key);
      updateManagerButtonState();
      alert('관리자 모드가 켜졌습니다. 이 브라우저 탭에서 수정/삭제/비번 재설정 시 관리자 키를 자동 사용합니다.');
    };

    const closeBtn = header.querySelector('.close-btn');
    if (closeBtn) header.insertBefore(btn, closeBtn);
    else header.appendChild(btn);

    updateManagerButtonState();
  }

  function makeActionButton(text, cssText, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary';
    btn.textContent = text;
    btn.style.cssText = cssText;
    btn.onclick = onClick;
    return btn;
  }

  function addAdminButtons() {
    const inquiries = Array.isArray(global._inquiryCache) ? global._inquiryCache : [];

    inquiries.forEach(function(inq) {
      const id = String((inq && inq.id) || '');
      if (!id) return;

      const area = document.getElementById('inqContent_' + id);
      if (!area) return;

      const row = area.querySelector('.action-row.right');
      if (!row) return;

      if (!row.querySelector('[data-thisone-reset-inquiry-password="true"]')) {
        const resetBtn = makeActionButton(
          '비번 재설정',
          'padding:8px 16px;font-size:12px;color:#334155;border-color:#cbd5e1;background:#f8fafc;',
          function(event) {
            event.preventDefault();
            event.stopPropagation();
            if (global.ThisOneUI && typeof global.ThisOneUI.resetInquiryPassword === 'function') {
              global.ThisOneUI.resetInquiryPassword(id);
            }
          }
        );
        resetBtn.dataset.thisoneResetInquiryPassword = 'true';
        row.insertBefore(resetBtn, row.firstChild);
      }

      if (!row.querySelector('[data-thisone-delete-inquiry="true"]')) {
        const deleteBtn = makeActionButton(
          '삭제하기',
          'padding:8px 16px;font-size:12px;color:#dc2626;border-color:#fecaca;background:#fff5f5;',
          function(event) {
            event.preventDefault();
            event.stopPropagation();
            if (global.ThisOneUI && typeof global.ThisOneUI.deleteInquiry === 'function') {
              global.ThisOneUI.deleteInquiry(id);
            }
          }
        );
        deleteBtn.dataset.thisoneDeleteInquiry = 'true';
        row.insertBefore(deleteBtn, row.firstChild);
      }
    });
  }

  function prepareEditWithManagerKey(id) {
    const item = (global._inquiryCache || []).find(function(inq) {
      return String(inq.id) === String(id);
    });

    if (!item) {
      alert('데이터를 찾을 수 없습니다.');
      return;
    }

    const key = getWriteKey();
    if (!key) return;

    global._editModeId = id;

    const titleEl = document.getElementById('inqTitle');
    const contentEl = document.getElementById('inqContent');
    const passwordEl = document.getElementById('inqPassword');

    if (titleEl) titleEl.value = item.title || '';
    if (contentEl) contentEl.value = item.content || '';
    if (passwordEl) passwordEl.value = key;

    if (global.ThisOneUI && typeof global.ThisOneUI.showInquiryForm === 'function') {
      global.ThisOneUI.showInquiryForm();
    }

    const submitBtn = document.getElementById('inqSubmitBtn');
    if (submitBtn) submitBtn.textContent = '수정 완료';
  }

  async function deleteInquiry(id) {
    const item = (global._inquiryCache || []).find(function(inq) {
      return String(inq.id) === String(id);
    });

    if (!item) {
      alert('삭제할 글을 찾을 수 없습니다.');
      return;
    }

    const key = getWriteKey();
    if (!key) return;

    const title = String(item.title || '이 글');
    if (!confirm('정말 삭제할까요?\n\n' + title)) return;

    try {
      const res = await fetch('/api/inquiry', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, password: key })
      });
      const result = await res.json().catch(function() { return {}; });

      if (res.ok && result.status === 'success') {
        alert('문의가 삭제되었습니다.');
        global._inquiryCache = (global._inquiryCache || []).filter(function(inq) {
          return String(inq.id) !== String(id);
        });

        const area = document.getElementById('inqContent_' + id);
        const itemEl = area && area.closest('.inquiry-item');
        if (itemEl) itemEl.remove();

        if (global.ThisOneUI && typeof global.ThisOneUI.openInquiryBoard === 'function') {
          global.ThisOneUI.openInquiryBoard();
        }
      } else {
        alert('삭제 실패: ' + (result.message || '비밀번호를 확인해주세요.'));
      }
    } catch (err) {
      console.error('[Inquiry] Delete failed:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  }

  async function resetInquiryPassword(id) {
    const item = (global._inquiryCache || []).find(function(inq) {
      return String(inq.id) === String(id);
    });

    if (!item) {
      alert('비밀번호를 재설정할 글을 찾을 수 없습니다.');
      return;
    }

    const managerKey = getManagerKey() || prompt('관리자 키를 입력해주세요.');
    if (!managerKey) return;

    const nextPassword = prompt('새 글 비밀번호를 입력해주세요.\n4자리 이상 권장');
    if (!nextPassword) return;
    if (String(nextPassword).trim().length < 4) {
      alert('새 비밀번호는 4자리 이상 입력해주세요.');
      return;
    }

    if (!confirm('이 글의 비밀번호를 새 비밀번호로 변경할까요?')) return;

    try {
      const res = await fetch('/api/inquiry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id,
          password: managerKey,
          newPassword: String(nextPassword).trim()
        })
      });
      const result = await res.json().catch(function() { return {}; });

      if (res.ok && result.status === 'success') {
        setManagerKey(managerKey);
        updateManagerButtonState();
        alert('글 비밀번호가 새로 설정되었습니다.');
      } else {
        alert('비밀번호 재설정 실패: ' + (result.message || '관리자 키를 확인해주세요.'));
      }
    } catch (err) {
      console.error('[Inquiry] Password reset failed:', err);
      alert('비밀번호 재설정 중 오류가 발생했습니다.');
    }
  }

  function install() {
    if (!global.ThisOneUI) return;

    global.ThisOneUI.deleteInquiry = deleteInquiry;
    global.ThisOneUI.resetInquiryPassword = resetInquiryPassword;
    global.ThisOneUI.prepareEdit = prepareEditWithManagerKey;
    global.ThisOneUI.enableInquiryManager = function() {
      const key = prompt('관리자 키를 입력해주세요.');
      if (!key) return;
      setManagerKey(key);
      updateManagerButtonState();
      alert('관리자 모드가 켜졌습니다.');
    };
    global.ThisOneUI.disableInquiryManager = function() {
      clearManagerKey();
      updateManagerButtonState();
    };

    if (typeof global.ThisOneUI.openInquiryBoard === 'function' && !global.ThisOneUI.openInquiryBoard.__adminPatchApplied) {
      const originalOpenInquiryBoard = global.ThisOneUI.openInquiryBoard;
      const patchedOpenInquiryBoard = function() {
        const result = originalOpenInquiryBoard.apply(this, arguments);
        setTimeout(addManagerButton, 0);
        setTimeout(addAdminButtons, 0);
        setTimeout(addManagerButton, 300);
        setTimeout(addAdminButtons, 300);
        setTimeout(addAdminButtons, 900);
        return result;
      };
      patchedOpenInquiryBoard.__adminPatchApplied = true;
      global.ThisOneUI.openInquiryBoard = patchedOpenInquiryBoard;
    }

    addManagerButton();
    addAdminButtons();
    updateManagerButtonState();
  }

  function start() {
    install();
    try {
      const observer = new MutationObserver(function() {
        install();
        addManagerButton();
        addAdminButtons();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  global.addEventListener('load', install);
})(window);
