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
    qrCanvasHolder: document.getElementById('qr-code'),
    permissionNote: document.getElementById('permission-note'),
    frame: document.getElementById('viewfinder'),
    mineralPanel: document.getElementById('mineral-panel'),
    mineralList: document.getElementById('mineral-list'),
    mapPanel: document.getElementById('map-panel'),
    mapLegend: document.getElementById('map-legend'),
    worldMapSvg: document.getElementById('world-map'),
    detailPanel: document.getElementById('detail-panel'),
    detailContent: document.getElementById('detail-content'),
    detailClose: document.getElementById('detail-close'),
  };

  const INTERVAL_MS = 2000;
  const CONFIDENCE_FLOOR = 0.4;

  let classifier = null;
  let modelInputWidth = 96;
  let modelInputHeight = 96;
  let stream = null;
  let facingMode = 'environment';
  let loopTimer = null;
  let busy = false;
  let isDetectionModel = true;

  window.__latestDetections = [];

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

  async function initClassifier() {
    classifier = new EdgeImpulseClassifier();
    await classifier.init();

    const project = classifier.getProjectInfo();
    els.projectName.textContent = `${project.owner} / ${project.name}`;

    const props = classifier.getProperties();
    if (props.image_input_width) modelInputWidth = props.image_input_width;
    if (props.image_input_height) modelInputHeight = props.image_input_height;
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

    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;

    ctx.drawImage(els.video, sx, sy, side, side, 0, 0, canvas.width, canvas.height);

    return classifier.getImageFeatures(canvas);
  }

  /**
   * Always resolve to at most ONE focused detection, even if the model
   * returns several boxes in a frame. The highest-confidence detection
   * wins; everything else is ignored for the readout, mineral panel, and
   * map, though all boxes still get a faint outline on the overlay so the
   * person can see what else was in frame.
   */
  function pickFocusDetection(candidates) {
    if (!candidates.length) return null;
    return candidates.slice().sort((a, b) => b.value - a.value)[0];
  }

  function renderResult(result) {
    const allDetections = (result.results || []).filter((r) => r.value >= CONFIDENCE_FLOOR);

    if (isDetectionModel) {
      const focus = pickFocusDetection(allDetections);
      drawOverlay(allDetections, focus);
      renderFocusedDetection(focus);
    } else {
      const top = (result.results || []).slice().sort((a, b) => b.value - a.value)[0];
      const focus = top && top.value >= CONFIDENCE_FLOOR ? top : null;
      drawOverlay([], null);
      renderFocusedDetection(focus);
    }
  }

  function renderFocusedDetection(focus) {
    if (!focus) {
      window.__latestDetections = [];
      setStatus('idle', 'No object detected');
      els.readout.innerHTML = `<div class="readout-empty">No object detected</div>`;
      hideMineralPanel();
      return;
    }

    window.__latestDetections = [{ label: focus.label, value: focus.value }];
    setStatus('scanning', 'Object found');
    els.readout.innerHTML = `
      <div class="readout-row">
        <span class="readout-label">${escapeHtml(focus.label)}</span>
        <span class="readout-confidence">${Math.round(focus.value * 100)}%</span>
      </div>`;

    showMineralPanel(focus.label);
  }

  function hideMineralPanel() {
    els.mineralPanel.hidden = true;
    els.mapPanel.hidden = true;
  }

  function showMineralPanel(label) {
    const keys = window.getMineralsForLabel(label);
    const minerals = window.MINERALS;

    els.mineralPanel.hidden = false;
    els.mineralList.innerHTML = keys
      .map((key) => {
        const m = minerals[key];
        if (!m) return '';
        return `
        <div class="mineral-item" data-key="${key}">
          <button class="mineral-item-header" data-toggle="${key}" aria-expanded="false">
            <span class="mineral-swatch" style="background:${m.color}; color:${m.color};"></span>
            <span class="mineral-name">${escapeHtml(m.name)}</span>
            <span class="mineral-symbol">${escapeHtml(m.symbol)}</span>
            <span class="mineral-chevron">›</span>
          </button>
          <div class="mineral-item-body">
            <p>${escapeHtml(m.summary)}</p>
            <div class="field-label">Used in this device for</div>
            <p class="dim">${escapeHtml(m.componentImpact)}</p>
            <div class="field-label">Spectral profile (illustrative)</div>
            ${renderSpectralChart(m)}
            <button class="mineral-link" data-detail="${key}">View mining regions &amp; full profile →</button>
          </div>
        </div>`;
      })
      .join('');

    els.mineralList.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.mineral-item');
        const willExpand = !item.classList.contains('expanded');
        item.classList.toggle('expanded', willExpand);
        btn.setAttribute('aria-expanded', String(willExpand));
      });
    });

    els.mineralList.querySelectorAll('[data-detail]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDetailView(btn.getAttribute('data-detail'));
      });
    });

    renderMap(keys);
  }

  function renderSpectralChart(mineral) {
    const peaks = (mineral.spectral && mineral.spectral.peaks) || [0.3, 0.5, 0.4, 0.6, 0.3, 0.5];
    const w = 280;
    const h = 56;
    const step = w / (peaks.length - 1);
    const points = peaks.map((p, i) => `${(i * step).toFixed(1)},${(h - p * h).toFixed(1)}`).join(' ');
    const color = (mineral.spectral && mineral.spectral.hue) || mineral.color;

    return `
      <svg class="spectral-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>
      </svg>`;
  }

  function renderMap(keys) {
    if (!keys.length) {
      els.mapPanel.hidden = true;
      return;
    }
    els.mapPanel.hidden = false;
    const legendHtml = window.renderWorldMap(els.worldMapSvg, keys);
    els.mapLegend.innerHTML = legendHtml;
  }

  function showDetailView(key) {
    const m = window.MINERALS[key];
    if (!m) return;

    els.detailContent.innerHTML = `
      <h3>${escapeHtml(m.name)}</h3>
      <div class="detail-symbol">${escapeHtml(m.symbol)}</div>
      <p>${escapeHtml(m.summary)}</p>
      <div class="field-label">Used in this device for</div>
      <p>${escapeHtml(m.componentImpact)}</p>
      <div class="field-label">Mining note</div>
      <p>${escapeHtml(m.miningNote)}</p>
      <div class="field-label">Spectral profile (illustrative)</div>
      ${renderSpectralChart(m)}
    `;
    els.detailPanel.hidden = false;
    els.detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  els.detailClose.addEventListener('click', () => {
    els.detailPanel.hidden = true;
  });

  function drawOverlay(allDetections, focus) {
    const overlay = els.overlay;
    const ctx = overlay.getContext('2d');
    overlay.width = overlay.clientWidth;
    overlay.height = overlay.clientHeight;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!allDetections.length) return;

    const looksNormalized = allDetections.every(
      (d) => d.x <= 1.5 && d.y <= 1.5 && d.width <= 1.5 && d.height <= 1.5
    );

    ctx.font = '600 14px "JetBrains Mono", monospace';

    allDetections.forEach((d) => {
      const isFocus = focus && d === focus;
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

      ctx.lineWidth = isFocus ? 3 : 1.5;
      ctx.strokeStyle = isFocus ? '#5EFFB0' : 'rgba(94,255,176,0.35)';
      ctx.strokeRect(x, y, w, h);

      if (isFocus) {
        const label = `${d.label} ${Math.round(d.value * 100)}%`;
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = '#5EFFB0';
        ctx.fillRect(x - 1.5, y - 22, textWidth + 10, 20);
        ctx.fillStyle = '#0b0e0f';
        ctx.fillText(label, x + 4, y - 7);
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  els.startBtn.addEventListener('click', () => {
    startCamera(facingMode).catch(() => {});
  });

  els.switchBtn.addEventListener('click', () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    startCamera(facingMode).catch(() => {});
  });

  window.addEventListener('resize', () => {
    if (stream) drawOverlay([], null);
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
