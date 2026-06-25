// Cloudflare Pages Function — GET /api/minerals?device=<label>
//
// Companion endpoint to /api/chat. Given a normalized device label (e.g.
// "phone", "laptop", "battery"), asks Gemini to produce a structured
// breakdown of the minerals typically found in that device — where each
// one is mined, what role it plays, and a fun fact — and returns it as
// JSON matching what app.js expects to render the mineral panel.
//
// Reuses the same GEMINI_API_KEY secret as chat.js. No new secrets needed.
//
// Frontend contract (see api-contract.md):
//   { device, summary, minerals: [{ name, symbol, foundIn, where, purpose, funFact }] }

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Small in-memory cache for the lifetime of the worker isolate. Mineral
// facts for "phone" don't change minute to minute, so this avoids hitting
// Gemini on every single scan when several users look at the same device
// type in quick succession. Cold starts simply miss and repopulate.
const CACHE = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'Server is missing GEMINI_API_KEY. Add it in Cloudflare Pages settings.' }, 500);
  }

  const url = new URL(request.url);
  const device = (url.searchParams.get('device') || '').trim().toLowerCase();

  if (!device) {
    return jsonResponse({ error: 'Missing "device" query parameter.' }, 400);
  }
  if (device.length > 60) {
    return jsonResponse({ error: 'Device label too long.' }, 400);
  }

  const cached = CACHE.get(device);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return jsonResponse(cached.data);
  }

  const prompt = buildPrompt(device);

  const geminiRequestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
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
  const raw = extractText(data);
  const parsed = safeParseMineralJson(raw);

  if (!parsed) {
    return jsonResponse({ error: 'Gemini returned an unusable mineral response.' }, 502);
  }

  CACHE.set(device, { at: Date.now(), data: parsed });

  return jsonResponse(parsed);
}

function buildPrompt(device) {
  return (
    `You are a geology/materials reference for a phone app that scans everyday devices ` +
    `and shows their mineral content. The detected device is: "${device}".\n\n` +
    `Return ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:\n` +
    `{\n` +
    `  "device": "Human-readable device name",\n` +
    `  "summary": "One sentence overview of why this device contains notable minerals",\n` +
    `  "minerals": [\n` +
    `    {\n` +
    `      "name": "Mineral or element name",\n` +
    `      "symbol": "Chemical symbol if applicable, else empty string",\n` +
    `      "foundIn": ["Specific component(s) it's found in"],\n` +
    `      "where": "Real-world mining regions/countries it primarily comes from",\n` +
    `      "purpose": "What functional role it plays in the device",\n` +
    `      "funFact": "One interesting, true, concise fact (optional, can be empty string)"\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Include 5-8 of the most significant minerals/elements for this device. Be factually ` +
    `accurate — use real geology and supply-chain knowledge (e.g. cobalt from the DRC, ` +
    `lithium from Chile/Australia, rare earths from China, tantalum from the DRC/Rwanda). ` +
    `If "${device}" is not a recognizable electronic device, return {"device": "${device}", ` +
    `"summary": "", "minerals": []}.`
  );
}

function safeParseMineralJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  // Defensive: strip markdown code fences if the model added them anyway.
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/```$/, '').trim();
  }
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.minerals)) return null;
    return {
      device: typeof obj.device === 'string' ? obj.device : '',
      summary: typeof obj.summary === 'string' ? obj.summary : '',
      minerals: obj.minerals
        .filter((m) => m && typeof m.name === 'string')
        .map((m) => ({
          name: m.name,
          symbol: typeof m.symbol === 'string' ? m.symbol : '',
          foundIn: Array.isArray(m.foundIn) ? m.foundIn.filter((x) => typeof x === 'string') : [],
          where: typeof m.where === 'string' ? m.where : '',
          purpose: typeof m.purpose === 'string' ? m.purpose : '',
          funFact: typeof m.funFact === 'string' ? m.funFact : '',
        })),
    };
  } catch {
    return null;
  }
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
