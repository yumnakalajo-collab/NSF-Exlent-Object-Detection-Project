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

// Exported as both onRequestPost AND a catch-all onRequest. Some Cloudflare
// Pages deployments have been seen routing POST requests to a Pages
// Function's path as a static-asset lookup instead of dispatching to
// onRequestPost (a known Cloudflare routing quirk), which surfaces as a
// 405 even though the function code itself is correct. Handling all
// methods through one onRequest works around that, and also lets us
// answer OPTIONS / GET with a clear diagnostic instead of a bare 405.
export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method === 'GET') {
    return jsonResponse(
      {
        ok: true,
        note: 'This endpoint is alive. Send a POST request with a JSON body ({ message, history, detections }) to chat.',
      },
      200
    );
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: `Method ${request.method} not supported. Use POST.` }, 405);
  }

  return handleChat(context);
}

// Kept for environments/tooling that specifically look for onRequestPost.
export async function onRequestPost(context) {
  return handleChat(context);
}

async function handleChat(context) {
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

