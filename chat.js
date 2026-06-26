(() => {
  const messagesEl = document.getElementById('chat-messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const statusDotEl = document.getElementById('chat-status-dot');
  const statusTextEl = document.getElementById('chat-status-text');

  const history = []; // { role: 'user' | 'model', text: string }
  let sending = false;

  // A reply that lands in 200ms still feels instant/robotic. Holding the
  // typing bubble for a short, slightly randomized stretch makes the
  // exchange feel like a conversation rather than a form submission —
  // fixed timing on every message would itself feel mechanical.
  const MIN_THINKING_MS = 500;
  const MAX_THINKING_MS = 1100;

  function pickThinkingDelay() {
    return MIN_THINKING_MS + Math.random() * (MAX_THINKING_MS - MIN_THINKING_MS);
  }

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

  function appendTypingBubble() {
    clearEmptyState();
    const div = document.createElement('div');
    div.className = 'chat-msg model typing-bubble';
    div.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --- Online/offline status ------------------------------------------------
  // Lights up green ("Online") once a lightweight ping to /api/chat's host
  // succeeds, amber while checking, red if it fails. Re-checks periodically
  // and whenever the browser regains connectivity.

  function setChatStatus(state, label) {
    if (!statusDotEl || !statusTextEl) return;
    statusDotEl.className = 'chat-status-dot ' + state;
    statusTextEl.textContent = label;
  }

  async function checkOnlineStatus() {
    if (!navigator.onLine) {
      setChatStatus('offline', 'Offline');
      return;
    }
    setChatStatus('checking', 'Connecting…');
    try {
      // Any HTTP response (even 405/404) proves the network path to the
      // function is alive, without spending a real Gemini call just to check.
      await fetch('/api/chat', { method: 'HEAD' });
      setChatStatus('online', 'Online');
    } catch {
      setChatStatus('offline', 'Offline');
    }
  }

  checkOnlineStatus();
  setInterval(checkOnlineStatus, 30000);
  window.addEventListener('online', checkOnlineStatus);
  window.addEventListener('offline', () => setChatStatus('offline', 'Offline'));

  // --- Sending ---------------------------------------------------------------

  async function sendMessage(text) {
    sending = true;
    sendBtn.disabled = true;

    appendMessage('user', text);
    const typingBubble = appendTypingBubble();
    const startedAt = Date.now();
    const thinkingDelay = pickThinkingDelay();

    const detections = Array.isArray(window.__latestDetections) ? window.__latestDetections : [];
    // Populated by app.js after it fetches /api/minerals for the current
    // detection. Sending it along lets the chat answer with the exact same
    // mineral facts shown in the sidebar panel, instead of guessing from
    // the bare device label.
    const minerals = window.__latestMinerals || null;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          detections,
          minerals,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Hold the typing bubble on screen for a believable minimum stretch.
      const elapsed = Date.now() - startedAt;
      const remaining = thinkingDelay - elapsed;
      if (remaining > 0) await wait(remaining);

      if (!res.ok || data.error) {
        typingBubble.remove();
        appendMessage('error', data.error || `Request failed (${res.status})`);
        setChatStatus('online', 'Online');
        return;
      }

      typingBubble.remove();
      appendMessage('model', data.reply);
      setChatStatus('online', 'Online');

      history.push({ role: 'user', text });
      history.push({ role: 'model', text: data.reply });
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      const remaining = thinkingDelay - elapsed;
      if (remaining > 0) await wait(remaining);

      typingBubble.remove();
      appendMessage('error', 'Could not reach the server: ' + (err.message || err));
      setChatStatus('offline', 'Offline');
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
