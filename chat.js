(() => {
  const messagesEl = document.getElementById('chat-messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  const history = []; // { role: 'user' | 'model', text: string }
  let sending = false;

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

  function appendPending() {
    clearEmptyState();
    const div = document.createElement('div');
    div.className = 'chat-msg model pending';
    div.textContent = 'Thinking…';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  async function sendMessage(text) {
    sending = true;
    sendBtn.disabled = true;

    appendMessage('user', text);
    const pending = appendPending();

    const detections = Array.isArray(window.__latestDetections) ? window.__latestDetections : [];
    const selectedObject = window.__selectedObject || '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          detections,
          selectedObject,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        pending.remove();
        appendMessage('error', data.error || `Request failed (${res.status})`);
        return;
      }

      pending.remove();
      appendMessage('model', data.reply);

      history.push({ role: 'user', text });
      history.push({ role: 'model', text: data.reply });
    } catch (err) {
      pending.remove();
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
