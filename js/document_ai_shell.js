(function (global) {
  if (global.__thisOneDocumentAIShellApplied) return;
  global.__thisOneDocumentAIShellApplied = true;

  const DOCUMENT_AI_MODE = 'document-ai';
  const READY_MESSAGE = '문서풀이 기능은 준비 중입니다.\n곧 문서를 쉽게 풀어드릴게요.';

  function setSearchModeShell() {
    document.body.classList.add('search-mode');
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.classList.add('hidden');
    const landingSearch = document.getElementById('landingSearch');
    if (landingSearch) landingSearch.scrollIntoView({ block: 'start' });
  }

  function renderDocumentAIShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    container.innerHTML = `
      <section class="document-ai-panel" data-mode="${DOCUMENT_AI_MODE}" aria-labelledby="documentAiTitle">
        <div class="document-ai-copy">
          <p class="document-ai-eyebrow">문서 풀기</p>
          <h2 id="documentAiTitle">디스원 문서풀이</h2>
          <p class="document-ai-main-copy">어려운 문서, 읽지 말고 물어보세요.</p>
          <p class="document-ai-sub-copy">PDF나 사진을 올리면 AI가 쉽게 풀어주고, 궁금한 점에 답해드립니다.</p>
        </div>

        <label class="document-ai-upload" for="documentAiFileInput">
          <span class="document-ai-upload-title">파일 업로드 영역</span>
          <span class="document-ai-upload-copy">PDF, 사진, 캡처 이미지를 올려주세요.</span>
          <span class="document-ai-upload-action">파일 선택</span>
        </label>
        <input class="document-ai-file-input" id="documentAiFileInput" type="file" accept="application/pdf,image/*" aria-label="문서 파일 업로드">

        <div class="document-ai-privacy" role="note" aria-label="개인정보 안내">
          <strong>개인정보 안내</strong>
          <p>개인정보는 종이나 손가락으로 가리고 올려주세요.</p>
          <p>디스원은 이름이 아니라 문서의 뜻을 풀어드립니다.</p>
          <p>이름, 주민번호, 주소, 전화번호, 계좌번호, 카드번호는 문서풀이에 필요하지 않습니다.</p>
        </div>

        <label class="document-ai-question-label" for="documentAiQuestion">질문 입력창</label>
        <textarea class="document-ai-question" id="documentAiQuestion" rows="3" placeholder="이 문서에서 궁금한 점을 물어보세요. 예: 내가 해야 할 일만 알려줘"></textarea>

        <button class="document-ai-submit" id="documentAiSubmit" type="button">문서 풀기</button>
        <p class="document-ai-placeholder" id="documentAiPlaceholder" role="status" aria-live="polite" hidden></p>
      </section>
    `;

    const button = document.getElementById('documentAiSubmit');
    const placeholder = document.getElementById('documentAiPlaceholder');
    button?.addEventListener('click', () => {
      if (!placeholder) return;
      placeholder.textContent = READY_MESSAGE;
      placeholder.hidden = false;
    });
  }

  function openDocumentAI() {
    setSearchModeShell();
    renderDocumentAIShell();
  }

  global.ThisOneDocumentAI = {
    open: openDocumentAI,
    mode: DOCUMENT_AI_MODE
  };
})(window);
