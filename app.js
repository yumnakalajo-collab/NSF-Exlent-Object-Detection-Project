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
    const detections = (result.results || []).filter((r) => r.value >= CONFIDENCE_FLOOR);

    drawOverlay(isDetectionModel ? detections : []);

    if (isDetectionModel) {
      window.__latestDetections = detections.map((d) => ({ label: d.label, value: d.value }));
    }

    if (isDetectionModel) {
      if (detections.length === 0) {
        setStatus('idle', 'No object detected');
        els.readout.innerHTML = `<div class="readout-empty">No object detected</div>`;
        return;
      }
      setStatus('scanning', `${detections.length} object${detections.length > 1 ? 's' : ''} found`);
      els.readout.innerHTML = detections
        .sort((a, b) => b.value - a.value)
        .map(
          (d) => `
          <div class="readout-row">
            <span class="readout-label">${escapeHtml(d.label)}</span>
            <span class="readout-confidence">${Math.round(d.value * 100)}%</span>
          </div>`
        )
        .join('');
    } else {
      const top = (result.results || []).slice().sort((a, b) => b.value - a.value)[0];
      window.__latestDetections = top && top.value >= CONFIDENCE_FLOOR ? [{ label: top.label, value: top.value }] : [];
      if (!top || top.value < CONFIDENCE_FLOOR) {
        setStatus('idle', 'No object detected');
        els.readout.innerHTML = `<div class="readout-empty">No object detected</div>`;
        return;
      }
      setStatus('scanning', 'Object found');
      els.readout.innerHTML = `
        <div class="readout-row">
          <span class="readout-label">${escapeHtml(top.label)}</span>
          <span class="readout-confidence">${Math.round(top.value * 100)}%</span>
        </div>`;
    }
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
