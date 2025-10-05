/* sketch.js
   Full p5.js sketch for Orbital 3D visualization.

   Change in this version:
   - For non-dz2 d overlays (overlayCache.type === 'd'), push each lobe outward along its axis
     by an axial offset proportional to its computed axial extent (t95). The size, color, direction,
     and position/orientation logic are preserved; only the axial offset used when rendering is changed.
   - dz2 overlays remain unchanged.
   - Reduced axial push multiplier to make non-dz2 d overlays sit slightly closer to the nucleus
     compared to the previous version (D_OVERLAY_AXIAL_PUSH_MULT = 0.12).
   - Added: maximum electron cap (30000) and UI "max" label when hit.
   - Removed: near/far per-electron size effect (for performance) — electrons now use a fixed size again.
*/

'use strict';

const FONT_FALLBACK_NAME = 'Inter, Arial, sans-serif';

let ui = {};
let positions = null;       // Float32Array [x,y,z,...]
let sizes = null;           // Float32Array [radius,...] (optional, currently per-sample electron size)
let sampleCount = 0;
let sampleTarget = 0;
let sampling = false;

let autoRotate = true;
window.autoRotate = !!autoRotate;

let rotX = -0.35;
let rotY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let camZoom = 1.0;
let camZoomTarget = camZoom;

let cnv;

let lblXgfx, lblYgfx, lblZgfx;
let lblTexW = 160, lblTexH = 64;
let lastLabelScreenPositions = null;

const a0 = 40; // arbitrary radial unit tuning
let sphereResolution = 12;

const SPHERE_RENDER_THRESHOLD = 600;
const CHUNK_SAMPLES = 1000;
const ATTEMPTS_PER_CHUNK = 20000; // tuned
const VIEW_MARGIN = 0.92;

const DEBUG_LABEL = false;

let progressDiv = null;
let statusDiv = null;

let centerLightColor = [255, 220, 160];
let backLightColor = [180, 200, 255];
let backPointFill = true;

const ELECTRON_BASE_COLOR = [255, 165, 60];

const NUCLEUS_RADIUS = 18.0;
const ELECTRON_MIN_GAP = 6.0;

const ELECTRON_DISTANCE_MULTIPLIER = 1.6;

const LIGHT_FALLOFF = 0.018;
const MIN_BRIGHTNESS = 0.10;
const MAX_BRIGHTNESS = 1.0;

const MIN_FACE_FACTOR = 0.08;
const FACE_EXP = 1.8;

const Z_FALLOFF_RATE = 0.005;
const MIN_Z_BRIGHTNESS = 0.05;

let nucleusShader = null;
let nucleus = null;

let _nucleusVertSrc = null;
let _nucleusFragSrc = null;

let overlayEnabled = false;
let overlayBtn = null;
let overlayCache = null;

let electronBtn = null;
let showElectrons = true;

let orbitalUpdateTimer = null;
/* Reduce debounce to make updates feel snappier while still avoiding floods */
const ORBITAL_UPDATE_DELAY = 150;

let currentSamplingId = 0;

/* track last UI state to avoid repeated fit/zoom when nothing changed */
let lastUIHash = null;

/* ---------- tuning constants ---------- */
const S_OVERLAY_SCALE = 0.85;
const P_OVERLAY_SCALE = 0.85;
const DZ_LOBE_SCALE = 1.00;
const LOBE_Z_SHRINK = 1.00;
const LOBE_AXIAL_EXTEND = 1.70;
const LOBE_Z_OFFSET_MULT = 0.18;
const P_PX_AXIAL_BOOST = 1.15;
const P_PX_RADIAL_BOOST = 1.10;
const LOBE_RADIAL_PERCENTILE_MULT = 0.65;
const LOBE_RADIAL_EXTRA_GROW = 1.03;
const GLOBAL_RADIAL_PUSH = 1.15;
const EQ_RADIAL_PUSH = 1.35;
const NEAR_NUCLEAR_PUSH_MULT = 2.0;
const NEAR_THRESHOLD_MULT = 1.5;
const NEAR_THRESHOLD_ABS = 80.0;
const NEAR_THRESHOLD_EQ_ABS = 120.0;
const BELLY_RADIAL_EXPAND = 1.18;
const BELLY_Z_SCALE = 0.45;
const DZ2_OVERLAY_COLOR = [100, 180, 255];
const DZ2_OVERLAY_ALPHA = 140;
const RING_DEFAULT_INNER_DIAM = 120.0;
const RING_DEFAULT_OUTER_DIAM = 180.0;
const RING_COLOR = [160, 220, 255];
const RING_ALPHA = 160;
const RING_DETAIL_U = 120;
const RING_DETAIL_V = 32;
const D_RADIAL_SHRINK_FACTOR = 0.80;
let D_DX2Y2_RADIAL_CANON = null;

/* ---------- overlay rendering shrink factors ----------
   s/p overlays default scaling (kept if used elsewhere)
*/
const OVERLAY_SCALE = 0.90;

/* ---------- Additional parameter for pushing non-dz2 d-overlays ----------
   This multiplier determines how far (along each lobe's axis) the overlay
   is translated outward relative to the lobe's axial extent (t95).
   Reduced from previous 0.25 to 0.12 so lobes sit slightly closer to nucleus.
*/
const D_OVERLAY_AXIAL_PUSH_MULT = 0.12;

/* ---------- New parameter for slightly pulling dz2 oval lobes closer ----------
   This multiplier is applied only at render time for dz2 overlays to nudge
   the two oval lobes a bit closer to the nucleus (without changing their size,
   color, or orientation). Value in (0,1] where 1.0 = no change.
*/
const DZ2_OVERLAY_AXIAL_PULL_MULT = 0.85;

/* ---------- new constants for electron UI behavior ---------- */
const MAX_ELECTRONS = 30000;

 /* ---------- preload shaders ---------- */
function preload() {
  _nucleusVertSrc = `
  precision highp float;
  attribute vec3 aPosition;
  attribute vec2 aTexCoord;
  varying vec2 vTexCoord;
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;
  void main() {
    vTexCoord = aTexCoord;
    vec4 pos = vec4(aPosition, 1.0);
    gl_Position = uProjectionMatrix * uModelViewMatrix * pos;
  }
  `;
  _nucleusFragSrc = `
  #ifdef GL_ES
  precision highp float;
  #endif
  varying vec2 vTexCoord;
  uniform vec3 uBaseColor;
  uniform vec3 uLightDir;
  uniform vec3 uBackLight;
  uniform float uAmbient;
  uniform float uSpecular;
  uniform float uAAFactor;
  void main() {
    vec2 uv = vTexCoord * 2.0 - 1.0;
    float r = length(uv);
    float edgeSmooth = max(0.0001, uAAFactor * 0.5);
    float alpha = 1.0 - smoothstep(1.0 - edgeSmooth, 1.0 + edgeSmooth, r);
    if (alpha <= 0.001) discard;
    float r2 = dot(uv, uv);
    float nz = sqrt(max(0.0, 1.0 - r2));
    vec3 normal = normalize(vec3(uv.x, uv.y, nz));
    vec3 L = normalize(uLightDir);
    float diff = max(dot(normal, L), 0.0);
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 halfV = normalize(L + viewDir);
    float spec = pow(max(dot(normal, halfV), 0.0), 64.0) * uSpecular;
    float back = pow(max(-normal.z, 0.0), 1.5);
    vec3 color = uBaseColor * (uAmbient + diff) + vec3(spec) + uBackLight * back;
    gl_FragColor = vec4(color, alpha);
  }
  `;
}

/* ---------- Nucleus class ---------- */
class Nucleus {
  constructor(radius = 18.0, opts = {}) {
    this.radius = radius;
    this.baseDetail = opts.baseDetail || 96;
    this.useImpostor = opts.useImpostor !== undefined ? opts.useImpostor : true;
    this.aaFactor = opts.aaFactor || 1.5;
    this._shader = opts.shader || null;
  }

  render(rotX, rotY, camZoom, worldToScreenFn, normalizeFn = null, backLightCol = [180,200,255]) {
    let pixelRadius = 0;
    try {
      const c = worldToScreenFn(0,0,0);
      const e = worldToScreenFn(this.radius, 0, 0);
      if (c && e) pixelRadius = dist(c.x, c.y, e.x, e.y);
    } catch (e) { pixelRadius = 0; }

    if (this._shader && this.useImpostor && isFinite(pixelRadius) && pixelRadius > 2) {
      push();
      rotateY(rotY);
      rotateX(rotX);
      const invScale = 1.0 / max(0.0001, camZoom);
      scale(invScale);
      const pixelDiameter = max(4, pixelRadius * 2.0);
      shader(this._shader);
      this._shader.setUniform('uBaseColor', [1.0, 1.0, 1.0]);
      const lightDir = normalizeFn ? normalizeFn([0.2, -0.4, 1.0]) : [0.2, -0.4, 1.0];
      this._shader.setUniform('uLightDir', lightDir);
      this._shader.setUniform('uBackLight', [backLightCol[0]*0.002, backLightCol[1]*0.002, backLightCol[2]*0.002]);
      this._shader.setUniform('uAmbient', 0.18);
      this._shader.setUniform('uSpecular', 0.9);
      this._shader.setUniform('uAAFactor', this.aaFactor);
      noStroke();
      push();
      translate(0, 0, 0);
      plane(pixelDiameter, pixelDiameter);
      pop();
      resetShader();
      pop();
      return;
    }

    push();
    noStroke();
    try {
      if (typeof sphereDetail === 'function') {
        const effectivePixelRadius = (isFinite(pixelRadius) && pixelRadius > 0) ? pixelRadius : 24;
        const desiredDetail = constrain(Math.ceil(effectivePixelRadius * 3.0), this.baseDetail, 512);
        sphereDetail(desiredDetail);
      }
    } catch (e) {}
    ambientMaterial(255);
    specularMaterial(255);
    shininess(80);
    sphere(this.radius);
    try { if (typeof sphereDetail === 'function') sphereDetail(this.baseDetail); } catch (e) {}
    pop();
  }
}

/* ---------- setup ---------- */
function setup() {
  progressDiv = select('#progress');
  statusDiv = select('#status');

  cnv = createCanvas(windowWidth, windowHeight, WEBGL);
  try {
    cnv.position(0, 0);
    cnv.style('position', 'fixed');
    cnv.style('top', '0px');
    cnv.style('left', '0px');
    cnv.style('width', '100%');
    cnv.style('height', '100%');
    cnv.style('display', 'block');
    cnv.style('z-index', '0');
  } catch (e) {}

  try { cnv.elt.setAttribute('aria-label', 'Orbital Canvas'); } catch (e) {}

  try {
    if (_nucleusVertSrc && _nucleusFragSrc && typeof createShader === 'function') {
      nucleusShader = createShader(_nucleusVertSrc, _nucleusFragSrc);
    }
  } catch (e) { nucleusShader = null; console.warn('Failed to create nucleus shader', e); }

  try { textFont(FONT_FALLBACK_NAME); } catch (e) {}

  smooth();
  createLabelGraphics();

  if (typeof sphereDetail === 'function') try { sphereDetail(sphereResolution); } catch (e) {}

  setupUI();

  nucleus = new Nucleus(NUCLEUS_RADIUS, { shader: nucleusShader, baseDetail: 96, useImpostor: true, aaFactor: 1.5 });

  camZoomTarget = camZoom;

  if (select('#nInput')) scheduleOrbitalUpdate(50);

  try { window.orbitalReady = true; } catch (e) {}

  // expose toggleAutoRotate and update UI label
  window.toggleAutoRotate = function() {
    autoRotate = !autoRotate;
    try { window.autoRotate = autoRotate; } catch (e) {}
    try { if (typeof window.updateToggleRotateText === 'function') window.updateToggleRotateText(); } catch (e) {}
  };
  try { window.autoRotate = autoRotate; } catch (e) {}
}

/* ---------- helpers: progress/status/labels ---------- */
function setStatus(text, append = false) {
  if (!statusDiv) return;
  if (!text) { try { statusDiv.style('display', 'none'); } catch (e) {} return; }
  if (append) statusDiv.html(statusDiv.html() + "\n" + text);
  else statusDiv.html(text);
  try { statusDiv.style('display', 'block'); } catch (e) {}
}
function setProgress(text) {
  if (!progressDiv) return;
  if (text) { progressDiv.html(text); try { progressDiv.style('display', 'block'); } catch (e) {} }
  else try { progressDiv.style('display', 'none'); } catch (e) {}
  try { if (typeof window.setLocalizedProgress === 'function') window.setLocalizedProgress(!!text, text); } catch (e) {}
}

function createLabelGraphics() {
  lblXgfx = createGraphics(lblTexW, lblTexH);
  lblYgfx = createGraphics(lblTexW, lblTexH);
  lblZgfx = createGraphics(lblTexW, lblTexH);
  [lblXgfx, lblYgfx, lblZgfx].forEach(g => {
    g.pixelDensity(1);
    g.clear();
    g.textFont(FONT_FALLBACK_NAME);
    g.textAlign(CENTER, CENTER);
  });
  drawLabelToGraphics(lblXgfx, 'x');
  drawLabelToGraphics(lblYgfx, 'y');
  drawLabelToGraphics(lblZgfx, 'z');
}
function drawLabelToGraphics(g, label) {
  g.clear();
  const fontSize = 30;
  g.textSize(fontSize);
  g.noStroke();
  g.fill(0, 140);
  g.text(label, g.width * 0.5 + 1.6, g.height * 0.5 + 1.6);
  g.fill(255);
  g.text(label, g.width * 0.5, g.height * 0.5);
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (sampleCount > 0) fitViewToPoints(true);
}

/* ---------- scheduling & UI wiring ---------- */
function scheduleOrbitalUpdate(delay = ORBITAL_UPDATE_DELAY) {
  if (orbitalUpdateTimer) clearTimeout(orbitalUpdateTimer);
  orbitalUpdateTimer = setTimeout(() => { createOrbitalFromUI(); }, delay);
}

function setupUI() {
  ui.nInput = select('#nInput');
  ui.lInput = select('#lInput');
  ui.mInput = select('#mInput');
  ui.electronSizeInput = select('#electronSizeInput');
  ui.numElectronsInput = select('#numElectronsInput');
  ui.createBtn = select('#createBtn');
  ui.toggleRotateBtn = select('#toggleRotateBtn');

  // create overlay and electron buttons if missing
  overlayBtn = select('#toggleOverlayBtn');
  electronBtn = select('#toggleElectronsBtn');

  // helper to manage "max" label for #electrons
  function updateNumElectronsMaxLabel(ne) {
    if (!ui.numElectronsInput || !ui.numElectronsInput.elt) return;
    let span = select('#numElectronsMaxLabel');
    if (!span) {
      try {
        span = createSpan('');
        span.id('numElectronsMaxLabel');
        span.style('margin-left', '6px');
        // try to insert after the input element
        const parent = ui.numElectronsInput.elt.parentNode;
        if (parent) {
          if (ui.numElectronsInput.elt.nextSibling) parent.insertBefore(span.elt, ui.numElectronsInput.elt.nextSibling);
          else parent.appendChild(span.elt);
        } else {
          // fallback: append to body
          document.body.appendChild(span.elt);
        }
      } catch (e) { return; }
    }
    try {
      if (typeof ne === 'number' && ne >= MAX_ELECTRONS) span.html('max');
      else span.html('');
    } catch (e) {}
  }

  function onNumChanged(ne) {
    // Do not modify overlayEnabled or showElectrons flags.
    // If ne == 0 we clear sampled positions and overlayCache so nothing renders,
    // but the UI toggles remain in their last state.
    if (typeof ne !== 'number') return;
    if (ne === 0) {
      positions = null;
      sizes = null;
      sampleCount = 0;
      sampleTarget = 0;
      sampling = false;
      overlayCache = null;
      updateNumElectronsMaxLabel(ne);
      // do not show status message
    } else {
      // clamp to MAX_ELECTRONS visually
      if (ne >= MAX_ELECTRONS) {
        try {
          if (ui.numElectronsInput) ui.numElectronsInput.value(MAX_ELECTRONS);
        } catch (e) {}
        updateNumElectronsMaxLabel(MAX_ELECTRONS);
      } else updateNumElectronsMaxLabel(ne);
      // when >0 and overlayEnabled is true, compute overlay after sampling finishes
    }
  }

  function inputChangedHandler() {
    // validate small things
    if (ui.nInput) {
      let n = parseInt(ui.nInput.value(), 10);
      if (isNaN(n) || n < 1) ui.nInput.value(1);
    }
    if (ui.lInput && ui.nInput) {
      let l = parseInt(ui.lInput.value(), 10);
      let n = Math.max(1, parseInt(ui.nInput.value()) || 1);
      if (isNaN(l) || l < 0) ui.lInput.value(0);
      if (l > n - 1) ui.lInput.value(Math.max(0, n - 1));
    }
    if (ui.mInput && ui.lInput) {
      let m = parseInt(ui.mInput.value(), 10);
      let l = Math.max(0, parseInt(ui.lInput.value()) || 0);
      if (isNaN(m) || Math.abs(m) > l) ui.mInput.value(0);
    }

    if (ui.numElectronsInput) {
      let ne = parseInt(ui.numElectronsInput.value(), 10);
      if (isNaN(ne) || ne < 0) { ne = 0; ui.numElectronsInput.value(ne); }
      if (ne > MAX_ELECTRONS) { ne = MAX_ELECTRONS; ui.numElectronsInput.value(ne); }
      onNumChanged(ne);
    }

    // update the textual orbital label immediately for immediate feedback
    try {
      if (typeof window.refreshOrbitalLabel === 'function') window.refreshOrbitalLabel();
    } catch (e) {}

    overlayCache = null;
    scheduleOrbitalUpdate();
  }

  const inputs = [ui.nInput, ui.lInput, ui.mInput, ui.numElectronsInput, ui.electronSizeInput];
  inputs.forEach(el => {
    if (!el) return;
    try {
      // Use p5.Element.input for convenience (fires while user types), but also
      // attach a native listener to the underlying element to cover browsers
      // and input modes where p5's .input may not fire consistently.
      try { el.input(inputChangedHandler); } catch (e) {}
      // Native listener (guaranteed to exist for <input> elements)
      try {
        if (el.elt && el.elt.addEventListener) {
          // IMPORTANT: attach 'input' only, DO NOT attach 'change' to avoid blur->change resample
          el.elt.addEventListener('input', inputChangedHandler, { passive: true });
          // keyup still useful for catching certain edit actions
          el.elt.addEventListener('keyup', (ev) => {
            if ((ev.key && ev.key.length === 1) || ev.key === 'Backspace' || ev.key === 'Delete') inputChangedHandler();
          });
        }
      } catch (e) {}
    } catch (e) {
      // fallback if p5.Element.input not present; attach native 'input' + keyup
      try { el.elt && el.elt.addEventListener('input', inputChangedHandler); } catch (e2) {}
      try {
        el.elt && el.elt.addEventListener('keyup', (ev) => {
          if ((ev.key && ev.key.length === 1) || ev.key === 'Backspace' || ev.key === 'Delete') inputChangedHandler();
        });
      } catch (e2) {}
    }
  });

  // ensure overlayBtn exists and is hooked
  if (!overlayBtn) {
    overlayBtn = createButton('');
    overlayBtn.id('toggleOverlayBtn');
    overlayBtn.elt.dataset.i18nKey = 'toggleOverlay';
    overlayBtn.elt.dataset.state = overlayEnabled ? 'on' : 'off';
    overlayBtn.elt.setAttribute('aria-pressed', overlayEnabled ? 'true' : 'false');
    overlayBtn.elt.classList.add('btn', 'secondary');
    overlayBtn.style('margin-top', '8px');

    // IMPORTANT: append INTO LEFT panel actions container to preserve your original left/right layout.
    const leftContainer = select('#ui .actions') || select('#ui');
    if (leftContainer && leftContainer.elt) leftContainer.elt.appendChild(overlayBtn.elt);
    else {
      // conservative fallback to earlier behavior (global .actions)
      const container = select('.actions') || select('#ui');
      if (container && container.elt) container.elt.appendChild(overlayBtn.elt);
    }

    try { if (typeof window.localizeNewElement === 'function') window.localizeNewElement(overlayBtn); } catch (e) {}
  } else {
    try { overlayBtn.elt.classList.add('btn', 'secondary'); } catch (e) {}
  }

  // ensure electronBtn exists and is hooked
  if (!electronBtn) {
    electronBtn = createButton('');
    electronBtn.id('toggleElectronsBtn');
    electronBtn.elt.dataset.i18nKey = 'toggleElectrons';
    electronBtn.elt.dataset.state = showElectrons ? 'on' : 'off';
    electronBtn.elt.setAttribute('aria-pressed', showElectrons ? 'true' : 'false');
    electronBtn.elt.classList.add('btn', 'secondary');
    electronBtn.style('margin-top', '6px');

    // Append to left panel actions (preserve layout)
    const leftContainer = select('#ui .actions') || select('#ui');
    if (leftContainer && leftContainer.elt) {
      // if overlayBtn exists and is in left container, insert after it for consistent order
      try {
        if (overlayBtn && overlayBtn.elt && overlayBtn.elt.parentNode === leftContainer.elt) {
          overlayBtn.elt.insertAdjacentElement('afterend', electronBtn.elt);
        } else {
          leftContainer.elt.appendChild(electronBtn.elt);
        }
      } catch (e) { leftContainer.elt.appendChild(electronBtn.elt); }
    } else {
      const container = select('.actions') || select('#ui');
      if (container && container.elt) container.elt.appendChild(electronBtn.elt);
    }

    try { if (typeof window.localizeNewElement === 'function') window.localizeNewElement(electronBtn); } catch (e) {}
  } else {
    try { electronBtn.elt.classList.add('btn', 'secondary'); } catch (e) {}
  }

  // overlay button behavior: toggles overlayEnabled but does not get forced off by numElectrons changes
  overlayBtn.mousePressed(() => {
    overlayEnabled = !overlayEnabled;
    try {
      overlayBtn.elt.setAttribute('aria-pressed', overlayEnabled ? 'true' : 'false');
      overlayBtn.elt.dataset.state = overlayEnabled ? 'on' : 'off';
    } catch (e) {}
    if (overlayEnabled && sampleCount > 0 && !sampling) {
      try { computeOverlay(); } catch (err) { console.warn('computeOverlay error', err); }
    } else if (!overlayEnabled) {
      overlayCache = null;
    }
    try { if (typeof window.localizeNewElement === 'function') window.localizeNewElement(overlayBtn); } catch (e) {}
  });

  // electron toggle: user-controlled, not forced by inputs
  electronBtn.mousePressed(() => {
    showElectrons = !showElectrons;
    try {
      electronBtn.elt.setAttribute('aria-pressed', showElectrons ? 'true' : 'false');
      electronBtn.elt.dataset.state = showElectrons ? 'on' : 'off';
    } catch (e) {}
    try { if (typeof window.localizeNewElement === 'function') window.localizeNewElement(electronBtn); } catch (e) {}
  });

  // update overlay button 'supported' visual depending on l (but do not change state)
  function updateOverlayButtonState() {
    const l = ui.lInput ? parseInt(ui.lInput.value(), 10) : 0;
    if (!overlayBtn) return;
    if (l >= 0 && l <= 2) {
      overlayBtn.style('opacity', '1.0');
      overlayBtn.style('background-color', '');
      overlayBtn.style('color', '');
      try {
        overlayBtn.elt.setAttribute('aria-pressed', overlayEnabled ? 'true' : 'false');
        overlayBtn.elt.dataset.state = overlayEnabled ? 'on' : 'off';
      } catch (e) {}
    } else {
      // visually indicate limited support but keep the ON/OFF state unchanged
      overlayBtn.style('opacity', '0.65');
      overlayBtn.style('background-color', '#333');
      overlayBtn.style('color', '#777');
      try {
        overlayBtn.elt.setAttribute('aria-pressed', overlayEnabled ? 'true' : 'false');
        overlayBtn.elt.dataset.state = overlayEnabled ? 'on' : 'off';
      } catch (e) {}
    }
    try { if (typeof window.localizeNewElement === 'function') window.localizeNewElement(overlayBtn); } catch (e) {}
  }
  if (ui.lInput) ui.lInput.input(updateOverlayButtonState);
  if (ui.nInput) ui.nInput.input(updateOverlayButtonState);
  if (ui.mInput) ui.mInput.input(updateOverlayButtonState);
  updateOverlayButtonState();

  // ensure rotate button label is synced using updateToggleRotateText exposed by index.html
  try { if (typeof window.updateToggleRotateText === 'function') window.updateToggleRotateText(); } catch (e) {}

  // initial label update for max (if UI already populated)
  try {
    const initialNe = ui.numElectronsInput ? parseInt(ui.numElectronsInput.value(), 10) : 0;
    if (!isNaN(initialNe)) updateNumElectronsMaxLabel(initialNe);
  } catch (e) {}
}

/* ---------- helper math / clustering ---------- */
function percentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const copy = Array.from(arr);
  copy.sort((a,b)=>a-b);
  const idx = Math.min(copy.length - 1, Math.floor(p * copy.length));
  return copy[idx];
}

function kmeans(points, count, k, maxIter = 30) {
  if (count <= 0) return [];
  const n = count;
  const indices = [...Array(n).keys()];
  const centroids = [];
  for (let i=0;i<k;i++){
    const idx = indices[Math.floor(random() * n)];
    centroids.push([points[idx*3], points[idx*3+1], points[idx*3+2]]);
  }
  let assignments = new Array(n).fill(0);
  for (let iter=0; iter<maxIter; iter++) {
    let moved = false;
    for (let i=0;i<n;i++){
      const px = points[i*3], py = points[i*3+1], pz = points[i*3+2];
      let best = 0;
      let bestD = Infinity;
      for (let c=0;c<k;c++){
        const dx = px - centroids[c][0];
        const dy = py - centroids[c][1];
        const dz = pz - centroids[c][2];
        const d = dx*dx + dy*dy + dz*dz;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; moved = true; }
    }
    const sums = [];
    const counts = [];
    for (let c=0;c<k;c++){ sums.push([0,0,0]); counts.push(0); }
    for (let i=0;i<n;i++){
      const a = assignments[i];
      sums[a][0] += points[i*3];
      sums[a][1] += points[i*3+1];
      sums[a][2] += points[i*3+2];
      counts[a] += 1;
    }
    for (let c=0;c<k;c++){
      if (counts[c] > 0) {
        centroids[c][0] = sums[c][0] / counts[c];
        centroids[c][1] = sums[c][1] / counts[c];
        centroids[c][2] = sums[c][2] / counts[c];
      } else {
        const idx = indices[Math.floor(random() * n)];
        centroids[c] = [points[idx*3], points[idx*3+1], points[idx*3+2]];
      }
    }
    if (!moved) break;
  }
  const clusters = [];
  for (let c=0;c<k;c++) clusters.push([]);
  for (let i=0;i<n;i++) clusters[assignments[i]].push(i);
  return clusters;
}

function yawPitchFromVector(v) {
  const vx = v[0], vy = v[1], vz = v[2];
  const yaw = Math.atan2(vx, vz);
  const horizLen = Math.sqrt(vx*vx + vz*vz);
  const pitch = -Math.atan2(vy, horizLen);
  return { yaw, pitch };
}

function drawLobeEllipsoid(axisVec, axialLen, radialRadius, fillColor, opacity = 150, axialOffset = 0) {
  if (!axisVec) return;
  const len = Math.sqrt(axisVec[0]*axisVec[0] + axisVec[1]*axisVec[1] + axisVec[2]*axisVec[2]);
  if (len === 0) return;
  const axisUnit = [axisVec[0]/len, axisVec[1]/len, axisVec[2]/len];
  const rp = yawPitchFromVector(axisUnit);

  push();
  rotateY(rp.yaw);
  rotateX(rp.pitch);

  translate(0, 0, axialLen * 0.5 + axialOffset);

  const sx = radialRadius;
  const sy = radialRadius;
  const sz = axialLen * 0.5;

  noStroke();
  fill(fillColor[0], fillColor[1], fillColor[2], opacity);

  try { if (typeof sphereDetail === 'function') sphereDetail(128); } catch (e) {}

  push(); scale(sx, sy, sz); sphere(1.0); pop();
  push(); translate(0,0,-axialLen * 0.25); scale(sx * 0.6, sy * 0.6, sz * 0.5); sphere(1.0); pop();

  try { if (typeof sphereDetail === 'function') sphereDetail(sphereResolution); } catch (e) {}

  pop();
}

/* ---------- pushElectronsOutward (FIXED) ----------
   Preserve full 3D direction when expanding points to avoid creating
   an artificial empty cylinder along the Z axis.
*/
function pushElectronsOutward(globalFactor = GLOBAL_RADIAL_PUSH, equatorialFactor = EQ_RADIAL_PUSH, applyNearMultiplier = false, nearMultiplier = NEAR_NUCLEAR_PUSH_MULT, nearThresholdParam = null, nearEquatorialThresholdParam = null) {
  if (!positions || sampleCount <= 0) return;

  const posAxial = [], negAxial = [];
  for (let i = 0; i < sampleCount; i++) {
    const z = positions[i*3 + 2];
    if (z >= 0) posAxial.push(z);
    else negAxial.push(-z);
  }
  const t80posRaw = posAxial.length ? percentile(posAxial, 0.80) : 0;
  const t80negRaw = negAxial.length ? percentile(negAxial, 0.80) : 0;
  const eqThreshold = Math.max(0.2 * Math.max(t80posRaw, t80negRaw), 1.0);

  const minAllowed = NUCLEUS_RADIUS + ELECTRON_MIN_GAP;
  const nearThreshold = (typeof nearThresholdParam === 'number' && isFinite(nearThresholdParam)) ? nearThresholdParam : (minAllowed * NEAR_THRESHOLD_MULT);
  const nearEqThreshold = (typeof nearEquatorialThresholdParam === 'number' && isFinite(nearEquatorialThresholdParam)) ? nearEquatorialThresholdParam : nearThreshold;

  const EPS = 1e-6;

  for (let i = 0; i < sampleCount; i++) {
    const idx = i * 3;
    let x = positions[idx], y = positions[idx + 1], z = positions[idx + 2];
    const rXY = Math.sqrt(x*x + y*y);
    const r3D = Math.sqrt(x*x + y*y + z*z);
    const isEquatorial = Math.abs(z) <= eqThreshold;
    let factor = isEquatorial ? equatorialFactor : globalFactor;

    let targetMinDistance = minAllowed;

    if (applyNearMultiplier) {
      if (isEquatorial && r3D <= nearEqThreshold) {
        factor *= nearMultiplier;
        targetMinDistance = Math.max(minAllowed, nearEqThreshold);
      } else if (!isEquatorial && r3D <= nearThreshold) {
        factor *= nearMultiplier;
        targetMinDistance = Math.max(minAllowed, nearThreshold);
      }
    }

    if (applyNearMultiplier) {
      // Already using full-3D scaling here (keeps direction).
      if (r3D <= EPS) {
        // at origin: pick random direction
        const ang = random(0, TWO_PI);
        const newR = Math.max(targetMinDistance, 0.5 * factor);
        positions[idx] = Math.cos(ang) * newR;
        positions[idx+1] = Math.sin(ang) * newR;
        positions[idx+2] = 0;
      } else {
        const newR3D = Math.max(targetMinDistance, r3D * factor);
        const s = newR3D / r3D;
        positions[idx] = x * s;
        positions[idx+1] = y * s;
        positions[idx+2] = z * s;
      }
    } else {
      // NON-applyNearMultiplier: preserve 3D direction for small rXY as well.
      if (rXY <= EPS) {
        // if essentially on axis, use r3D to decide
        if (r3D <= EPS) {
          // random direction on sphere at minAllowed radius
          const u = random(-1, 1);
          const theta = acos(u);
          const phi = random(0, TWO_PI);
          const sr = Math.sin(theta);
          positions[idx]   = minAllowed * sr * Math.cos(phi);
          positions[idx+1] = minAllowed * sr * Math.sin(phi);
          positions[idx+2] = minAllowed * Math.cos(theta);
        } else {
          // scale full 3D vector
          const newR3D = Math.max(minAllowed, r3D * factor);
          const s = newR3D / r3D;
          positions[idx] = x * s;
          positions[idx+1] = y * s;
          positions[idx+2] = z * s;
        }
      } else {
        // Previously scaled only XY; now scale full 3D vector to keep direction.
        const newR3D = Math.max(minAllowed, r3D * factor);
        const s = newR3D / r3D;
        positions[idx] = x * s;
        positions[idx+1] = y * s;
        positions[idx+2] = z * s;
      }
    }
  }
}

/* ---------- computeOverlay ---------- */
function computeOverlay() {
  if (!overlayEnabled) { overlayCache = null; return; }
  if (!positions || sampleCount <= 0) { overlayCache = null; return; }

  const l = ui.lInput ? int(ui.lInput.value()) : 0;
  const m = ui.mInput ? int(ui.mInput.value()) : 0;

  const overlayColor = DZ2_OVERLAY_COLOR;
  const cache = { type: null, data: null, color: overlayColor };

  if (l === 0) {
    const dists = [];
    for (let i=0;i<sampleCount;i++){
      const idx = i*3;
      const r = Math.sqrt(positions[idx]*positions[idx] + positions[idx+1]*positions[idx+1] + positions[idx+2]*positions[idx+2]);
      dists.push(r);
    }
    let r95 = percentile(dists, 0.95);
    r95 = Math.max(0.5, r95 * S_OVERLAY_SCALE);
    cache.type = 's';
    cache.data = { r95: r95 };

  } else if (l === 1) {
    const clusters = kmeans(positions, sampleCount, 2, 30);
    const lobesComputed = [];

    for (let c=0;c<clusters.length;c++){
      const idxs = clusters[c];
      if (idxs.length < 6) continue;
      let sx = 0, sy = 0, sz = 0;
      const axialVals = [];
      const radialVals = [];
      for (let j=0;j<idxs.length;j++){
        const i = idxs[j];
        const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
        sx += x; sy += y; sz += z;
      }
      sx /= idxs.length; sy /= idxs.length; sz /= idxs.length;
      const axis = [sx, sy, sz];
      const axisLen = Math.sqrt(axis[0]*axis[0]+axis[1]*axis[1]+axis[2]*axis[2]) || 1.0;
      const axisUnit = [axis[0]/axisLen, axis[1]/axisLen, axis[2]/axisLen];
      for (let j=0;j<idxs.length;j++){
        const i = idxs[j];
        const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
        const t = x*axisUnit[0] + y*axisUnit[1] + z*axisUnit[2];
        axialVals.push(Math.abs(t));
        const radialSq = x*x + y*y + z*z - t*t;
        radialVals.push(Math.sqrt(Math.max(0, radialSq)));
      }
      const t95 = percentile(axialVals, 0.95);
      const r95 = percentile(radialVals, 0.95);
      lobesComputed.push({ axisUnit: axisUnit, t95: Math.max(0.01, t95), r95: Math.max(0.01, r95) });
    }
    if (lobesComputed.length < 2) {
      const absX = [];
      const rPerpX = [];
      for (let i=0;i<sampleCount;i++){
        const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
        absX.push(Math.abs(x));
        rPerpX.push(Math.sqrt(y*y + z*z));
      }
      let t95_px = absX.length ? percentile(absX, 0.95) : 8.0;
      let r95_px = rPerpX.length ? percentile(rPerpX, 0.95) : 2.0;
      t95_px = Math.max(0.01, t95_px * P_PX_AXIAL_BOOST);
      r95_px = Math.max(0.01, r95_px * P_PX_RADIAL_BOOST);
      lobesComputed.push({ axisUnit: [1,0,0], t95: t95_px, r95: r95_px });
      lobesComputed.push({ axisUnit: [-1,0,0], t95: t95_px, r95: r95_px });
    }

    let bestIdx = -1;
    let bestAlign = -1;
    for (let i=0;i<lobesComputed.length;i++){
      const ax = lobesComputed[i].axisUnit;
      const align = Math.abs(ax[0]);
      if (align > bestAlign) { bestAlign = align; bestIdx = i; }
    }

    let canonicalT = null;
    let canonicalR = null;
    if (bestIdx >= 0) {
      canonicalT = lobesComputed[bestIdx].t95;
      canonicalR = lobesComputed[bestIdx].r95;
    } else {
      const absX = [];
      const rPerpX = [];
      for (let i=0;i<sampleCount;i++){
        const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
        absX.push(Math.abs(x));
        rPerpX.push(Math.sqrt(y*y + z*z));
      }
      canonicalT = absX.length ? percentile(absX, 0.95) : 8.0;
      canonicalR = rPerpX.length ? percentile(rPerpX, 0.95) : 2.0;
      canonicalT = Math.max(0.01, canonicalT * P_PX_AXIAL_BOOST);
      canonicalR = Math.max(0.01, canonicalR * P_PX_RADIAL_BOOST);
    }
    const lobesFinal = [];
    for (let i=0;i<lobesComputed.length;i++){
      const axUnit = lobesComputed[i].axisUnit;
      lobesFinal.push({
        axisUnit: axUnit,
        t95: canonicalT,
        r95: canonicalR
      });
    }
    if (lobesFinal.length === 1) {
      const ax = lobesFinal[0].axisUnit;
      lobesFinal.push({ axisUnit: [-ax[0], -ax[1], -ax[2]], t95: canonicalT, r95: canonicalR });
    }

    cache.type = 'p';
    cache.data = { lobes: lobesFinal };

  } else if (l === 2) {
    if (m === 0) {
      const posAxial = [];
      const negAxial = [];
      const radialXYAll = [];
      const radialXYEquatorial = [];

      for (let i=0;i<sampleCount;i++){
        const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
        const rxy = Math.sqrt(x*x + y*y);
        if (z >= 0) posAxial.push(z);
        else negAxial.push(-z);
        radialXYAll.push(rxy);
      }

      const t80posRaw = posAxial.length ? percentile(posAxial, 0.80) : 0;
      const t80negRaw = negAxial.length ? percentile(negAxial, 0.80) : 0;
      const t80pos = Math.max(1.0, t80posRaw * DZ_LOBE_SCALE * LOBE_Z_SHRINK * LOBE_AXIAL_EXTEND);
      const t80neg = Math.max(1.0, t80negRaw * DZ_LOBE_SCALE * LOBE_Z_SHRINK * LOBE_AXIAL_EXTEND);

      const lobeRadial80 = radialXYAll.length ? percentile(radialXYAll, 0.80) * LOBE_RADIAL_PERCENTILE_MULT : 2.0;
      const lobeRadial = Math.max(0.9, lobeRadial80 * LOBE_RADIAL_EXTRA_GROW);

      const axialOffsetPos = t80pos * LOBE_Z_OFFSET_MULT;
      const axialOffsetNeg = t80neg * LOBE_Z_OFFSET_MULT;

      const eqThreshold = Math.max(0.2 * Math.max(t80posRaw, t80negRaw), 1.0);
      for (let i=0;i<sampleCount;i++){
        const z = positions[i*3+2];
        if (Math.abs(z) <= eqThreshold) {
          const x = positions[i*3], y = positions[i*3+1];
          radialXYEquatorial.push(Math.sqrt(x*x + y*y));
        }
      }

      const innerP = 0.125;
      const outerP = 0.875;
      let ringInnerRadius, ringOuterRadius;
      if (radialXYEquatorial.length >= 8) {
        ringInnerRadius = Math.max(NUCLEUS_RADIUS + ELECTRON_MIN_GAP, percentile(radialXYEquatorial, innerP));
        ringOuterRadius = Math.max(ringInnerRadius + 0.001, percentile(radialXYEquatorial, outerP));
      } else {
        ringInnerRadius = RING_DEFAULT_INNER_DIAM * 0.5;
        ringOuterRadius = RING_DEFAULT_OUTER_DIAM * 0.5;
      }

      let tubeRadius = Math.max(1.0, (ringOuterRadius - ringInnerRadius) * 0.5);
      const majorRadius = (ringInnerRadius + ringOuterRadius) * 0.5;

      cache.type = 'dz2';
      cache.data = {
        t80pos: t80pos,
        t80neg: t80neg,
        lobeRadial: lobeRadial,
        axialOffsetPos: axialOffsetPos,
        axialOffsetNeg: axialOffsetNeg,
        ring: {
          innerRadius: ringInnerRadius,
          outerRadius: ringOuterRadius,
          majorRadius: majorRadius,
          tubeRadius: tubeRadius,
          color: RING_COLOR.slice(),
          alpha: RING_ALPHA
        }
      };
    } else {
      const k = 4;
      const clusters = kmeans(positions, sampleCount, k, 30);
      const lobesRaw = [];
      for (let c=0;c<clusters.length;c++){
        const idxs = clusters[c];
        if (idxs.length < 6) continue;
        let sx = 0, sy = 0, sz = 0;
        const radialVals = [];
        const axialVals = [];
        for (let j=0;j<idxs.length;j++){
          const i = idxs[j];
          sx += positions[i*3]; sy += positions[i*3+1]; sz += positions[i*3+2];
        }
        sx /= idxs.length; sy /= idxs.length; sz /= idxs.length;
        const axis = [sx, sy, sz];
        const axisLen = Math.sqrt(axis[0]*axis[0]+axis[1]*axis[1]+axis[2]*axis[2]) || 1.0;
        const axisUnit = [axis[0]/axisLen, axis[1]/axisLen, axis[2]/axisLen];
        for (let j=0;j<idxs.length;j++){
          const i = idxs[j];
          const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
          const t = x*axisUnit[0] + y*axisUnit[1] + z*axisUnit[2];
          axialVals.push(Math.abs(t));
          const radialSq = x*x + y*y + z*z - t*t;
          radialVals.push(Math.sqrt(Math.max(0, radialSq)));
        }
        const t95 = percentile(axialVals, 0.95);
        const r95 = percentile(radialVals, 0.95);
        lobesRaw.push({ axisUnit: axisUnit, t95: Math.max(4, t95), r95: Math.max(0.01, r95) });
      }
      if (lobesRaw.length === 0) {
        cache.type = 'd';
        cache.data = { lobes: [] };
        overlayCache = cache;
        return;
      }

      if (Math.abs(m) === 2) {
        const rList = lobesRaw.map(l => l.r95).sort((a,b) => a - b);
        let medianR;
        const n = rList.length;
        if (n % 2 === 1) medianR = rList[(n-1)/2];
        else medianR = 0.5 * (rList[n/2 - 1] + rList[n/2]);

        let canonicalRadial = Math.max(0.01, medianR * D_RADIAL_SHRINK_FACTOR);
        if (!isFinite(canonicalRadial) || canonicalRadial <= 0) canonicalRadial = 0.5;

        D_DX2Y2_RADIAL_CANON = canonicalRadial;

        const lobesFinal = lobesRaw.map(raw => ({
          axisUnit: [raw.axisUnit[0], raw.axisUnit[1], raw.axisUnit[2]],
          t95: raw.t95,
          r95: canonicalRadial
        }));

        cache.type = 'd';
        cache.data = { lobes: lobesFinal };

      } else {
        let canonicalRadial = null;
        if (D_DX2Y2_RADIAL_CANON && isFinite(D_DX2Y2_RADIAL_CANON) && D_DX2Y2_RADIAL_CANON > 0) {
          canonicalRadial = D_DX2Y2_RADIAL_CANON;
        } else {
          const rList = lobesRaw.map(l => l.r95).sort((a,b) => a - b);
          let medianR;
          const n = rList.length;
          if (n % 2 === 1) medianR = rList[(n-1)/2];
          else medianR = 0.5 * (rList[n/2 - 1] + rList[n/2]);
          canonicalRadial = Math.max(0.01, medianR * D_RADIAL_SHRINK_FACTOR);
        }

        if (!isFinite(canonicalRadial) || canonicalRadial <= 0) canonicalRadial = 0.5;

        const lobesFinal = lobesRaw.map(raw => ({
          axisUnit: [raw.axisUnit[0], raw.axisUnit[1], raw.axisUnit[2]],
          t95: raw.t95,
          r95: canonicalRadial
        }));

        cache.type = 'd';
        cache.data = { lobes: lobesFinal };
      }
    }
  }

  overlayCache = cache;
}

/* ---------- render loop ---------- */
function draw() {
  background(0);

  const ZOOM_LERP = 0.12;
  if (isFinite(camZoomTarget) && Math.abs(camZoomTarget - camZoom) > 1e-5) {
    camZoom += (camZoomTarget - camZoom) * ZOOM_LERP;
    if (Math.abs(camZoomTarget - camZoom) < 1e-4) camZoom = camZoomTarget;
  }

  ambientLight(70);
  directionalLight(200,200,220,-0.5,-0.6,-1);
  pointLight(255,255,255,0,-400,600);
  pointLight(140,140,160,-400,-200,-300);

  try {
    directionalLight(backLightColor[0], backLightColor[1], backLightColor[2], 0, 0, 1);
    if (backPointFill) pointLight(backLightColor[0]*0.45, backLightColor[1]*0.45, backLightColor[2]*0.45, 0, 0, -800);
  } catch (e) {}

  push();
  scale(camZoom);
  if (autoRotate && !isDragging) rotY += 0.0035;
  rotateY(rotY);
  rotateX(rotX);

  const axisLen = computeAxisLength90();
  drawAxes(axisLen);

  if (nucleus) nucleus.render(rotX, rotY, camZoom, worldToScreen, normalizeVec3, backLightColor);

  // electrons
  if (showElectrons && sampleCount > 0) {
    const baseUIVal = float((ui.electronSizeInput && ui.electronSizeInput.value()) || 1);

    if (sampleCount <= SPHERE_RENDER_THRESHOLD) {
      if (typeof sphereDetail === 'function') try { sphereDetail(sphereResolution); } catch (e) {}
      const desiredPixelBase = max(4.0, baseUIVal * 8.0);
      for (let i=0;i<sampleCount;i++){
        const idx = i*3;
        const x = positions[idx], y = positions[idx+1], z = positions[idx+2];
        const cam = worldToCameraSpace(x, y, z);
        const distCam = cam.dist;
        const camZ = cam.z;
        const facing = cam.facing;

        let brightness = 1.0 / (1.0 + LIGHT_FALLOFF * distCam);
        brightness = constrain(brightness, MIN_BRIGHTNESS, MAX_BRIGHTNESS);

        const zFactor = Math.exp(Z_FALLOFF_RATE * camZ / camZoom);
        brightness *= constrain(zFactor, MIN_Z_BRIGHTNESS, 1.0);

        const faceMul = MIN_FACE_FACTOR + (1.0 - MIN_FACE_FACTOR) * pow(facing, FACE_EXP);
        brightness *= faceMul;
        brightness = constrain(brightness, 0, 1);

        // Use fixed desired pixel size (no near/far multiplier for performance)
        const desiredPixels = desiredPixelBase;

        push();
        translate(x, y, z);
        noStroke();
        const ambR = Math.round(ELECTRON_BASE_COLOR[0] * brightness);
        const ambG = Math.round(ELECTRON_BASE_COLOR[1] * brightness);
        const ambB = Math.round(ELECTRON_BASE_COLOR[2] * brightness);
        ambientMaterial(ambR, ambG, ambB);
        specularMaterial(Math.round(255 * brightness));
        shininess(30);
        const worldR = worldRadiusForScreenPixels(x, y, z, desiredPixels);
        sphere(max(0.05, worldR));
        pop();
      }
    } else {
      // For large counts use efficient POINTS batch drawing (fixed size per frame)
      noLights();
      const base = ELECTRON_BASE_COLOR;
      const pointSize = constrain(max(0.5, baseUIVal * 1.5), 0.5, 18);
      stroke(base[0], base[1], base[2]);
      fill(base[0], base[1], base[2]);
      strokeWeight(pointSize);
      beginShape(POINTS);
      for (let i=0;i<sampleCount;i++){
        const idx = i*3;
        vertex(positions[idx], positions[idx+1], positions[idx+2]);
      }
      endShape();
      // reset strokeWeight to default
      strokeWeight(1);
    }
  }

  // overlay
  if (overlayEnabled && overlayCache) {
    try { hint(DISABLE_DEPTH_TEST); } catch (e) {}
    push();

    if (overlayCache.type === 's') {
      const r95 = overlayCache.data.r95;
      push();
      noLights();
      noStroke();
      blendMode(ADD);
      try { if (typeof sphereDetail === 'function') sphereDetail(192); } catch (e) {}
      // scale sphere radius by OVERLAY_SCALE
      const scaledR = r95 * OVERLAY_SCALE;
      fill(DZ2_OVERLAY_COLOR[0], DZ2_OVERLAY_COLOR[1], DZ2_OVERLAY_COLOR[2], DZ2_OVERLAY_ALPHA);
      sphere(scaledR);
      try { if (typeof sphereDetail === 'function') sphereDetail(sphereResolution); } catch (e) {}
      blendMode(BLEND);
      pop();

    } else if (overlayCache.type === 'p') {
      const lobes = overlayCache.data.lobes || [];
      for (let li=0; li<lobes.length; li++) {
        const L = lobes[li];
        // p overlays scaled by OVERLAY_SCALE (size preserved relative to earlier behavior)
        const scaledAxial = Math.max(4, L.t95) * OVERLAY_SCALE;
        const scaledRadial = Math.max(0.01, L.r95) * OVERLAY_SCALE;
        push(); noLights(); drawLobeEllipsoid(L.axisUnit, scaledAxial, scaledRadial, DZ2_OVERLAY_COLOR, DZ2_OVERLAY_ALPHA, 0); pop();
      }

    } else if (overlayCache.type === 'dz2') {
      // dz2 overlay: keep exactly as computed (no additional scaling or pushing)
      const d = overlayCache.data;
      if (d) {
        const lobeAxialPos = d.t80pos;
        const lobeAxialNeg = d.t80neg;
        const axialOffsetPos = d.axialOffsetPos || 0;
        const axialOffsetNeg = d.axialOffsetNeg || 0;
        const lobeRadial = d.lobeRadial;

        // Apply render-time pull multiplier to the axial offsets so the two oval lobes sit slightly closer
        // to the nucleus while preserving computed sizes, orientations, and the ring itself.
        const renderAxialOffsetPos = axialOffsetPos * DZ2_OVERLAY_AXIAL_PULL_MULT;
        const renderAxialOffsetNeg = axialOffsetNeg * DZ2_OVERLAY_AXIAL_PULL_MULT;

        push();
        noLights();
        drawLobeEllipsoid([0,0,1], lobeAxialPos, lobeRadial, DZ2_OVERLAY_COLOR, DZ2_OVERLAY_ALPHA, renderAxialOffsetPos);
        drawLobeEllipsoid([0,0,-1], lobeAxialNeg, lobeRadial, DZ2_OVERLAY_COLOR, DZ2_OVERLAY_ALPHA, renderAxialOffsetNeg);
        pop();

        if (d.ring) {
          push();
          noStroke();
          blendMode(ADD);
          fill(d.ring.color[0], d.ring.color[1], d.ring.color[2], d.ring.alpha);

          try { if (typeof sphereDetail === 'function') sphereDetail(32); } catch (e) {}

          try {
            if (typeof torus === 'function') {
              torus(d.ring.majorRadius, d.ring.tubeRadius, RING_DETAIL_U, RING_DETAIL_V);
            } else {
              const steps = 240;
              for (let i = 0; i < steps; i++) {
                const ang = (i / steps) * TWO_PI;
                const cx = Math.cos(ang) * d.ring.majorRadius;
                const cy = Math.sin(ang) * d.ring.majorRadius;
                push();
                translate(cx, cy, 0);
                sphere(max(0.01, d.ring.tubeRadius));
                pop();
              }
            }
          } catch (e) {
            const steps = 240;
            for (let i = 0; i < steps; i++) {
              const ang = (i / steps) * TWO_PI;
              const cx = Math.cos(ang) * d.ring.majorRadius;
              const cy = Math.sin(ang) * d.ring.majorRadius;
              push();
              translate(cx, cy, 0);
              sphere(max(0.01, d.ring.tubeRadius));
              pop();
            }
          }

          try { if (typeof sphereDetail === 'function') sphereDetail(sphereResolution); } catch (e) {}
          blendMode(BLEND);
          pop();
        }
      }

    } else if (overlayCache.type === 'd') {
      // non-dz2 d overlays: keep size, color and orientation; push lobes outward along their axis
      const lobes = overlayCache.data.lobes || [];
      for (let li=0; li<lobes.length; li++) {
        const L = lobes[li];
        const axialLen = Math.max(4, L.t95);
        const radial = Math.max(0.01, L.r95);
        // Compute an axial offset proportional to the lobe axial extent.
        // Reduced multiplier so lobes sit slightly closer to nucleus than before.
        const axialOffset = axialLen * D_OVERLAY_AXIAL_PUSH_MULT;
        push(); noLights(); drawLobeEllipsoid(L.axisUnit, axialLen, radial, DZ2_OVERLAY_COLOR, DZ2_OVERLAY_ALPHA, axialOffset); pop();
      }
    }

    pop();
    try { hint(ENABLE_DEPTH_TEST); } catch (e) {}
  }

  drawAxisLabelSprite(axisLen);
  pop();

  if (DEBUG_LABEL && lastLabelScreenPositions) {
    push(); resetMatrix(); noStroke(); fill(255,0,0);
    if (lastLabelScreenPositions.pX) ellipse(lastLabelScreenPositions.pX.x, lastLabelScreenPositions.pX.y,6,6);
    if (lastLabelScreenPositions.pY) ellipse(lastLabelScreenPositions.pY.x, lastLabelScreenPositions.pY.y,6,6);
    if (lastLabelScreenPositions.pZ) ellipse(lastLabelScreenPositions.pZ.x, lastLabelScreenPositions.pZ.y,6,6);
    if (lastLabelScreenPositions.origin) ellipse(lastLabelScreenPositions.origin.x, lastLabelScreenPositions.origin.y,4,4);
    pop();
  }

  if (sampling) {
    if (progressDiv) {
      progressDiv.show();
      progressDiv.html(`Sampling: ${sampleCount} / ${sampleTarget} (${nf((sampleCount/max(1,sampleTarget))*100,1,1)}%)`);
    }
  } else {
    if (progressDiv) progressDiv.hide();
  }
}

/* ---------- axis label sprite ---------- */
function drawAxisLabelSprite(axisLen) {
  const worldX = createVector(axisLen,0,0);
  const worldY = createVector(0,-axisLen,0);
  const worldZ = createVector(0,0,axisLen);

  lastLabelScreenPositions = {
    pX: worldToScreen(worldX.x, worldX.y, worldX.z),
    pY: worldToScreen(worldY.x, worldY.y, worldY.z),
    pZ: worldToScreen(worldZ.x, worldZ.y, worldZ.z),
    origin: worldToScreen(0,0,0) || {x: width*0.5, y: height*0.5}
  };

  const labelPixelWidth = 72;
  const labelPixelHeight = 40;
  const invScale = 1.0 / max(0.0001, camZoom);

  noLights();
  try { hint(DISABLE_DEPTH_TEST); } catch(e) {}

  push(); translate(worldX.x, worldX.y, worldX.z); rotateX(-rotX); rotateY(-rotY); scale(invScale); translate(12,-10,0); noStroke(); texture(lblXgfx); plane(labelPixelWidth,labelPixelHeight); pop();
  push(); translate(worldY.x, worldY.y, worldY.z); rotateX(-rotX); rotateY(-rotY); scale(invScale); translate(-10,-14,0); noStroke(); texture(lblYgfx); plane(labelPixelWidth,labelPixelHeight); pop();
  push(); translate(worldZ.x, worldZ.y, worldZ.z); rotateX(-rotX); rotateY(-rotY); scale(invScale); translate(12,-10,0); noStroke(); texture(lblZgfx); plane(labelPixelWidth,labelPixelHeight); pop();

  try { hint(ENABLE_DEPTH_TEST); } catch(e) {}
}

/* ---------- coordinate helpers ---------- */
function worldToScreen(x,y,z) {
  try {
    const sx = screenX(x,y,z);
    const sy = screenY(x,y,z);
    const convX = sx + width*0.5;
    const convY = sy + height*0.5;
    if (!isFinite(convX) || !isFinite(convY)) return null;
    return { x: convX, y: convY };
  } catch (e) { return null; }
}
function worldToCameraSpace(x, y, z) {
  let vx = x * camZoom;
  let vy = y * camZoom;
  let vz = z * camZoom;

  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  let rx = cy * vx + sy * vz;
  let ry = vy;
  let rz = -sy * vx + cy * vz;

  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const rrx = rx;
  const rry = cx * ry - sx * rz;
  const rrz = sx * ry + cx * rz;

  const dist = Math.sqrt(rrx*rrx + rry*rry + rrz*rrz) || 1.0;
  let facing = (-rrz) / dist;
  if (!isFinite(facing)) facing = 0;
  facing = constrain(facing, 0, 1);

  return { x: rrx, y: rry, z: rrz, dist: dist, facing: facing };
}
function worldRadiusForScreenPixels(x, y, z, desiredPixels) {
  const pCenter = worldToScreen(x, y, z);
  const pOffset = worldToScreen(x + 1.0, y, z);
  if (!pCenter || !pOffset) {
    return max(0.05, (desiredPixels * 0.01) / max(0.0001, camZoom));
  }
  const pixelPerUnit = dist(pCenter.x, pCenter.y, pOffset.x, pOffset.y);
  if (pixelPerUnit <= 1e-6) return max(0.05, desiredPixels * 0.01 / max(0.0001, camZoom));
  const worldRadius = desiredPixels / pixelPerUnit;
  return constrain(worldRadius, 0.02, 200);
}

/* ---------- orbit creation & sampling ---------- */
function createOrbitalFromUI() {
  if (!ui.nInput || !ui.lInput || !ui.mInput || !ui.numElectronsInput || !ui.electronSizeInput) {
    console.warn('UI inputs missing');
    return;
  }

  let n = parseInt(ui.nInput.value(), 10);
  let l = parseInt(ui.lInput.value(), 10);
  let m = parseInt(ui.mInput.value(), 10);
  let electronSize = parseFloat(ui.electronSizeInput.value());
  let numElectrons = parseInt(ui.numElectronsInput.value(), 10);

  if (isNaN(n) || n < 1) { n = 1; ui.nInput.value(n); }
  if (isNaN(l) || l < 0) { l = 0; ui.lInput.value(l); }
  if (isNaN(m)) { m = 0; ui.mInput.value(m); }
  if (isNaN(electronSize) || electronSize <= 0) { electronSize = 1.0; ui.electronSizeInput.value(electronSize); }
  if (isNaN(numElectrons) || numElectrons < 0) { numElectrons = 0; ui.numElectronsInput.value(numElectrons); }

  // enforce maximum and update label
  if (numElectrons > MAX_ELECTRONS) {
    numElectrons = MAX_ELECTRONS;
    try { ui.numElectronsInput.value(MAX_ELECTRONS); } catch (e) {}
    // update max label if available
    try {
      const span = select('#numElectronsMaxLabel');
      if (span) span.html('max');
    } catch (e) {}
  } else {
    try {
      const span = select('#numElectronsMaxLabel');
      if (span) span.html('');
    } catch (e) {}
  }

  if (l >= n) return;
  if (Math.abs(m) > l) return;

  const uiHash = `${n}|${l}|${m}|${electronSize}|${numElectrons}`;
  if (uiHash === lastUIHash) {
    // no change; do not resample or refit
    return;
  }
  lastUIHash = uiHash;

  if (numElectrons === 0) {
    // clear samples but don't touch toggles
    positions = null;
    sizes = null;
    sampleCount = 0;
    sampleTarget = 0;
    sampling = false;
    overlayCache = null;
    return;
  }

  currentSamplingId++;
  const mySamplingId = currentSamplingId;

  overlayCache = null;

  positions = new Float32Array(numElectrons * 3);
  sizes = new Float32Array(numElectrons);
  sampleCount = 0;
  sampleTarget = numElectrons;
  sampling = true;

  const estAxis = estimateAxisLenFromQuantum(n, l);
  fitViewToAxisLen(estAxis, false, false);

  setTimeout(() => {
    sampleOrbitalChunked(n, l, m, numElectrons, electronSize, mySamplingId, () => {
      if (mySamplingId !== currentSamplingId) return;
      sampling = false;

      const applyNearDoubling = (l === 2 && m === 0);
      const nearThresholdForCall = applyNearDoubling ? NEAR_THRESHOLD_ABS : null;
      const nearEqThresholdForCall = applyNearDoubling ? NEAR_THRESHOLD_EQ_ABS : null;
      pushElectronsOutward(GLOBAL_RADIAL_PUSH, EQ_RADIAL_PUSH, applyNearDoubling, NEAR_NUCLEAR_PUSH_MULT, nearThresholdForCall, nearEqThresholdForCall);

      fitViewToPoints(false, true);
      if (overlayEnabled) {
        try { computeOverlay(); } catch (err) { console.warn('computeOverlay error', err); }
      }
    });
  }, 10);
}

function sampleOrbitalChunked(n, l, m, numSamples, electronSize, samplingId, onDone) {
  if (!isFinite(numSamples) || numSamples <= 0) {
    if (onDone) try { onDone(); } catch (e) { console.warn('onDone error', e); }
    return;
  }

  // Use Gamma-like shape tuned to r^{2l+2} behaviour -> shape = 2*l + 3
  const k = Math.max(1, 2 * l + 3);
  const thetaScale = (n * a0) / 2.0;
  const radialScale = radialLScale(l) * ELECTRON_DISTANCE_MULTIPLIER;
  const maxAngular = estimateMaxAngular(l, m, 500) * 1.2;

  const minR = NUCLEUS_RADIUS + ELECTRON_MIN_GAP;

  function chunk() {
    if (samplingId !== currentSamplingId) return;

    const stopIndex = Math.min(numSamples, sampleCount + CHUNK_SAMPLES);
    let attemptsThisChunk = 0;
    while (sampleCount < stopIndex && attemptsThisChunk < ATTEMPTS_PER_CHUNK) {
      if (samplingId !== currentSamplingId) return;

      attemptsThisChunk++;
      let sumExp = 0;
      for (let i=0;i<k;i++){
        let u = random();
        if (u <= 1e-12) u = 1e-12;
        sumExp += -Math.log(u);
      }
      let r = thetaScale * sumExp * radialScale;

      if (r < minR) continue;

      let accepted = false;
      let thetaS = 0, phiS = 0;
      for (let aTry = 0; aTry < 20; aTry++) {
        const cosT = random(-1,1);
        thetaS = acos(cosT);
        phiS = random(0, TWO_PI);
        const ang = angularProb(thetaS, phiS, l, m);
        if (random() < ang / maxAngular) { accepted = true; break; }
      }
      if (!accepted) continue;

      const x = r * sin(thetaS) * cos(phiS);
      const y = r * sin(thetaS) * sin(phiS);
      const z = r * cos(thetaS);
      const idx = sampleCount * 3;
      positions[idx] = x;
      positions[idx+1] = y;
      positions[idx+2] = z;
      sizes[sampleCount] = electronSize;
      sampleCount++;
    }

    if (sampleCount < numSamples) {
      if (samplingId !== currentSamplingId) return;
      if (attemptsThisChunk >= ATTEMPTS_PER_CHUNK) setTimeout(chunk, 10);
      else setTimeout(chunk, 0);
    } else {
      if (sampleCount < numSamples) {
        const rMax = Math.max(1, n * n * a0 * 1.8);
        for (let i = sampleCount; i < numSamples; i++) {
          let rr = rMax * pow(random(), 1.0 / 3.0) * radialScale;
          if (rr < minR) rr = minR + (rMax - minR) * pow(random(), 1.0/3.0);
          const theta2 = acos(random(-1,1));
          const phi2 = random(0, TWO_PI);
          const idx = i*3;
          positions[idx] = rr * sin(theta2) * cos(phi2);
          positions[idx+1] = rr * sin(theta2) * sin(phi2);
          positions[idx+2] = rr * cos(theta2);
          sizes[i] = electronSize;
        }
        sampleCount = numSamples;
      }
      if (onDone) {
        try { onDone(); } catch (e) { console.warn('onDone error', e); }
      }
    }
  }
  chunk();
}

/* ---------- remaining helpers ---------- */
function estimateMaxAngular(l, m, trialCount = 400) {
  let maxVal = 1e-20;
  for (let i=0;i<trialCount;i++){
    const cosT = random(-1,1);
    const theta = acos(cosT);
    const phi = random(0, TWO_PI);
    const v = angularProb(theta, phi, l, m);
    if (v > maxVal) maxVal = v;
  }
  return maxVal;
}
function angularProb(theta, phi, l, m) {
  const x = cos(theta);
  const mm = abs(m);
  const Plm = associatedLegendre(l, mm, x);
  let ang = Plm;
  if (m > 0) ang *= cos(m * phi);
  else if (m < 0) ang *= sin(mm * phi);
  return ang * ang + 1e-30;
}
function associatedLegendre(l, m, x) {
  if (m > l) return 0;
  let pmm = 1.0;
  if (m > 0) {
    let somx2 = sqrt(max(0, 1 - x * x));
    let fact = 1.0;
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2;
      fact += 2.0;
    }
  }
  if (l === m) return pmm;
  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;
  let plmPrev = pmm;
  let plm = pmmp1;
  for (let ll = m + 2; ll <= l; ll++) {
    let plnew = ((2 * ll - 1) * x * plm - (ll + m - 1) * plmPrev) / (ll - m);
    plmPrev = plm;
    plm = plnew;
  }
  return plm;
}

function computeAxisLength90() {
  if (!positions || sampleCount === 0) return 180;
  const n = sampleCount;
  const sampleCountMax = min(n, 50000);
  const step = Math.max(1, Math.floor(n / sampleCountMax));
  const arr = [];
  for (let i = 0; i < n; i += step) {
    const idx = i * 3;
    const r = sqrt(positions[idx] * positions[idx] + positions[idx+1] * positions[idx+1] + positions[idx+2] * positions[idx+2]);
    arr.push(r);
  }
  arr.sort((a,b)=>a-b);
  const idx = Math.max(0, Math.floor(0.9 * arr.length) - 1);
  let r90 = arr[idx] || 0;
  r90 = max(r90, NUCLEUS_RADIUS);
  return max(r90 * 1.12, 120);
}
function computeAxisMax() {
  if (!positions || sampleCount === 0) return 180;
  const n = sampleCount;
  const sampleCountMax = min(n, 100000);
  const step = Math.max(1, Math.floor(n / sampleCountMax));
  let maxR = 0;
  for (let i = 0; i < n; i += step) {
    const idx = i * 3;
    const r = sqrt(positions[idx] * positions[idx] + positions[idx+1] * positions[idx+1] + positions[idx+2] * positions[idx+2]);
    if (r > maxR) maxR = r;
  }
  maxR = max(maxR, NUCLEUS_RADIUS);
  return max(maxR * 1.02, 120);
}
function drawAxes(length) {
  strokeWeight(1);
  push(); stroke(200,80,80); line(-length,0,0,length,0,0); pop();
  push(); stroke(80,200,120); line(0,-length,0,0,length,0); pop();
  push(); stroke(100,140,240); line(0,0,-length,0,0,length); pop();
}
function fitViewToAxisLen(axisLen, immediate = false, allowZoomIn = true) {
  if (!axisLen || axisLen <= 0) return;
  const halfScreen = Math.min(windowWidth, windowHeight) * 0.5;
  const targetZoom = constrain((halfScreen * VIEW_MARGIN) / axisLen, 0.01, 40.0); // expanded zoom range
  let newTarget = targetZoom;
  if (!allowZoomIn && newTarget > camZoomTarget) newTarget = camZoomTarget;
  if (immediate) { camZoom = newTarget; camZoomTarget = newTarget; }
  else camZoomTarget = newTarget;
}
function fitViewToPoints(immediate = false, allowZoomIn = true) {
  const axisLen = computeAxisMax();
  if (axisLen > 0) fitViewToAxisLen(axisLen, immediate, allowZoomIn);
}
function radialLScale(l) {
  if (!l || l <= 0) return 1.0;
  const factorPerL = 0.06;
  return Math.max(0.6, 1.0 - factorPerL * l);
}
function estimateAxisLenFromQuantum(n, l) {
  const k = 2 * l + 1;
  const thetaScale = (n * a0) / 2.0;
  const radialScale = radialLScale(l) * ELECTRON_DISTANCE_MULTIPLIER;
  const factorCover = 3.0;
  const estR = thetaScale * k * factorCover * radialScale;
  return max(estR * 1.12, 120);
}

/* ---------- input / interaction ---------- */
function _eventIsOnCanvas(event) {
  if (!cnv || !cnv.elt || !event) return false;
  let el = event.target || null;
  if (!el) return false;
  if (el === cnv.elt) return true;
  if (cnv.elt.contains && cnv.elt.contains(el)) return true;
  return false;
}
function mousePressed(event) {
  const isLeft = (typeof event === 'object' && event !== null && 'button' in event) ? (event.button === 0) : (mouseButton === LEFT);
  if (!isLeft) return;
  if (!_eventIsOnCanvas(event)) return;
  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    isDragging = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
}
function mouseReleased() { isDragging = false; }
function mouseDragged(event) {
  if (isDragging) {
    const dx = mouseX - lastMouseX;
    const dy = mouseY - lastMouseY;
    rotY += dx * 0.01;
    rotX += dy * 0.01;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
  return false;
}
function mouseWheel(event) {
  camZoom *= event.delta > 0 ? 0.95 : 1.05; // slightly faster / more responsive
  camZoom = constrain(camZoom, 0.01, 40.0); // expanded limits
  camZoomTarget = camZoom;
  return false;
}
function normalizeVec3(v) {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]) || 1.0;
  return [v[0]/len, v[1]/len, v[2]/len];
}