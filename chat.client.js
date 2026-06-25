(() => {
  const messagesEl = document.getElementById('chat-messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const suggestionsEl = document.getElementById('chat-suggestions'); // optional, skip gracefully if absent

  const history = []; // { role: 'user' | 'model', text: string }
  let sending = false;
  let lastSuggestionDevice = null; // tracks which device's chips are currently shown

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Very small, safe subset of markdown: **bold** and line breaks only.
  // Everything is escaped first, so this can't be used to inject HTML.
  function formatModelText(str) {
    const escaped = escapeHtml(str);
    const bolded = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return bolded.replace(/\n/g, '<br>');
  }

  function clearEmptyState() {
    const empty = messagesEl.querySelector('.chat-empty');
    if (empty) empty.remove();
  }

  function appendMessage(role, text) {
    clearEmptyState();
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    if (role === 'model') {
      div.innerHTML = formatModelText(text);
    } else {
      div.textContent = text;
    }
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

  // --- Context gathering ---------------------------------------------------

  function getCurrentDetections() {
    return Array.isArray(window.__latestDetections) ? window.__latestDetections : [];
  }

  function getCurrentMinerals() {
    // Populated by app.js after a successful detection + mineral lookup.
    // Shape: { device, summary, minerals: [{ name, symbol, foundIn, where, purpose, funFact }] }
    return window.__latestMinerals || null;
  }

  // --- Suggested questions ---------------------------------------------------
  // When a new device is detected, offer a few tappable starter questions
  // grounded in that device's actual minerals, so the user doesn't have to
  // think of what to ask.

  function buildSuggestions(minerals) {
    if (!minerals || !Array.isArray(minerals.minerals) || !minerals.minerals.length) return [];
    const device = minerals.device || 'this device';
    const firstMineral = minerals.minerals[0].name;
    const secondMineral = minerals.minerals[1] ? minerals.minerals[1].name : null;

    const suggestions = [
      `What minerals are in this ${device.toLowerCase()}?`,
      `Where does ${firstMineral.toLowerCase()} come from?`,
      `Why is ${firstMineral.toLowerCase()} used in a ${device.toLowerCase()}?`,
    ];
    if (secondMineral) {
      suggestions.push(`Compare ${firstMineral.toLowerCase()} and ${secondMineral.toLowerCase()}`);
    }
    return suggestions;
  }

  function renderSuggestions() {
    if (!suggestionsEl) return;
    const minerals = getCurrentMinerals();
    const deviceKey = minerals ? minerals.device : null;

    if (!minerals) {
      if (lastSuggestionDevice !== null) {
        suggestionsEl.innerHTML = '';
        suggestionsEl.hidden = true;
        lastSuggestionDevice = null;
      }
      return;
    }

    if (deviceKey === lastSuggestionDevice) return; // already showing chips for this device
    lastSuggestionDevice = deviceKey;

    const suggestions = buildSuggestions(minerals);
    if (!suggestions.length) {
      suggestionsEl.innerHTML = '';
      suggestionsEl.hidden = true;
      return;
    }

    suggestionsEl.hidden = false;
    suggestionsEl.innerHTML = suggestions
      .map((s) => `<button type="button" class="chat-suggestion-chip">${escapeHtml(s)}</button>`)
      .join('');

    suggestionsEl.querySelectorAll('.chat-suggestion-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (sending) return;
        sendMessage(btn.textContent);
      });
    });
  }

  // Poll lightly for new detections/minerals so suggestion chips update as
  // the user points the camera at different things, without needing app.js
  // to know anything about chat.js (keeps the two modules decoupled).
  setInterval(renderSuggestions, 1500);

  // --- Sending ---------------------------------------------------------------

  async function sendMessage(text) {
    sending = true;
    sendBtn.disabled = true;

    appendMessage('user', text);
    const pending = appendPending();

    const detections = getCurrentDetections();
    const minerals = getCurrentMinerals();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          detections,
          // Sending the mineral context lets the backend ground its answer
          // in exactly what's on screen, instead of just the bare label.
          minerals,
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

  // Initial check in case a detection already happened before chat.js loaded.
  renderSuggestions();
})();
