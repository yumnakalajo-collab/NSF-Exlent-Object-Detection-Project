// Cloudflare Pages Function — POST /api/minerals
//
// Companion to functions/api/chat.js. Given the device label currently
// detected by the camera (e.g. "phone", "laptop", "battery"), asks Gemini
// for the minerals typically found inside it, with enough detail to render
// the sidebar's mineral panel:
//   - where it's mined (named locations + lat/lng, for plotting map pins)
//   - how it's extracted
//   - what it's used for in everyday items
//   - which component of THIS device it's used in, and how it affects that component
//   - a spectral profile (peak wavelength + range, for the chart)
//   - a fun fact
//
// Reuses the same GEMINI_API_KEY secret as chat.js — no new secrets needed.
//
// IMPORTANT DEPLOYMENT NOTE: this file must live at functions/api/minerals.js
// in the deployed site (same folder as functions/api/chat.js) for Cloudflare
// Pages to expose it at the /api/minerals URL. If you see "Mineral lookup
// returned an unexpected response (status 404)" in the browser, this file
// is missing or misplaced in the deployment — check the Pages dashboard's
// deployment "Files" tab to confirm functions/api/minerals.js is present.

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Per-isolate cache so repeated scans of the same device type don't all
// trigger a fresh Gemini call. Mineral facts don't change minute to minute.
const CACHE = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'Server is missing GEMINI_API_KEY. Add it in Cloudflare Pages settings under Workers & Pages > your project > Settings > Variables and Secrets.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body sent to /api/minerals.' }, 400);
  }

  const { device } = body || {};
  if (!device || typeof device !== 'string') {
    return jsonResponse({ error: 'Missing "device" string in request body.' }, 400);
  }

  const key = device.trim().toLowerCase();
  if (!key) return jsonResponse({ error: 'Empty "device" value.' }, 400);
  if (key.length > 60) return jsonResponse({ error: 'Device label too long.' }, 400);

  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return jsonResponse(cached.data);
  }

  // First attempt: ask for strict JSON mode. If that fails for any reason
  // (model rejects the config, safety block, truncation), retry once
  // without JSON mode and rely on prompt instructions + fence-stripping —
  // this makes the endpoint resilient to JSON-mode edge cases that have
  // been reported for some Gemini model versions/configurations.
  let result = await callGemini(env.GEMINI_API_KEY, key, true);
  if (!result.ok) {
    const retry = await callGemini(env.GEMINI_API_KEY, key, false);
    if (retry.ok) {
      result = retry;
    } else {
      return jsonResponse(
        { error: `Gemini request failed. JSON-mode attempt: ${result.error}. Plain-text retry: ${retry.error}` },
        502
      );
    }
  }

  CACHE.set(key, { at: Date.now(), data: result.data });
  return jsonResponse(result.data);
}

async function callGemini(apiKey, key, useJsonMode) {
  const geminiRequestBody = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(key) }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
      ...(useJsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  let geminiResponse;
  try {
    geminiResponse = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(geminiRequestBody),
    });
  } catch (err) {
    return { ok: false, error: `network error reaching Gemini (${err.message})` };
  }

  let payload;
  const rawBody = await geminiResponse.text();
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: `Gemini returned non-JSON HTTP ${geminiResponse.status}: ${rawBody.slice(0, 200)}` };
  }

  if (!geminiResponse.ok) {
    const apiMsg = payload?.error?.message || JSON.stringify(payload).slice(0, 300);
    return { ok: false, error: `Gemini API HTTP ${geminiResponse.status}: ${apiMsg}` };
  }

  // Check for safety blocks or other non-standard finish reasons before
  // assuming there's usable text in the response.
  const candidate = payload?.candidates?.[0];
  if (!candidate) {
    const blockReason = payload?.promptFeedback?.blockReason;
    return { ok: false, error: blockReason ? `prompt blocked (${blockReason})` : 'no candidates in Gemini response' };
  }
  if (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
    return { ok: false, error: `Gemini finishReason was ${candidate.finishReason}` };
  }

  const raw = (candidate.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!raw) {
    return { ok: false, error: 'Gemini returned an empty response' };
  }

  const parsed = safeParseMineralJson(raw, key);
  if (!parsed) {
    return { ok: false, error: `could not parse mineral JSON from Gemini output (first 200 chars: ${raw.slice(0, 200)})` };
  }

  return { ok: true, data: parsed };
}

function buildPrompt(device) {
  return (
    `You are a geology reference for a phone app that scans everyday devices and shows the ` +
    `minerals/elements they contain. The detected device is: "${device}".\n\n` +
    `Return ONLY valid JSON (no markdown fences, no commentary, no explanation before or after) ` +
    `matching exactly this shape:\n` +
    `{\n` +
    `  "device": "Human-readable device name",\n` +
    `  "minerals": [\n` +
    `    {\n` +
    `      "name": "Mineral or element name",\n` +
    `      "symbol": "Chemical symbol if applicable, else empty string",\n` +
    `      "locations": [\n` +
    `        { "place": "Country or region name", "lat": 0.0, "lng": 0.0 }\n` +
    `      ],\n` +
    `      "extraction": "How it is physically mined or extracted, in plain language",\n` +
    `      "everydayUses": "What it's used for in everyday items, beyond just this device",\n` +
    `      "deviceImpact": {\n` +
    `        "component": "The specific component of THIS device that contains it, e.g. 'battery cathode' or 'circuit board connectors'",\n` +
    `        "effect": "How this mineral affects that component's function — what would change or fail without it"\n` +
    `      },\n` +
    `      "spectralProfile": {\n` +
    `        "peakWavelengthNm": 0,\n` +
    `        "rangeLowNm": 0,\n` +
    `        "rangeHighNm": 0,\n` +
    `        "type": "absorption or reflectance",\n` +
    `        "note": "One short phrase on what's spectrally distinctive, e.g. a notable absorption dip or reflectance peak"\n` +
    `      },\n` +
    `      "funFact": "One interesting, true, concise fact"\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `Include 4-7 of the most significant minerals/elements for this device. Include 1-3 ` +
    `real mining locations per mineral with approximate, real-world latitude/longitude ` +
    `(decimal degrees, lat in [-90,90], lng in [-180,180]) for major producing countries or ` +
    `regions — e.g. Democratic Republic of the Congo for cobalt is roughly lat -4, lng 21.8. ` +
    `For spectralProfile, give a real, approximate characteristic wavelength in nanometers ` +
    `where this mineral has a notable diagnostic absorption or reflectance feature (visible ` +
    `to near-infrared range, roughly 380-2500nm, is the relevant window for materials ` +
    `identification) — use real reflectance/absorption spectroscopy knowledge, not invented ` +
    `numbers. Be factually accurate using real geology, materials science, and supply-chain ` +
    `knowledge. If "${device}" is not a recognizable electronic device, return ` +
    `{"device": "${device}", "minerals": []}. Respond with the JSON object only.`
  );
}

function safeParseMineralJson(raw, fallbackDevice) {
  if (!raw) return null;
  let text = raw.trim();

  // Strip markdown code fences if present, regardless of where they appear.
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // If there's leading/trailing prose around the JSON object (some models
  // add a sentence before/after despite instructions), extract the
  // outermost {...} block as a fallback.
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    try {
      obj = JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }

  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.minerals)) return null;

  return {
    device: typeof obj.device === 'string' && obj.device ? obj.device : fallbackDevice,
    minerals: obj.minerals
      .filter((m) => m && typeof m.name === 'string')
      .map((m) => ({
        name: m.name,
        symbol: typeof m.symbol === 'string' ? m.symbol : '',
        locations: Array.isArray(m.locations)
          ? m.locations
              .filter(
                (loc) =>
                  loc &&
                  typeof loc.place === 'string' &&
                  typeof loc.lat === 'number' &&
                  typeof loc.lng === 'number' &&
                  loc.lat >= -90 &&
                  loc.lat <= 90 &&
                  loc.lng >= -180 &&
                  loc.lng <= 180
              )
              .map((loc) => ({ place: loc.place, lat: loc.lat, lng: loc.lng }))
          : [],
        extraction: typeof m.extraction === 'string' ? m.extraction : '',
        everydayUses: typeof m.everydayUses === 'string' ? m.everydayUses : '',
        deviceImpact:
          m.deviceImpact && typeof m.deviceImpact === 'object'
            ? {
                component: typeof m.deviceImpact.component === 'string' ? m.deviceImpact.component : '',
                effect: typeof m.deviceImpact.effect === 'string' ? m.deviceImpact.effect : '',
              }
            : { component: '', effect: '' },
        spectralProfile:
          m.spectralProfile && typeof m.spectralProfile === 'object'
            ? {
                peakWavelengthNm: typeof m.spectralProfile.peakWavelengthNm === 'number' ? m.spectralProfile.peakWavelengthNm : null,
                rangeLowNm: typeof m.spectralProfile.rangeLowNm === 'number' ? m.spectralProfile.rangeLowNm : null,
                rangeHighNm: typeof m.spectralProfile.rangeHighNm === 'number' ? m.spectralProfile.rangeHighNm : null,
                type: typeof m.spectralProfile.type === 'string' ? m.spectralProfile.type : '',
                note: typeof m.spectralProfile.note === 'string' ? m.spectralProfile.note : '',
              }
            : null,
        funFact: typeof m.funFact === 'string' ? m.funFact : '',
      })),
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
