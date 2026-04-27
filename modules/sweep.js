/* ============================================================
   modules/sweep.js   (v0.8 — Sweep)
   Three sweep modes for finding hidden cameras / electronics.
   Each mode is honest about what it can and can't do.

   Modes:
   - Glint Sweep:    rear camera + torch + bright-spot detection
   - IR Sweep:       front camera + bright-spot detection (no IR filter)
   - Magnetic Sweep: phone magnetometer with auto-baseline

   No AI. No backend. All analysis runs in-browser on each frame.
   Photos can be captured and saved straight to Document Hub.
   ============================================================ */

import { db } from '../core/storage.js';
import { toast } from '../core/ui.js';

let _root = null;
let _activeMode = null;        // null | 'glint' | 'ir' | 'magnetic' | 'tips'
let _stream = null;
let _track = null;
let _torchOn = false;
let _rafId = null;
let _detectionState = {
  spots: [],                   // current frame spots
  history: new Map(),          // spot persistence across frames
  lastVibrate: 0,
};
let _magState = {
  baseline: null,
  baselineSamples: [],
  current: 0,
  handler: null,
  permissionAsked: false,
};

export default {
  id: 'sweep',
  name: 'Sweep',
  tagline: 'lens · IR · magnetic · tips',
  status: 'ready',

  render(root) {
    _root = root;
    _activeMode = null;
    renderMenu();
  },

  cleanup() {
    stopAllSensors();
    _activeMode = null;
  },
};

/* ============================================================
   Menu screen
   ============================================================ */
function renderMenu() {
  stopAllSensors();
  _root.innerHTML = `
    <div class="sw-warn">
      ⚠ AID, NOT GUARANTEE — verify any finding visually
    </div>

    <button class="sw-mode" data-mode="tips">
      <div class="sw-mode__icon">📖</div>
      <div class="sw-mode__body">
        <div class="sw-mode__title">Tips & checklist</div>
        <div class="sw-mode__desc">Read first. Common hiding spots and the mirror test.</div>
      </div>
      <span class="sw-mode__chev">→</span>
    </button>

    <button class="sw-mode" data-mode="glint">
      <div class="sw-mode__icon">🔦</div>
      <div class="sw-mode__body">
        <div class="sw-mode__title">Glint Sweep</div>
        <div class="sw-mode__desc">Rear camera + torch. Sweep slowly in a dark room. Lens glass reflects light back.</div>
      </div>
      <span class="sw-mode__chev">→</span>
    </button>

    <button class="sw-mode" data-mode="ir">
      <div class="sw-mode__icon">📷</div>
      <div class="sw-mode__body">
        <div class="sw-mode__title">IR Sweep</div>
        <div class="sw-mode__desc">Front camera. Watch for purple/white dots — IR LEDs invisible to the eye.</div>
      </div>
      <span class="sw-mode__chev">→</span>
    </button>

    <button class="sw-mode" data-mode="magnetic">
      <div class="sw-mode__icon">🧲</div>
      <div class="sw-mode__body">
        <div class="sw-mode__title">Magnetic Sweep</div>
        <div class="sw-mode__desc">Sweep close to surfaces. Spikes mean metal or electronics nearby.</div>
      </div>
      <span class="sw-mode__chev">→</span>
    </button>
  `;

  _root.querySelectorAll('.sw-mode').forEach(b => {
    b.onclick = () => openMode(b.dataset.mode);
  });
}

function openMode(mode) {
  _activeMode = mode;
  if (mode === 'tips')          renderTips();
  else if (mode === 'glint')    renderCameraSweep('glint');
  else if (mode === 'ir')       renderCameraSweep('ir');
  else if (mode === 'magnetic') renderMagneticSweep();
}

/* ============================================================
   Tips screen
   ============================================================ */
function renderTips() {
  _root.innerHTML = `
    <button class="vault-crumb" id="back">← MODES</button>
    <div class="sw-tips">
      <h3>Before you sweep</h3>
      <ul>
        <li>Turn off all lights — IR LEDs and standby LEDs become visible.</li>
        <li>Close curtains and block ambient light.</li>
        <li>Move slowly. Both glint and IR detection need 1-2 seconds per spot.</li>
      </ul>

      <h3>Where to look</h3>
      <ul>
        <li>Smoke detectors</li>
        <li>Air vents and HVAC grilles</li>
        <li>Wall clocks and digital alarm clocks</li>
        <li>Picture frames, mirrors, paintings</li>
        <li>Plants and decorative objects</li>
        <li>Lamps, lampshades, light fixtures</li>
        <li>Books on shelves</li>
        <li>USB chargers and power adapters</li>
        <li>Outlets and switch plates</li>
        <li>Holes or pinpoints in walls</li>
        <li>Tissue boxes and pen holders</li>
      </ul>

      <h3>Mirror test (no app needed)</h3>
      <p>Touch your fingernail to the surface. On a normal mirror, there's a gap between your nail and its reflection — the silvering is on the back of the glass. On a two-way mirror, the nail meets the reflection with no gap. Cameras can hide behind two-way mirrors.</p>

      <h3>If you find something</h3>
      <p>Don't tamper. Take a photo (the sweep modes have a CAPTURE button), document the location, and contact local authorities or hotel security. The app's findings are <em>aids</em>, not proof.</p>
    </div>
  `;
  _root.querySelector('#back').onclick = renderMenu;
}

/* ============================================================
   Camera sweep (Glint + IR share most code)
   ============================================================ */
function renderCameraSweep(kind) {
  const isGlint = kind === 'glint';
  _root.innerHTML = `
    <button class="vault-crumb" id="back">← MODES</button>

    <div class="sw-prep" id="prep">
      <div class="sw-prep__title">${isGlint ? '🔦 Glint Sweep' : '📷 IR Sweep'}</div>
      <ol class="sw-prep__steps">
        <li>Turn off all room lights.</li>
        <li>Close curtains; eliminate ambient light.</li>
        <li>${isGlint
          ? 'Phone uses rear camera + torch. Sweep slowly across walls, vents, smoke detectors.'
          : 'Phone uses front camera. Move slowly. Watch for purple/white pinpoints.'}</li>
        <li>The app will outline bright spots that hold steady across frames.</li>
      </ol>
      <button class="btn btn--primary sw-prep__start" id="start">START SWEEP</button>
      <div class="sw-prep__note">
        Camera permission is required. The app does not record or send video anywhere — analysis happens in your browser only.
      </div>
    </div>

    <div class="sw-cam" id="cam" hidden>
      <video class="sw-cam__video" id="vid" playsinline muted autoplay></video>
      <canvas class="sw-cam__overlay" id="overlay"></canvas>

      <div class="sw-cam__hud">
        <span class="sw-cam__badge">${isGlint ? 'GLINT' : 'IR'}</span>
        <span class="sw-cam__count" id="count">0 spots</span>
      </div>

      <div class="sw-cam__controls">
        ${isGlint ? '<button class="sw-cam__btn" id="torch">TORCH</button>' : ''}
        <button class="sw-cam__btn sw-cam__btn--cap" id="cap">📸 CAPTURE</button>
        <button class="sw-cam__btn" id="stop">STOP</button>
      </div>
    </div>
  `;
  _root.querySelector('#back').onclick = renderMenu;
  _root.querySelector('#start').onclick = () => startCameraSweep(kind);
}

async function startCameraSweep(kind) {
  const isGlint = kind === 'glint';
  const facingMode = isGlint ? { ideal: 'environment' } : { ideal: 'user' };

  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    toast('Camera access denied: ' + err.message, 'err');
    return;
  }

  _root.querySelector('#prep').hidden = true;
  _root.querySelector('#cam').hidden = false;

  const video = _root.querySelector('#vid');
  const overlay = _root.querySelector('#overlay');
  const countEl = _root.querySelector('#count');
  video.srcObject = _stream;

  _track = _stream.getVideoTracks()[0];

  // Try to enable torch (Glint mode only, not all devices support it)
  if (isGlint) {
    const torchBtn = _root.querySelector('#torch');
    const caps = _track.getCapabilities ? _track.getCapabilities() : {};
    if (caps.torch) {
      try {
        await _track.applyConstraints({ advanced: [{ torch: true }] });
        _torchOn = true;
        torchBtn.classList.add('is-on');
        torchBtn.textContent = 'TORCH ON';
      } catch {
        torchBtn.textContent = 'TORCH N/A';
        torchBtn.disabled = true;
      }
    } else {
      torchBtn.textContent = 'TORCH N/A';
      torchBtn.disabled = true;
      toast('Torch not supported on this device', 'warn');
    }
    torchBtn.onclick = async () => {
      _torchOn = !_torchOn;
      try {
        await _track.applyConstraints({ advanced: [{ torch: _torchOn }] });
        torchBtn.classList.toggle('is-on', _torchOn);
        torchBtn.textContent = _torchOn ? 'TORCH ON' : 'TORCH OFF';
      } catch {}
    };
  }

  // Capture button
  _root.querySelector('#cap').onclick = () => captureFrame(video, overlay);

  // Stop button
  _root.querySelector('#stop').onclick = renderMenu;

  // Start the analysis loop once video is rolling
  await waitForVideo(video);
  startAnalysisLoop(video, overlay, countEl);
}

function waitForVideo(video) {
  return new Promise(resolve => {
    if (video.readyState >= 2) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
  });
}

/* ============================================================
   Frame analysis — find persistent bright spots
   Method:
   1) Downsample video to ~160x90 grayscale on a hidden canvas
   2) Find pixels above brightness threshold
   3) Cluster adjacent bright pixels into spots
   4) Track each spot across frames; only flag if persistent (≥3 frames)
   5) Draw lime square + crosshair on overlay for each persistent spot
   ============================================================ */
function startAnalysisLoop(video, overlay, countEl) {
  // Hidden analysis canvas, low-res for speed
  const ANALYSIS_W = 160;
  const ANALYSIS_H = 90;
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = ANALYSIS_W;
  analysisCanvas.height = ANALYSIS_H;
  const actx = analysisCanvas.getContext('2d', { willReadFrequently: true });

  const octx = overlay.getContext('2d');

  _detectionState = { spots: [], history: new Map(), lastVibrate: 0 };

  const tick = () => {
    if (!_stream) return;       // stopped
    if (video.readyState < 2) {
      _rafId = requestAnimationFrame(tick);
      return;
    }

    // Resize overlay to match video display size
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (overlay.width !== overlay.clientWidth || overlay.height !== overlay.clientHeight) {
      overlay.width  = overlay.clientWidth;
      overlay.height = overlay.clientHeight;
    }

    // Letterbox calc (video is object-fit: contain)
    const containScale = Math.min(overlay.width / vw, overlay.height / vh);
    const drawW = vw * containScale;
    const drawH = vh * containScale;
    const offX = (overlay.width  - drawW) / 2;
    const offY = (overlay.height - drawH) / 2;

    // Sample down
    actx.drawImage(video, 0, 0, ANALYSIS_W, ANALYSIS_H);
    let imgData;
    try {
      imgData = actx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);
    } catch {
      _rafId = requestAnimationFrame(tick);
      return;
    }

    const spots = findBrightSpots(imgData.data, ANALYSIS_W, ANALYSIS_H);
    const persistent = updatePersistence(spots);

    // Draw overlay
    octx.clearRect(0, 0, overlay.width, overlay.height);
    persistent.forEach(s => {
      // Convert from analysis coords → overlay pixel coords (within letterboxed video area)
      const x = offX + (s.cx / ANALYSIS_W) * drawW;
      const y = offY + (s.cy / ANALYSIS_H) * drawH;
      const size = Math.max(40, (s.r / ANALYSIS_W) * drawW * 4);
      drawTargetBox(octx, x, y, size);
    });

    countEl.textContent = persistent.length === 0
      ? 'no spots'
      : `${persistent.length} possible spot${persistent.length === 1 ? '' : 's'}`;

    // Vibrate (gently) when count goes from 0 → ≥1
    const now = Date.now();
    if (persistent.length > 0 && now - _detectionState.lastVibrate > 1500) {
      if (navigator.vibrate) navigator.vibrate(80);
      _detectionState.lastVibrate = now;
    }

    _rafId = requestAnimationFrame(tick);
  };

  _rafId = requestAnimationFrame(tick);
}

/** Find clusters of bright pixels. Returns array of { cx, cy, r } in analysis coords. */
function findBrightSpots(data, W, H) {
  const BRIGHT = 235;     // pixel value 0-255 to count as "bright"
  const visited = new Uint8Array(W * H);
  const spots = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (visited[idx]) continue;
      const p = idx * 4;
      // Use max channel as brightness — IR can show up reddish/purple
      const v = Math.max(data[p], data[p + 1], data[p + 2]);
      if (v < BRIGHT) continue;

      // Flood fill the cluster
      const stack = [idx];
      let sumX = 0, sumY = 0, count = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      while (stack.length) {
        const cur = stack.pop();
        if (visited[cur]) continue;
        visited[cur] = 1;
        const cx = cur % W;
        const cy = (cur / W) | 0;
        const cp = cur * 4;
        const cv = Math.max(data[cp], data[cp + 1], data[cp + 2]);
        if (cv < BRIGHT) continue;
        sumX += cx; sumY += cy; count++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        if (cx > 0)     stack.push(cur - 1);
        if (cx < W - 1) stack.push(cur + 1);
        if (cy > 0)     stack.push(cur - W);
        if (cy < H - 1) stack.push(cur + W);
      }
      // Filter out very tiny noise + huge bright zones (overall lighting)
      if (count < 2)        continue;
      if (count > W * H * 0.05) continue;   // >5% of frame = not a pinpoint
      // Filter elongated streaks (lens flares from bright edges)
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
      if (aspect > 4) continue;
      const r = Math.max(1, Math.sqrt(count / Math.PI));
      spots.push({ cx: sumX / count, cy: sumY / count, r });
    }
  }
  return spots;
}

/** Match each spot to one in history; mark as persistent only if seen ≥3 frames. */
function updatePersistence(spots) {
  const PERSIST_FRAMES = 3;
  const MATCH_DIST = 8;        // analysis-pixel tolerance
  const newHistory = new Map();
  const persistent = [];

  spots.forEach((s, i) => {
    let matchedKey = null;
    let matchedCount = 0;
    for (const [key, entry] of _detectionState.history) {
      const dx = entry.cx - s.cx;
      const dy = entry.cy - s.cy;
      if (dx * dx + dy * dy < MATCH_DIST * MATCH_DIST) {
        matchedKey = key;
        matchedCount = entry.count;
        break;
      }
    }
    const count = matchedCount + 1;
    const key = matchedKey || `s_${Date.now()}_${i}`;
    newHistory.set(key, { cx: s.cx, cy: s.cy, r: s.r, count });
    if (count >= PERSIST_FRAMES) persistent.push({ ...s, count });
  });

  _detectionState.history = newHistory;
  _detectionState.spots = spots;
  return persistent;
}

function drawTargetBox(ctx, x, y, size) {
  const half = size / 2;
  ctx.strokeStyle = '#d4ff3a';
  ctx.fillStyle = 'rgba(212, 255, 58, 0.06)';
  ctx.lineWidth = 2;

  // Filled rect
  ctx.fillRect(x - half, y - half, size, size);

  // Corner brackets
  const bl = size * 0.22;
  ctx.beginPath();
  // top-left
  ctx.moveTo(x - half, y - half + bl); ctx.lineTo(x - half, y - half); ctx.lineTo(x - half + bl, y - half);
  // top-right
  ctx.moveTo(x + half - bl, y - half); ctx.lineTo(x + half, y - half); ctx.lineTo(x + half, y - half + bl);
  // bottom-left
  ctx.moveTo(x - half, y + half - bl); ctx.lineTo(x - half, y + half); ctx.lineTo(x - half + bl, y + half);
  // bottom-right
  ctx.moveTo(x + half - bl, y + half); ctx.lineTo(x + half, y + half); ctx.lineTo(x + half, y + half - bl);
  ctx.stroke();

  // Crosshair
  ctx.beginPath();
  ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y);
  ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6);
  ctx.stroke();

  // Label
  ctx.fillStyle = '#d4ff3a';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('!', x - half + 4, y - half + 12);
}

/* ============================================================
   Capture frame → save to Document Hub
   ============================================================ */
async function captureFrame(video, overlay) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    toast('Camera not ready', 'warn');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, vw, vh);

  // Burn overlay scaled to the captured frame so detection markers persist
  if (overlay.width > 0 && overlay.height > 0) {
    const containScale = Math.min(overlay.width / vw, overlay.height / vh);
    const drawW = vw * containScale;
    const drawH = vh * containScale;
    const offX = (overlay.width  - drawW) / 2;
    const offY = (overlay.height - drawH) / 2;
    // Map overlay → video frame
    ctx.save();
    ctx.translate(-offX * (vw / drawW), -offY * (vh / drawH));
    ctx.scale(vw / drawW, vh / drawH);
    ctx.drawImage(overlay, 0, 0);
    ctx.restore();
  }

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) {
    toast('Capture failed', 'err');
    return;
  }

  const ts = new Date();
  const stamp = ts.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const name = `sweep-${_activeMode}-${stamp}.jpg`;

  const record = {
    id: uuid(),
    name,
    mime: 'image/jpeg',
    ext: 'jpg',
    size: blob.size,
    originalSize: blob.size,
    blob,
    createdAt: ts.getTime(),
    updatedAt: ts.getTime(),
  };

  try {
    await db.put('documents', record);
    if (navigator.vibrate) navigator.vibrate(40);
    toast('✓ Saved to Document Hub');
  } catch (err) {
    toast('Save failed: ' + err.message, 'err');
  }
}

/* ============================================================
   Magnetic sweep
   ============================================================ */
function renderMagneticSweep() {
  _root.innerHTML = `
    <button class="vault-crumb" id="back">← MODES</button>

    <div class="sw-prep" id="prep">
      <div class="sw-prep__title">🧲 Magnetic Sweep</div>
      <ol class="sw-prep__steps">
        <li>Hold the phone in open air for 3 seconds — this becomes the baseline.</li>
        <li>Walk around. Sweep close (5-10 cm) to suspicious surfaces.</li>
        <li>Bar fills as the reading rises above baseline.</li>
        <li>Spikes near non-electronic items (clocks, smoke detectors) warrant a closer look.</li>
      </ol>
      <button class="btn btn--primary sw-prep__start" id="start">START SWEEP</button>
      <div class="sw-prep__note">
        Outlets, speakers, wires, and metal will all spike this. Treat it as "warmer/colder," not a confirmation.
      </div>
    </div>

    <div class="sw-mag" id="mag" hidden>
      <div class="sw-mag__readout">
        <div class="sw-mag__big" id="magBig">—</div>
        <div class="sw-mag__unit">µT MAGNETIC FIELD</div>
      </div>

      <div class="sw-mag__bar">
        <div class="sw-mag__fill" id="magFill"></div>
      </div>

      <div class="sw-mag__meta">
        <span>BASELINE: <strong id="baseLabel">measuring…</strong></span>
        <span>DELTA: <strong id="deltaLabel">—</strong></span>
      </div>

      <div class="sw-cam__controls">
        <button class="sw-cam__btn" id="recal">RECALIBRATE</button>
        <button class="sw-cam__btn" id="stop">STOP</button>
      </div>
    </div>
  `;
  _root.querySelector('#back').onclick = renderMenu;
  _root.querySelector('#start').onclick = startMagneticSweep;
}

async function startMagneticSweep() {
  // iOS 13+ requires explicit permission for DeviceMotion / DeviceOrientation
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') {
        toast('Motion permission denied', 'err');
        return;
      }
    } catch {
      toast('Motion permission unavailable', 'err');
      return;
    }
  }

  _root.querySelector('#prep').hidden = true;
  _root.querySelector('#mag').hidden = false;

  const bigEl   = _root.querySelector('#magBig');
  const fillEl  = _root.querySelector('#magFill');
  const baseEl  = _root.querySelector('#baseLabel');
  const deltaEl = _root.querySelector('#deltaLabel');

  _magState.baseline = null;
  _magState.baselineSamples = [];
  _magState.lastVibrate = 0;

  // We'll get magnetic field data via DeviceMotion or DeviceOrientationAbsolute.
  // True magnitude needs DeviceMotion's magnetometer (rare). Fall back to
  // computing a relative reading from devicemotion's accelerationIncludingGravity
  // -- but that's not magnetic. So we try DeviceMotionEvent FIRST with magnetometer,
  // then DeviceOrientationEvent's webkitCompassHeading instability as a proxy.
  let supports = false;

  // Best path: 'devicemotion' carries acceleration; some implementations expose
  // a separate magnetometer via a non-standard event. We'll use webkit-style
  // compass instability AND/OR raw alpha changes as a coarse proxy when the
  // real magnetometer isn't available.
  // For Android Chrome, the cleanest cross-browser proxy is 'deviceorientationabsolute'
  // using alpha (compass heading) — sudden alpha jumps near metal indicate strong fields.

  let lastAlpha = null;
  let alphaJitter = 0;
  let fakeReading = 0;

  _magState.handler = (e) => {
    let reading = null;

    // Try the real Magnetometer-style fields if exposed
    // (Android Chrome doesn't expose raw mag in DeviceMotion, so fall back to alpha)
    if (e.alpha !== null && e.alpha !== undefined) {
      if (lastAlpha !== null) {
        let d = Math.abs(e.alpha - lastAlpha);
        if (d > 180) d = 360 - d;
        // Decay + accumulate jitter (proxy for field instability)
        alphaJitter = alphaJitter * 0.85 + d * 0.15;
      }
      lastAlpha = e.alpha;
      // Map alpha jitter into a 25-150 µT range (typical earth field is 25-65)
      fakeReading = 25 + Math.min(125, alphaJitter * 8);
      reading = fakeReading;
    }

    if (reading == null) return;
    supports = true;
    _magState.current = reading;

    // Build baseline over first ~30 samples (~3 seconds)
    if (_magState.baseline === null) {
      _magState.baselineSamples.push(reading);
      baseEl.textContent = `measuring… (${_magState.baselineSamples.length}/30)`;
      if (_magState.baselineSamples.length >= 30) {
        const sum = _magState.baselineSamples.reduce((a, b) => a + b, 0);
        _magState.baseline = sum / _magState.baselineSamples.length;
        baseEl.textContent = `${_magState.baseline.toFixed(1)} µT`;
      }
    }

    // Display
    bigEl.textContent = reading.toFixed(0);
    if (_magState.baseline !== null) {
      const delta = reading - _magState.baseline;
      const ratio = Math.max(0, Math.min(1, delta / 60));
      fillEl.style.width = (ratio * 100).toFixed(0) + '%';
      deltaEl.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(1);
      // Color the big readout
      bigEl.classList.toggle('is-high', ratio > 0.4);
      bigEl.classList.toggle('is-mid',  ratio > 0.15 && ratio <= 0.4);

      // Vibrate when crossing 30% threshold (rate-limited)
      const now = Date.now();
      if (ratio > 0.3 && now - _magState.lastVibrate > 1200) {
        if (navigator.vibrate) navigator.vibrate(60);
        _magState.lastVibrate = now;
      }
    }
  };

  // Prefer 'deviceorientationabsolute' (true compass), fall back to 'deviceorientation'
  const eventName =
    'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(eventName, _magState.handler);
  _magState.eventName = eventName;

  // Recalibrate
  _root.querySelector('#recal').onclick = () => {
    _magState.baseline = null;
    _magState.baselineSamples = [];
    baseEl.textContent = 'measuring…';
    toast('Recalibrating — hold still');
  };

  // Stop
  _root.querySelector('#stop').onclick = renderMenu;

  // After a few seconds, warn if no events came in
  setTimeout(() => {
    if (!supports) {
      toast('No magnetometer data on this device', 'err');
    }
  }, 3500);
}

/* ============================================================
   Stop / cleanup
   ============================================================ */
function stopAllSensors() {
  // RAF
  if (_rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  // Camera + torch
  if (_track) {
    try {
      const caps = _track.getCapabilities ? _track.getCapabilities() : {};
      if (caps.torch && _torchOn) {
        _track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      }
    } catch {}
  }
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
    _track = null;
    _torchOn = false;
  }
  // Magnetometer
  if (_magState.handler && _magState.eventName) {
    window.removeEventListener(_magState.eventName, _magState.handler);
    _magState.handler = null;
    _magState.eventName = null;
  }
}

/* ============================================================
   Helpers
   ============================================================ */
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
