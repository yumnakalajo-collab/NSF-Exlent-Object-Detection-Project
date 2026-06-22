# Scope · Detect

A live object-detection scanner that runs entirely in the browser using your
Edge Impulse model (WebAssembly). Point a camera at something — laptop webcam
or phone camera — and it checks for objects every 2 seconds, drawing boxes
around anything it finds. If nothing matches, it just says "No object detected."

Everything runs client-side. No frames are uploaded anywhere.

## Files

- `index.html` — the page itself (camera viewfinder, status readout, QR panel, chat panel)
- `app.js` — camera handling, capture loop, drawing detection boxes
- `chat.js` — chat UI: sends questions + current detections to `/api/chat`
- `classifier.js` — thin wrapper around the Edge Impulse WASM module
- `edge-impulse-standalone.js` / `.wasm` — your exported model
- `functions/api/chat.js` — Cloudflare Pages Function that calls Gemini server-side (keeps your API key private)
- `server.py` — a simple local dev server (sets the right MIME type for `.wasm`)

## Setting up the AI chat (Gemini)

The chat panel lets people ask questions — about what's currently detected,
or anything else — and answers come from Google's Gemini API. The key is
never sent to the browser; it lives only on Cloudflare's servers, inside the
`functions/api/chat.js` Pages Function.

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
   (there's a free tier).
2. In the Cloudflare dashboard: **Workers & Pages → your project → Settings →
   Variables and Secrets → Add.**
3. Set:
   - **Variable name:** `GEMINI_API_KEY`
   - **Value:** your key
   - **Type:** Secret
4. Save, then redeploy (upload again, or push a commit if using the
   GitHub-connected method) so the function picks up the variable.

If you're using the drag-and-drop "Upload assets" method, make sure to
include the whole `functions` folder (with `api/chat.js` inside) along with
the rest of the files — Cloudflare needs to see it to create the `/api/chat`
endpoint.

## Running it locally

```
python3 server.py
```

Then open http://localhost:8082 in a browser.

Note: `getUserMedia` (camera access) requires either `localhost` or HTTPS —
it will not work over a plain `http://` address on another machine, including
phones on your local network. For the QR-code "switch to your phone" feature
to work, the page needs to be served over HTTPS.

The chat panel won't work with `server.py` — that's a plain static file
server and doesn't run `functions/api/chat.js`. Chat only works once deployed
to Cloudflare Pages (or via `wrangler pages dev` if you use the Wrangler CLI
locally with a `.dev.vars` file containing `GEMINI_API_KEY=...`).

## Deploying

Since you're hosting this yourself: upload all the files above to any static
host that serves HTTPS (Netlify, Vercel, GitHub Pages, Cloudflare Pages, S3 +
CloudFront, your own server with a TLS cert, etc.) — no build step needed,
it's plain HTML/JS/WASM. Just make sure:

- The host serves `.wasm` files with the `application/wasm` content type
  (most do this automatically; if detections silently fail to load, check
  this first).
- The site is served over HTTPS (required for camera access on phones).

Once deployed, opening the page on any device and tapping **Start camera**
works on its own. The QR code on the page always encodes the page's own
current URL, so scanning it from a laptop opens the same scanner on a phone,
where you can use the phone's camera instead.

## How detection works

Every 2 seconds, the app grabs the current video frame, center-crops it to a
square, resizes it to the model's expected input size (read automatically
from the model via `getProperties()`), and runs it through your classifier.
Detected boxes are drawn over the video, and labels with confidence scores
show up in the side panel. Detections below 40% confidence are treated as
no detection, to avoid flickering on borderline noise — adjust
`CONFIDENCE_FLOOR` in `app.js` if you want it more or less sensitive.
