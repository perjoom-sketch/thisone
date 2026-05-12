(function (global) {
  if (global.ThisOneAIToolVoice) return;

  const UNSUPPORTED_MESSAGE = '이 브라우저에서는 음성 입력을 지원하지 않습니다.';
  const LISTENING_MESSAGE = '듣고 있습니다...';
  const NO_SPEECH_MESSAGE = '음성이 감지되지 않았습니다.';
  const SILENCE_TIMEOUT_MS = 5000;
  const TITLE = '음성으로 입력';
  const LISTENING_TITLE = '듣는 중...';
  const MIC_ICON = `
    <svg class="ai-tool-mic-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <path d="M12 19v3"></path>
      <path d="M8 22h8"></path>
    </svg>
  `;
  const controllers = new Set();
  let activeController = null;

  function getSpeechRecognition() {
    return global.SpeechRecognition || global.webkitSpeechRecognition || null;
  }

  function setStatus(status, message) {
    if (!status) return;
    status.textContent = message || '';
    status.hidden = !message;
  }

  function setButtonContent(button, isListening) {
    if (!button) return;
    button.innerHTML = MIC_ICON;
    button.title = isListening ? LISTENING_TITLE : TITLE;
  }

  function dispatchInput(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function appendTranscript(input, transcript, appendMode) {
    const cleanTranscript = String(transcript || '').replace(/\s+/g, ' ').trim();
    if (!input || !cleanTranscript) return;

    const currentValue = String(input.value || '').trimEnd();
    if (!currentValue) {
      input.value = cleanTranscript;
    } else if (appendMode === 'newline') {
      input.value = `${currentValue}\n${cleanTranscript}`;
    } else {
      input.value = `${currentValue} ${cleanTranscript}`;
    }

    dispatchInput(input);
    input.focus();
  }

  function clearSilenceTimer(controller) {
    if (!controller?.silenceTimerId) return;
    clearTimeout(controller.silenceTimerId);
    controller.silenceTimerId = null;
  }

  function startSilenceTimer(controller) {
    clearSilenceTimer(controller);
    controller.silenceTimerId = setTimeout(() => {
      controller.silenceTimerId = null;
      if (!controller.isListening || controller.hasFinalTranscript) return;
      controller.pendingStatusMessage = NO_SPEECH_MESSAGE;
      stopController(controller);
    }, SILENCE_TIMEOUT_MS);
  }

  function stopController(controller) {
    if (!controller) return;
    clearSilenceTimer(controller);
    if (!controller.isListening) return;
    controller.shouldRefocus = false;
    try { controller.recognition?.stop(); } catch (e) {}
  }

  function stopAll() {
    controllers.forEach(stopController);
  }

  function attach(options) {
    const button = options?.button || null;
    const input = options?.input || null;
    const status = options?.status || null;
    const appendMode = options?.appendMode === 'newline' ? 'newline' : 'space';
    const SpeechRecognition = getSpeechRecognition();

    if (!button || !input) return null;

    button.type = 'button';
    button.title = TITLE;
    button.setAttribute('aria-label', '음성으로 입력');
    button.setAttribute('aria-pressed', 'false');
    setButtonContent(button, false);

    if (!SpeechRecognition) {
      button.disabled = true;
      button.hidden = false;
      setStatus(status, UNSUPPORTED_MESSAGE);
      return null;
    }

    const recognition = new SpeechRecognition();
    const controller = {
      button,
      input,
      recognition,
      status,
      appendMode,
      isListening: false,
      shouldRefocus: false,
      silenceTimerId: null,
      hasFinalTranscript: false,
      pendingStatusMessage: ''
    };

    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    function setListening(isListening) {
      controller.isListening = Boolean(isListening);
      button.classList.toggle('is-listening', controller.isListening);
      button.setAttribute('aria-pressed', controller.isListening ? 'true' : 'false');
      setButtonContent(button, controller.isListening);
      if (controller.isListening) setStatus(status, LISTENING_MESSAGE);
      else setStatus(status, '');
    }

    recognition.onstart = () => {
      if (activeController && activeController !== controller) stopController(activeController);
      activeController = controller;
      controller.shouldRefocus = true;
      controller.hasFinalTranscript = false;
      controller.pendingStatusMessage = '';
      setListening(true);
      startSilenceTimer(controller);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) finalTranscript += result[0]?.transcript || '';
      }
      if (finalTranscript) {
        controller.hasFinalTranscript = true;
        clearSilenceTimer(controller);
        appendTranscript(input, finalTranscript, appendMode);
      }
    };

    recognition.onerror = (event) => {
      clearSilenceTimer(controller);
      setListening(false);
      const permissionErrors = new Set(['not-allowed', 'permission-denied', 'service-not-allowed']);
      if (permissionErrors.has(event?.error)) {
        controller.pendingStatusMessage = '마이크 권한을 허용해주세요.';
      } else if (event?.error === 'no-speech') {
        controller.pendingStatusMessage = NO_SPEECH_MESSAGE;
      } else {
        controller.pendingStatusMessage = '음성 인식 중 오류가 발생했습니다.';
      }
      setStatus(status, controller.pendingStatusMessage);
    };

    recognition.onend = () => {
      const shouldFocus = controller.shouldRefocus;
      const pendingStatusMessage = controller.pendingStatusMessage;
      clearSilenceTimer(controller);
      setListening(false);
      if (pendingStatusMessage) setStatus(status, pendingStatusMessage);
      if (activeController === controller) activeController = null;
      if (shouldFocus) input.focus();
      controller.shouldRefocus = false;
      controller.pendingStatusMessage = '';
    };

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (controller.isListening) {
        stopController(controller);
        return;
      }

      stopAll();
      try {
        recognition.start();
      } catch (error) {
        setListening(false);
        setStatus(status, '음성 인식을 시작할 수 없습니다. 다시 시도해주세요.');
      }
    });

    controllers.add(controller);
    return {
      stop: () => stopController(controller),
      destroy: () => {
        stopController(controller);
        clearSilenceTimer(controller);
        controllers.delete(controller);
        if (activeController === controller) activeController = null;
      }
    };
  }

  global.ThisOneAIToolVoice = {
    attach,
    stopAll,
    unsupportedMessage: UNSUPPORTED_MESSAGE
  };
})(window);
