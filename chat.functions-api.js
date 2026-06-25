// Cloudflare Pages Function — POST /api/chat
//
// Keeps the Gemini API key server-side. The browser sends the conversation
// history and (optionally) the current detection results; this function
// forwards a request to Gemini and returns just the reply text.
//
// Requires a secret environment variable named GEMINI_API_KEY, set in the
// Cloudflare dashboard under Workers & Pages > your project > Settings >
// Variables and Secrets (type: Secret). It is never exposed to the browser.

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'Server is missing GEMINI_API_KEY. Add it in Cloudflare Pages settings.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const { message, history, detections, minerals } = body || {};

  if (!message || typeof message !== 'string') {
    return jsonResponse({ error: 'Missing "message" string in request body.' }, 400);
  }

  // Build conversation contents for Gemini: prior turns, then the new message.
  // Each history item is expected as { role: 'user' | 'model', text: string }.
  const contents = [];

  if (Array.isArray(history)) {
    for (const turn of history.slice(-10)) {
      if (!turn || typeof turn.text !== 'string') continue;
      const role = turn.role === 'model' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: turn.text }] });
    }
  }

  let userText = message;
  const contextLines = [];

  if (Array.isArray(detections) && detections.length > 0) {
    const detectionSummary = detections
      .map((d) => `${d.label} (${Math.round((d.value || 0) * 100)}% confidence)`)
      .join(', ');
    contextLines.push(`Current camera detections: ${detectionSummary}`);
  } else if (detections !== undefined) {
    contextLines.push('Current camera detections: none right now');
  }

  // The frontend's mineral lookup (local dataset or /api/minerals) hands us
  // the specific minerals already matched to the detected device. Folding
  // that into the prompt means Gemini answers with the right minerals for
  // what's actually on screen, instead of guessing from the device name alone.
  if (minerals && Array.isArray(minerals.minerals) && minerals.minerals.length > 0) {
    const mineralLines = minerals.minerals.map((m) => {
      const bits = [`- ${m.name}${m.symbol ? ` (${m.symbol})` : ''}`];
      if (m.foundIn && m.foundIn.length) bits.push(`found in: ${[].concat(m.foundIn).join(', ')}`);
      if (m.where) bits.push(`source: ${m.where}`);
      if (m.purpose) bits.push(`purpose: ${m.purpose}`);
      return bits.join(' — ');
    });
    contextLines.push(
      `Known minerals in the detected ${minerals.device || 'device'}:\n${mineralLines.join('\n')}`
    );
  }

  if (contextLines.length > 0) {
    userText = `${contextLines.join('\n\n')}\n\nUser question: ${message}`;
  }

  contents.push({ role: 'user', parts: [{ text: userText }] });

  const geminiRequestBody = {
    contents,
    systemInstruction: {
      parts: [
        {
          text:
            'You are a knowledgeable, friendly assistant embedded in a live camera app that scans ' +
            'everyday devices (phones, laptops, batteries) and identifies the minerals they contain. ' +
            'You may be given the current camera detections and a list of known minerals for the ' +
            'detected device, as context — use that context to ground your answers in specifics: ' +
            'where each mineral is mined, what role it plays in the device, and interesting facts ' +
            'about its supply chain or properties. Keep answers conversational and concise (2-5 ' +
            'sentences unless the user asks for more detail). If no detections or minerals are ' +
            'provided, or the question is unrelated to them, just answer normally.',
        },
      ],
    },
  };

  let geminiResponse;
  try {
    geminiResponse = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify(geminiRequestBody),
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to reach Gemini API: ' + err.message }, 502);
  }

  if (!geminiResponse.ok) {
    const errText = await geminiResponse.text().catch(() => '');
    return jsonResponse({ error: 'Gemini API error (' + geminiResponse.status + '): ' + errText }, 502);
  }

  const data = await geminiResponse.json();
  const reply = extractText(data);

  if (!reply) {
    return jsonResponse({ error: 'Gemini returned no usable response.' }, 502);
  }

  return jsonResponse({ reply });
}

function extractText(geminiData) {
  const candidate = geminiData?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  return parts
    .map((p) => p.text || '')
    .join('')
    .trim();
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
