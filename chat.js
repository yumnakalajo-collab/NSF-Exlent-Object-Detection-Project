// Frontend UI Controller (Outside chat.js)
document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('chat-form'); // Adjust to your form ID
  const userInput = document.getElementById('user-input'); // Adjust to your text input ID
  const chatDisplay = document.getElementById('chat-display'); // Adjust to your chat history container

  // Track simple history array required by your backend format
  let conversationHistory = [];

  if (chatForm) {
    chatForm.addEventListener('submit', async (event) => {
      // 1. STOP the page from reloading
      event.preventDefault();

      const messageText = userInput.value.trim();
      if (!messageText) return;

      // Append user message to local UI window
      appendMessageToUI('user', messageText);
      userInput.value = '';

      // 2. Gather context variables if your camera app sets them globally
      // (If these aren't set up yet, fallback to empty arrays/objects)
      const currentDetections = window.currentCameraDetections || []; 
      const currentMinerals = window.currentMineralPayload || null; 

      try {
        // 3. Make the clean fetch to your integrated backend route
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: messageText,
            history: conversationHistory,
            detections: currentDetections,
            minerals: currentMinerals
          })
        });

        const data = await response.json();

        if (response.ok && data.reply) {
          appendMessageToUI('model', data.reply);
          
          // Keep track of history turns for future prompts (max 10 turns managed by server)
          conversationHistory.push({ role: 'user', text: messageText });
          conversationHistory.push({ role: 'model', text: data.reply });
        } else {
          appendMessageToUI('system', `Error: ${data.error || 'Unknown server error.'}`);
        }
      } catch (err) {
        appendMessageToUI('system', `Failed to connect: ${err.message}`);
      }
    });
  }

  function appendMessageToUI(sender, text) {
    if (!chatDisplay) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}-message`;
    msgDiv.textContent = text;
    chatDisplay.appendChild(msgDiv);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
  }
});
