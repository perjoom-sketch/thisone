(function (global) {
  const LOVEME_MODE = 'loveme';
  const SYSTEM_PROMPT = `You are LoveMe, a warm and slightly funny personal styling assistant.

LoveMe gives non-surgical styling advice for appearance concerns.
LoveMe helps users naturally complement concerns with hairstyle, makeup, clothing, glasses, accessories, colors, styling, and presentation choices.

Core identity in Korean:
럽미
아무 걱정하지 마세요.
고치지 않고, 어울리게 연출해드립니다.
수술은 병원에서
연출은 럽미에서.

Rules:
- Do not recommend plastic surgery.
- Do not suggest medical procedures.
- Do not diagnose the face or body.
- Do not rate appearance.
- Do not insult or directly confirm negative appearance concerns.
- Do not joke at the user's expense.
- Humor should reduce tension, not attack the user.
- Do not ask for photo uploads or face analysis.
- Do not use “착시” in any LoveMe response.
- Do not use “힘을 빌려보겠습니다”.
- Use “연출”, “스타일링”, and “자연스럽게 보완”.
- Keep jokes soft and natural.
- Move quickly into practical styling advice.

Tone:
- Warm
- Reassuring
- Slightly witty
- Practical
- On the user's side
- Not clinical
- Not too serious

Opening style:
When the user states a concern, lightly soften it first.
For example, if the user says their face looks large, start with a gentle deflection like:
네? 그럴 리가요.
아무 걱정하지 마세요.
Then explain this is not about changing the face, but using hair, color, fit, makeup, glasses, accessories, and styling to naturally complement the concern.
If the user mentions frizzy wavy hair on rainy days, blame humidity lightly and reassure them.

Answer in Korean unless the user clearly asks for another language.

Use this structure when relevant:
1. Light reassuring opening
2. Short witty line
3. Styling direction
4. Hair recommendation
5. Makeup recommendation if relevant
6. Clothing/fit recommendation if relevant
7. Glasses/accessories/color recommendation if relevant
8. What to avoid
9. Styling recipe
10. Sentence to tell a hairdresser or stylist
11. Shopping search keywords if relevant

Keep it practical and kind. Avoid long lectures.`;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function enterLoveMeMode() {
    global.ThisOneAIToolVoice?.stopAll?.();
    document.body.classList.add('ai-tool-mode', 'loveme-mode');
    document.body.classList.remove('document-ai-mode', 'instant-answer-mode', 'web-search-mode');
  }

  function setStatus(element, message) {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
  }

  function renderMarkdownLite(text) {
    const safe = escapeHtml(text || '').trim();
    if (!safe) return '';

    const withBold = safe.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    return withBold
      .replace(/^###\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/^##\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/^#\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  async function requestLoveMeAnswer(concern, onChunk) {
    const payload = {
      model: 'gemini-2.5-flash',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: concern }]
    };

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return response.text();

    const decoder = new TextDecoder();
    let fullText = '';
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        const chunk = decoder.decode(result.value, { stream: true });
        fullText += chunk;
        if (typeof onChunk === 'function') onChunk(chunk, fullText);
      }
    }
    return fullText;
  }

  function renderLoveMeShell() {
    const container = document.getElementById('msgContainer');
    if (!container) return;

    container.innerHTML = `
      <section class="loveme-panel" aria-label="럽미 스타일링 상담">
        ${global.ThisOneModeTabs?.render?.(LOVEME_MODE) || ''}
        <div class="loveme-copy">
          <p class="loveme-eyebrow">스타일링 상담</p>
          <h2 class="loveme-title">럽미</h2>
          <p class="loveme-main-copy">아무 걱정하지 마세요.<br>고치지 않고, 어울리게 연출해드립니다.</p>
          <p class="loveme-description">신경 쓰이는 부분을 편하게 말해보세요.<br>헤어, 메이크업, 의상, 색상으로 자연스럽게 보완해드릴게요.</p>
          <p class="loveme-sub-copy">수술은 병원에서<br>연출은 럽미에서</p>
        </div>

        <div class="loveme-composer">
          <div class="loveme-composer-top">
            <label class="loveme-question-label" for="loveMeConcern">스타일링 고민 입력창</label>
            <textarea class="loveme-question" id="loveMeConcern" rows="1" aria-label="럽미 스타일링 고민 입력창" placeholder="예: 얼굴이 큰 편입니다, 이마가 넓어요, 반곱슬이라 비 오는 날 머리가 부스스해요"></textarea>
          </div>
          <div class="loveme-composer-bottom">
            <p class="loveme-helper">사진 없이도 괜찮아요. 고민만 말해주시면 바로 스타일링해드릴게요.</p>
            <button class="loveme-submit" id="loveMeSubmit" type="button">럽미 시작</button>
          </div>
        </div>

        <p class="loveme-status" id="loveMeStatus" role="status" aria-live="polite" hidden></p>
        <div class="loveme-result" id="loveMeResult" aria-live="polite" hidden></div>
      </section>
    `;

    const root = container.querySelector('.loveme-panel');
    const concern = root.querySelector('#loveMeConcern');
    const submit = root.querySelector('#loveMeSubmit');
    const status = root.querySelector('#loveMeStatus');
    const result = root.querySelector('#loveMeResult');

    global.ThisOneModeTabs?.bind?.(root);

    concern?.addEventListener('input', () => {
      concern.style.height = 'auto';
      concern.style.height = `${concern.scrollHeight / 16}rem`;
    });

    concern?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit?.click();
      }
    });

    submit?.addEventListener('click', async () => {
      const text = concern.value.trim();
      if (!text) {
        setStatus(status, '신경 쓰이는 부분을 편하게 적어주세요. 럽미는 편입니다.');
        concern.focus();
        return;
      }

      submit.disabled = true;
      result.hidden = false;
      result.innerHTML = '';
      setStatus(status, '럽미가 어울리는 스타일링을 찾는 중입니다...');

      try {
        const answer = await requestLoveMeAnswer(text, (chunk, fullText) => {
          result.innerHTML = renderMarkdownLite(fullText || chunk);
        });
        result.innerHTML = renderMarkdownLite(answer);
        setStatus(status, '스타일링 답변이 완료되었습니다.');
      } catch (error) {
        result.innerHTML = '';
        result.hidden = true;
        setStatus(status, `럽미 답변 생성 중 오류가 발생했습니다. ${error.message || ''}`.trim());
      } finally {
        submit.disabled = false;
      }
    });
  }

  function openLoveMe() {
    enterLoveMeMode();
    renderLoveMeShell();
  }

  global.ThisOneLoveMe = {
    open: openLoveMe,
    mode: LOVEME_MODE
  };
})(window);
