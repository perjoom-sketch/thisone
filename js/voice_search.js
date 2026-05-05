(function applyVoiceSearch(global) {
  if (global.__thisOneVoiceSearchApplied) return;
  global.__thisOneVoiceSearchApplied = true;

  let recognition = null;
  let isRecording = false;
  let voiceToastEl = null;
  let voiceToastTimer = null;

  function ensureStyle() {
    if (document.getElementById('thisoneVoiceSearchStyle')) return;

    const style = document.createElement('style');
    style.id = 'thisoneVoiceSearchStyle';
    style.textContent = `
      .mic-btn.recording {
        color: #ef4444 !important;
        animation: thisoneMicPulse 1.2s ease-in-out infinite;
      }

      @keyframes thisoneMicPulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.6;
          transform: scale(1.1);
        }
      }

      .voice-toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 12px 20px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 600;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.25s ease;
        pointer-events: none;
        white-space: nowrap;
        box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      }

      .voice-toast.show {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  function getSpeechRecognition() {
    return global.SpeechRecognition || global.webkitSpeechRecognition;
  }

  function getInput() {
    return document.getElementById('msgInput');
  }

  function getMicBtn() {
    return document.getElementById('micBtn');
  }

  function setRecordingState(active) {
    isRecording = !!active;
    const btn = getMicBtn();
    if (btn) {
      btn.classList.toggle('recording', isRecording);
      btn.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
      btn.title = isRecording ? '음성 입력 중지' : '음성 입력';
    }
  }

  function showVoiceToast(message) {
    if (!voiceToastEl) {
      voiceToastEl = document.createElement('div');
      voiceToastEl.className = 'voice-toast';
      document.body.appendChild(voiceToastEl);
    }

    voiceToastEl.textContent = message;
    voiceToastEl.classList.add('show');

    clearTimeout(voiceToastTimer);
    voiceToastTimer = setTimeout(hideVoiceToast, 2500);
  }

  function hideVoiceToast() {
    if (voiceToastEl) voiceToastEl.classList.remove('show');
    clearTimeout(voiceToastTimer);
  }

  function initVoiceRecognition() {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return null;

    const recog = new SpeechRecognition();
    recog.lang = 'ko-KR';
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      setRecordingState(true);
      showVoiceToast('🎤 말씀해주세요...');
    };

    recog.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0]?.transcript || '';
      }

      const input = getInput();
      if (input) {
        input.value = transcript.trim();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        try { global.autoResize?.(input); } catch (e) {}
      }
    };

    recog.onerror = (event) => {
      setRecordingState(false);

      let message = '음성 인식 오류가 발생했습니다.';
      if (event.error === 'no-speech') message = '음성이 감지되지 않았습니다.';
      else if (event.error === 'not-allowed' || event.error === 'permission-denied' || event.error === 'service-not-allowed') message = '🎤 마이크 권한을 허용해주세요.';
      else if (event.error === 'network') message = '네트워크 오류가 발생했습니다.';

      showVoiceToast(message);
    };

    recog.onend = () => {
      setRecordingState(false);
      hideVoiceToast();
      const input = getInput();
      if (input) input.focus();
    };

    return recog;
  }

  function toggleVoiceInput() {
    if (!recognition) {
      recognition = initVoiceRecognition();
      if (!recognition) {
        showVoiceToast('이 브라우저는 음성 입력을 지원하지 않습니다. Chrome 또는 Safari를 사용해주세요.');
        return;
      }
    }

    if (isRecording) {
      try { recognition.stop(); } catch (e) {}
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      console.error('[ThisOne][voice] start failed:', error);
      showVoiceToast('음성 인식을 시작할 수 없습니다. 다시 시도해주세요.');
    }
  }

  function install() {
    ensureStyle();
    const btn = getMicBtn();
    if (!btn || btn.dataset.voiceBound === 'true') return;
    btn.dataset.voiceBound = 'true';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleVoiceInput();
    });
  }

  global.toggleVoiceInput = toggleVoiceInput;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  const observer = new MutationObserver(install);
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  global.addEventListener('load', install);
})(window);
