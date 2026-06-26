(() => {
  const els = {
    video: document.getElementById('video'),
    overlay: document.getElementById('overlay'),
    captureCanvas: document.getElementById('capture-canvas'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    readout: document.getElementById('readout'),
    projectName: document.getElementById('project-name'),
    startBtn: document.getElementById('start-camera'),
    switchBtn: document.getElementById('switch-camera'),
    qrPanel: document.getElementById('qr-panel'),
    qrCanvasHolder: document.getElementById('qr-code'),
    permissionNote: document.getElementById('permission-note'),
    frame: document.getElementById('viewfinder'),
    mineralList: document.getElementById('mineral-list'),
    mineralStatus: document.getElementById('mineral-status'),
  };

  const INTERVAL_MS = 2000;
  let classifier = null;
  let modelInputWidth = 96;
  let modelInputHeight = 96;
  let modelChannels = 3;
  let stream = null;
  let facingMode = 'environment';
  let loopTimer = null;
  let busy = false;

  window.__latestDetections = [];
  window.__latestMinerals = null; // { device, minerals: [...] } for the current top detection

  let mineralRequestKey = null; // device label currently being fetched/shown, to avoid duplicate calls
  let mineralAbortController = null;

  function setStatus(state, text) {
    els.statusDot.className = 'status-dot ' + state;
    els.statusText.textContent = text;
  }

  function buildQrCode() {
    const url = window.location.href;
    els.qrCanvasHolder.innerHTML = '';
    // eslint-disable-next-line no-undef
    new QRCode(els.qrCanvasHolder, {
      text: url,
      width: 168,
      height: 168,
      colorDark: '#0b0e0f',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  let isDetectionModel = true;

  async function initClassifier() {
    classifier = new EdgeImpulseClassifier();
    await classifier.init();

    const project = classifier.getProjectInfo();
    els.projectName.textContent = `${project.owner} / ${project.name}`;

    const props = classifier.getProperties();
    if (props.image_input_width) modelInputWidth = props.image_input_width;
    if (props.image_input_height) modelInputHeight = props.image_input_height;
    if (props.image_channel_count) modelChannels = props.image_channel_count;
    isDetectionModel = props.model_type === 'object_detection' || props.model_type === 'constrained_object_detection';

    els.captureCanvas.width = modelInputWidth;
    els.captureCanvas.height = modelInputHeight;
  }

  async function startCamera(preferredFacing) {
    stopCamera();
    setStatus('idle', 'Requesting camera…');
    els.permissionNote.hidden = true;

    const constraintsAttempts = [
      { video: { facingMode: { ideal: preferredFacing }, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false },
      { video: true, audio: false },
    ];

    let lastErr = null;
    for (const constraints of constraintsAttempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!stream) {
      setStatus('error', 'Camera unavailable');
      els.permissionNote.hidden = false;
      els.permissionNote.textContent = describeCameraError(lastErr);
      throw lastErr;
    }

    els.video.srcObject = stream;
    await els.video.play();

    els.frame.classList.add('is-live');
    els.startBtn.hidden = true;
    els.switchBtn.hidden = false;
    setStatus('scanning', 'Scanning…');
    scheduleNextCapture(true);
  }

  function stopCamera() {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    clearMineralPanel();
  }

  function describeCameraError(err) {
    if (!err) return 'Could not access a camera on this device.';
    if (err.name === 'NotAllowedError') {
      return 'Camera access was blocked. Allow camera permission in the browser and try again.';
    }
    if (err.name === 'NotFoundError') {
      return 'No camera was found on this device.';
    }
    return 'Could not access the camera: ' + (err.message || err.name || err);
  }

  function scheduleNextCapture(immediate = false) {
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = setTimeout(runDetectionCycle, immediate ? 0 : INTERVAL_MS);
  }

  async function runDetectionCycle() {
    if (busy || !stream) return;
    busy = true;

    try {
      const features = captureFeatures();
      const result = classifier.classify(features);
      renderResult(result);
    } catch (err) {
      console.error(err);
      setStatus('error', 'Detection error');
      els.readout.innerHTML = `<div class="readout-empty">Something went wrong running the model. Check the console for details.</div>`;
    } finally {
      busy = false;
      scheduleNextCapture(false);
    }
  }

  function captureFeatures() {
    const canvas = els.captureCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const vw = els.video.videoWidth;
    const vh = els.video.videoHeight;

    // Center-crop the video frame to a square, then scale to the model's
    // expected input size, so the aspect ratio matches what the model saw
    // during training (Edge Impulse's default "fit shortest axis" crop).
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;

    ctx.drawImage(els.video, sx, sy, side, side, 0, 0, canvas.width, canvas.height);

    return classifier.getImageFeatures(canvas);
  }

  function renderResult(result) {
    const CONFIDENCE_FLOOR = 0.4;
    const allDetections = (result.results || []).filter((r) => r.value >= CONFIDENCE_FLOOR);

    // The app is designed to focus on one object at a time — if the model
    // reports several candidates in a frame, keep only the highest-confidence
    // one rather than juggling multiple simultaneous mineral lookups/readouts.
    const top = allDetections.slice().sort((a, b) => b.value - a.value)[0] || null;
    const detections = top ? [top] : [];

    drawOverlay(isDetectionModel ? detections : []);

    window.__latestDetections = detections.map((d) => ({ label: d.label, value: d.value }));

    if (!top) {
      setStatus('idle', 'No object detected');
      els.readout.innerHTML = `<div class="readout-empty">No object detected</div>`;
      clearMineralPanel();
      return;
    }

    setStatus('scanning', 'Object found');
    els.readout.innerHTML = `
      <div class="readout-row">
        <span class="readout-label">${escapeHtml(top.label)}</span>
        <span class="readout-confidence">${Math.round(top.value * 100)}%</span>
      </div>`;
    handleMineralLookup(top.label);
  }

  function drawOverlay(detections) {
    const overlay = els.overlay;
    const ctx = overlay.getContext('2d');
    overlay.width = overlay.clientWidth;
    overlay.height = overlay.clientHeight;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!detections.length) return;

    // The Edge Impulse SDK can report box coordinates either as 0–1
    // normalized fractions, or as pixel coordinates relative to the
    // model's input resolution (e.g. 0–96). Detect which one we got by
    // checking whether any value exceeds 1.5, then scale accordingly.
    const looksNormalized = detections.every(
      (d) => d.x <= 1.5 && d.y <= 1.5 && d.width <= 1.5 && d.height <= 1.5
    );

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#5EFFB0';
    ctx.fillStyle = '#5EFFB0';
    ctx.font = '600 14px "JetBrains Mono", monospace';

    detections.forEach((d) => {
      let nx, ny, nw, nh;
      if (looksNormalized) {
        nx = d.x; ny = d.y; nw = d.width; nh = d.height;
      } else {
        nx = d.x / modelInputWidth;
        ny = d.y / modelInputHeight;
        nw = d.width / modelInputWidth;
        nh = d.height / modelInputHeight;
      }

      const x = nx * overlay.width;
      const y = ny * overlay.height;
      const w = nw * overlay.width;
      const h = nh * overlay.height;

      ctx.strokeRect(x, y, w, h);
      const label = `${d.label} ${Math.round(d.value * 100)}%`;
      const textWidth = ctx.measureText(label).width;
      ctx.fillRect(x - 1.5, y - 22, textWidth + 10, 20);
      ctx.fillStyle = '#0b0e0f';
      ctx.fillText(label, x + 4, y - 7);
      ctx.fillStyle = '#5EFFB0';
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // --- Mineral lookup & rendering -------------------------------------------
  // On each newly detected device, fetch the mineral breakdown from
  // /api/minerals and render it as a collapsed list in the sidebar.
  // Tapping a mineral expands it to show a small world map (pins for each
  // mining location), extraction method, everyday uses, and a fun fact.

  function clearMineralPanel() {
    mineralRequestKey = null;
    window.__latestMinerals = null;
    if (mineralAbortController) {
      mineralAbortController.abort();
      mineralAbortController = null;
    }
    if (els.mineralList) {
      els.mineralList.innerHTML = `<div class="readout-empty">Point the camera at a device to see its minerals.</div>`;
    }
    if (els.mineralStatus) els.mineralStatus.textContent = '';
  }

  async function handleMineralLookup(rawLabel) {
    if (!els.mineralList) return; // markup not present yet, skip gracefully

    const key = String(rawLabel || '').trim().toLowerCase();
    if (!key) return;
    if (key === mineralRequestKey) return; // already fetched/shown for this device
    mineralRequestKey = key;

    if (els.mineralStatus) els.mineralStatus.textContent = `Looking up minerals in "${rawLabel}"…`;
    els.mineralList.innerHTML = `<div class="readout-empty">Loading mineral data…</div>`;

    if (mineralAbortController) mineralAbortController.abort();
    mineralAbortController = new AbortController();

    try {
      const res = await fetch('/api/minerals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: key }),
        signal: mineralAbortController.signal,
      });

      let data;
      let rawText = '';
      try {
        rawText = await res.text();
        data = rawText ? JSON.parse(rawText) : {};
      } catch (parseErr) {
        // The endpoint returned something that isn't JSON at all — most likely
        // a 404/500 HTML error page from Cloudflare, which means the function
        // file isn't deployed at functions/api/minerals.js, or crashed before
        // it could return JSON. Log the raw body so it's diagnosable.
        console.error('Mineral endpoint returned non-JSON response:', res.status, rawText.slice(0, 300));
        if (els.mineralStatus) els.mineralStatus.textContent = '';
        els.mineralList.innerHTML = `<div class="readout-empty">Mineral lookup returned an unexpected response (status ${res.status}). Check the browser console and confirm functions/api/minerals.js is deployed.</div>`;
        return;
      }

      if (!res.ok || data.error) {
        console.error('Mineral endpoint error:', res.status, data.error || '(no error message in response)');
        if (els.mineralStatus) els.mineralStatus.textContent = '';
        els.mineralList.innerHTML = `<div class="readout-empty">Couldn't load mineral data (${res.status}${
          data.error ? ': ' + escapeHtml(data.error) : ''
        }). Check the browser console for details.</div>`;
        return;
      }

      if (!Array.isArray(data.minerals) || data.minerals.length === 0) {
        if (els.mineralStatus) els.mineralStatus.textContent = '';
        els.mineralList.innerHTML = `<div class="readout-empty">No mineral data available for this object.</div>`;
        window.__latestMinerals = null;
        return;
      }

      window.__latestMinerals = data;
      if (els.mineralStatus) els.mineralStatus.textContent = '';
      renderMineralList(data);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Mineral lookup failed (network/fetch error):', err);
      if (els.mineralStatus) els.mineralStatus.textContent = '';
      els.mineralList.innerHTML = `<div class="readout-empty">Couldn't reach the mineral lookup service. Check the browser console for details.</div>`;
    }
  }

  function renderMineralList(data) {
    els.mineralList.innerHTML = data.minerals
      .map((m, i) => `
        <div class="mineral-item">
          <button type="button" class="mineral-toggle" data-index="${i}" aria-expanded="false">
            <span class="mineral-name">${escapeHtml(m.name)}</span>
            ${m.symbol ? `<span class="mineral-symbol">${escapeHtml(m.symbol)}</span>` : ''}
            <span class="mineral-chevron">▾</span>
          </button>
          <div class="mineral-detail" id="mineral-detail-${i}" hidden></div>
        </div>
      `)
      .join('');

    els.mineralList.querySelectorAll('.mineral-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        const mineral = data.minerals[idx];
        const detailEl = document.getElementById(`mineral-detail-${idx}`);
        const isOpen = btn.getAttribute('aria-expanded') === 'true';

        // Close any other open entries (collapsed-list behavior).
        els.mineralList.querySelectorAll('.mineral-toggle').forEach((otherBtn) => {
          if (otherBtn !== btn) {
            otherBtn.setAttribute('aria-expanded', 'false');
            const otherDetail = document.getElementById(`mineral-detail-${otherBtn.dataset.index}`);
            if (otherDetail) otherDetail.hidden = true;
          }
        });

        if (isOpen) {
          btn.setAttribute('aria-expanded', 'false');
          detailEl.hidden = true;
          return;
        }

        btn.setAttribute('aria-expanded', 'true');
        detailEl.hidden = false;
        if (!detailEl.dataset.rendered) {
          detailEl.innerHTML = renderMineralDetail(mineral);
          detailEl.dataset.rendered = '1';
        }
      });
    });
  }

  function renderMineralDetail(m) {
    const locations = Array.isArray(m.locations) ? m.locations : [];
    const mapSvg = locations.length ? buildMiniMapSvg(locations) : '';
    const impact = m.deviceImpact || {};
    const spectral = m.spectralProfile || null;

    return `
      ${mapSvg}
      ${
        locations.length
          ? `<p class="mineral-locations">${locations.map((l) => escapeHtml(l.place)).join(', ')}</p>`
          : ''
      }
      ${
        impact.component
          ? `<p><strong>Found in this device's:</strong> ${escapeHtml(impact.component)}${
              impact.effect ? ` — ${escapeHtml(impact.effect)}` : ''
            }</p>`
          : ''
      }
      ${m.extraction ? `<p><strong>How it's extracted:</strong> ${escapeHtml(m.extraction)}</p>` : ''}
      ${m.everydayUses ? `<p><strong>Everyday uses:</strong> ${escapeHtml(m.everydayUses)}</p>` : ''}
      ${spectral && spectral.peakWavelengthNm ? renderSpectralProfile(spectral) : ''}
      ${m.funFact ? `<p class="mineral-funfact"><strong>Fun fact:</strong> ${escapeHtml(m.funFact)}</p>` : ''}
    `;
  }

  // Renders the mineral's characteristic spectral feature as a small bar
  // chart spanning the visible–near-infrared window, with the peak/range
  // marked, plus the key numbers spelled out underneath for anyone who
  // wants the precise figures rather than just the picture.
  function renderSpectralProfile(spectral) {
    const SPECTRUM_LOW = 380; // nm, start of visible range
    const SPECTRUM_HIGH = 2500; // nm, end of relevant near-infrared window
    const W = 280;
    const H = 54;

    const clamp = (v) => Math.min(SPECTRUM_HIGH, Math.max(SPECTRUM_LOW, v));
    const toX = (nm) => ((clamp(nm) - SPECTRUM_LOW) / (SPECTRUM_HIGH - SPECTRUM_LOW)) * W;

    const peakX = toX(spectral.peakWavelengthNm);
    const hasRange =
      typeof spectral.rangeLowNm === 'number' && typeof spectral.rangeHighNm === 'number' && spectral.rangeHighNm > spectral.rangeLowNm;
    const rangeXLow = hasRange ? toX(spectral.rangeLowNm) : null;
    const rangeXHigh = hasRange ? toX(spectral.rangeHighNm) : null;

    const rangeBand = hasRange
      ? `<rect x="${rangeXLow.toFixed(1)}" y="0" width="${(rangeXHigh - rangeXLow).toFixed(1)}" height="${H}" class="spectral-band" />`
      : '';

    const chart = `
      <svg class="spectral-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spectral profile chart">
        <rect x="0" y="0" width="${W}" height="${H}" rx="6" class="spectral-bg" />
        <defs>
          <linearGradient id="spectrumGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#5B6FE0" />
            <stop offset="35%" stop-color="#5FB8E0" />
            <stop offset="55%" stop-color="#6FCB8C" />
            <stop offset="75%" stop-color="#D8B85A" />
            <stop offset="100%" stop-color="#B5651D" />
          </linearGradient>
        </defs>
        <rect x="0" y="${H - 10}" width="${W}" height="6" rx="3" fill="url(#spectrumGradient)" opacity="0.85" />
        ${rangeBand}
        <line x1="${peakX.toFixed(1)}" y1="2" x2="${peakX.toFixed(1)}" y2="${H - 4}" class="spectral-peak-line" />
        <circle cx="${peakX.toFixed(1)}" cy="8" r="4" class="spectral-peak-dot" />
      </svg>`;

    const numbers = [`peak ≈ ${spectral.peakWavelengthNm}nm`];
    if (hasRange) numbers.push(`range ${spectral.rangeLowNm}–${spectral.rangeHighNm}nm`);
    if (spectral.type) numbers.push(spectral.type);

    return `
      <div class="mineral-spectral">
        <strong>Spectral profile</strong>
        ${chart}
        <p class="spectral-numbers">${escapeHtml(numbers.join(' · '))}</p>
        ${spectral.note ? `<p class="spectral-note">${escapeHtml(spectral.note)}</p>` : ''}
      </div>
    `;
  }

  // Renders a minimal equirectangular world map as inline SVG with a pin
  // for each location. No external map tiles/API key required — just a
  // simple lat/lng -> x/y projection onto a fixed-size box.
  function buildMiniMapSvg(locations) {
    const W = 280;
    const H = 140;

    function project(lat, lng) {
      const x = ((lng + 180) / 360) * W;
      const y = ((90 - lat) / 180) * H;
      return [x, y];
    }

    const pins = locations
      .map((loc) => {
        const [x, y] = project(loc.lat, loc.lng);
        return `
          <g class="mineral-pin">
            <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" />
            <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" class="mineral-pin-ring" />
          </g>`;
      })
      .join('');

    return `
      <svg class="mineral-map" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Map of mining locations">
        <rect x="0" y="0" width="${W}" height="${H}" rx="6" class="mineral-map-bg" />
        ${gridLines(W, H)}
        ${pins}
      </svg>`;
  }

  function gridLines(W, H) {
    let lines = '';
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i;
      lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="mineral-map-grid" />`;
    }
    for (let i = 1; i < 6; i++) {
      const x = (W / 6) * i;
      lines += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="mineral-map-grid" />`;
    }
    return lines;
  }

  els.startBtn.addEventListener('click', () => {
    startCamera(facingMode).catch(() => {});
  });

  els.switchBtn.addEventListener('click', () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera(facingMode).catch(() => {});
  });

  window.addEventListener('resize', () => {
    if (stream) drawOverlay([]);
  });

  (async function boot() {
    buildQrCode();
    setStatus('idle', 'Loading model…');
    try {
      await initClassifier();
      setStatus('idle', 'Ready');
    } catch (err) {
      console.error(err);
      setStatus('error', 'Model failed to load');
    }
  })();
})();
