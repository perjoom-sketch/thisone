(function (global) {
  if (global.__thisOneDocumentAIShellApplied) return;
  global.__thisOneDocumentAIShellApplied = true;

  const DOCUMENT_AI_MODE = 'document-ai';
  const READY_MESSAGE = '해석 기능은 준비 중입니다.\n곧 어려운 내용을 쉽게 해석해드릴게요.';
  const UNSUPPORTED_FILE_MESSAGE = '현재는 PDF, 이미지, 텍스트만 해석할 수 있습니다.';
  const SUPPORTED_FILE_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);

  function isSupportedFile(file) {
    return file && SUPPORTED_FILE_TYPES.has(file.type);
  }

  function getFirstSupportedFile(fileList) {
    return Array.from(fileList || []).find(isSupportedFile) || null;
  }

  function setStatus(element, message) {
    if (!element) return;
    element.textContent = message;
    element.hidden = false;
  }

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
          <p class="document-ai-eyebrow">해석</p>
          <h2 id="documentAiTitle">디스원 해석</h2>
          <p class="document-ai-main-copy">어려운 글, 읽지 말고 물어보세요.</p>
          <p class="document-ai-sub-copy">PDF나 사진을 올리면 AI가 쉽게 해석하고, 궁금한 점에 답해드립니다.</p>
        </div>

        <label class="document-ai-upload" id="documentAiUpload" for="documentAiFileInput">
          <span class="document-ai-upload-title">파일 업로드 영역</span>
          <span class="document-ai-upload-copy">PDF, JPG, PNG, WebP 이미지를 하나만 올려주세요.</span>
          <span class="document-ai-upload-action">파일 선택</span>
        </label>
        <input class="document-ai-file-input" id="documentAiFileInput" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="문서 파일 업로드">

        <div class="document-ai-privacy" role="note" aria-label="개인정보 안내">
          <strong>개인정보 안내</strong>
          <p>개인정보는 종이나 손가락으로 가리고 올려주세요.</p>
          <p>디스원은 이름이 아니라 문서의 뜻을 풀어드립니다.</p>
          <p>이름, 주민번호, 주소, 전화번호, 계좌번호, 카드번호는 해석에 필요하지 않습니다.</p>
        </div>

        <label class="document-ai-question-label" for="documentAiQuestion">질문 입력창</label>
        <textarea class="document-ai-question" id="documentAiQuestion" rows="3" placeholder="이 문서에서 궁금한 점을 물어보세요. 예: 내가 해야 할 일만 알려줘"></textarea>

        <button class="document-ai-submit" id="documentAiSubmit" type="button">해석하기</button>
        <p class="document-ai-placeholder" id="documentAiPlaceholder" role="status" aria-live="polite" hidden></p>
      </section>
    `;

    const button = document.getElementById('documentAiSubmit');
    const placeholder = document.getElementById('documentAiPlaceholder');
    const fileInput = document.getElementById('documentAiFileInput');
    const upload = document.getElementById('documentAiUpload');
    const question = document.getElementById('documentAiQuestion');
    function handleFiles(fileList) {
      if (!fileList || fileList.length === 0) return;

      const file = getFirstSupportedFile(fileList);
      if (!file) {
        setStatus(placeholder, UNSUPPORTED_FILE_MESSAGE);
        if (fileInput) fileInput.value = '';
        return;
      }

      setStatus(placeholder, `${file.name || '붙여넣은 이미지'} 파일을 선택했습니다.`);
    }

    button?.addEventListener('click', () => {
      setStatus(placeholder, READY_MESSAGE);
    });

    fileInput?.addEventListener('change', (event) => {
      handleFiles(event.target.files);
    });

    upload?.addEventListener('dragover', (event) => {
      event.preventDefault();
    });

    upload?.addEventListener('drop', (event) => {
      event.preventDefault();
      handleFiles(event.dataTransfer?.files);
    });

    question?.addEventListener('paste', (event) => {
      const files = Array.from(event.clipboardData?.files || []);
      if (files.length === 0) return;

      event.preventDefault();
      handleFiles(files);
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
