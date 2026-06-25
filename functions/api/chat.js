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

  const { message, history, detections } = body || {};

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
  if (Array.isArray(detections) && detections.length > 0) {
    const detectionSummary = detections
      .map((d) => `${d.label} (${Math.round((d.value || 0) * 100)}% confidence)`)
      .join(', ');
    userText = `Current camera detections: ${detectionSummary}\n\nUser question: ${message}`;
  } else if (detections !== undefined) {
    userText = `Current camera detections: none right now\n\nUser question: ${message}`;
  }

  contents.push({ role: 'user', parts: [{ text: userText }] });

  const geminiRequestBody = {
    contents,
    systemInstruction: {
      parts: [
        {
          text:
            'You are a helpful assistant embedded in a live object-detection camera app. ' +
            'You may be told what the camera currently detects, as context. Answer naturally and ' +
            'concisely. If the question is about what the camera sees, use the detection context ' +
            'provided. If no detections are mentioned or relevant, just answer the question normally.',
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
