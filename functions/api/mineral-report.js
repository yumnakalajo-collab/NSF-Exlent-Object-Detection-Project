// Cloudflare Pages Function - POST /api/mineral-report
//
// Generates a structured critical-minerals report with Gemini while keeping
// the Gemini API key on the server. The browser receives only JSON content
// that the page renders into the mineral report section.

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SOURCES = [
  { label: 'USGS Critical Minerals', url: 'https://www.usgs.gov/mission-areas/national-minerals-information-center/critical-minerals' },
  { label: 'USGS Spectral Library', url: 'https://www.usgs.gov/labs/spec-lab/capabilities/spectral-library' },
  { label: 'EPA battery recycling guidance', url: 'https://www.epa.gov/recycle/used-household-batteries' },
  { label: 'Call2Recycle locator', url: 'https://www.call2recycle.org/locator/' },
  { label: 'Earth911 recycling search', url: 'https://search.earth911.com/' },
];

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

  const object = typeof body?.object === 'string' ? body.object.trim() : '';
  if (!object) {
    return jsonResponse({ error: 'Missing "object" string in request body.' }, 400);
  }

  const detectionSummary = Array.isArray(body?.detections)
    ? body.detections
        .filter((d) => d && typeof d.label === 'string')
        .slice(0, 8)
        .map((d) => `${d.label} (${Math.round((d.value || 0) * 100)}% confidence)`)
        .join(', ')
    : '';

  const prompt = [
    `Selected detected object: ${object}`,
    detectionSummary ? `Other detections: ${detectionSummary}` : '',
    '',
    'Return a concise, educational critical-minerals report for this object.',
    'Use accurate science language. Do not invent exact certainty for a detected object; say "likely" when appropriate.',
    'Include minerals or elements that are relevant to the object, their use in the object, where they are located inside the object, criticality, why they are critical, spectral profiles, and best wavelengths or methods to observe them.',
    'For each mineral, include up to six major global supply locations as {name, lat, lon, note}; use approximate country or mining-district coordinates.',
    'For spectral profiles, distinguish reflectance absorption features from lab emission/XRF/Raman methods when reflectance is not diagnostic.',
    'If the object is a battery or commonly contains a battery, infer the likely battery chemistry when possible, such as lithium-ion, alkaline, button-cell, or lead-acid. Include recycling guidance specific to that battery type: how, why, and where users in the United States can look for drop-off options.',
  ].join('\n');

  const geminiRequestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
    systemInstruction: {
      parts: [
        {
          text:
            'You are a critical-minerals educator for a live object-detection website. ' +
            'Return only valid JSON matching this schema: ' +
            '{"object":"string","summary":"string","minerals":[{"name":"string","usage":"string","location":"string","criticality":"High|Medium|Low","why":"string","spectralProfile":"string","bestWavelengths":"string","supplyLocations":[{"name":"string","lat":number,"lon":number,"note":"string"}]}],"mapLocations":[{"label":"string","location":"string","x":number,"y":number}],"battery":{"applies":boolean,"type":"lithium-ion|alkaline|button-cell|lead-acid|general rechargeable","why":"string","how":["string"],"where":["string"]},"sources":[{"label":"string","url":"string"}]}. ' +
            'Map x and y are percentages from 10 to 90 for label placement. ' +
            'Use 3 to 6 minerals. Keep each field short but specific. Include source links from USGS, EPA, Call2Recycle, or Earth911 where relevant.',
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
  const rawText = extractText(data);
  const report = parseReport(rawText);

  if (!report) {
    return jsonResponse({ error: 'Gemini returned an unreadable mineral report.' }, 502);
  }

  report.sources = Array.isArray(report.sources) && report.sources.length ? report.sources : SOURCES;

  return jsonResponse({ report });
}

function extractText(geminiData) {
  const candidate = geminiData?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  return parts
    .map((p) => p.text || '')
    .join('')
    .trim();
}

function parseReport(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
