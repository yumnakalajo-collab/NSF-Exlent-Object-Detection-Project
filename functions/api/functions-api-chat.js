// Cloudflare Pages Function — POST /api/chat
//
// Keeps the Gemini API key server-side. The browser sends the conversation
// history, the current detection results, and (if available) the mineral
// data already fetched for the detected device; this function forwards a
// request to Gemini and returns just the reply text.
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

  const contextLines = [];

  if (Array.isArray(detections) && detections.length > 0) {
    const detectionSummary = detections
      .map((d) => `${d.label} (${Math.round((d.value || 0) * 100)}% confidence)`)
      .join(', ');
    contextLines.push(`Current camera detections: ${detectionSummary}`);
  } else if (detections !== undefined) {
    contextLines.push('Current camera detections: none right now');
  }

  // minerals is the same payload returned by /api/minerals — already fetched
  // by the frontend for the current detection. Folding it into the prompt
  // means Gemini's answers line up exactly with what's shown in the mineral
  // panel, instead of re-deriving (and possibly contradicting) it from scratch.
  if (minerals && Array.isArray(minerals.minerals) && minerals.minerals.length > 0) {
    const mineralLines = minerals.minerals.map((m) => {
      const bits = [`- ${m.name}${m.symbol ? ` (${m.symbol})` : ''}`];
      if (m.locations && m.locations.length) {
        bits.push(`mined in: ${m.locations.map((l) => l.place).join(', ')}`);
      }
      if (m.extraction) bits.push(`extraction: ${m.extraction}`);
      if (m.everydayUses) bits.push(`everyday uses: ${m.everydayUses}`);
      if (m.deviceImpact && m.deviceImpact.component) {
        bits.push(
          `found in this device's ${m.deviceImpact.component}${
            m.deviceImpact.effect ? ` (${m.deviceImpact.effect})` : ''
          }`
        );
      }
      if (m.spectralProfile && m.spectralProfile.peakWavelengthNm) {
        const sp = m.spectralProfile;
        bits.push(
          `spectral profile: ~${sp.peakWavelengthNm}nm peak ${sp.type || ''}${
            sp.note ? ` (${sp.note})` : ''
          }`.trim()
        );
      }
      if (m.funFact) bits.push(`fun fact: ${m.funFact}`);
      return bits.join(' — ');
    });
    contextLines.push(
      `Known minerals in the detected ${minerals.device || 'device'}:\n${mineralLines.join('\n')}`
    );
  }

  const userText = contextLines.length > 0 ? `${contextLines.join('\n\n')}\n\nUser question: ${message}` : message;

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
            'where each mineral is mined, how it is extracted, what everyday items it shows up in, ' +
            'and interesting facts about it. Keep answers conversational and concise (2-5 sentences ' +
            'unless the user asks for more detail). If no detections or minerals are provided, or the ' +
            'question is unrelated to them, just answer normally.',
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
