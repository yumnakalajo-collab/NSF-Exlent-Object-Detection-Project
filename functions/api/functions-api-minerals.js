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
//   - a spectral profile (the wavelength bands used to identify it spectroscopically)
//   - a fun fact
//
// Reuses the same GEMINI_API_KEY secret as chat.js — no new secrets needed.

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Per-isolate cache so repeated scans of the same device type don't all
// trigger a fresh Gemini call. Mineral facts don't change minute to minute.
const CACHE = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

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

  const geminiRequestBody = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(key) }] }],
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
  const parsed = safeParseMineralJson(raw, key);

  if (!parsed) {
    return jsonResponse({ error: 'Gemini returned an unusable mineral response.' }, 502);
  }

  CACHE.set(key, { at: Date.now(), data: parsed });

  return jsonResponse(parsed);
}

function buildPrompt(device) {
  return (
    `You are a geology reference for a phone app that scans everyday devices and shows the ` +
    `minerals/elements they contain. The detected device is: "${device}".\n\n` +
    `Return ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:\n` +
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
    `{"device": "${device}", "minerals": []}.`
  );
}

function safeParseMineralJson(raw, fallbackDevice) {
  if (!raw) return null;
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\n?/, '').replace(/```$/, '').trim();
  }
  try {
    const obj = JSON.parse(text);
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
