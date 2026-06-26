(() => {
  const messagesEl = document.getElementById('chat-messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const typingEl = document.getElementById('chat-typing');
  const typingLabelEl = document.getElementById('typing-label');

  const history = []; // { role: 'user' | 'model', text: string }
  let sending = false;
  let typingStatusTimer = null;

  const TYPING_STATUSES = ['Thinking…', 'Checking the detection…', 'Looking up minerals…', 'Putting it together…'];

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function clearEmptyState() {
    const empty = messagesEl.querySelector('.chat-empty');
    if (empty) empty.remove();
  }

  function appendMessage(role, text) {
    clearEmptyState();
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function startTyping() {
    typingEl.hidden = false;
    let i = 0;
    typingLabelEl.textContent = TYPING_STATUSES[0];
    typingStatusTimer = setInterval(() => {
      i = (i + 1) % TYPING_STATUSES.length;
      typingLabelEl.textContent = TYPING_STATUSES[i];
    }, 900);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function stopTyping() {
    typingEl.hidden = true;
    if (typingStatusTimer) {
      clearInterval(typingStatusTimer);
      typingStatusTimer = null;
    }
  }

  // Small deliberate delay so replies don't feel instant — the typing
  // indicator gets a moment to be seen even if the network is fast.
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function sendMessage(text) {
    sending = true;
    sendBtn.disabled = true;

    appendMessage('user', text);
    startTyping();

    const detections = Array.isArray(window.__latestDetections) ? window.__latestDetections : [];
    const startedAt = Date.now();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          detections,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Ensure the typing indicator is visible for at least ~1.1s total,
      // so the pacing feels considered rather than instantaneous.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1100) await wait(1100 - elapsed);

      stopTyping();

      if (!res.ok || data.error) {
        appendMessage('error', data.error || `Request failed (${res.status})`);
        return;
      }

      appendMessage('model', data.reply);
      history.push({ role: 'user', text });
      history.push({ role: 'model', text: data.reply });
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1100) await wait(1100 - elapsed);
      stopTyping();
      appendMessage('error', 'Could not reach the server: ' + (err.message || err));
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  }

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sending) return;

    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    sendMessage(text);
  });
})();
