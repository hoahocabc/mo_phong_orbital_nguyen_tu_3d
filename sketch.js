'use strict';

/* ============================================
   ORBITAL 3D SIMULATOR - OPTIMIZED CORE
   Performance-optimized quantum visualization
   ============================================ */

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================

const FONT_FALLBACK_NAME = 'JetBrains Mono, Inter, Arial, sans-serif';

let globalFlattenVec = null;

// UI State
let ui = {};
let positions = null;
let sizes = null;
let sampleCount = 0;
let sampleTarget = 0;
let sampling = false;

let innerOrbitals = [];

// Camera & Rotation (Optimized)
let autoRotate = true;
window.autoRotate = !!autoRotate;

let rotX = -0.35;
let rotY = 0;
let rotYTarget = rotY;
let rotYVelocity = 0; // ✅ NEW: Smooth rotation velocity
const ROTATION_DAMPING = 0.92; // ✅ NEW: Damping factor
const ROTATION_SPEED = 0.0008; // ✅ NEW: Base rotation speed

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let camZoom = 1.0;
let camZoomTarget = camZoom;

let cnv;

// Label Graphics
let lblXgfx, lblYgfx, lblZgfx;
let lblTexW = 160, lblTexH = 64;
let lastLabelScreenPositions = null;

// Physics Constants
const a0 = 40; // Bohr radius scale
let sphereResolution = 64; // ✅ REDUCED: 96 → 64 for performance

// WebGL Limits (Optimized)
const MAX_SPHERE_DETAIL = 2048; // ✅ REDUCED: 4096 → 2048
const MAX_TORUS_U = 2048; // ✅ REDUCED: 4096 → 2048
const MAX_TORUS_V = 1024; // ✅ REDUCED: 2048 → 1024

const APP_SAFE_MAX_TORUS_U = 768; // ✅ REDUCED: 1024 → 768
const APP_SAFE_MAX_TORUS_V = 384; // ✅ REDUCED: 512 → 384
const MAX_TORUS_VERTEX_COUNT = 200000; // ✅ REDUCED: 300k → 200k
const APP_SPHERE_DETAIL_CAP = 512; // ✅ REDUCED: 1024 → 512

const SAFE_MAX_TORUS_U = APP_SAFE_MAX_TORUS_U;
const SAFE_MAX_TORUS_V = APP_SAFE_MAX_TORUS_V;

// Rendering Thresholds
const SPHERE_RENDER_THRESHOLD = 2000;
const CHUNK_SAMPLES = 1500; // ✅ INCREASED: 1000 → 1500 (faster sampling)
const ATTEMPTS_PER_CHUNK = 25000; // ✅ INCREASED: 20k → 25k
const VIEW_MARGIN = 0.92;

const DEBUG_LABEL = false;

let progressDiv = null;
let statusDiv = null;

// Lighting Colors
let centerLightColor = [255, 220, 160];
let backLightColor = [180, 200, 255];
let backPointFill = true;

// Aufbau Order (Electron filling)
const AUFBAU_ORDER = [
  [1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0],
  [4, 2], [5, 1], [6, 0], [4, 3], [5, 2], [6, 1], [7, 0], [5, 3], [6, 2], [7, 1],
];

// Subshell Color Map
const SUBSHELL_COLORS = {
  '1,0': [255, 165, 60], '2,0': [80, 255, 80], '2,1': [80, 120, 255],
  '3,0': [255, 255, 80], '3,1': [255, 80, 255], '4,0': [80, 255, 255],
  '3,2': [255, 100, 100], '4,1': [180, 80, 255], '5,0': [255, 160, 160],
  '4,2': [160, 255, 160], '5,1': [160, 160, 255], '6,0': [255, 255, 160],
  '4,3': [255, 160, 255], '5,2': [160, 255, 255], '6,1': [255, 200, 160],
  '7,0': [200, 255, 160], '5,3': [200, 160, 255], '6,2': [255, 220, 180],
  '7,1': [180, 255, 220],
};

// Vibrant Color Generator (Golden Ratio)
function generateVibrantColors(count) {
  const colors = [];
  const goldenRatioConjugate = 0.618033988749895;
  let h = Math.random();
  
  for (let i = 0; i < count; i++) {
    h = (h + goldenRatioConjugate) % 1;
    const hue = h * 360;
    const saturation = 85 + Math.random() * 15;
    const lightness = 50 + Math.random() * 10;
    
    const c = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness / 100 - c / 2;
    
    let r, g, b;
    if (hue < 60) { [r, g, b] = [c, x, 0]; }
    else if (hue < 120) { [r, g, b] = [x, c, 0]; }
    else if (hue < 180) { [r, g, b] = [0, c, x]; }
    else if (hue < 240) { [r, g, b] = [0, x, c]; }
    else if (hue < 300) { [r, g, b] = [x, 0, c]; }
    else { [r, g, b] = [c, 0, x]; }
    
    colors.push([
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ]);
  }
  return colors;
}

const ORBITAL_COLORS = generateVibrantColors(30);

// Nuclear & Electron Constants
const NUCLEUS_RADIUS = 18.0;
const ELECTRON_MIN_GAP = 6.0;
const ELECTRON_DISTANCE_MULTIPLIER = 1.6;

// Lighting Parameters
const LIGHT_FALLOFF = 0.018;
const MIN_BRIGHTNESS = 0.10;
const MAX_BRIGHTNESS = 1.0;
const MIN_FACE_FACTOR = 0.08;
const FACE_EXP = 1.8;
const Z_FALLOFF_RATE = 0.005;
const MIN_Z_BRIGHTNESS = 0.05;

// Shaders
let nucleusShader = null;
let nucleus = null;
let _nucleusVertSrc = null;
let _nucleusFragSrc = null;

let overlayShader = null;
let _overlayVertSrc = null;
let _overlayFragSrc = null;

// Overlay State
let overlayEnabled = false;
let overlayBtn = null;
let overlayCache = null;

let electronBtn = null;
let showElectrons = true;

// Update Timer
let orbitalUpdateTimer = null;
const ORBITAL_UPDATE_DELAY = 150;

let currentSamplingId = 0;
let lastUIHash = null;

// Display Buffers (Smooth Transitions)
let positionsDisplay = null;
let displayCount = 0;
let alphasDisplay = null;

const SMOOTH_TAU_MS = 180; // ✅ REDUCED: 220 → 180 (faster transitions)
const DISPLAY_UPDATES_PER_FRAME = 3000; // ✅ INCREASED: 2000 → 3000
let displayUpdateCursor = 0;

let instantTransition = true;
try { window.instantTransition = instantTransition; } catch (e) {}

// Overlay Scale Constants
const S_OVERLAY_SCALE = 0.98;
const P_OVERLAY_SCALE = 0.98;

// D-orbital Dz² Parameters (Optimized)
const DZ_LOBE_SCALE = 0.78;
const LOBE_Z_SHRINK = 1.00;
const LOBE_AXIAL_EXTEND = 1.42;
const LOBE_Z_OFFSET_MULT = 0.18;
const P_PX_AXIAL_BOOST = 1.15;
const P_PX_RADIAL_BOOST = 1.10;
const LOBE_RADIAL_PERCENTILE_MULT = 0.54;
const LOBE_RADIAL_EXTRA_GROW = 0.84;

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
const RING_DETAIL_U = 180; // ✅ REDUCED: 240 → 180
const RING_DETAIL_V = 48; // ✅ REDUCED: 64 → 48

const DZ2_RING_SHRINK_FACTOR = 0.92;

// Other D-orbitals
const D_RADIAL_SHRINK_FACTOR = 0.50;
const D_RADIAL_EXPAND_FACTOR = 1.15;
let D_DX2Y2_RADIAL_CANON = null;

const OVERLAY_SCALE = 0.95;
const D_OVERLAY_AXIAL_PUSH_MULT = 0.12;
const DZ2_OVERLAY_AXIAL_PULL_MULT = 0.85;

const MAX_ELECTRONS = 30000;
const MAX_INNER_ELECTRONS = 8000;

const DZ2_AXIAL_OFFSET_SCALE = 0.75;

const OVERLAY_PERCENTILE = 0.95;
const OVERLAY_RING_INNER_P = 0.10;
const OVERLAY_RING_OUTER_P = 0.90;

const OVERLAY_SPHERE_DETAIL = 48; // ✅ REDUCED: 64 → 48

let cachedSphereGeometry = null;
let cachedEllipsoidGeometry = null;

// ============================================
// HELPER FUNCTIONS
// ============================================

function getSubshellColor(n, l) {
  const key = `${n},${l}`;
  if (SUBSHELL_COLORS[key]) return SUBSHELL_COLORS[key];
  const hash = (n * 100) + (l * 10);
  const colorIndex = hash % ORBITAL_COLORS.length;
  return ORBITAL_COLORS[colorIndex];
}

function getAllInnerOrbitalsAufbau(targetN, targetL, targetM) {
  const orbitals = [];
  let targetIndex = -1;
  
  for (let i = 0; i < AUFBAU_ORDER.length; i++) {
    const [n, l] = AUFBAU_ORDER[i];
    if (n === targetN && l === targetL) {
      targetIndex = i;
      break;
    }
  }
  
  if (targetIndex === -1) {
    console.warn(`Orbital ${targetN},${targetL} not in Aufbau order, using simple fill`);
    return getAllInnerOrbitalsSimple(targetN, targetL, targetM);
  }
  
  for (let i = 0; i <= targetIndex; i++) {
    const [n, l] = AUFBAU_ORDER[i];
    if (n > targetN) continue;
    
    if (i < targetIndex) {
      for (let m = -l; m <= l; m++) {
        orbitals.push({ n, l, m });
      }
    } else {
      orbitals.push({ n: targetN, l: targetL, m: targetM });
    }
  }
  
  return orbitals;
}

function getAllInnerOrbitalsSimple(targetN, targetL, targetM) {
  const orbitals = [];
  
  for (let n = 1; n < targetN; n++) {
    for (let l = 0; l < n; l++) {
      for (let m = -l; m <= l; m++) {
        orbitals.push({ n, l, m });
      }
    }
  }
  
  for (let l = 0; l < targetL; l++) {
    for (let m = -l; m <= l; m++) {
      orbitals.push({ n: targetN, l, m });
    }
  }
  
  orbitals.push({ n: targetN, l: targetL, m: targetM });
  return orbitals;
}

function getOrbitalLabel(n, l, m) {
  const lLabels = ['s', 'p', 'd', 'f', 'g', 'h', 'i', 'j'];
  const lLabel = l < lLabels.length ? lLabels[l] : `l${l}`;
  
  if (l === 0) return `${n}${lLabel}`;
  
  const mLabels = {
    1: { '-1': 'y', '0': 'z', '1': 'x' },
    2: { '-2': 'xy', '-1': 'yz', '0': 'z²', '1': 'xz', '2': 'x²-y²' },
    3: {
      '-3': 'y(z²-x²)', '-2': 'xyz', '-1': 'yz²',
      '0': 'z³', '1': 'xz²', '2': 'z(x²-y²)', '3': 'x(x²-3y²)'
    }
  };
  
  if (mLabels[l] && mLabels[l][m.toString()]) {
    return `${n}${lLabel}_${mLabels[l][m.toString()]}`;
  }
  
  return `${n}${lLabel}(m=${m})`;
}

// Vector Math
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function makePerpBasis(axisUnit) {
  let arbitrary = Math.abs(axisUnit[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let v1 = cross(axisUnit, arbitrary);
  let v1len = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]) || 1.0;
  v1 = [v1[0] / v1len, v1[1] / v1len, v1[2] / v1len];
  
  let v2 = cross(axisUnit, v1);
  let v2len = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]) || 1.0;
  v2 = [v2[0] / v2len, v2[1] / v2len, v2[2] / v2len];
  
  return { v1, v2 };
}

function pca2D(proj1Arr, proj2Arr) {
  const n = proj1Arr.length;
  if (n === 0) return { angle: 0, var1: 0, var2: 0 };
  
  let m1 = 0, m2 = 0;
  for (let i = 0; i < n; i++) {
    m1 += proj1Arr[i];
    m2 += proj2Arr[i];
  }
  m1 /= n;
  m2 /= n;
  
  let c11 = 0, c22 = 0, c12 = 0;
  for (let i = 0; i < n; i++) {
    const d1 = proj1Arr[i] - m1;
    const d2 = proj2Arr[i] - m2;
    c11 += d1 * d1;
    c22 += d2 * d2;
    c12 += d1 * d2;
  }
  c11 /= n;
  c22 /= n;
  c12 /= n;
  
  const angle = 0.5 * Math.atan2(2 * c12, c11 - c22);
  const t = c11 + c22;
  const d = Math.sqrt(Math.max(0, (c11 - c22) * (c11 - c22) + 4 * c12 * c12));
  const lambda1 = Math.max(0, 0.5 * (t + d));
  const lambda2 = Math.max(0, 0.5 * (t - d));
  
  return { angle, var1: lambda1, var2: lambda2 };
}

// WebGL Helpers
function setWebGLDepthMask(val) {
  try {
    const gl = drawingContext;
    if (gl && typeof gl.depthMask === 'function') gl.depthMask(!!val);
  } catch (e) {}
}

function setWebGLDepthFunc(funcName) {
  try {
    const gl = drawingContext;
    if (gl && typeof gl.depthFunc === 'function') {
      const map = {
        'LESS': gl.LESS,
        'LEQUAL': gl.LEQUAL,
        'GREATER': gl.GREATER,
        'ALWAYS': gl.ALWAYS,
        'NOTEQUAL': gl.NOTEQUAL
      };
      const v = map[funcName] || gl.LESS;
      gl.depthFunc(v);
    }
  } catch (e) {}
}

function safeCall(cb, context = {}) {
  if (typeof cb !== 'function') return;
  try {
    cb();
  } catch (e) {
    let info = {};
    try {
      info = {
        message: e && e.message ? e.message : String(e),
        name: e && e.name ? e.name : typeof e,
        stack: e && e.stack ? e.stack : undefined,
        context: context
      };
    } catch (ee) {
      info = { message: String(e), context: context };
    }
    console.error('safeCall: callback threw', info);
  }
}

// Global Error Handler
try {
  window.onerror = function(message, source, lineno, colno, error) {
    try {
      console.error('Global error caught', {
        message, source, lineno, colno,
        errorName: error && error.name,
        errorMessage: error && error.message,
        stack: error && error.stack
      });
    } catch (e) {
      console.error('Global error (fallback)', message, source, lineno, colno, error);
    }
  };
} catch (e) {}

// ============================================
// SHADER PRELOAD
// ============================================

function preload() {
  // Nucleus Impostor Shader
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
  
  // Overlay Shader
  _overlayVertSrc = `
  precision highp float;
  attribute vec3 aPosition;
  attribute vec3 aNormal;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  uniform mat4 uModelViewMatrix;
  uniform mat4 uProjectionMatrix;
  uniform mat3 uNormalMatrix;
  
  void main() {
    vec4 positionVec4 = vec4(aPosition, 1.0);
    gl_Position = uProjectionMatrix * uModelViewMatrix * positionVec4;
    vNormal = normalize(uNormalMatrix * aNormal);
    vWorldNormal = aNormal;
    vPosition = (uModelViewMatrix * positionVec4).xyz;
  }
  `;
  
  _overlayFragSrc = `
  #ifdef GL_ES
  precision highp float;
  #endif
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldNormal;
  uniform vec3 uLightDirection;
  uniform vec3 uBaseColor;
  uniform float uOpacity;
  uniform float uAmbient;
  uniform float uDiffuse;
  uniform float uSpecular;
  uniform float uShininess;
  uniform float uRimPower;
  uniform float uRimIntensity;
  
  void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uLightDirection);
    vec3 viewDir = normalize(-vPosition);
    vec3 halfDir = normalize(lightDir + viewDir);
    
    float ambient = uAmbient;
    float diffuse = max(dot(normal, lightDir), 0.0) * uDiffuse;
    float specular = pow(max(dot(normal, halfDir), 0.0), uShininess) * uSpecular;
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), uRimPower) * uRimIntensity;
    
    float ao = 0.5 + 0.5 * dot(normal, vec3(0.0, 1.0, 0.0));
    
    vec3 lighting = vec3(ambient * ao + diffuse + specular + rim);
    vec3 color = uBaseColor * lighting;
    
    float alpha = uOpacity * smoothstep(0.0, 0.1, length(vWorldNormal));
    
    gl_FragColor = vec4(color, alpha);
  }
  `;
}

// ============================================
// NUCLEUS CLASS
// ============================================

class Nucleus {
  constructor(radius = 18.0, opts = {}) {
    this.radius = radius;
    this.baseDetail = opts.baseDetail || 64; // ✅ REDUCED: 96 → 64
    this.useImpostor = opts.useImpostor !== undefined ? opts.useImpostor : true;
    this.aaFactor = opts.aaFactor || 1.5;
    this._shader = opts.shader || null;
  }

  render(rotX, rotY, camZoom, worldToScreenFn, normalizeFn = null, backLightCol = [180, 200, 255]) {
    let pixelRadius = 0;
    try {
      const c = worldToScreenFn(0, 0, 0);
      const e = worldToScreenFn(this.radius, 0, 0);
      if (c && e) pixelRadius = dist(c.x, c.y, e.x, e.y);
    } catch (e) {
      pixelRadius = 0;
    }

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
      this._shader.setUniform('uBackLight', [
        backLightCol[0] * 0.002,
        backLightCol[1] * 0.002,
        backLightCol[2] * 0.002
      ]);
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

    // Fallback: Geometric sphere
    push();
    noStroke();
    try {
      if (typeof sphereDetail === 'function') {
        const effectivePixelRadius = (isFinite(pixelRadius) && pixelRadius > 0) ? pixelRadius : 24;
        const desiredDetail = constrain(Math.ceil(effectivePixelRadius * 2.5), this.baseDetail, 256); // ✅ REDUCED multiplier
        sphereDetail(desiredDetail);
      }
    } catch (e) {}
    
    ambientMaterial(255);
    specularMaterial(255);
    shininess(80);
    sphere(this.radius);
    
    try {
      if (typeof sphereDetail === 'function') sphereDetail(this.baseDetail);
    } catch (e) {}
    pop();
  }
}

// ============================================
// ORBITAL CLASS
// ============================================

class Orbital {
  constructor(n, l, m, electronCount = 0, electronSize = 1.0) {
    this.n = n;
    this.l = l;
    this.m = m;
    this.electronCount = electronCount;
    this.electronSize = electronSize;
    
    this.positions = null;
    this.sizes = null;
    this.sampleCount = 0;
    this.color = getSubshellColor(n, l);
    
    this.positionsDisplay = null;
    this.alphasDisplay = null;
    this.displayCount = 0;
    this.displayUpdateCursor = 0;
    
    this.distanceScale = this.calculateDistanceScale();
  }
  
  calculateDistanceScale() {
    return ELECTRON_DISTANCE_MULTIPLIER * (0.7 + 0.2 * this.n);
  }
  
  initDisplayBuffers(prevPositions, prevCount) {
    const pCount = prevCount || 0;
    const nCount = this.sampleCount || 0;
    const maxCount = Math.max(pCount, nCount);
    
    if (maxCount <= 0) {
      this.positionsDisplay = null;
      this.alphasDisplay = null;
      this.displayCount = 0;
      this.displayUpdateCursor = 0;
      return;
    }
    
    const newDisp = new Float32Array(maxCount * 3);
    const newAlphas = new Float32Array(maxCount);

    for (let i = 0; i < maxCount; i++) {
      if (i < pCount && prevPositions && prevPositions.length >= (i * 3 + 3)) {
        newDisp[i * 3] = prevPositions[i * 3];
        newDisp[i * 3 + 1] = prevPositions[i * 3 + 1];
        newDisp[i * 3 + 2] = prevPositions[i * 3 + 2];
        newAlphas[i] = 1.0;
      } else if (i < nCount && this.positions && this.positions.length >= (i * 3 + 3)) {
        newDisp[i * 3] = this.positions[i * 3];
        newDisp[i * 3 + 1] = this.positions[i * 3 + 1];
        newDisp[i * 3 + 2] = this.positions[i * 3 + 2];
        newAlphas[i] = 1.0;
      } else {
        const ang = (i * 97.3) % (Math.PI * 2);
        const rr = NUCLEUS_RADIUS + ELECTRON_MIN_GAP + (Math.random() * 6.0);
        newDisp[i * 3] = Math.cos(ang) * rr;
        newDisp[i * 3 + 1] = Math.sin(ang) * rr;
        newDisp[i * 3 + 2] = 0;
        newAlphas[i] = 0.0;
      }
    }
    
    this.positionsDisplay = newDisp;
    this.alphasDisplay = newAlphas;
    this.displayCount = maxCount;
    this.displayUpdateCursor = 0;
  }
  
  updateDisplayBuffers(dt) {
    if (!this.positions || this.sampleCount <= 0) return;
    
    if (!this.positionsDisplay || !this.alphasDisplay) {
      this.initDisplayBuffers(null, 0);
      return;
    }
    
    const alpha = 1 - Math.exp(-dt / SMOOTH_TAU_MS);
    
    const maxCount = Math.max(this.displayCount, this.sampleCount);
    if (this.positionsDisplay.length / 3 < maxCount) {
      const tmp = new Float32Array(maxCount * 3);
      tmp.set(this.positionsDisplay);
      for (let i = this.positionsDisplay.length / 3; i < maxCount; i++) {
        const ang = (i * 97.3) % (Math.PI * 2);
        const rr = NUCLEUS_RADIUS + ELECTRON_MIN_GAP + 2.0;
        tmp[i * 3] = Math.cos(ang) * rr;
        tmp[i * 3 + 1] = Math.sin(ang) * rr;
        tmp[i * 3 + 2] = 0;
      }
      this.positionsDisplay = tmp;
    }
    
    if (this.alphasDisplay.length < maxCount) {
      const tmpA = new Float32Array(maxCount);
      tmpA.set(this.alphasDisplay);
      for (let i = this.alphasDisplay.length; i < maxCount; i++) tmpA[i] = 0.0;
      this.alphasDisplay = tmpA;
    }
    
    this.displayCount = maxCount;

    const updates = Math.min(DISPLAY_UPDATES_PER_FRAME / Math.max(1, innerOrbitals.length), maxCount);
    let start = this.displayUpdateCursor;
    let end = Math.min(maxCount, start + updates);

    for (let i = start; i < end; i++) {
      const idx3 = i * 3;
      if (i < this.sampleCount && this.positions && this.positions.length >= idx3 + 3) {
        const tx = this.positions[idx3];
        const ty = this.positions[idx3 + 1];
        const tz = this.positions[idx3 + 2];
        
        this.positionsDisplay[idx3] += (tx - this.positionsDisplay[idx3]) * alpha;
        this.positionsDisplay[idx3 + 1] += (ty - this.positionsDisplay[idx3 + 1]) * alpha;
        this.positionsDisplay[idx3 + 2] += (tz - this.positionsDisplay[idx3 + 2]) * alpha;
        this.alphasDisplay[i] += (1.0 - this.alphasDisplay[i]) * alpha;
      } else {
        const ang = (i * 97.3) % (Math.PI * 2);
        const rr = NUCLEUS_RADIUS + ELECTRON_MIN_GAP + 2.0;
        const tx = Math.cos(ang) * rr;
        const ty = Math.sin(ang) * rr;
        const tz = 0;
        
        this.positionsDisplay[idx3] += (tx - this.positionsDisplay[idx3]) * (alpha * 0.5);
        this.positionsDisplay[idx3 + 1] += (ty - this.positionsDisplay[idx3 + 1]) * (alpha * 0.5);
        this.positionsDisplay[idx3 + 2] += (tz - this.positionsDisplay[idx3 + 2]) * (alpha * 0.5);
        this.alphasDisplay[i] += (0.0 - this.alphasDisplay[i]) * alpha;
      }
    }

    this.displayUpdateCursor = end >= maxCount ? 0 : end;
  }
  
  render(pointSize) {
    if (!this.positionsDisplay || this.displayCount <= 0) return;
    
    noLights();
    strokeWeight(pointSize);
    
    beginShape(POINTS);
    for (let i = 0; i < this.displayCount; i++) {
      const idx = i * 3;
      const alpha = (this.alphasDisplay && i < this.alphasDisplay.length) ? this.alphasDisplay[i] : 1.0;
      const alphaVal = Math.round(255 * constrain(alpha, 0, 1));
      
      stroke(this.color[0], this.color[1], this.color[2], alphaVal);
      fill(this.color[0], this.color[1], this.color[2], alphaVal);
      vertex(this.positionsDisplay[idx], this.positionsDisplay[idx + 1], this.positionsDisplay[idx + 2]);
    }
    endShape();
    
    strokeWeight(1);
  }
}
// ============================================
// SETUP & INITIALIZATION
// ============================================

function setup() {
  progressDiv = select('#progress');
  statusDiv = select('#status');

  // Create WEBGL canvas
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

  try {
    cnv.elt.setAttribute('aria-label', 'Orbital 3D Canvas');
  } catch (e) {}

  // ✅ OPTIMIZATION: Set pixel density based on device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const pixelDens = isMobile ? 1 : Math.min(2, window.devicePixelRatio || 1);
  pixelDensity(pixelDens);

  // Compile shaders
  try {
    if (_nucleusVertSrc && _nucleusFragSrc && typeof createShader === 'function') {
      nucleusShader = createShader(_nucleusVertSrc, _nucleusFragSrc);
      console.log('✅ Nucleus shader compiled');
    }
  } catch (e) {
    nucleusShader = null;
    console.warn('⚠️ Failed to create nucleus shader', e);
  }

  try {
    if (_overlayVertSrc && _overlayFragSrc && typeof createShader === 'function') {
      overlayShader = createShader(_overlayVertSrc, _overlayFragSrc);
      console.log('✅ Overlay shader compiled (optimized D-orbitals)');
    }
  } catch (e) {
    overlayShader = null;
    console.warn('⚠️ Failed to create overlay shader', e);
  }

  // Set font
  try {
    textFont(FONT_FALLBACK_NAME);
  } catch (e) {}

  smooth();
  createLabelGraphics();

  // Set sphere detail
  if (typeof sphereDetail === 'function') {
    try {
      sphereDetail(sphereResolution);
    } catch (e) {}
  }

  setupUI();

  // Create nucleus
  nucleus = new Nucleus(NUCLEUS_RADIUS, {
    shader: nucleusShader,
    baseDetail: 64,
    useImpostor: true,
    aaFactor: 1.5
  });

  camZoomTarget = camZoom;

  // Initial orbital creation
  if (select('#nInput')) scheduleOrbitalUpdate(50);

  // Mark as ready
  try {
    window.orbitalReady = true;
  } catch (e) {}

  // Toggle auto-rotate function
  window.toggleAutoRotate = function() {
    autoRotate = !autoRotate;
    try {
      window.autoRotate = autoRotate;
    } catch (e) {}
    rotYTarget = rotY;
    rotYVelocity = 0; // ✅ Reset velocity on manual toggle
    try {
      if (typeof window.updateToggleRotateText === 'function') {
        window.updateToggleRotateText();
      }
    } catch (e) {}
  };
  
  try {
    window.autoRotate = autoRotate;
  } catch (e) {}

  console.log('✅ Setup complete - Optimized for mobile & desktop');
}

// ============================================
// STATUS & PROGRESS HELPERS
// ============================================

function setStatus(text, append = false) {
  if (!statusDiv) return;
  if (!text) {
    try {
      statusDiv.style('display', 'none');
    } catch (e) {}
    return;
  }
  
  if (append) statusDiv.html(statusDiv.html() + "\n" + text);
  else statusDiv.html(text);
  
  try {
    statusDiv.style('display', 'block');
  } catch (e) {}
}

function setProgress(text) {
  if (!progressDiv) return;
  
  if (text) {
    progressDiv.html(text);
    try {
      progressDiv.style('display', 'block');
    } catch (e) {}
  } else {
    try {
      progressDiv.style('display', 'none');
    } catch (e) {}
  }
  
  try {
    if (typeof window.setLocalizedProgress === 'function') {
      window.setLocalizedProgress(!!text, text);
    }
  } catch (e) {}
}

// ============================================
// LABEL GRAPHICS
// ============================================

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
  const fontSize = 25;
  g.textSize(fontSize);
  g.noStroke();
  
  // Shadow
  g.fill(0, 160);
  g.text(label, g.width * 0.5 + 1.6, g.height * 0.5 + 1.6);
  
  // Main text
  g.fill(255, 255, 255);
  g.text(label, g.width * 0.5, g.height * 0.5);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (sampleCount > 0) fitViewToPoints(true);
}

// ============================================
// ORBITAL UPDATE SCHEDULER
// ============================================

function scheduleOrbitalUpdate(delay = ORBITAL_UPDATE_DELAY) {
  if (orbitalUpdateTimer) clearTimeout(orbitalUpdateTimer);
  orbitalUpdateTimer = setTimeout(() => {
    createOrbitalFromUI();
  }, delay);
}

window.scheduleOrbitalUpdate = scheduleOrbitalUpdate;

// ============================================
// UI SETUP
// ============================================

function setupUI() {
  ui.nInput = select('#nInput');
  ui.lInput = select('#lInput');
  ui.mInput = select('#mInput');
  ui.electronSizeInput = select('#electronSizeInput');
  ui.numElectronsInput = select('#numElectronsInput');
  ui.createBtn = select('#createBtn');
  ui.toggleRotateBtn = select('#toggleRotateBtn');
  ui.modeSelect = select('#modeSelect');

  overlayBtn = select('#toggleOverlayBtn');
  electronBtn = select('#toggleElectronsBtn');

  function updateNumElectronsMaxLabel(ne) {
    if (!ui.numElectronsInput || !ui.numElectronsInput.elt) return;
    
    let span = select('#numElectronsMaxLabel');
    if (!span) {
      try {
        span = createSpan('');
        span.id('numElectronsMaxLabel');
        span.style('margin-left', '6px');
        span.style('color', '#ff9800');
        span.style('font-size', '12px');
        span.style('font-weight', '700');
        
        const parent = ui.numElectronsInput.elt.parentNode;
        if (parent) {
          if (ui.numElectronsInput.elt.nextSibling) {
            parent.insertBefore(span.elt, ui.numElectronsInput.elt.nextSibling);
          } else {
            parent.appendChild(span.elt);
          }
        } else {
          document.body.appendChild(span.elt);
        }
      } catch (e) {
        return;
      }
    }
    
    try {
      if (typeof ne === 'number' && ne >= MAX_ELECTRONS) {
        span.html('MAX');
      } else {
        span.html('');
      }
    } catch (e) {}
  }

  function onNumChanged(ne) {
    if (typeof ne !== 'number') return;
    
    if (ne === 0) {
      positions = null;
      sizes = null;
      sampleCount = 0;
      sampleTarget = 0;
      sampling = false;
      overlayCache = null;
      positionsDisplay = null;
      displayCount = 0;
      alphasDisplay = null;
      innerOrbitals = [];
      updateNumElectronsMaxLabel(ne);
    } else {
      if (ne >= MAX_ELECTRONS) {
        try {
          if (ui.numElectronsInput) ui.numElectronsInput.value(MAX_ELECTRONS);
        } catch (e) {}
        updateNumElectronsMaxLabel(MAX_ELECTRONS);
      } else {
        updateNumElectronsMaxLabel(ne);
      }
    }
  }

  function inputChangedHandler() {
    // Validate n
    if (ui.nInput) {
      let n = parseInt(ui.nInput.value(), 10);
      if (isNaN(n) || n < 1) ui.nInput.value(1);
    }
    
    // Validate l
    if (ui.lInput && ui.nInput) {
      let l = parseInt(ui.lInput.value(), 10);
      let n = Math.max(1, parseInt(ui.nInput.value()) || 1);
      if (isNaN(l) || l < 0) ui.lInput.value(0);
      if (l > n - 1) ui.lInput.value(Math.max(0, n - 1));
    }
    
    // Validate m
    if (ui.mInput && ui.lInput) {
      let m = parseInt(ui.mInput.value(), 10);
      let l = Math.max(0, parseInt(ui.lInput.value()) || 0);
      if (isNaN(m) || Math.abs(m) > l) ui.mInput.value(0);
    }
    
    // Validate electron count
    if (ui.numElectronsInput) {
      let ne = parseInt(ui.numElectronsInput.value(), 10);
      if (isNaN(ne) || ne < 0) {
        ne = 0;
        ui.numElectronsInput.value(ne);
      }
      if (ne > MAX_ELECTRONS) {
        ne = MAX_ELECTRONS;
        ui.numElectronsInput.value(ne);
      }
      onNumChanged(ne);
    }
    
    try {
      if (typeof window.refreshOrbitalLabel === 'function') {
        window.refreshOrbitalLabel();
      }
    } catch (e) {}
    
    overlayCache = null;
    scheduleOrbitalUpdate();
  }

  // Attach input listeners
  const inputs = [ui.nInput, ui.lInput, ui.mInput, ui.numElectronsInput, ui.electronSizeInput];
  inputs.forEach(el => {
    if (!el) return;
    
    try {
      try {
        el.input(inputChangedHandler);
      } catch (e) {}
      
      try {
        if (el.elt && el.elt.addEventListener) {
          el.elt.addEventListener('input', inputChangedHandler, { passive: true });
          el.elt.addEventListener('keyup', (ev) => {
            if ((ev.key && ev.key.length === 1) || ev.key === 'Backspace' || ev.key === 'Delete') {
              inputChangedHandler();
            }
          });
        }
      } catch (e) {}
    } catch (e) {
      try {
        el.elt && el.elt.addEventListener('input', inputChangedHandler);
      } catch (e2) {}
      
      try {
        el.elt && el.elt.addEventListener('keyup', (ev) => {
          if ((ev.key && ev.key.length === 1) || ev.key === 'Backspace' || ev.key === 'Delete') {
            inputChangedHandler();
          }
        });
      } catch (e2) {}
    }
  });

  // Create Overlay Button
  if (!overlayBtn) {
    overlayBtn = createButton('Overlay');
    overlayBtn.id('toggleOverlayBtn');
    overlayBtn.elt.dataset.i18nKey = 'toggleOverlay';
    overlayBtn.elt.dataset.state = overlayEnabled ? 'on' : 'off';
    overlayBtn.elt.setAttribute('aria-pressed', overlayEnabled ? 'true' : 'false');
    overlayBtn.elt.setAttribute('aria-label', 'Toggle overlay');
    overlayBtn.elt.classList.add('btn', 'secondary');
    overlayBtn.style('margin-top', '8px');
    
    const leftContainer = select('#uiLeft .actions') || select('#uiLeft');
    if (leftContainer && leftContainer.elt) {
      leftContainer.elt.appendChild(overlayBtn.elt);
    }
    
    try {
      if (typeof window.localizeNewElement === 'function') {
        window.localizeNewElement(overlayBtn);
      }
    } catch (e) {}
  }

  // Create Electron Button
  if (!electronBtn) {
    electronBtn = createButton('Electrons');
    electronBtn.id('toggleElectronsBtn');
    electronBtn.elt.dataset.i18nKey = 'toggleElectrons';
    electronBtn.elt.dataset.state = showElectrons ? 'on' : 'off';
    electronBtn.elt.setAttribute('aria-pressed', showElectrons ? 'true' : 'false');
    electronBtn.elt.setAttribute('aria-label', 'Toggle electrons');
    electronBtn.elt.classList.add('btn', 'secondary');
    electronBtn.style('margin-top', '6px');
    
    const leftContainer2 = select('#uiLeft .actions') || select('#uiLeft');
    if (leftContainer2 && leftContainer2.elt) {
      try {
        if (overlayBtn && overlayBtn.elt && overlayBtn.elt.parentNode === leftContainer2.elt) {
          overlayBtn.elt.insertAdjacentElement('afterend', electronBtn.elt);
        } else {
          leftContainer2.elt.appendChild(electronBtn.elt);
        }
      } catch (e) {
        leftContainer2.elt.appendChild(electronBtn.elt);
      }
    }
    
    try {
      if (typeof window.localizeNewElement === 'function') {
        window.localizeNewElement(electronBtn);
      }
    } catch (e) {}
  }

  // Update Overlay Button State
  function updateOverlayButtonState() {
    const l = ui.lInput ? parseInt(ui.lInput.value(), 10) : 0;
    if (!overlayBtn) return;
    
    const currentMode = window.orbitalMode || 'basic';
    
    if (currentMode === 'complete') {
      overlayBtn.addClass('disabled');
      overlayBtn.attribute('disabled', 'disabled');
      overlayEnabled = false;
      
      try {
        overlayBtn.elt.setAttribute('aria-pressed', 'false');
        overlayBtn.elt.dataset.state = 'off';
      } catch (e) {}
      return;
    }
    
    overlayBtn.removeClass('disabled');
    overlayBtn.removeAttribute('disabled');
    
    if (l >= 0 && l <= 2) {
      overlayBtn.style('opacity', '1.0');
      overlayBtn.style('background', '');
      overlayBtn.style('color', '');
      
      try {
        overlayBtn.elt.setAttribute('aria-pressed', overlayEnabled ? 'true' : 'false');
        overlayBtn.elt.dataset.state = overlayEnabled ? 'on' : 'off';
      } catch (e) {}
    } else {
      overlayBtn.style('opacity', '0.4');
      overlayBtn.style('background', 'rgba(100, 100, 100, 0.3)');
      overlayBtn.style('color', 'rgba(255, 255, 255, 0.5)');
      
      try {
        overlayBtn.elt.setAttribute('aria-pressed', overlayEnabled ? 'true' : 'false');
        overlayBtn.elt.dataset.state = overlayEnabled ? 'on' : 'off';
      } catch (e) {}
    }
    
    try {
      if (typeof window.localizeNewElement === 'function') {
        window.localizeNewElement(overlayBtn);
      }
    } catch (e) {}
  }

  window.updateOverlayButtonForMode = function(mode) {
    window.orbitalMode = mode;
    updateOverlayButtonState();
    overlayCache = null;
    scheduleOrbitalUpdate();
  };

  if (ui.lInput) ui.lInput.input(updateOverlayButtonState);
  if (ui.nInput) ui.nInput.input(updateOverlayButtonState);
  if (ui.mInput) ui.mInput.input(updateOverlayButtonState);
  
  if (ui.modeSelect) {
    ui.modeSelect.input(function() {
      const mode = ui.modeSelect.value();
      window.orbitalMode = mode;
      updateOverlayButtonState();
    });
  }

  window.orbitalMode = window.orbitalMode || localStorage.getItem('orbital_mode') || 'basic';
  updateOverlayButtonState();

  try {
    if (typeof window.updateToggleRotateText === 'function') {
      window.updateToggleRotateText();
    }
  } catch (e) {}

  try {
    const initialNe = ui.numElectronsInput ? parseInt(ui.numElectronsInput.value(), 10) : 0;
    if (!isNaN(initialNe)) updateNumElectronsMaxLabel(initialNe);
  } catch (e) {}

  // Overlay Button Click
  overlayBtn.mousePressed(() => {
    if (overlayBtn.hasClass('disabled') || overlayBtn.attribute('disabled')) return;
    
    overlayEnabled = !overlayEnabled;
    
    try {
      overlayBtn.elt.setAttribute('aria-pressed', overlayEnabled ? 'true' : 'false');
      overlayBtn.elt.dataset.state = overlayEnabled ? 'on' : 'off';
    } catch (e) {}
    
    if (overlayEnabled && sampleCount > 0 && !sampling) {
      setTimeout(() => {
        try {
          computeOverlay();
        } catch (err) {
          console.warn('computeOverlay error', err);
        }
      }, 10);
    } else if (!overlayEnabled) {
      overlayCache = null;
    }
    
    try {
      if (typeof window.localizeNewElement === 'function') {
        window.localizeNewElement(overlayBtn);
      }
    } catch (e) {}
  });

  // Electron Button Click
  electronBtn.mousePressed(() => {
    showElectrons = !showElectrons;
    
    try {
      electronBtn.elt.setAttribute('aria-pressed', showElectrons ? 'true' : 'false');
      electronBtn.elt.dataset.state = showElectrons ? 'on' : 'off';
    } catch (e) {}
    
    try {
      if (typeof window.localizeNewElement === 'function') {
        window.localizeNewElement(electronBtn);
      }
    } catch (e) {}
  });

  // Add native click/touch fallbacks for p5-created buttons to ensure robust touch behavior
  try {
    if (overlayBtn && overlayBtn.elt && overlayBtn.elt.addEventListener) {
      overlayBtn.elt.addEventListener('click', (e) => { try { e.preventDefault(); e.stopPropagation(); } catch (ee) {} overlayBtn.mousePressed(); }, { passive: false });
      overlayBtn.elt.addEventListener('touchend', (e) => { try { e.preventDefault(); e.stopPropagation(); } catch (ee) {} overlayBtn.mousePressed(); }, { passive: false });
    }
  } catch (e) {}

  try {
    if (electronBtn && electronBtn.elt && electronBtn.elt.addEventListener) {
      electronBtn.elt.addEventListener('click', (e) => { try { e.preventDefault(); e.stopPropagation(); } catch (ee) {} electronBtn.mousePressed(); }, { passive: false });
      electronBtn.elt.addEventListener('touchend', (e) => { try { e.preventDefault(); e.stopPropagation(); } catch (ee) {} electronBtn.mousePressed(); }, { passive: false });
    }
  } catch (e) {}
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function percentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const copy = Array.from(arr);
  copy.sort((a, b) => a - b);
  const idx = Math.min(copy.length - 1, Math.floor(p * copy.length));
  return copy[idx];
}

function kmeans(points, count, k, maxIter = 30) {
  if (count <= 0) return [];
  
  const n = count;
  const indices = [...Array(n).keys()];
  const centroids = [];
  const used = new Set();
  
  for (let i = 0; i < k; i++) {
    let idx;
    let tries = 0;
    do {
      idx = Math.floor(random() * n);
      tries++;
    } while (used.has(idx) && tries < 10);
    used.add(idx);
    centroids.push([points[idx * 3], points[idx * 3 + 1], points[idx * 3 + 2]]);
  }
  
  let assignments = new Array(n).fill(0);
  
  for (let iter = 0; iter < maxIter; iter++) {
    let moved = false;
    
    for (let i = 0; i < n; i++) {
      const px = points[i * 3], py = points[i * 3 + 1], pz = points[i * 3 + 2];
      let best = 0;
      let bestD = Infinity;
      
      for (let c = 0; c < k; c++) {
        const dx = px - centroids[c][0];
        const dy = py - centroids[c][1];
        const dz = pz - centroids[c][2];
        const d = dx * dx + dy * dy + dz * dz;
        
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      
      if (assignments[i] !== best) {
        assignments[i] = best;
        moved = true;
      }
    }
    
    const sums = [];
    const counts = [];
    for (let c = 0; c < k; c++) {
      sums.push([0, 0, 0]);
      counts.push(0);
    }
    
    for (let i = 0; i < n; i++) {
      const a = assignments[i];
      sums[a][0] += points[i * 3];
      sums[a][1] += points[i * 3 + 1];
      sums[a][2] += points[i * 3 + 2];
      counts[a] += 1;
    }
    
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c][0] = sums[c][0] / counts[c];
        centroids[c][1] = sums[c][1] / counts[c];
        centroids[c][2] = sums[c][2] / counts[c];
      } else {
        const idx = indices[Math.floor(random() * n)];
        centroids[c] = [points[idx * 3], points[idx * 3 + 1], points[idx * 3 + 2]];
      }
    }
    
    if (!moved) break;
  }
  
  const clusters = [];
  for (let c = 0; c < k; c++) clusters.push([]);
  for (let i = 0; i < n; i++) clusters[assignments[i]].push(i);
  
  return clusters;
}

function yawPitchFromVector(v) {
  const vx = v[0], vy = v[1], vz = v[2];
  const yaw = Math.atan2(vx, vz);
  const horizLen = Math.sqrt(vx * vx + vz * vz);
  const pitch = -Math.atan2(vy, horizLen);
  return { yaw, pitch };
}

function getSafeSphereDetail(requested = MAX_SPHERE_DETAIL) {
  try {
    const cap = Math.min(requested || MAX_SPHERE_DETAIL, APP_SPHERE_DETAIL_CAP);
    return Math.max(8, Math.floor(cap));
  } catch (e) {
    return Math.max(8, Math.min(256, Math.floor(requested || sphereResolution)));
  }
}

function computeTorusSegments(majorR, tubeR) {
  let u = Math.max(8, Math.min(APP_SAFE_MAX_TORUS_U, Math.round(256 * Math.max(0.4, majorR / 200))));
  let v = Math.max(4, Math.min(APP_SAFE_MAX_TORUS_V, Math.round(64 * Math.max(0.5, tubeR / 6))));
  
  const prod = u * v;
  if (prod > MAX_TORUS_VERTEX_COUNT) {
    const scale = Math.sqrt(MAX_TORUS_VERTEX_COUNT / prod);
    u = Math.max(8, Math.floor(u * scale));
    v = Math.max(4, Math.floor(v * scale));
  }
  
  u = Math.max(8, Math.min(APP_SAFE_MAX_TORUS_U, u));
  v = Math.max(4, Math.min(APP_SAFE_MAX_TORUS_V, v));
  
  return { uSegs: u, vSegs: v };
}

function drawSmoothTorus(majorR, tubeR, uSegs = 128, vSegs = 48) {
  if (!isFinite(majorR) || !isFinite(tubeR) || majorR <= 0 || tubeR <= 0) return;

  uSegs = Math.max(8, Math.min(APP_SAFE_MAX_TORUS_U, Math.floor(uSegs)));
  vSegs = Math.max(4, Math.min(APP_SAFE_MAX_TORUS_V, Math.floor(vSegs)));

  if (uSegs * vSegs > MAX_TORUS_VERTEX_COUNT) {
    const scale = Math.sqrt(MAX_TORUS_VERTEX_COUNT / (uSegs * vSegs));
    uSegs = Math.max(8, Math.floor(uSegs * scale));
    vSegs = Math.max(4, Math.floor(vSegs * scale));
  }

  for (let i = 0; i < uSegs; i++) {
    const a0 = (i / uSegs) * TWO_PI;
    const a1 = ((i + 1) / uSegs) * TWO_PI;
    
    beginShape(TRIANGLE_STRIP);
    for (let j = 0; j <= vSegs; j++) {
      const b = (j / vSegs) * TWO_PI;
      
      let x1 = (majorR + tubeR * Math.cos(b)) * Math.cos(a1);
      let y1 = (majorR + tubeR * Math.cos(b)) * Math.sin(a1);
      let z1 = tubeR * Math.sin(b);
      let nx1 = Math.cos(b) * Math.cos(a1);
      let ny1 = Math.cos(b) * Math.sin(a1);
      let nz1 = Math.sin(b);
      normal(nx1, ny1, nz1);
      vertex(x1, y1, z1);
      
      let x0 = (majorR + tubeR * Math.cos(b)) * Math.cos(a0);
      let y0 = (majorR + tubeR * Math.cos(b)) * Math.sin(a0);
      let z0 = tubeR * Math.sin(b);
      let nx0 = Math.cos(b) * Math.cos(a0);
      let ny0 = Math.cos(b) * Math.sin(a0);
      let nz0 = Math.sin(b);
      normal(nx0, ny0, nz0);
      vertex(x0, y0, z0);
    }
    endShape();
  }
}
// ============================================
// OVERLAY LIGHTING & RENDERING HELPERS
// ============================================

function _overlayNormalize(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1.0;
  return [v[0] / len, v[1] / len, v[2] / len];
}

const OVERLAY_LIGHT_DIR = _overlayNormalize([0.2, -0.4, 1.0]);
const OVERLAY_AMBIENT = 0.30;
const OVERLAY_DIFFUSE_MIN = 0.20;
const OVERLAY_DIFFUSE_SCALE = 0.90;
const OVERLAY_SPEC_INTENSITY = 0.9;
const OVERLAY_RIM_INTENSITY = 0.6;

function overlayLightingForAxis(axisUnit) {
  const L = OVERLAY_LIGHT_DIR;
  const dotv = Math.max(-1, Math.min(1, axisUnit[0] * L[0] + axisUnit[1] * L[1] + axisUnit[2] * L[2]));
  const diffuse = OVERLAY_DIFFUSE_MIN + OVERLAY_DIFFUSE_SCALE * Math.max(0, dotv);
  const spec = Math.pow(Math.max(0, dotv), 24) * OVERLAY_SPEC_INTENSITY;
  
  return { ambient: OVERLAY_AMBIENT, diffuse: diffuse, specular: spec, dot: dotv };
}

function axisWorldToCamera(axisUnit) {
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const rx = cy * axisUnit[0] + sy * axisUnit[2];
  const ry = axisUnit[1];
  const rz = -sy * axisUnit[0] + cy * axisUnit[2];
  
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const rrx = rx;
  const rry = cx * ry - sx * rz;
  const rrz = sx * ry + cx * rz;
  
  const len = Math.sqrt(rrx * rrx + rry * rry + rrz * rrz) || 1.0;
  return [rrx / len, rry / len, rrz / len];
}

function shadedColorForAxis(fillColor, axisUnit, alpha255) {
  const colorScale = 0.75;
  const baseR = fillColor[0] * colorScale;
  const baseG = fillColor[1] * colorScale;
  const baseB = fillColor[2] * colorScale;
  
  const L = overlayLightingForAxis(axisUnit);
  const axisCam = axisWorldToCamera(axisUnit);
  const viewDot = Math.max(-1, Math.min(1, axisCam[2]));
  const rim = Math.pow(Math.max(0, 1 - Math.abs(viewDot)), 3) * OVERLAY_RIM_INTENSITY;
  
  const litR = Math.min(255, Math.round(baseR * (L.ambient + L.diffuse) + 255 * L.specular * 0.03 + 255 * rim * 0.04));
  const litG = Math.min(255, Math.round(baseG * (L.ambient + L.diffuse) + 255 * L.specular * 0.03 + 255 * rim * 0.04));
  const litB = Math.min(255, Math.round(baseB * (L.ambient + L.diffuse) + 255 * L.specular * 0.03 + 255 * rim * 0.04));
  const a = Math.max(0, Math.min(255, Math.round(alpha255)));
  
  return [litR, litG, litB, a];
}

function shadedColorUniform(fillColor, alpha255) {
  const canonicalAxis = [0, 0, 1];
  return shadedColorForAxis(fillColor, canonicalAxis, alpha255);
}

// ============================================
// CACHED GEOMETRY FUNCTIONS
// ============================================

function getCachedSphereGeometry(radius, detailX = 64, detailY = 64) {
  const cacheKey = `${radius}_${detailX}_${detailY}`;
  
  if (!cachedSphereGeometry) {
    cachedSphereGeometry = {};
  }
  
  if (cachedSphereGeometry[cacheKey]) {
    return cachedSphereGeometry[cacheKey];
  }
  
  const vertices = [];
  const normals = [];
  const indices = [];
  
  for (let lat = 0; lat <= detailY; lat++) {
    const theta = lat * Math.PI / detailY;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    
    for (let lon = 0; lon <= detailX; lon++) {
      const phi = lon * 2 * Math.PI / detailX;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      
      const nx = cosPhi * sinTheta;
      const ny = cosTheta;
      const nz = sinPhi * sinTheta;
      
      const x = radius * nx;
      const y = radius * ny;
      const z = radius * nz;
      
      vertices.push({ x, y, z });
      normals.push({ x: nx, y: ny, z: nz });
    }
  }
  
  for (let lat = 0; lat < detailY; lat++) {
    for (let lon = 0; lon < detailX; lon++) {
      const first = lat * (detailX + 1) + lon;
      const second = first + detailX + 1;
      
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }
  
  const geometry = { vertices, normals, indices };
  cachedSphereGeometry[cacheKey] = geometry;
  return geometry;
}

function drawPerfectSmoothSphere(radius, detailX = 64, detailY = 64) {
  const geom = getCachedSphereGeometry(radius, detailX, detailY);
  
  beginShape(TRIANGLES);
  for (let i = 0; i < geom.indices.length; i++) {
    const idx = geom.indices[i];
    const v = geom.vertices[idx];
    const n = geom.normals[idx];
    normal(n.x, n.y, n.z);
    vertex(v.x, v.y, v.z);
  }
  endShape();
}

function drawPerfectSmoothEllipsoid(sx, sy, sz, detailX = 64, detailY = 64) {
  const geom = getCachedSphereGeometry(1.0, detailX, detailY);
  
  beginShape(TRIANGLES);
  for (let i = 0; i < geom.indices.length; i++) {
    const idx = geom.indices[i];
    const v = geom.vertices[idx];
    const n = geom.normals[idx];
    
    const x = sx * v.x;
    const y = sy * v.y;
    const z = sz * v.z;
    
    const nx = n.x / (sx * sx);
    const ny = n.y / (sy * sy);
    const nz = n.z / (sz * sz);
    const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    
    normal(nx / nlen, ny / nlen, nz / nlen);
    vertex(x, y, z);
  }
  endShape();
}

// ============================================
// LOBE ELLIPSOID RENDERING
// ============================================

function drawLobeEllipsoidBase(axisVec, axialLen, radialRadius, fillColor, opacity = 140, axialOffset = 0, useUniformLighting = false) {
  if (!axisVec) return;
  
  const len = Math.sqrt(axisVec[0] * axisVec[0] + axisVec[1] * axisVec[1] + axisVec[2] * axisVec[2]);
  if (len === 0) return;
  
  const axisUnit = [axisVec[0] / len, axisVec[1] / len, axisVec[2] / len];
  const rp = yawPitchFromVector(axisUnit);
  
  push();
  rotateY(rp.yaw);
  rotateX(rp.pitch);
  translate(0, 0, axialLen * 0.5 + axialOffset);
  
  const sx = radialRadius;
  const sy = radialRadius;
  const sz = axialLen * 0.5;
  
  noStroke();
  
  if (overlayShader) {
    shader(overlayShader);
    overlayShader.setUniform('uLightDirection', [0.2, -0.4, 1.0]);
    overlayShader.setUniform('uBaseColor', [fillColor[0] / 255, fillColor[1] / 255, fillColor[2] / 255]);
    overlayShader.setUniform('uOpacity', opacity / 255);
    overlayShader.setUniform('uAmbient', 0.25);
    overlayShader.setUniform('uDiffuse', 0.50);
    overlayShader.setUniform('uSpecular', 0.25);
    overlayShader.setUniform('uShininess', 48.0);
    overlayShader.setUniform('uRimPower', 3.0);
    overlayShader.setUniform('uRimIntensity', 0.35);
    
    try {
      fill(fillColor[0], fillColor[1], fillColor[2], Math.round(opacity * 0.6));
    } catch (e) {}
    
    drawPerfectSmoothEllipsoid(sx, sy, sz, OVERLAY_SPHERE_DETAIL, OVERLAY_SPHERE_DETAIL);
    resetShader();
  } else {
    const shaded = useUniformLighting ? shadedColorUniform(fillColor, opacity) : shadedColorForAxis(fillColor, axisUnit, opacity);
    ambientMaterial(shaded[0], shaded[1], shaded[2]);
    specularMaterial(90, 90, 90);
    shininess(30);
    
    push();
    scale(sx, sy, sz);
    try {
      if (typeof sphereDetail === 'function') sphereDetail(OVERLAY_SPHERE_DETAIL);
      fill(fillColor[0], fillColor[1], fillColor[2], Math.round(opacity * 0.6));
    } catch (e) {}
    sphere(1.0);
    try {
      noFill();
    } catch (e) {}
    pop();
  }
  
  // Micro highlights
  push();
  try {
    pointLight(180, 180, 180, 1.0, -1.0, 0.5);
  } catch (e) {}
  push();
  translate(0.45, -0.45, 0);
  specularMaterial(200, 200, 200);
  shininess(60);
  sphere(0.18);
  pop();
  pop();
  
  push();
  try {
    pointLight(150, 150, 150, -0.8, 0.6, -0.3);
  } catch (e) {}
  push();
  translate(-0.35, 0.35, -0.1);
  specularMaterial(180, 180, 180);
  shininess(50);
  sphere(0.15);
  pop();
  pop();
  
  try {
    if (typeof sphereDetail === 'function') sphereDetail(sphereResolution);
  } catch (e) {}
  pop();
}

function drawLobeEllipsoidBase3(axisVec, axialLen, radialMajor, radialMinor, rotationAngle = 0, fillColor = DZ2_OVERLAY_COLOR, opacity = 140, axialOffset = 0, useUniformLighting = false) {
  if (!axisVec) return;
  
  const len = Math.sqrt(axisVec[0] * axisVec[0] + axisVec[1] * axisVec[1] + axisVec[2] * axisVec[2]);
  if (len === 0) return;
  
  const axisUnit = [axisVec[0] / len, axisVec[1] / len, axisVec[2] / len];
  const rp = yawPitchFromVector(axisUnit);
  
  push();
  rotateY(rp.yaw);
  rotateX(rp.pitch);
  try {
    rotateZ(rotationAngle);
  } catch (e) {}
  translate(0, 0, axialLen * 0.5 + axialOffset);
  
  const sx = radialMajor;
  const sy = radialMinor;
  const sz = axialLen * 0.5;
  
  noStroke();
  
  if (overlayShader) {
    shader(overlayShader);
    overlayShader.setUniform('uLightDirection', [0.2, -0.4, 1.0]);
    overlayShader.setUniform('uBaseColor', [fillColor[0] / 255, fillColor[1] / 255, fillColor[2] / 255]);
    overlayShader.setUniform('uOpacity', opacity / 255);
    overlayShader.setUniform('uAmbient', 0.25);
    overlayShader.setUniform('uDiffuse', 0.50);
    overlayShader.setUniform('uSpecular', 0.25);
    overlayShader.setUniform('uShininess', 48.0);
    overlayShader.setUniform('uRimPower', 3.0);
    overlayShader.setUniform('uRimIntensity', 0.35);
    
    try {
      fill(fillColor[0], fillColor[1], fillColor[2], Math.round(opacity * 0.6));
    } catch (e) {}
    
    drawPerfectSmoothEllipsoid(sx, sy, sz, OVERLAY_SPHERE_DETAIL, OVERLAY_SPHERE_DETAIL);
    resetShader();
  } else {
    const shaded = useUniformLighting ? shadedColorUniform(fillColor, opacity) : shadedColorForAxis(fillColor, axisUnit, opacity);
    ambientMaterial(shaded[0], shaded[1], shaded[2]);
    specularMaterial(90, 90, 90);
    shininess(30);
    
    push();
    scale(sx, sy, sz);
    try {
      if (typeof sphereDetail === 'function') sphereDetail(OVERLAY_SPHERE_DETAIL);
      fill(fillColor[0], fillColor[1], fillColor[2], Math.round(opacity * 0.6));
    } catch (e) {}
    sphere(1.0);
    try {
      noFill();
    } catch (e) {}
    pop();
  }
  
  // Micro highlights
  push();
  try {
    pointLight(180, 180, 180, 1.0, -1.0, 0.5);
  } catch (e) {}
  push();
  translate(0.45, -0.45, 0);
  specularMaterial(200, 200, 200);
  shininess(60);
  sphere(0.18);
  pop();
  pop();
  
  push();
  try {
    pointLight(150, 150, 150, -0.8, 0.6, -0.3);
  } catch (e) {}
  push();
  translate(-0.35, 0.35, -0.1);
  specularMaterial(180, 180, 180);
  shininess(50);
  sphere(0.15);
  pop();
  pop();
  
  try {
    if (typeof sphereDetail === 'function') sphereDetail(sphereResolution);
  } catch (e) {}
  pop();
}

function drawLobeEllipsoid(axisVec, axialLen, radialRadius, fillColor, opacity = 140, axialOffset = 0, useUniformLighting = true) {
  drawLobeEllipsoidBase(axisVec, axialLen, radialRadius, fillColor, opacity, axialOffset, useUniformLighting);
}

// ============================================
// ELECTRON PUSHING & OVERLAY COMPUTATION
// ============================================

function pushElectronsOutward(globalFactor = GLOBAL_RADIAL_PUSH, equatorialFactor = EQ_RADIAL_PUSH, applyNearMultiplier = false, nearMultiplier = NEAR_NUCLEAR_PUSH_MULT, nearThresholdParam = null, nearEquatorialThresholdParam = null) {
  if (!positions || sampleCount <= 0) return;
  
  const posAxial = [], negAxial = [];
  for (let i = 0; i < sampleCount; i++) {
    const z = positions[i * 3 + 2];
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
    const rXY = Math.sqrt(x * x + y * y);
    const r3D = Math.sqrt(x * x + y * y + z * z);
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
      if (r3D <= EPS) {
        const ang = random(0, TWO_PI);
        const newR = Math.max(targetMinDistance, 0.5 * factor);
        positions[idx] = Math.cos(ang) * newR;
        positions[idx + 1] = Math.sin(ang) * newR;
        positions[idx + 2] = 0;
      } else {
        const newR3D = Math.max(targetMinDistance, r3D * factor);
        const s = newR3D / r3D;
        positions[idx] = x * s;
        positions[idx + 1] = y * s;
        positions[idx + 2] = z * s;
      }
    } else {
      if (rXY <= EPS) {
        if (r3D <= EPS) {
          const u = random(-1, 1);
          const theta = acos(u);
          const phi = random(0, TWO_PI);
          const sr = Math.sin(theta);
          positions[idx] = minAllowed * sr * Math.cos(phi);
          positions[idx + 1] = minAllowed * sr * Math.sin(phi);
          positions[idx + 2] = minAllowed * Math.cos(theta);
        } else {
          const newR3D = Math.max(minAllowed, r3D * factor);
          const s = newR3D / r3D;
          positions[idx] = x * s;
          positions[idx + 1] = y * s;
          positions[idx + 2] = z * s;
        }
      } else {
        const newR3D = Math.max(minAllowed, r3D * factor);
        const s = newR3D / r3D;
        positions[idx] = x * s;
        positions[idx + 1] = y * s;
        positions[idx + 2] = z * s;
      }
    }
  }
}

function computeOverlay() {
  if (!overlayEnabled) {
    overlayCache = null;
    return;
  }
  
  if (!positions || sampleCount <= 0) {
    overlayCache = null;
    return;
  }

  const maxSampleForOverlay = 3000;
  const n = sampleCount;
  const step = Math.max(1, Math.floor(n / maxSampleForOverlay));
  const sampled = new Float32Array(Math.ceil(n / step) * 3);
  let si = 0;
  
  for (let i = 0; i < n; i += step) {
    const idx = i * 3;
    sampled[si++] = positions[idx];
    sampled[si++] = positions[idx + 1];
    sampled[si++] = positions[idx + 2];
  }

  setTimeout(() => {
    const sampleCountSampled = Math.floor(si / 3);
    const l = ui.lInput ? parseInt(ui.lInput.value(), 10) : 0;
    const m = ui.mInput ? parseInt(ui.mInput.value(), 10) : 0;
    const overlayColor = DZ2_OVERLAY_COLOR;
    const cache = { type: null, data: null, color: overlayColor };

    // S-orbital
    if (l === 0) {
      const dists = [];
      for (let i = 0; i < sampleCountSampled; i++) {
        const idx = i * 3;
        const r = Math.sqrt(sampled[idx] * sampled[idx] + sampled[idx + 1] * sampled[idx + 1] + sampled[idx + 2] * sampled[idx + 2]);
        dists.push(r);
      }
      
      let r95 = percentile(dists, OVERLAY_PERCENTILE);
      r95 = Math.max(0.5, r95 * S_OVERLAY_SCALE);
      cache.type = 's';
      cache.data = { r95: r95 };
      console.log(`📊 S-orbital overlay: r95=${r95.toFixed(1)}`);
    }
    // P-orbital
    else if (l === 1) {
      if (sampleCountSampled < 6) {
        cache.type = 'p';
        cache.data = {
          lobes: [
            { axisUnit: [1, 0, 0], t95: 8, r95: 2 },
            { axisUnit: [-1, 0, 0], t95: 8, r95: 2 }
          ]
        };
      } else {
        const clusters = kmeans(sampled, sampleCountSampled, 2, 30);
        const lobesComputed = [];
        
        for (let c = 0; c < clusters.length; c++) {
          const idxs = clusters[c];
          if (!idxs || idxs.length < 6) continue;
          
          let sx = 0, sy = 0, sz = 0;
          const axialVals = [];
          const radialVals = [];
          
          for (let j = 0; j < idxs.length; j++) {
            const i = idxs[j];
            const x = sampled[i * 3], y = sampled[i * 3 + 1], z = sampled[i * 3 + 2];
            sx += x;
            sy += y;
            sz += z;
          }
          
          sx /= idxs.length;
          sy /= idxs.length;
          sz /= idxs.length;
          
          const axis = [sx, sy, sz];
          const axisLen = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]) || 1.0;
          const axisUnit = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
          
          for (let j = 0; j < idxs.length; j++) {
            const i = idxs[j];
            const x = sampled[i * 3], y = sampled[i * 3 + 1], z = sampled[i * 3 + 2];
            const t = x * axisUnit[0] + y * axisUnit[1] + z * axisUnit[2];
            axialVals.push(Math.abs(t));
            const radialSq = x * x + y * y + z * z - t * t;
            radialVals.push(Math.sqrt(Math.max(0, radialSq)));
          }
          
          const t95 = percentile(axialVals, OVERLAY_PERCENTILE);
          const r95 = percentile(radialVals, OVERLAY_PERCENTILE);
          lobesComputed.push({
            axisUnit: axisUnit,
            t95: Math.max(0.01, t95),
            r95: Math.max(0.01, r95)
          });
        }

        if (lobesComputed.length < 2) {
          const absX = [];
          const rPerpX = [];
          for (let i = 0; i < sampleCountSampled; i++) {
            const x = sampled[i * 3], y = sampled[i * 3 + 1], z = sampled[i * 3 + 2];
            absX.push(Math.abs(x));
            rPerpX.push(Math.sqrt(y * y + z * z));
          }
          
          let t95_px = absX.length ? percentile(absX, OVERLAY_PERCENTILE) : 8.0;
          let r95_px = rPerpX.length ? percentile(rPerpX, OVERLAY_PERCENTILE) : 2.0;
          t95_px = Math.max(0.01, t95_px * P_PX_AXIAL_BOOST);
          r95_px = Math.max(0.01, r95_px * P_PX_RADIAL_BOOST);
          
          lobesComputed.push({ axisUnit: [1, 0, 0], t95: t95_px, r95: r95_px });
          lobesComputed.push({ axisUnit: [-1, 0, 0], t95: t95_px, r95: r95_px });
        }
        
        let bestIdx = -1;
        let bestAlign = -1;
        for (let i = 0; i < lobesComputed.length; i++) {
          const ax = lobesComputed[i].axisUnit;
          const align = Math.abs(ax[0]);
          if (align > bestAlign) {
            bestAlign = align;
            bestIdx = i;
          }
        }
        
        let canonicalT = null;
        let canonicalR = null;
        
        if (bestIdx >= 0) {
          canonicalT = lobesComputed[bestIdx].t95;
          canonicalR = lobesComputed[bestIdx].r95;
        } else {
          const absX = [];
          const rPerpX = [];
          for (let i = 0; i < sampleCountSampled; i++) {
            const x = sampled[i * 3], y = sampled[i * 3 + 1], z = sampled[i * 3 + 2];
            absX.push(Math.abs(x));
            rPerpX.push(Math.sqrt(y * y + z * z));
          }
          
          canonicalT = absX.length ? percentile(absX, OVERLAY_PERCENTILE) : 8.0;
          canonicalR = rPerpX.length ? percentile(rPerpX, OVERLAY_PERCENTILE) : 2.0;
          canonicalT = Math.max(0.01, canonicalT * P_PX_AXIAL_BOOST);
          canonicalR = Math.max(0.01, canonicalR * P_PX_RADIAL_BOOST);
        }
        
        const lobesFinal = [];
        for (let i = 0; i < lobesComputed.length; i++) {
          const axUnit = lobesComputed[i].axisUnit;
          lobesFinal.push({
            axisUnit: axUnit,
            t95: canonicalT,
            r95: canonicalR
          });
        }
        
        if (lobesFinal.length === 1) {
          const ax = lobesFinal[0].axisUnit;
          lobesFinal.push({
            axisUnit: [-ax[0], -ax[1], -ax[2]],
            t95: canonicalT,
            r95: canonicalR
          });
        }
        
        cache.type = 'p';
        cache.data = { lobes: lobesFinal };
        console.log(`📊 P-orbital overlay: axial=${canonicalT.toFixed(1)}, radial=${canonicalR.toFixed(1)}`);
      }
    }
    // D-orbital (continued in next section due to length)
    else if (l === 2) {
      if (m === 0) {
        // Dz² orbital with ring
        const posAxial = [];
        const negAxial = [];
        const radialXYAll = [];
        const radialXYEquatorial = [];
        
        for (let i = 0; i < sampleCountSampled; i++) {
          const x = sampled[i * 3], y = sampled[i * 3 + 1], z = sampled[i * 3 + 2];
          const rxy = Math.sqrt(x * x + y * y);
          if (z >= 0) posAxial.push(z);
          else negAxial.push(-z);
          radialXYAll.push(rxy);
        }
        
        const t95posRaw = posAxial.length ? percentile(posAxial, OVERLAY_PERCENTILE) : 0;
        const t95negRaw = negAxial.length ? percentile(negAxial, OVERLAY_PERCENTILE) : 0;
        const t95pos = Math.max(1.0, t95posRaw * DZ_LOBE_SCALE * LOBE_Z_SHRINK * LOBE_AXIAL_EXTEND);
        const t95neg = Math.max(1.0, t95negRaw * DZ_LOBE_SCALE * LOBE_Z_SHRINK * LOBE_AXIAL_EXTEND);
        
        const lobeRadial95 = radialXYAll.length ? percentile(radialXYAll, OVERLAY_PERCENTILE) * LOBE_RADIAL_PERCENTILE_MULT : 2.0;
        const lobeRadial = Math.max(0.9, lobeRadial95 * LOBE_RADIAL_EXTRA_GROW);
        
        let axialOffsetPos = t95pos * LOBE_Z_OFFSET_MULT;
        let axialOffsetNeg = t95neg * LOBE_Z_OFFSET_MULT;
        axialOffsetPos *= DZ2_AXIAL_OFFSET_SCALE;
        axialOffsetNeg *= DZ2_AXIAL_OFFSET_SCALE;
        
        const eqThreshold = Math.max(0.2 * Math.max(t95posRaw, t95negRaw), 1.0);
        for (let i = 0; i < sampleCountSampled; i++) {
          const x = sampled[i * 3], y = sampled[i * 3 + 1], z = sampled[i * 3 + 2];
          if (Math.abs(z) <= eqThreshold) {
            radialXYEquatorial.push(Math.sqrt(x * x + y * y));
          }
        }
        
        let ringInnerRadius, ringOuterRadius;
        if (radialXYEquatorial.length >= 8) {
          ringInnerRadius = Math.max(NUCLEUS_RADIUS + ELECTRON_MIN_GAP, percentile(radialXYEquatorial, OVERLAY_RING_INNER_P));
          ringOuterRadius = Math.max(ringInnerRadius + 0.001, percentile(radialXYEquatorial, OVERLAY_RING_OUTER_P));
        } else {
          ringInnerRadius = RING_DEFAULT_INNER_DIAM * 0.5;
          ringOuterRadius = RING_DEFAULT_OUTER_DIAM * 0.5;
        }
        
        ringInnerRadius *= DZ2_RING_SHRINK_FACTOR;
        ringOuterRadius *= DZ2_RING_SHRINK_FACTOR;
        
        let tubeRadius = Math.max(1.0, (ringOuterRadius - ringInnerRadius) * 0.5);
        const majorRadius = (ringInnerRadius + ringOuterRadius) * 0.5;
        
        cache.type = 'dz2';
        cache.data = {
          t80pos: t95pos,
          t80neg: t95neg,
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
        
        console.log(`📊 Dz² overlay: axial=${t95pos.toFixed(1)}/${t95neg.toFixed(1)}, radial=${lobeRadial.toFixed(1)}, ring=${ringInnerRadius.toFixed(1)}-${ringOuterRadius.toFixed(1)}`);
      } else {
        // Other D-orbitals (dxy, dxz, dyz, dx2-y2)
        if (sampleCountSampled < 8) {
          const fallbackAxes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
          const allAxial = [];
          const allRadial = [];
          
          for (let i = 0; i < sampleCountSampled; i++) {
            const x = sampled[i * 3], y = sampled[i * 3 + 1], z = sampled[i * 3 + 2];
            allRadial.push(Math.sqrt(x * x + y * y));
            allAxial.push(Math.abs(z));
          }
          
          const globalT95 = Math.max(0.01, percentile(allAxial, OVERLAY_PERCENTILE) * 1.05);
          const globalRBase = Math.max(0.01, percentile(allRadial, OVERLAY_PERCENTILE) * 1.05);
          const globalR95 = globalRBase * D_RADIAL_SHRINK_FACTOR * D_RADIAL_EXPAND_FACTOR;
          
          const processedLobes = [];
          for (let a of fallbackAxes) {
            processedLobes.push({
              axisUnit: a,
              axial: globalT95,
              radialMajor: globalR95,
              radialMinor: globalR95,
              radialAngle: 0,
              nearSideCompression: Math.max(0.0, globalT95 * 0.06)
            });
          }
          
          cache.type = 'd';
          cache.data = { lobes: processedLobes, alpha: DZ2_OVERLAY_ALPHA };
        } else {
          const k = 4;
          let clusters = kmeans(sampled, sampleCountSampled, k, 40);
          const minClusterSize = Math.max(4, Math.floor(sampleCountSampled * 0.02));
          let needFallback = false;
          
          for (let c = 0; c < clusters.length; c++) {
            if (clusters[c].length < minClusterSize) {
              needFallback = true;
              break;
            }
          }
          
          if (needFallback) {
            clusters = kmeans(sampled, sampleCountSampled, k, 60);
          }
          
          const lobes = [];
          const COVER_P = OVERLAY_PERCENTILE;
          
          for (let c = 0; c < clusters.length; c++) {
            const idxs = clusters[c];
            if (!idxs || idxs.length < 4) continue;
            
            let sx = 0, sy = 0, sz = 0;
            const axialVals = [];
            const proj1 = [];
            const proj2 = [];
            const radialValsPerSample = [];
            
            for (let j = 0; j < idxs.length; j++) {
              const i = idxs[j];
              sx += sampled[i * 3];
              sy += sampled[i * 3 + 1];
              sz += sampled[i * 3 + 2];
            }
            
            sx /= idxs.length;
            sy /= idxs.length;
            sz /= idxs.length;
            
            const axis = [sx, sy, sz];
            const axisLen = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]) || 1.0;
            const axisUnit = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
            const basis = makePerpBasis(axisUnit);
            
            for (let j = 0; j < idxs.length; j++) {
              const i = idxs[j];
              const x = sampled[i * 3], y = sampled[i * 3 + 1], z = sampled[i * 3 + 2];
              const t = x * axisUnit[0] + y * axisUnit[1] + z * axisUnit[2];
              axialVals.push(Math.abs(t));
              proj1.push(Math.abs(dot([x, y, z], basis.v1)));
              proj2.push(Math.abs(dot([x, y, z], basis.v2)));
              const radialSq = x * x + y * y + z * z - t * t;
              radialValsPerSample.push(Math.sqrt(Math.max(0, radialSq)));
            }
            
            const t95 = Math.max(0.01, percentile(axialVals, COVER_P));
            const r1_95 = Math.max(0.01, percentile(proj1, COVER_P));
            const r2_95 = Math.max(0.01, percentile(proj2, COVER_P));
            
            let rotationAngle = 0;
            if (r2_95 > r1_95) rotationAngle = Math.PI * 0.5;
            
            let preciseAngle = rotationAngle;
            if (idxs.length >= 8) {
              const p1 = [], p2 = [];
              for (let j = 0; j < idxs.length; j++) {
                const ii = idxs[j];
                const x = sampled[ii * 3], y = sampled[ii * 3 + 1], z = sampled[ii * 3 + 2];
                p1.push(dot([x, y, z], basis.v1));
                p2.push(dot([x, y, z], basis.v2));
              }
              const pc = pca2D(p1.map(Math.abs), p2.map(Math.abs));
              if (pc && typeof pc.angle === 'number') preciseAngle = pc.angle;
            }

            lobes.push({
              axisUnit: axisUnit,
              t90: t95,
              proj_r1_90: r1_95,
              proj_r2_90: r2_95,
              radialAngle: preciseAngle,
              radialSamples: radialValsPerSample.slice(),
              idxs: idxs.slice()
            });
          }

          if (lobes.length < 4) {
            lobes.length = 0;
            const fallbackAxes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
            const allAxial = [];
            const allRadial = [];
            
            for (let i = 0; i < sampleCountSampled; i++) {
              const x = sampled[i * 3], y = sampled[i * 3 + 1], z = sampled[i * 3 + 2];
              allRadial.push(Math.sqrt(x * x + y * y));
              allAxial.push(Math.abs(z));
            }
            
            const globalT95 = Math.max(0.01, percentile(allAxial, OVERLAY_PERCENTILE) * 1.05);
            const globalRBase = Math.max(0.01, percentile(allRadial, OVERLAY_PERCENTILE) * 1.05);
            const globalR95 = globalRBase * D_RADIAL_SHRINK_FACTOR * D_RADIAL_EXPAND_FACTOR;
            
            for (let a of fallbackAxes) {
              lobes.push({
                axisUnit: a,
                t90: globalT95,
                radialMajor: globalR95,
                radialMinor: globalR95,
                radialAngle: 0,
                idxs: []
              });
            }
          }

          const axialAll = [];
          const radialAll = [];
          
          for (let li = 0; li < lobes.length; li++) {
            const L = lobes[li];
            const idxs = L.idxs || [];
            
            if (idxs.length > 0) {
              for (let j = 0; j < idxs.length; j++) {
                const ii = idxs[j];
                const x = sampled[ii * 3], y = sampled[ii * 3 + 1], z = sampled[ii * 3 + 2];
                const t = x * L.axisUnit[0] + y * L.axisUnit[1] + z * L.axisUnit[2];
                axialAll.push(Math.abs(t));
                const radialSq = x * x + y * y + z * z - t * t;
                radialAll.push(Math.sqrt(Math.max(0, radialSq)));
              }
            } else {
              axialAll.push(L.t90 || 0.0);
              radialAll.push(Math.max(L.proj_r1_90 || 0.0, L.proj_r2_90 || 0.0));
            }
          }

          const COVER_P_GLOBAL = OVERLAY_PERCENTILE;
          let canonicalAxial = axialAll.length ? percentile(axialAll, COVER_P_GLOBAL) : 8.0;
          let canonicalRadialBase = radialAll.length ? percentile(radialAll, COVER_P_GLOBAL) : 2.0;
          canonicalAxial = Math.max(0.01, canonicalAxial);
          const canonicalRadial = Math.max(0.01, canonicalRadialBase * D_RADIAL_SHRINK_FACTOR * D_RADIAL_EXPAND_FACTOR);

          const processedLobes = [];
          for (let i = 0; i < lobes.length; i++) {
            const L = lobes[i];
            const axisUnit = L.axisUnit;
            let rotAng = (typeof L.radialAngle === 'number') ? L.radialAngle : 0;
            rotAng = ((rotAng + Math.PI) % (2 * Math.PI)) - Math.PI;
            const nearSideCompression = Math.max(0.0, canonicalAxial * 0.06);
            
            processedLobes.push({
              axisUnit: axisUnit,
              axial: canonicalAxial,
              radialMajor: canonicalRadial,
              radialMinor: canonicalRadial,
              radialAngle: rotAng,
              nearSideCompression: nearSideCompression
            });
          }

          cache.type = 'd';
          cache.data = { lobes: processedLobes, alpha: DZ2_OVERLAY_ALPHA };
          console.log(`📊 D-orbital overlay: axial=${canonicalAxial.toFixed(1)}, radial=${canonicalRadial.toFixed(1)}, lobes=${processedLobes.length}`);
        }
      }
    }
    
    overlayCache = cache;
  }, 8);
}

// ============================================
// CAMERA & COORDINATE HELPERS
// ============================================

function cameraDirToWorld(dX, dY, dZ) {
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  
  const rx = dX;
  const ry = cx * dY + sx * dZ;
  const rz = -sx * dY + cx * dZ;
  
  const vx = cy * rx - sy * rz;
  const vy = ry;
  const vz = sy * rx + cy * rz;
  
  const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1.0;
  return [vx / len, vy / len, vz / len];
}

function ensureSceneLights() {
  ambientLight(50);
  
  try {
    const camLightCamPos = [0, -300, 600];
    const dirCamX = -camLightCamPos[0];
    const dirCamY = -camLightCamPos[1];
    const dirCamZ = -camLightCamPos[2];
    const worldDir = cameraDirToWorld(dirCamX, dirCamY, dirCamZ);
    directionalLight(200, 200, 200, worldDir[0], worldDir[1], worldDir[2]);
  } catch (e) {}
}

function initDisplayBuffersAfterSampling(prevPositions, prevCount, newPositions, newCount) {
  const pCount = prevCount || 0;
  const nCount = newCount || 0;
  const maxCount = Math.max(pCount, nCount);
  
  if (maxCount <= 0) {
    positionsDisplay = null;
    alphasDisplay = null;
    displayCount = 0;
    displayUpdateCursor = 0;
    return;
  }

  const newDisp = new Float32Array(maxCount * 3);
  const newAlphas = new Float32Array(maxCount);

  for (let i = 0; i < maxCount; i++) {
    if (i < pCount && prevPositions && prevPositions.length >= (i * 3 + 3)) {
      newDisp[i * 3] = prevPositions[i * 3];
      newDisp[i * 3 + 1] = prevPositions[i * 3 + 1];
      newDisp[i * 3 + 2] = prevPositions[i * 3 + 2];
      newAlphas[i] = 1.0;
    } else if (i < nCount && newPositions && newPositions.length >= (i * 3 + 3)) {
      newDisp[i * 3] = newPositions[i * 3];
      newDisp[i * 3 + 1] = newPositions[i * 3 + 1];
      newDisp[i * 3 + 2] = newPositions[i * 3 + 2];
      newAlphas[i] = 1.0;
    } else {
      const ang = (i * 97.3) % (Math.PI * 2);
      const rr = NUCLEUS_RADIUS + ELECTRON_MIN_GAP + (Math.random() * 6.0);
      newDisp[i * 3] = Math.cos(ang) * rr;
      newDisp[i * 3 + 1] = Math.sin(ang) * rr;
      newDisp[i * 3 + 2] = 0;
      newAlphas[i] = 0.0;
    }
  }

  positionsDisplay = newDisp;
  alphasDisplay = newAlphas;
  displayCount = maxCount;
  displayUpdateCursor = 0;
}
function updateDisplayBuffers() {
  if ((!positionsDisplay || !alphasDisplay) && positions && sampleCount > 0) {
    initDisplayBuffersAfterSampling(positions, sampleCount, positions, sampleCount);
    return;
  }
  
  if (!positionsDisplay || !alphasDisplay) return;

  const dt = (typeof deltaTime !== 'undefined' && isFinite(deltaTime)) ? Math.min(deltaTime, 100) : 16.67;
  const alpha = 1 - Math.exp(-dt / SMOOTH_TAU_MS);

  const maxCount = Math.max(displayCount, sampleCount);
  
  if (positionsDisplay.length / 3 < maxCount) {
    const tmp = new Float32Array(maxCount * 3);
    tmp.set(positionsDisplay);
    for (let i = positionsDisplay.length / 3; i < maxCount; i++) {
      const ang = (i * 97.3) % (Math.PI * 2);
      const rr = NUCLEUS_RADIUS + ELECTRON_MIN_GAP + 2.0;
      tmp[i * 3] = Math.cos(ang) * rr;
      tmp[i * 3 + 1] = Math.sin(ang) * rr;
      tmp[i * 3 + 2] = 0;
    }
    positionsDisplay = tmp;
  }
  
  if (alphasDisplay.length < maxCount) {
    const tmpA = new Float32Array(maxCount);
    tmpA.set(alphasDisplay);
    for (let i = alphasDisplay.length; i < maxCount; i++) tmpA[i] = 0.0;
    alphasDisplay = tmpA;
  }
  
  displayCount = maxCount;

  const updates = Math.min(DISPLAY_UPDATES_PER_FRAME, maxCount);
  let start = displayUpdateCursor;
  let end = Math.min(maxCount, start + updates);

  for (let i = start; i < end; i++) {
    const idx3 = i * 3;
    
    if (i < sampleCount && positions && positions.length >= idx3 + 3) {
      const tx = positions[idx3];
      const ty = positions[idx3 + 1];
      const tz = positions[idx3 + 2];
      
      positionsDisplay[idx3] += (tx - positionsDisplay[idx3]) * alpha;
      positionsDisplay[idx3 + 1] += (ty - positionsDisplay[idx3 + 1]) * alpha;
      positionsDisplay[idx3 + 2] += (tz - positionsDisplay[idx3 + 2]) * alpha;
      alphasDisplay[i] += (1.0 - alphasDisplay[i]) * alpha;
    } else {
      const ang = (i * 97.3) % (Math.PI * 2);
      const rr = NUCLEUS_RADIUS + ELECTRON_MIN_GAP + 2.0;
      const tx = Math.cos(ang) * rr;
      const ty = Math.sin(ang) * rr;
      const tz = 0;
      
      positionsDisplay[idx3] += (tx - positionsDisplay[idx3]) * (alpha * 0.5);
      positionsDisplay[idx3 + 1] += (ty - positionsDisplay[idx3 + 1]) * (alpha * 0.5);
      positionsDisplay[idx3 + 2] += (tz - positionsDisplay[idx3 + 2]) * (alpha * 0.5);
      alphasDisplay[i] += (0.0 - alphasDisplay[i]) * alpha;
    }
  }

  displayUpdateCursor = end >= maxCount ? 0 : end;
  
  // Update inner orbitals
  for (let i = 0; i < innerOrbitals.length; i++) {
    innerOrbitals[i].updateDisplayBuffers(dt);
  }
}

// ============================================
// MAIN DRAW LOOP (OPTIMIZED)
// ============================================

function draw() {
  background(0);
  
  const dt = (typeof deltaTime !== 'undefined' && isFinite(deltaTime)) ? Math.min(deltaTime, 100) : 16.67;

  // ✅ OPTIMIZED: Smooth zoom with lerp
  const ZOOM_LERP = 0.12;
  if (isFinite(camZoomTarget) && Math.abs(camZoomTarget - camZoom) > 1e-5) {
    camZoom += (camZoomTarget - camZoom) * ZOOM_LERP;
    if (Math.abs(camZoomTarget - camZoom) < 1e-4) camZoom = camZoomTarget;
  }

  // ✅ OPTIMIZED: Physics-based smooth rotation (NO JERKING)
  if (autoRotate && !isDragging) {
    // Apply constant angular velocity
    rotYVelocity = ROTATION_SPEED * dt;
    rotYTarget += rotYVelocity;
    rotY = rotYTarget; // Direct assignment for perfectly smooth rotation
  } else if (!isDragging) {
    // Damping when auto-rotate is off
    rotYVelocity *= ROTATION_DAMPING;
    if (Math.abs(rotYVelocity) > 0.00001) {
      rotYTarget += rotYVelocity;
    }
    
    // Smooth lerp to target
    const rotAlpha = 1 - Math.exp(-dt / 120);
    rotY += (rotYTarget - rotY) * rotAlpha;
  }

  // Lighting
  ambientLight(50);
  
  try {
    const camLightCamPos = [0, -300, 600];
    const dirCamX = -camLightCamPos[0];
    const dirCamY = -camLightCamPos[1];
    const dirCamZ = -camLightCamPos[2];
    const worldDir = cameraDirToWorld(dirCamX, dirCamY, dirCamZ);
    directionalLight(200, 200, 200, worldDir[0], worldDir[1], worldDir[2]);
  } catch (e) {}

  push();
  scale(camZoom);
  rotateY(rotY);
  rotateX(rotX);
  
  const axisLen = computeAxisLength90();
  drawAxes(axisLen);

  ensureSceneLights();

  // Render nucleus
  if (nucleus) nucleus.render(rotX, rotY, camZoom, worldToScreen, normalizeVec3, backLightColor);

  updateDisplayBuffers();

  // Enable depth testing
  try {
    const gl = drawingContext;
    if (gl) {
      if (typeof gl.enable === 'function') gl.enable(gl.DEPTH_TEST);
      setWebGLDepthFunc('LESS');
      setWebGLDepthMask(true);
    }
  } catch (e) {}

  const currentMode = window.orbitalMode || 'basic';
  
  // Render electrons
  if (showElectrons) {
    // Inner orbitals
    if (innerOrbitals.length > 0) {
      noLights();
      
      const baseUIVal = (ui.electronSizeInput && ui.electronSizeInput.value) ? parseFloat(ui.electronSizeInput.value()) || 1 : 1;
      const pointSize = constrain(max(0.5, baseUIVal * 1.5), 0.5, 18);
      
      for (let i = 0; i < innerOrbitals.length; i++) {
        innerOrbitals[i].render(pointSize);
      }
      
      strokeWeight(1);
      ensureSceneLights();
    }
    
    // Main orbital electrons
    if ((displayCount > 0 || sampleCount > 0) && positions) {
      let renderPositions = (positionsDisplay && positionsDisplay.length > 0) ? positionsDisplay : positions;
      let renderCount = (positionsDisplay && positionsDisplay.length > 0) ? displayCount : sampleCount;

      if (renderPositions && renderCount > 0) {
        noLights();
        
        let electronColor;
        if (currentMode === 'complete' && ui.nInput && ui.lInput) {
          const n = parseInt(ui.nInput.value(), 10);
          const l = parseInt(ui.lInput.value(), 10);
          electronColor = getSubshellColor(n, l);
        } else {
          electronColor = getSubshellColor(1, 0);
        }
        
        const baseUIVal = (ui.electronSizeInput && ui.electronSizeInput.value) ? parseFloat(ui.electronSizeInput.value()) || 1 : 1;
        const pointSize = constrain(max(0.5, baseUIVal * 1.5), 0.5, 18);
        
        strokeWeight(pointSize);
        beginShape(POINTS);
        for (let i = 0; i < renderCount; i++) {
          const idx = i * 3;
          const alpha = (alphasDisplay && i < alphasDisplay.length) ? alphasDisplay[i] : 1.0;
          const alphaVal = Math.round(255 * constrain(alpha, 0, 1));
          
          stroke(electronColor[0], electronColor[1], electronColor[2], alphaVal);
          fill(electronColor[0], electronColor[1], electronColor[2], alphaVal);
          vertex(renderPositions[idx], renderPositions[idx + 1], renderPositions[idx + 2]);
        }
        endShape();
        
        strokeWeight(1);
        ensureSceneLights();
      }
    }
  }

  // Render overlay (S, P, D orbitals)
  if (currentMode === 'basic' && overlayEnabled && overlayCache) {
    try {
      hint(ENABLE_DEPTH_TEST);
    } catch (e) {}
    
    try {
      const gl = drawingContext;
      if (gl) {
        if (typeof gl.enable === 'function') gl.enable(gl.DEPTH_TEST);
      }
    } catch (e) {}
    
    setWebGLDepthFunc('LESS');
    setWebGLDepthMask(false);

    push();
    ensureSceneLights();
    
    try {
      blendMode(BLEND);
    } catch (e) {}

    const safeLobeAlpha = Math.max(8, Math.round(DZ2_OVERLAY_ALPHA * 0.35));
    const safeRingAlpha = Math.max(6, Math.round(RING_ALPHA * 0.30));

    // S-orbital overlay
    if (overlayCache.type === 's') {
      const r95 = overlayCache.data.r95;
      
      push();
      noStroke();
      const scaledR = r95 * OVERLAY_SCALE;
      
      if (overlayShader) {
        shader(overlayShader);
        overlayShader.setUniform('uLightDirection', [0.2, -0.4, 1.0]);
        overlayShader.setUniform('uBaseColor', [DZ2_OVERLAY_COLOR[0] / 255, DZ2_OVERLAY_COLOR[1] / 255, DZ2_OVERLAY_COLOR[2] / 255]);
        overlayShader.setUniform('uOpacity', safeLobeAlpha / 255);
        overlayShader.setUniform('uAmbient', 0.25);
        overlayShader.setUniform('uDiffuse', 0.50);
        overlayShader.setUniform('uSpecular', 0.25);
        overlayShader.setUniform('uShininess', 48.0);
        overlayShader.setUniform('uRimPower', 3.0);
        overlayShader.setUniform('uRimIntensity', 0.35);
        
        try {
          fill(DZ2_OVERLAY_COLOR[0], DZ2_OVERLAY_COLOR[1], DZ2_OVERLAY_COLOR[2], safeLobeAlpha);
        } catch (e) {}
        
        drawPerfectSmoothSphere(scaledR, OVERLAY_SPHERE_DETAIL, OVERLAY_SPHERE_DETAIL);
        resetShader();
      } else {
        const shaded = shadedColorForAxis(DZ2_OVERLAY_COLOR, [0, 0, 1], safeLobeAlpha);
        ambientMaterial(Math.round(shaded[0] * 0.9), Math.round(shaded[1] * 0.9), Math.round(shaded[2] * 0.9));
        specularMaterial(100, 100, 100);
        shininess(20);
        
        try {
          if (typeof sphereDetail === 'function') sphereDetail(OVERLAY_SPHERE_DETAIL);
          fill(Math.round(shaded[0] * 0.9), Math.round(shaded[1] * 0.9), Math.round(shaded[2] * 0.9), safeLobeAlpha);
        } catch (e) {}
        
        sphere(scaledR);
        
        try {
          noFill();
        } catch (e) {}
      }
      
      // Highlights
      push();
      try {
        pointLight(180, 180, 180, scaledR * 0.3, -scaledR * 0.3, scaledR * 0.2);
      } catch (e) {}
      translate(scaledR * 0.25, -scaledR * 0.25, 0);
      specularMaterial(200, 200, 200);
      shininess(60);
      sphere(scaledR * 0.05);
      pop();
      
      push();
      try {
        pointLight(150, 150, 150, -scaledR * 0.25, scaledR * 0.25, -scaledR * 0.15);
      } catch (e) {}
      translate(-scaledR * 0.22, scaledR * 0.22, -scaledR * 0.08);
      specularMaterial(180, 180, 180);
      shininess(50);
      sphere(scaledR * 0.04);
      pop();
      
      try {
        if (typeof sphereDetail === 'function') sphereDetail(sphereResolution);
      } catch (e) {}
      pop();
    }
    // P-orbital overlay
    else if (overlayCache.type === 'p') {
      const lobes = overlayCache.data.lobes || [];
      const lobeEntries = [];
      
      for (let li = 0; li < lobes.length; li++) {
        const L = lobes[li];
        const axialLen = Math.max(4, L.t95) * OVERLAY_SCALE;
        const axialOffset = 0;
        const cx = L.axisUnit[0] * (axialLen * 0.5 + axialOffset);
        const cy = L.axisUnit[1] * (axialLen * 0.5 + axialOffset);
        const cz = L.axisUnit[2] * (axialLen * 0.5 + axialOffset);
        const cam = worldToCameraSpace(cx, cy, cz);
        lobeEntries.push({ idx: li, depth: cam.z, L: L });
      }
      
      lobeEntries.sort((a, b) => a.depth - b.depth);
      
      for (let e of lobeEntries) {
        const L = e.L;
        const scaledAxial = Math.max(4, L.t95) * OVERLAY_SCALE;
        const scaledRadial = Math.max(0.01, L.r95) * OVERLAY_SCALE;
        
        push();
        drawLobeEllipsoidBase(L.axisUnit, scaledAxial, scaledRadial, DZ2_OVERLAY_COLOR, safeLobeAlpha, 0, true);
        pop();
      }
    }
    // Dz² overlay
    else if (overlayCache.type === 'dz2') {
      const d = overlayCache.data;
      
      if (d) {
        const lobeAxialPos = d.t80pos;
        const lobeAxialNeg = d.t80neg;
        const axialOffsetPos = d.axialOffsetPos || 0;
        const axialOffsetNeg = d.axialOffsetNeg || 0;
        const lobeRadial = d.lobeRadial;
        
        const entries = [];
        const cpos = [0, 0, (lobeAxialPos * 0.5 + axialOffsetPos)];
        const cneg = [0, 0, (-lobeAxialNeg * 0.5 + axialOffsetNeg)];
        const camPos = worldToCameraSpace(cpos[0], cpos[1], cpos[2]);
        const camNeg = worldToCameraSpace(cneg[0], cneg[1], cneg[2]);
        
        entries.push({
          depth: camPos.z,
          draw: () => drawLobeEllipsoid([0, 0, 1], lobeAxialPos, lobeRadial, DZ2_OVERLAY_COLOR, safeLobeAlpha, axialOffsetPos, true)
        });
        
        entries.push({
          depth: camNeg.z,
          draw: () => drawLobeEllipsoid([0, 0, -1], lobeAxialNeg, lobeRadial, DZ2_OVERLAY_COLOR, safeLobeAlpha, axialOffsetNeg, true)
        });
        
        entries.sort((a, b) => a.depth - b.depth);
        
        for (let ent of entries) {
          push();
          ent.draw();
          pop();
        }
        
        // Ring
        if (d.ring) {
          push();
          noStroke();
          
          if (overlayShader) {
            shader(overlayShader);
            overlayShader.setUniform('uLightDirection', [0.2, -0.4, 1.0]);
            overlayShader.setUniform('uBaseColor', [d.ring.color[0] / 255, d.ring.color[1] / 255, d.ring.color[2] / 255]);
            overlayShader.setUniform('uOpacity', safeRingAlpha / 255);
            overlayShader.setUniform('uAmbient', 0.25);
            overlayShader.setUniform('uDiffuse', 0.50);
            overlayShader.setUniform('uSpecular', 0.25);
            overlayShader.setUniform('uShininess', 48.0);
            overlayShader.setUniform('uRimPower', 3.0);
            overlayShader.setUniform('uRimIntensity', 0.35);
          } else {
            const shadedRing = shadedColorForAxis(d.ring.color, [0, 0, 1], safeRingAlpha);
            ambientMaterial(Math.round(shadedRing[0] * 0.9), Math.round(shadedRing[1] * 0.9), Math.round(shadedRing[2] * 0.9));
            specularMaterial(100, 100, 100);
            shininess(20);
          }
          
          try {
            fill(d.ring.color[0], d.ring.color[1], d.ring.color[2], safeRingAlpha);
          } catch (e) {}
          
          const segs = computeTorusSegments(d.ring.majorRadius, d.ring.tubeRadius);
          const uSegs = Math.max(48, Math.min(segs.uSegs, 512));
          const vSegs = Math.max(12, Math.min(segs.vSegs, 128));
          
          try {
            if (typeof torus === 'function') {
              torus(d.ring.majorRadius, d.ring.tubeRadius, uSegs, vSegs);
            } else {
              drawSmoothTorus(d.ring.majorRadius, d.ring.tubeRadius, uSegs, vSegs);
            }
          } catch (e) {
            try {
              drawSmoothTorus(d.ring.majorRadius, d.ring.tubeRadius, Math.min(120, uSegs), Math.min(48, vSegs));
            } catch (ee) {}
          }
          
          try {
            noFill();
          } catch (e) {}
          
          if (overlayShader) resetShader();
          pop();
        }
      }
    }
    // Other D-orbitals overlay
    else if (overlayCache.type === 'd') {
      const lobes = overlayCache.data.lobes || [];
      const entries = [];
      
      for (let li = 0; li < lobes.length; li++) {
        const L = lobes[li];
        const baseAxial = Math.max(0.01, L.axial);
        const axialLen = Math.max(4, baseAxial * OVERLAY_SCALE);
        const radialMajor = Math.max(0.01, (L.radialMajor || L.radial) * OVERLAY_SCALE);
        const radialMinor = Math.max(0.01, (L.radialMinor || L.radial) * OVERLAY_SCALE);
        const rotationAngle = L.radialAngle || 0;
        const axialOffsetBase = axialLen * D_OVERLAY_AXIAL_PUSH_MULT;
        const axialOffset = axialOffsetBase + (L.nearSideCompression || 0);
        
        const cx = L.axisUnit[0] * (axialLen * 0.5 + axialOffset);
        const cy = L.axisUnit[1] * (axialLen * 0.5 + axialOffset);
        const cz = L.axisUnit[2] * (axialLen * 0.5 + axialOffset);
        const cam = worldToCameraSpace(cx, cy, cz);
        
        entries.push({
          depth: cam.z,
          L: L,
          axialLen: axialLen,
          axialOffset: axialOffset,
          radialMajor: radialMajor,
          radialMinor: radialMinor,
          rotationAngle: rotationAngle
        });
      }
      
      entries.sort((a, b) => a.depth - b.depth);
      
      for (let e of entries) {
        push();
        drawLobeEllipsoidBase3(
          e.L.axisUnit,
          e.axialLen,
          e.radialMajor,
          e.radialMinor,
          e.rotationAngle,
          DZ2_OVERLAY_COLOR,
          ((overlayCache.data && overlayCache.data.alpha) ? overlayCache.data.alpha : DZ2_OVERLAY_ALPHA) * 0.5,
          e.axialOffset,
          true
        );
        pop();
      }
    }

    pop();
    setWebGLDepthMask(true);
    
    try {
      hint(ENABLE_DEPTH_TEST);
    } catch (e) {}
  }

  // Draw axis labels
  drawAxisLabelSprite(axisLen);
  pop();

  // Debug label positions
  if (DEBUG_LABEL && lastLabelScreenPositions) {
    push();
    resetMatrix();
    noStroke();
    fill(255, 0, 0);
    if (lastLabelScreenPositions.pX) ellipse(lastLabelScreenPositions.pX.x, lastLabelScreenPositions.pX.y, 6, 6);
    if (lastLabelScreenPositions.pY) ellipse(lastLabelScreenPositions.pY.x, lastLabelScreenPositions.pY.y, 6, 6);
    if (lastLabelScreenPositions.pZ) ellipse(lastLabelScreenPositions.pZ.x, lastLabelScreenPositions.pZ.y, 6, 6);
    if (lastLabelScreenPositions.origin) ellipse(lastLabelScreenPositions.origin.x, lastLabelScreenPositions.origin.y, 4, 4);
    pop();
  }

  // Progress indicator
  if (sampling) {
    if (progressDiv) {
      progressDiv.show();
      progressDiv.html(`Sampling: ${sampleCount} / ${sampleTarget} (${nf((sampleCount / max(1, sampleTarget)) * 100, 1, 1)}%)`);
    }
  } else {
    if (progressDiv) progressDiv.hide();
  }
}

// ============================================
// AXIS LABEL RENDERING
// ============================================

function drawAxisLabelSprite(axisLen) {
  const worldX = createVector(axisLen, 0, 0);
  const worldY = createVector(0, -axisLen, 0);
  const worldZ = createVector(0, 0, axisLen);
  
  lastLabelScreenPositions = {
    pX: worldToScreen(worldX.x, worldX.y, worldX.z),
    pY: worldToScreen(worldY.x, worldY.y, worldY.z),
    pZ: worldToScreen(worldZ.x, worldZ.y, worldZ.z),
    origin: worldToScreen(0, 0, 0) || { x: width * 0.5, y: height * 0.5 }
  };
  
  const labelPixelWidth = 72;
  const labelPixelHeight = 40;
  const invScale = 1.0 / max(0.0001, camZoom);
  
  noLights();
  
  try {
    hint(DISABLE_DEPTH_TEST);
  } catch (e) {}
  
  push();
  translate(worldX.x, worldX.y, worldX.z);
  rotateX(-rotX);
  rotateY(-rotY);
  scale(invScale);
  translate(12, -10, 0);
  noStroke();
  texture(lblXgfx);
  plane(labelPixelWidth, labelPixelHeight);
  pop();
  
  push();
  translate(worldY.x, worldY.y, worldY.z);
  rotateX(-rotX);
  rotateY(-rotY);
  scale(invScale);
  translate(-10, -14, 0);
  noStroke();
  texture(lblYgfx);
  plane(labelPixelWidth, labelPixelHeight);
  pop();
  
  push();
  translate(worldZ.x, worldZ.y, worldZ.z);
  rotateX(-rotX);
  rotateY(-rotY);
  scale(invScale);
  translate(12, -10, 0);
  noStroke();
  texture(lblZgfx);
  plane(labelPixelWidth, labelPixelHeight);
  pop();
  
  try {
    hint(ENABLE_DEPTH_TEST);
  } catch (e) {}
}

function worldToScreen(x, y, z) {
  try {
    const sx = screenX(x, y, z);
    const sy = screenY(x, y, z);
    const convX = sx + width * 0.5;
    const convY = sy + height * 0.5;
    
    if (!isFinite(convX) || !isFinite(convY)) return null;
    return { x: convX, y: convY };
  } catch (e) {
    return null;
  }
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
  
  const dist = Math.sqrt(rrx * rrx + rry * rry + rrz * rrz) || 1.0;
  let facing = (-rrz) / dist;
  if (!isFinite(facing)) facing = 0;
  facing = constrain(facing, 0, 1);
  
  return { x: rrx, y: rry, z: rrz, dist: dist, facing: facing };
}

// ============================================
// ORBITAL CREATION FROM UI
// ============================================

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
  
  if (isNaN(n) || n < 1) {
    n = 1;
    ui.nInput.value(n);
  }
  if (isNaN(l) || l < 0) {
    l = 0;
    ui.lInput.value(l);
  }
  if (isNaN(m)) {
    m = 0;
    ui.mInput.value(m);
  }
  if (isNaN(electronSize) || electronSize <= 0) {
    electronSize = 1.0;
    ui.electronSizeInput.value(electronSize);
  }
  if (isNaN(numElectrons) || numElectrons < 0) {
    numElectrons = 0;
    ui.numElectronsInput.value(numElectrons);
  }
  
  if (numElectrons > MAX_ELECTRONS) {
    numElectrons = MAX_ELECTRONS;
    try {
      ui.numElectronsInput.value(MAX_ELECTRONS);
    } catch (e) {}
    try {
      const span = select('#numElectronsMaxLabel');
      if (span) span.html('MAX');
    } catch (e) {}
  } else {
    try {
      const span = select('#numElectronsMaxLabel');
      if (span) span.html('');
    } catch (e) {}
  }
  
  if (l >= n) return;
  if (Math.abs(m) > l) return;
  
  const uiHash = `${n}|${l}|${m}|${electronSize}|${numElectrons}|${window.orbitalMode}`;
  if (uiHash === lastUIHash) return;
  lastUIHash = uiHash;
  
  if (numElectrons === 0) {
    positions = null;
    sizes = null;
    sampleCount = 0;
    sampleTarget = 0;
    sampling = false;
    overlayCache = null;
    positionsDisplay = null;
    displayCount = 0;
    alphasDisplay = null;
    innerOrbitals = [];
    return;
  }
  
  currentSamplingId++;
  const mySamplingId = currentSamplingId;
  overlayCache = null;

  const prevPositionsForTransition = positionsDisplay ? Float32Array.from(positionsDisplay)
    : (positions ? Float32Array.from(positions) : null);
  const prevCountForTransition = positionsDisplay ? displayCount : sampleCount;

  positions = new Float32Array(numElectrons * 3);
  sizes = new Float32Array(numElectrons);
  sampleCount = 0;
  sampleTarget = numElectrons;
  sampling = true;

  innerOrbitals = [];

  const estAxis = estimateAxisLenFromQuantum(n, l);
  fitViewToAxisLen(estAxis, false, false);

  setTimeout(() => {
    sampleOrbitalChunked(n, l, m, numElectrons, electronSize, mySamplingId, () => {
      try {
        if (mySamplingId !== currentSamplingId) return;
        sampling = false;
        
        const applyNearDoubling = (l === 2 && m === 0);
        const nearThresholdForCall = applyNearDoubling ? NEAR_THRESHOLD_ABS : null;
        const nearEqThresholdForCall = applyNearDoubling ? NEAR_THRESHOLD_EQ_ABS : null;
        pushElectronsOutward(GLOBAL_RADIAL_PUSH, EQ_RADIAL_PUSH, applyNearDoubling, NEAR_NUCLEAR_PUSH_MULT, nearThresholdForCall, nearEqThresholdForCall);
        
        const mainOrbital = new Orbital(n, l, m, numElectrons, electronSize);
        mainOrbital.positions = positions;
        mainOrbital.sizes = sizes;
        mainOrbital.sampleCount = sampleCount;
        
        if (window.orbitalMode === 'complete' && n > 1) {
          createAllInnerOrbitals(n, l, m, numElectrons, electronSize, mySamplingId);
        }
        
        fitViewToPoints(false, true);

        try {
          if (window.instantTransition) {
            if (positions && sampleCount > 0) {
              positionsDisplay = new Float32Array(sampleCount * 3);
              positionsDisplay.set(positions.subarray(0, sampleCount * 3));
              alphasDisplay = new Float32Array(sampleCount);
              for (let i = 0; i < sampleCount; i++) alphasDisplay[i] = 1.0;
              displayCount = sampleCount;
              displayUpdateCursor = 0;
              
              for (let orbital of innerOrbitals) {
                if (orbital.positions && orbital.sampleCount > 0) {
                  orbital.initDisplayBuffers(null, 0);
                }
              }
            } else {
              initDisplayBuffersAfterSampling(prevPositionsForTransition, prevCountForTransition, positions, sampleCount);
            }
          } else {
            initDisplayBuffersAfterSampling(prevPositionsForTransition, prevCountForTransition, positions, sampleCount);
          }
        } catch (e) {
          initDisplayBuffersAfterSampling(prevPositionsForTransition, prevCountForTransition, positions, sampleCount);
          console.warn('Instant transition fallback due to error', e);
        }

        if (overlayEnabled && window.orbitalMode === 'basic') {
          try {
            computeOverlay();
          } catch (err) {
            console.warn('computeOverlay error', err);
          }
        }
      } catch (err) {
        console.error('Error in createOrbitalFromUI onDone handler', { err: err && err.stack ? err.stack : err });
      }
    });
  }, 10);
}

function createAllInnerOrbitals(outerN, outerL, outerM, numElectrons, electronSize, samplingId) {
  const allOrbitals = getAllInnerOrbitalsAufbau(outerN, outerL, outerM);
  console.log(`🔬 Aufbau Mode: Creating ${allOrbitals.length} orbitals for (${outerN},${outerL},${outerM})`);
  
  const totalOrbitals = allOrbitals.length;
  const baseElectronCount = Math.max(800, Math.floor(numElectrons * 1.5 / totalOrbitals));
  
  for (let i = 0; i < allOrbitals.length; i++) {
    const { n, l, m } = allOrbitals[i];
    let innerElectronCount;
    const shellDistance = outerN - n;
    const isMainOrbital = (n === outerN && l === outerL && m === outerM);
    
    if (isMainOrbital) {
      innerElectronCount = Math.min(MAX_INNER_ELECTRONS, Math.floor(numElectrons * 0.25));
    } else {
      let scaleFactor;
      if (shellDistance === 0) scaleFactor = 1.2;
      else if (shellDistance === 1) scaleFactor = 1.4;
      else if (shellDistance === 2) scaleFactor = 1.6;
      else scaleFactor = 1.8;
      
      innerElectronCount = Math.floor(baseElectronCount * scaleFactor);
      if (n === 1) innerElectronCount = Math.floor(innerElectronCount * 2.0);
      else if (n === 2) innerElectronCount = Math.floor(innerElectronCount * 1.5);
    }
    
    innerElectronCount = Math.max(800, Math.min(innerElectronCount, MAX_INNER_ELECTRONS));
    
    if (innerElectronCount <= 0) continue;
    
    const orbital = new Orbital(n, l, m, innerElectronCount, electronSize);
    sampleOrbitalForObject(orbital, samplingId);
    innerOrbitals.push(orbital);
    
    const marker = isMainOrbital ? '⭐' : '  ';
    const orbitalName = getOrbitalLabel(n, l, m);
    const shellLabel = shellDistance === 0 ? 'SAME' : `-${shellDistance}`;
    console.log(`${marker}[${i + 1}/${totalOrbitals}] ${orbitalName.padEnd(8)} | ${String(innerElectronCount).padStart(5)} e⁻ | Shell: ${shellLabel} | RGB(${orbital.color.join(',')})`);
  }
  
  console.log(`✅ Created ${innerOrbitals.length} orbitals with improved distribution`);
  console.log(`📊 Total electrons: ${innerOrbitals.reduce((sum, o) => sum + o.electronCount, 0) + numElectrons}`);
}

function sampleOrbitalForObject(orbital, samplingId) {
  if (orbital.electronCount <= 0) return;
  
  const n = orbital.n, l = orbital.l, m = orbital.m;
  const numSamples = orbital.electronCount, electronSize = orbital.electronSize;
  
  orbital.positions = new Float32Array(numSamples * 3);
  orbital.sizes = new Float32Array(numSamples);
  orbital.sampleCount = 0;
  
  const k = Math.max(1, 2 * l + 3);
  const thetaScale = (n * a0) / 2.5;
  const radialScale = radialLScale(l) * orbital.distanceScale;
  const maxAngular = estimateMaxAngular(l, m, 500) * 1.2;
  const minR = NUCLEUS_RADIUS + ELECTRON_MIN_GAP;
  
  let sampleCount = 0, attempts = 0;
  const maxAttempts = ATTEMPTS_PER_CHUNK * 5;
  
  while (sampleCount < numSamples && attempts < maxAttempts) {
    if (samplingId !== currentSamplingId) return;
    attempts++;
    
    let sumExp = 0;
    for (let i = 0; i < k; i++) {
      let u = random();
      if (u <= 1e-12) u = 1e-12;
      sumExp += -Math.log(u);
    }
    
    let r = thetaScale * sumExp * radialScale;
    if (r < minR) continue;
    
    let accepted = false, thetaS = 0, phiS = 0;
    for (let aTry = 0; aTry < 10; aTry++) {
      const cosT = random(-1, 1);
      thetaS = acos(cosT);
      phiS = random(0, TWO_PI);
      const ang = angularProb(thetaS, phiS, l, m);
      if (random() < ang / maxAngular) {
        accepted = true;
        break;
      }
    }
    
    if (!accepted) continue;
    
    const x = r * sin(thetaS) * cos(phiS);
    const y = r * sin(thetaS) * sin(phiS);
    const z = r * cos(thetaS);
    
    const idx = sampleCount * 3;
    orbital.positions[idx] = x;
    orbital.positions[idx + 1] = y;
    orbital.positions[idx + 2] = z;
    orbital.sizes[sampleCount] = electronSize;
    sampleCount++;
  }
  
  if (sampleCount < numSamples) {
    const rMax = Math.max(1, n * n * a0 * 1.4);
    for (let i = sampleCount; i < numSamples; i++) {
      let rr = rMax * pow(random(), 1.0 / 3.0) * radialScale;
      if (rr < minR) rr = minR + (rMax - minR) * pow(random(), 1.0 / 3.0);
      const theta2 = acos(random(-1, 1));
      const phi2 = random(0, TWO_PI);
      
      const idx = i * 3;
      orbital.positions[idx] = rr * sin(theta2) * cos(phi2);
      orbital.positions[idx + 1] = rr * sin(theta2) * sin(phi2);
      orbital.positions[idx + 2] = rr * cos(theta2);
      orbital.sizes[i] = electronSize;
    }
    sampleCount = numSamples;
  }
  
  orbital.sampleCount = sampleCount;
  
  const globalFactor = GLOBAL_RADIAL_PUSH * 0.95;
  const EPS = 1e-6;
  
  for (let i = 0; i < sampleCount; i++) {
    const idx = i * 3;
    let x = orbital.positions[idx], y = orbital.positions[idx + 1], z = orbital.positions[idx + 2];
    const r3D = Math.sqrt(x * x + y * y + z * z);
    
    if (r3D <= EPS) {
      const ang = random(0, TWO_PI);
      const newR = Math.max(minR, 0.5 * globalFactor);
      orbital.positions[idx] = Math.cos(ang) * newR;
      orbital.positions[idx + 1] = Math.sin(ang) * newR;
      orbital.positions[idx + 2] = 0;
    } else {
      const newR3D = Math.max(minR, r3D * globalFactor);
      const s = newR3D / r3D;
      orbital.positions[idx] = x * s;
      orbital.positions[idx + 1] = y * s;
      orbital.positions[idx + 2] = z * s;
    }
  }
}

function sampleOrbitalChunked(n, l, m, numSamples, electronSize, samplingId, onDone) {
  if (!isFinite(numSamples) || numSamples <= 0) {
    safeCall(() => {
      onDone && onDone();
    }, { where: 'sampleOrbitalChunked early-return', samplingId, n, l, m, numSamples });
    return;
  }
  
  const k = Math.max(1, 2 * l + 3);
  const thetaScale = (n * a0) / 2.0;
  const radialScale = radialLScale(l) * ELECTRON_DISTANCE_MULTIPLIER;
  const maxAngular = estimateMaxAngular(l, m, 500) * 1.2;
  const minR = NUCLEUS_RADIUS + ELECTRON_MIN_GAP;
  
  function chunk() {
    if (samplingId !== currentSamplingId) return;
    
    const stopIndex = Math.min(numSamples, sampleCount + CHUNK_SAMPLES);
    let attemptsThisChunk = 0;
    const startCount = sampleCount;
    
    while (sampleCount < stopIndex && attemptsThisChunk < ATTEMPTS_PER_CHUNK) {
      if (samplingId !== currentSamplingId) return;
      attemptsThisChunk++;
      
      let sumExp = 0;
      for (let i = 0; i < k; i++) {
        let u = random();
        if (u <= 1e-12) u = 1e-12;
        sumExp += -Math.log(u);
      }
      
      let r = thetaScale * sumExp * radialScale;
      if (r < minR) continue;
      
      let accepted = false, thetaS = 0, phiS = 0;
      for (let aTry = 0; aTry < 20; aTry++) {
        const cosT = random(-1, 1);
        thetaS = acos(cosT);
        phiS = random(0, TWO_PI);
        const ang = angularProb(thetaS, phiS, l, m);
        if (random() < ang / maxAngular) {
          accepted = true;
          break;
        }
      }
      
      if (!accepted) continue;
      
      const x = r * sin(thetaS) * cos(phiS);
      const y = r * sin(thetaS) * sin(phiS);
      const z = r * cos(thetaS);
      
      const idx = sampleCount * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      sizes[sampleCount] = electronSize;
      sampleCount++;
    }
    
    if (sampleCount < numSamples) {
      if (attemptsThisChunk >= ATTEMPTS_PER_CHUNK && sampleCount === startCount) {
        const rMax = Math.max(1, n * n * a0 * 1.8);
        for (let i = sampleCount; i < numSamples; i++) {
          let rr = rMax * pow(random(), 1.0 / 3.0) * radialScale;
          if (rr < minR) rr = minR + (rMax - minR) * pow(random(), 1.0 / 3.0);
          const theta2 = acos(random(-1, 1));
          const phi2 = random(0, TWO_PI);
          
          const idx = i * 3;
          positions[idx] = rr * sin(theta2) * cos(phi2);
          positions[idx + 1] = rr * sin(theta2) * sin(phi2);
          positions[idx + 2] = rr * cos(theta2);
          sizes[i] = electronSize;
        }
        sampleCount = numSamples;
        safeCall(() => {
          onDone && onDone();
        }, { where: 'sampleOrbitalChunked fallback-fill', samplingId, n, l, m, numSamples });
        return;
      }
      
      if (samplingId !== currentSamplingId) return;
      
      if (attemptsThisChunk >= ATTEMPTS_PER_CHUNK) setTimeout(chunk, 10);
      else setTimeout(chunk, 0);
      return;
    }
    
    safeCall(() => {
      onDone && onDone();
    }, { where: 'sampleOrbitalChunked finish', samplingId, n, l, m, numSamples });
  }
  
  chunk();
}

// ============================================
// WAVEFUNCTION HELPERS
// ============================================

function estimateMaxAngular(l, m, trialCount = 400) {
  let maxVal = 1e-20;
  
  for (let i = 0; i < trialCount; i++) {
    const cosT = random(-1, 1);
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

// ============================================
// VIEW & CAMERA HELPERS
// ============================================

function computeAxisLength90() {
  if (!positions || sampleCount === 0) return 180;
  
  const n = sampleCount;
  const sampleCountMax = min(n, 50000);
  const step = Math.max(1, Math.floor(n / sampleCountMax));
  const arr = [];
  
  for (let i = 0; i < n; i += step) {
    const idx = i * 3;
    const r = sqrt(positions[idx] * positions[idx] + positions[idx + 1] * positions[idx + 1] + positions[idx + 2] * positions[idx + 2]);
    arr.push(r);
  }
  
  arr.sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(0.9 * arr.length) - 1);
  let r90 = arr[idx] || 0;
  r90 = max(r90, NUCLEUS_RADIUS);
  
  return max(r90 * 1.12, 120);
}

function computeAxisMax() {
  let maxR = NUCLEUS_RADIUS;
  
  if (positions && sampleCount > 0) {
    const n = sampleCount;
    const sampleCountMax = min(n, 100000);
    const step = Math.max(1, Math.floor(n / sampleCountMax));
    
    for (let i = 0; i < n; i += step) {
      const idx = i * 3;
      const r = sqrt(positions[idx] * positions[idx] + positions[idx + 1] * positions[idx + 1] + positions[idx + 2] * positions[idx + 2]);
      if (r > maxR) maxR = r;
    }
  }
  
  for (let orbital of innerOrbitals) {
    if (!orbital.positions || orbital.sampleCount <= 0) continue;
    
    const innerStep = Math.max(1, Math.floor(orbital.sampleCount / 10000));
    for (let i = 0; i < orbital.sampleCount; i += innerStep) {
      const idx = i * 3;
      const r = sqrt(
        orbital.positions[idx] * orbital.positions[idx] +
        orbital.positions[idx + 1] * orbital.positions[idx + 1] +
        orbital.positions[idx + 2] * orbital.positions[idx + 2]
      );
      if (r > maxR) maxR = r;
    }
  }
  
  return max(maxR * 1.02, 120);
}

function drawAxes(length) {
  strokeWeight(1);
  
  push();
  stroke(200, 80, 80);
  line(-length, 0, 0, length, 0, 0);
  pop();
  
  push();
  stroke(80, 200, 120);
  line(0, -length, 0, 0, length, 0);
  pop();
  
  push();
  stroke(100, 140, 240);
  line(0, 0, -length, 0, 0, length);
  pop();
}

function fitViewToAxisLen(axisLen, immediate = false, allowZoomIn = true) {
  if (!axisLen || axisLen <= 0) return;
  
  const halfScreen = Math.min(windowWidth, windowHeight) * 0.5;
  const targetZoom = constrain((halfScreen * VIEW_MARGIN) / axisLen, 0.01, 40.0);
  let newTarget = targetZoom;
  
  if (!allowZoomIn && newTarget > camZoomTarget) newTarget = camZoomTarget;
  
  if (immediate) {
    camZoom = newTarget;
    camZoomTarget = newTarget;
  } else {
    camZoomTarget = newTarget;
  }
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

// ============================================
// INPUT HANDLERS (OPTIMIZED FOR MOBILE)
// ============================================

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
    
    // ✅ Stop auto-rotate velocity when user starts dragging
    if (autoRotate) {
      rotYVelocity = 0;
    }
  }
}

function mouseReleased() {
  isDragging = false;
  rotYTarget = rotY;
}

function mouseDragged(event) {
  if (isDragging) {
    const dx = mouseX - lastMouseX;
    const dy = mouseY - lastMouseY;
    
    rotY += dx * 0.01;
    rotX += dy * 0.01;
    rotYTarget = rotY;
    
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
  return false;
}

function mouseWheel(event) {
  camZoom *= event.delta > 0 ? 0.95 : 1.05;
  camZoom = constrain(camZoom, 0.01, 40.0);
  camZoomTarget = camZoom;
  return false;
}

// ✅ TOUCH SUPPORT FOR MOBILE
function touchStarted(event) {
  if (!_eventIsOnCanvas(event)) return;
  
  if (touches.length === 1) {
    isDragging = true;
    lastMouseX = touches[0].x;
    lastMouseY = touches[0].y;
    
    // Stop auto-rotate velocity
    if (autoRotate) {
      rotYVelocity = 0;
    }
    return false;
  }
}

function touchMoved(event) {
  if (isDragging && touches.length === 1) {
    const dx = touches[0].x - lastMouseX;
    const dy = touches[0].y - lastMouseY;
    
    rotY += dx * 0.01;
    rotX += dy * 0.01;
    rotYTarget = rotY;
    
    lastMouseX = touches[0].x;
    lastMouseY = touches[0].y;
    return false;
  }
}

function touchEnded() {
  isDragging = false;
  rotYTarget = rotY;
  return false;
}

// ============================================
// VECTOR NORMALIZATION
// ============================================

function normalizeVec3(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1.0;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ============================================
// END OF SKETCH.JS
// ============================================

console.log('✅ Orbital 3D Simulator loaded successfully');
console.log('📱 Optimized for desktop & mobile performance');
console.log('🎨 Modern glassmorphism UI with smooth animations');
console.log('🔬 Ready for quantum visualization!');