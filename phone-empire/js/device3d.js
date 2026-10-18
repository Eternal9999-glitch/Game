'use strict';
// ============================================================================
//  3D device preview built with three.js. The model is rebuilt from the
//  spec on every change: body shape per form factor, material, color,
//  screen content per display tech, keypads, hinges, cameras and antenna.
//  Without WebGL/three.js the Phone Lab falls back to the 2D drawing.
// ============================================================================

const Device3D = {
  renderer: null, scene: null, camera: null, model: null, shadow: null, raf: 0,
  yaw: -0.5, pitch: 0.18, tYaw: -0.5, tPitch: 0.18, zoom: 1, idle: 0, spin: true,
  open: 1, tOpen: 1, spec: null, ev: null, dirty: false, radius: 8,
  failed: false,

  available() {
    if (this.failed || typeof THREE === 'undefined') return false;
    if (this.renderer) return true;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  },

  mount(container) {
    if (!this.available()) return false;
    try {
      if (!this.renderer) this.init();
    } catch (e) { this.failed = true; return false; }
    container.appendChild(this.renderer.domElement);
    this.container = container;
    this.resize();
    if (!this.ro) { this.ro = new ResizeObserver(() => this.resize()); }
    this.ro.disconnect(); this.ro.observe(container);
    if (!this.raf) this.loop(performance.now());
    return true;
  },

  init() {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.renderer = r;
    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0xe6eeff, 0x1a1e28, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.25); key.position.set(6, 9, 12); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fb8ff, 0.7); rim.position.set(-8, 4, -10); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe6cc, 0.35); fill.position.set(-6, -3, 8); scene.add(fill);
    // studio environment for reflections: a soft gradient with two light strips
    const env = document.createElement('canvas'); env.width = 512; env.height = 256;
    const g = env.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#dfe7f5'); grd.addColorStop(0.45, '#7d879b'); grd.addColorStop(0.55, '#3a4050'); grd.addColorStop(1, '#14161c');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(90, 40, 60, 90); g.fillRect(340, 30, 40, 110);
    const envTex = new THREE.CanvasTexture(env);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.encoding = THREE.sRGBEncoding;
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromEquirectangular(envTex).texture;
    envTex.dispose(); pm.dispose();
    // soft contact shadow
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sg = sc.getContext('2d');
    const rg = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    // controls
    const el = r.domElement;
    el.style.touchAction = 'none';
    let drag = null;
    el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); this.idle = 0; this.spin = false; });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      this.tYaw += (e.clientX - drag.x) * 0.012; this.tPitch = clamp(this.tPitch + (e.clientY - drag.y) * 0.008, -1.2, 1.2);
      drag = { x: e.clientX, y: e.clientY }; this.idle = 0;
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoom = clamp(this.zoom * (e.deltaY > 0 ? 1.08 : 0.93), 0.55, 1.8); }, { passive: false });
    el.addEventListener('dblclick', () => this.view('front'));
  },

  resize() {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth || 300, h = this.container.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  view(v) {
    const base = Math.round(this.tYaw / (Math.PI * 2)) * Math.PI * 2;
    this.spin = v === 'spin' ? !this.spin : false;
    if (v === 'front') { this.tYaw = base; this.tPitch = 0.05; }
    if (v === 'back') { this.tYaw = base + Math.PI; this.tPitch = 0.05; }
    if (v === 'side') { this.tYaw = base + Math.PI / 2; this.tPitch = 0.05; }
    if (v === 'open') this.tOpen = this.tOpen > 0.5 ? 0 : 1;
    this.idle = 0;
  },

  setSpec(spec, ev) {
    this.spec = JSON.parse(JSON.stringify(spec));
    this.ev = ev;
    this.dirty = true;
  },

  loop(ts) {
    const r = this.renderer;
    if (!r || !document.body.contains(r.domElement)) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(t => this.loop(t));
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    if (this.dirty) { this.dirty = false; this.rebuild(); }
    this.idle += dt;
    if (this.spin && this.idle > 1.5) this.tYaw += dt * 0.45;
    this.yaw += (this.tYaw - this.yaw) * Math.min(1, dt * 8);
    this.pitch += (this.tPitch - this.pitch) * Math.min(1, dt * 8);
    this.open += (this.tOpen - this.open) * Math.min(1, dt * 5);
    if (this.model) {
      this.model.rotation.set(this.pitch, this.yaw, 0);
      if (this.model.userData.animate) this.model.userData.animate(this.open);
    }
    const fit = Math.min(1, this.camera.aspect);           // tall viewports need more distance
    const d = this.radius / Math.sin((this.camera.fov / 2) * Math.PI / 180) * 0.92 / Math.sqrt(fit) * this.zoom;
    this.camera.position.set(0, this.radius * 0.08, d);
    this.camera.lookAt(0, 0, 0);
    r.render(this.scene, this.camera);
  },

  rebuild() {
    if (this.model) { this.scene.remove(this.model); disposeTree(this.model); }
    if (!this.spec || !this.ev) return;
    this.model = buildDeviceModel(this.spec, this.ev);
    this.scene.add(this.model);
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    this.radius = Math.max(size.x, size.y, size.z) * 0.62 + 0.5;
    this.shadow.scale.set(size.x * 1.6 + 2, size.y * 0.35 + 2, 1);
    this.shadow.position.set(0, -this.radius * 1.02, 0);
    this.shadow.scale.set(this.radius * 2.2, this.radius * 1.2, 1);
  },
};

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { for (const k of ['map', 'emissiveMap', 'roughnessMap']) if (m[k]) m[k].dispose(); m.dispose(); }
    }
  });
}

// ---- geometry helpers --------------------------------------------------------------------
function roundedRectShape(w, h, r) {
  r = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function slabGeo(w, h, d, r) {
  const bev = Math.min(d * 0.42, r * 0.9, 0.35);
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w - bev * 2, h - bev * 2, Math.max(0.01, r - bev)),
    { depth: Math.max(0.01, d - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 12 });
  geo.translate(0, 0, -(d - bev * 2) / 2);
  return geo;
}
// flat rounded rectangle with 0..1 UVs (for screens, keypads, glass backs)
function planeGeo(w, h, r) {
  const geo = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 12);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return geo;
}
function canvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}

// ---- materials ----------------------------------------------------------------------------
function bodyMaterial(mat, color) {
  const c = new THREE.Color(color);
  const silver = new THREE.Color('#c9ccd1');
  switch (mat) {
    case 'alu': return new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.85 });
    case 'glass': return new THREE.MeshStandardMaterial({ color: c.clone().lerp(silver, 0.25), roughness: 0.28, metalness: 0.9 });
    case 'steel': return new THREE.MeshStandardMaterial({ color: c.clone().lerp(silver, 0.55), roughness: 0.12, metalness: 1.0 });
    case 'ceramic': return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
    case 'ti': return new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#8b8f94'), 0.55), roughness: 0.42, metalness: 0.9 });
    default: return new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.02 });
  }
}
function backPanelMaterial(mat, color) {
  if (mat !== 'glass' && mat !== 'steel') return null;
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.1, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 });
}
const darkGlass = () => new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 });

// ---- 2D art drawn onto the screen and keypad -------------------------------------------------
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function drawScreen(spec, wPx, hPx, opts) {
  const cv = document.createElement('canvas');
  cv.width = wPx; cv.height = hPx;
  const g = cv.getContext('2d');
  const tech = spec.display.tech, name = (S && S.company ? S.company.split(' ')[0] : 'NIMBUS').toUpperCase();
  const u = Math.min(wPx, hPx) / 100;
  if (opts && opts.outer) {
    g.fillStyle = '#05070a'; g.fillRect(0, 0, wPx, hPx);
    g.fillStyle = tech === 'mono' ? '#9fb497' : '#9ecbff';
    g.font = `bold ${Math.round(hPx * 0.28)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('12:45', wPx / 2, hPx / 2);
    return cv;
  }
  if (tech === 'mono') {
    const grd = g.createLinearGradient(0, 0, 0, hPx);
    grd.addColorStop(0, '#b7c7a6'); grd.addColorStop(1, '#93a786');
    g.fillStyle = grd; g.fillRect(0, 0, wPx, hPx);
    g.fillStyle = '#1f2c1e';
    for (let i = 0; i < 4; i++) g.fillRect(4 * u + i * 4 * u, 14 * u - i * 3 * u, 2.6 * u, 3 * u + i * 3 * u);
    g.fillRect(wPx - 14 * u, 6 * u, 9 * u, 6 * u); g.fillStyle = '#b7c7a6'; g.fillRect(wPx - 13 * u, 7 * u, 3 * u, 4 * u); g.fillStyle = '#1f2c1e';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(16 * u)}px monospace`; g.fillText(name.slice(0, 9), wPx / 2, hPx * 0.42);
    g.font = `${Math.round(11 * u)}px monospace`; g.fillText('12:45', wPx / 2, hPx * 0.62);
    g.font = `bold ${Math.round(9 * u)}px monospace`; g.textAlign = 'left'; g.fillText('Menu', 4 * u, hPx - 7 * u);
    g.textAlign = 'right'; g.fillText('Names', wPx - 4 * u, hPx - 7 * u);
    // faint pixel grid
    g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let x = 0; x < wPx; x += Math.max(2, u * 1.6)) g.fillRect(x, 0, 1, hPx);
    return cv;
  }
  const seed = hashStr(spec.name || name);
  const hue = seed % 360;
  const sat = tech === 'cstn' ? 35 : tech === 'tft' ? 55 : 70;
  const grd = g.createLinearGradient(0, 0, wPx, hPx);
  grd.addColorStop(0, `hsl(${hue},${sat}%,${tech === 'cstn' ? 55 : 45}%)`);
  grd.addColorStop(1, `hsl(${(hue + 70) % 360},${sat}%,${tech === 'cstn' ? 35 : 18}%)`);
  g.fillStyle = grd; g.fillRect(0, 0, wPx, hPx);
  if (spec.display.touch === 'none' || isKeypad(formOf(spec))) {
    // feature phone home screen
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, wPx, 12 * u);
    g.fillStyle = '#fff'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(8 * u)}px sans-serif`; g.textAlign = 'left'; g.fillText('▮▮▮▯', 3 * u, 6 * u);
    g.textAlign = 'right'; g.fillText('▭', wPx - 3 * u, 6 * u);
    g.textAlign = 'center';
    g.font = `bold ${Math.round(22 * u)}px sans-serif`; g.fillText('12:45', wPx / 2, hPx * 0.4);
    g.font = `${Math.round(9 * u)}px sans-serif`; g.fillText(name, wPx / 2, hPx * 0.55);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, hPx - 14 * u, wPx, 14 * u);
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(8.5 * u)}px sans-serif`;
    g.textAlign = 'left'; g.fillText('Menu', 4 * u, hPx - 7 * u); g.textAlign = 'right'; g.fillText('Contacts', wPx - 4 * u, hPx - 7 * u);
    return cv;
  }
  // touch home screen: app grid + dock
  const cols = wPx > hPx ? 7 : spec.cat === 'tablet' || formOf(spec) === 'fold' ? 6 : 4;
  const cell = wPx / cols, icon = cell * 0.62;
  const rows = Math.floor((hPx * 0.72) / cell);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = `600 ${Math.round(cell * 0.18)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('9:41', wPx * 0.14, cell * 0.22);
  let k = seed;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    k = (Math.imul(k, 1103515245) + 12345) >>> 0;
    const x = c * cell + (cell - icon) / 2, y = cell * 0.5 + r * cell;
    g.fillStyle = `hsl(${k % 360},65%,${50 + (k >> 8) % 15}%)`;
    roundRect(g, x, y, icon, icon, icon * 0.24); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(g, cell * 0.2, hPx - cell * 1.15, wPx - cell * 0.4, cell * 0.95, cell * 0.3); g.fill();
  for (let c = 0; c < Math.min(cols, 5); c++) {
    k = (Math.imul(k, 1103515245) + 12345) >>> 0;
    const dc = Math.min(cols, 5), dcell = (wPx - cell * 0.4) / dc;
    g.fillStyle = `hsl(${k % 360},60%,55%)`;
    roundRect(g, cell * 0.2 + c * dcell + (dcell - icon) / 2, hPx - cell * 1.15 + (cell * 0.95 - icon) / 2, icon, icon, icon * 0.24); g.fill();
  }
  return cv;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function drawKeypad(kind, wPx, hPx, color, mono) {
  const cv = document.createElement('canvas');
  cv.width = wPx; cv.height = hPx;
  const g = cv.getContext('2d');
  const base = new THREE.Color(color);
  const lum = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
  g.fillStyle = color; g.fillRect(0, 0, wPx, hPx);
  const keyCol = lum > 0.6 ? '#f4f5f7' : '#2b2f38', text = lum > 0.6 ? '#333' : '#e9edf5';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'qwerty') {
    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    const kw = wPx / 10.6, kh = hPx / 4.6;
    rows.forEach((row, ri) => {
      const off = (wPx - row.length * kw) / 2;
      for (let i = 0; i < row.length; i++) {
        g.fillStyle = keyCol; roundRect(g, off + i * kw + kw * 0.08, ri * kh + kh * 0.3, kw * 0.84, kh * 0.8, kw * 0.25); g.fill();
        g.fillStyle = text; g.font = `bold ${Math.round(kh * 0.38)}px sans-serif`; g.fillText(row[i], off + i * kw + kw / 2, ri * kh + kh * 0.7);
      }
    });
    g.fillStyle = keyCol; roundRect(g, wPx * 0.25, 3 * kh + kh * 0.35, wPx * 0.5, kh * 0.75, kh * 0.3); g.fill();
    return cv;
  }
  // navigation cluster on top, then 3×4 number grid
  const navH = hPx * 0.28;
  g.fillStyle = keyCol;
  roundRect(g, wPx * 0.06, navH * 0.15, wPx * 0.24, navH * 0.4, navH * 0.2); g.fill();
  roundRect(g, wPx * 0.70, navH * 0.15, wPx * 0.24, navH * 0.4, navH * 0.2); g.fill();
  g.fillStyle = '#3fae5a'; roundRect(g, wPx * 0.06, navH * 0.6, wPx * 0.24, navH * 0.32, navH * 0.16); g.fill();
  g.fillStyle = '#d24b4b'; roundRect(g, wPx * 0.70, navH * 0.6, wPx * 0.24, navH * 0.32, navH * 0.16); g.fill();
  g.fillStyle = keyCol; g.beginPath(); g.arc(wPx / 2, navH * 0.52, navH * 0.42, 0, Math.PI * 2); g.fill();
  g.fillStyle = lum > 0.6 ? '#d9dce2' : '#1c1f26'; g.beginPath(); g.arc(wPx / 2, navH * 0.52, navH * 0.17, 0, Math.PI * 2); g.fill();
  const labels = [['1', ''], ['2', 'abc'], ['3', 'def'], ['4', 'ghi'], ['5', 'jkl'], ['6', 'mno'], ['7', 'pqrs'], ['8', 'tuv'], ['9', 'wxyz'], ['*', ''], ['0', '+'], ['#', '']];
  const gy = navH * 1.05, kw = wPx / 3, kh = (hPx - gy) / 4;
  labels.forEach(([n, l], i) => {
    const x = (i % 3) * kw, y = gy + Math.floor(i / 3) * kh;
    g.fillStyle = keyCol; roundRect(g, x + kw * 0.1, y + kh * 0.1, kw * 0.8, kh * 0.78, kh * 0.32); g.fill();
    g.fillStyle = mono ? text : text;
    g.font = `bold ${Math.round(kh * 0.4)}px sans-serif`; g.fillText(n, x + kw * 0.38, y + kh * 0.5);
    g.font = `${Math.round(kh * 0.22)}px sans-serif`; g.fillText(l, x + kw * 0.66, y + kh * 0.52);
  });
  return cv;
}
function drawLogo(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  const c = new THREE.Color(color), lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  g.fillStyle = lum > 0.55 ? 'rgba(20,24,32,0.55)' : 'rgba(255,255,255,0.6)';
  g.font = '800 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  return cv;
}

// ---- the model ------------------------------------------------------------------------------
function buildDeviceModel(spec, ev) {
  const IN = 2.54;                               // cm per inch – the scene is in cm
  const g = ev.geom, form = g.form;
  const W = g.w * IN, H = g.h * IN, T = Math.max(0.55, ev.thick / 10);
  const sw = g.sw * IN, sh = g.sh * IN;
  const root = new THREE.Group();
  const bodyMat = bodyMaterial(spec.body.mat, spec.color);
  const backMat = backPanelMaterial(spec.body.mat, spec.color);
  const touch = !isKeypad(form);
  const screenPx = (w, h) => [Math.round(clamp(w / Math.max(w, h) * 512, 64, 512)), Math.round(clamp(h / Math.max(w, h) * 512, 64, 512))];
  const screenMesh = (w, h, r, opts) => {
    const [px, py] = screenPx(w, h);
    const tex = canvasTex(drawScreen(spec, px, py, opts));
    const m = new THREE.Mesh(planeGeo(w, h, r), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, roughness: 0.12, metalness: 0.1 }));
    return m;
  };
  const keypadMesh = (w, h, kind) => {
    const px = 384, py = Math.round(384 * h / w);
    const tex = canvasTex(drawKeypad(kind, px, py, spec.color, spec.display.tech === 'mono'));
    return new THREE.Mesh(planeGeo(w, h, Math.min(w, h) * 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.05 }));
  };
  const lens = (r, depth) => {
    const grp = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.3, depth, 32), new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.25, metalness: 1 }));
    ring.rotation.x = Math.PI / 2;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth * 1.02, 32), new THREE.MeshPhysicalMaterial({ color: 0x0b1020, roughness: 0.05, metalness: 0.3, clearcoat: 1 }));
    glass.rotation.x = Math.PI / 2;
    grp.add(ring, glass);
    return grp;
  };
  const addBack = (grp, w, h, d, opts) => {
    // glass back panel, cameras and logo on the -z face
    const z = -d / 2;
    if (backMat) { const p = new THREE.Mesh(planeGeo(w * 0.94, h * 0.96, Math.min(w, h) * 0.12), backMat); p.position.z = z - 0.01; p.rotation.y = Math.PI; grp.add(p); }
    const cams = camerasList(spec.cams).filter(([k]) => k !== 'front');
    if (cams.length) {
      const r0 = clamp(Math.sqrt(SENSORS[spec.cams.main.sensor].area) * 0.07, 0.18, 0.55);
      const n = cams.length;
      const islandW = n > 2 ? r0 * 5.4 : r0 * 3, islandH = n > 1 ? r0 * 5.4 : r0 * 3;
      // seen from behind, +x is on the viewer's right... so the island goes at -x to sit top-left
      const ix = opts.camX != null ? opts.camX : (touch ? -(w / 2 - islandW / 2 - w * 0.08) : 0);
      const iy = opts.camY != null ? opts.camY : h / 2 - islandH / 2 - h * 0.06;
      if (touch && n > 1) {
        const isl = new THREE.Mesh(slabGeo(islandW, islandH, 0.18, islandW * 0.28), backMat || bodyMat);
        isl.position.set(-ix, iy, z - 0.05); grp.add(isl);
      }
      const spots = n === 1 ? [[0, 0]] : n === 2 ? [[0, 1.2], [0, -1.2]] : [[-1.2, 1.2], [1.2, 1.2], [-1.2, -1.2]];
      cams.forEach(([k], i) => {
        const L = lens(k === 'main' ? r0 : r0 * 0.8, 0.16);
        L.position.set(-ix + spots[i][0] * r0, iy + spots[i][1] * r0, z - 0.12);
        grp.add(L);
      });
      if (spec.cams.flash) {
        const fl = new THREE.Mesh(new THREE.CircleGeometry(r0 * 0.35, 20), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0x554422, roughness: 0.3 }));
        fl.position.set(-ix + islandW * 0.5 + r0 * 0.6, iy, z - 0.02); fl.rotation.y = Math.PI; grp.add(fl);
      }
    }
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.55, 4), Math.min(w * 0.55, 4) / 4), new THREE.MeshBasicMaterial({ map: canvasTex(drawLogo((S && S.company ? S.company.split(' ')[0] : 'NIMBUS').toUpperCase(), spec.color)), transparent: true }));
    logo.position.set(0, -h * (opts.logoY || 0.15), z - 0.02); logo.rotation.y = Math.PI;
    grp.add(logo);
  };
  const addAntenna = (grp, w, h, d) => {
    if (spec.body.antenna === 'internal') return;
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.6, 20), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6 }));
    a.position.set(w / 2 - 0.55, h / 2 + 0.7, -d * 0.1);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), a.material);
    tip.position.set(0, 0.8, 0); a.add(tip);
    grp.add(a);
  };
  const addButtons = (grp, w, h, d) => {
    const m = bodyMaterial(spec.body.mat === 'plastic' ? 'plastic' : 'alu', spec.color);
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, h * 0.07, d * 0.35), m);
      b.position.set(-w / 2 - 0.03, h * 0.25 - i * h * 0.1, 0); grp.add(b);
    }
  };
  const earpiece = (grp, y, z) => {
    const e = new THREE.Mesh(planeGeo(Math.min(1.2, W * 0.25), 0.16, 0.08), new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.7 }));
    e.position.set(0, y, z); grp.add(e);
  };

  if (form === 'flip' || form === 'fold') {
    const half = T / 2;
    const base = new THREE.Group(), lidPivot = new THREE.Group(), lid = new THREE.Group();
    if (form === 'flip') {
      const bh = H, hz = half / 2;
      const bm = new THREE.Mesh(slabGeo(W, bh, half, W * 0.16), bodyMat); bm.position.y = -bh / 2; base.add(bm);
      const kp = keypadMesh(W * 0.86, bh * 0.82, 'num'); kp.position.set(0, -bh * 0.52, hz + 0.01); base.add(kp);
      const lm = new THREE.Mesh(slabGeo(W, H, half, W * 0.16), bodyMat); lm.position.set(0, H / 2, -half / 2); lid.add(lm);
      const scr = screenMesh(sw, sh, 0.12); scr.position.set(0, H - 0.3 * IN - sh / 2, 0.01); lid.add(scr);
      earpiece(lid, H - 0.15 * IN, 0.01);
      if (spec.display.tech !== 'mono') { const os = screenMesh(W * 0.42, W * 0.3, 0.1, { outer: true }); os.position.set(0, H * 0.62, -half - 0.01); os.rotation.y = Math.PI; lid.add(os); }
      const lidBack = new THREE.Group(); lidBack.position.set(0, H / 2, -half / 2); lid.add(lidBack);
      addBack(lidBack, W, H, half, { camY: H * 0.08, logoY: 0.32 });
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(half * 0.5, half * 0.5, W * 0.9, 24), bodyMat);
      hinge.rotation.z = Math.PI / 2; hinge.position.set(0, 0, 0); base.add(hinge);
      lidPivot.position.set(0, 0, hz); lid.position.set(0, 0, 0);
      addAntenna(lid, W, H * 2, half);
      lidPivot.add(lid);
      root.add(base, lidPivot);
      root.userData.animate = k => { lidPivot.rotation.x = -(0.32 + (1 - k) * (Math.PI - 0.32)); root.position.y = (1 - k) * H / 2; };
    } else {
      // foldable: two halves side by side, folding around the vertical spine
      const hw = W, hz = half / 2;
      const left = new THREE.Mesh(slabGeo(hw, H, half, hw * 0.12), bodyMat); left.position.set(-hw / 2, 0, 0); base.add(left);
      const scrL = screenMesh(sw / 2 - 0.05, sh, 0.25); scrL.position.set(-hw / 2 + 0.02, 0, hz + 0.01); base.add(scrL);
      const rm = new THREE.Mesh(slabGeo(hw, H, half, hw * 0.12), bodyMat); rm.position.set(hw / 2, 0, 0); lid.add(rm);
      const scrR = screenMesh(sw / 2 - 0.05, sh, 0.25); scrR.position.set(hw / 2 - 0.02, 0, hz + 0.01); lid.add(scrR);
      const cover = screenMesh(hw * 0.9, H * 0.92, 0.35); cover.position.set(hw / 2, 0, -hz - 0.01); cover.rotation.y = Math.PI; lid.add(cover);
      const lb = new THREE.Group(); lb.position.set(-hw / 2, 0, 0); base.add(lb);
      addBack(lb, hw, H, half, {});
      lidPivot.position.z = hz; lid.position.z = -hz;      // hinge on the screen side: halves fold face to face
      lidPivot.add(lid);
      root.add(base, lidPivot);
      root.userData.animate = k => { lidPivot.rotation.y = -(1 - k) * Math.PI * 0.98; root.position.x = (1 - k) * hw / 2; };
    }
    return root;
  }

  if (form === 'slider') {
    const front = new THREE.Group(), back = new THREE.Group();
    const tf = T * 0.55, tb = T * 0.45;
    const fm = new THREE.Mesh(slabGeo(W, H, tf, W * 0.14), bodyMat); front.add(fm);
    const scr = screenMesh(sw, sh, 0.1); scr.position.set(0, H / 2 - 0.25 * IN - sh / 2, tf / 2 + 0.01); front.add(scr);
    earpiece(front, H / 2 - 0.12 * IN, tf / 2 + 0.01);
    const bm = new THREE.Mesh(slabGeo(W * 0.98, H * 0.98, tb, W * 0.14), new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.5 })); back.add(bm);
    const kp = keypadMesh(W * 0.86, H * 0.55, 'num'); kp.position.set(0, -H * 0.2, tb / 2 + 0.01); back.add(kp);
    front.position.z = tb / 2;                    // the two layers meet at z = (tb - tf) / 2
    back.position.z = -tf / 2;
    const bk = new THREE.Group(); back.add(bk);
    addBack(bk, W, H, tb, {});
    addAntenna(front, W, H, tf);
    addButtons(front, W, H, tf);
    root.add(front, back);
    root.userData.animate = k => { front.position.y = H * 0.36 * k; back.position.y = 0; root.position.y = -H * 0.18 * k; };
    return root;
  }

  // single slab: candybar, qwerty, touch, tablet
  const body = new THREE.Mesh(slabGeo(W, H, T, touch ? Math.min(W, H) * (spec.display.fullview ? 0.15 : 0.12) : W * 0.2), bodyMat);
  root.add(body);
  const zf = T / 2 + 0.005;
  if (touch) {
    const front = new THREE.Mesh(planeGeo(W * 0.985, H * 0.99, Math.min(W, H) * (spec.display.fullview ? 0.14 : 0.1)), darkGlass());
    front.position.z = zf; root.add(front);
    const scr = screenMesh(sw, sh, spec.display.fullview ? Math.min(sw, sh) * 0.1 : 0.05);
    scr.position.set(0, spec.display.fullview ? 0 : (H - sh) * 0.04, zf + 0.005); root.add(scr);
    if (spec.display.fullview) {
      if (spec.cams.front.on) { const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: 0x000000 })); dot.position.set(0, sh / 2 - 0.45, zf + 0.01); root.add(dot); }
    } else {
      earpiece(root, (sh / 2 + (H / 2 - sh / 2) * 0.55), zf + 0.01);
      if (spec.cat === 'phone' && (H - sh) / 2 > 0.9) {
        const hb = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0x5a6070 }));
        hb.position.set(0, -(sh / 2 + (H / 2 - sh / 2) * 0.5), zf + 0.01); root.add(hb);
      }
      if (spec.cams.front.on) { const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: 0x1a2440 })); dot.position.set(-W * 0.18, sh / 2 + (H / 2 - sh / 2) * 0.55, zf + 0.01); root.add(dot); }
    }
  } else {
    const topM = 0.4 * IN;
    const scrY = H / 2 - topM - sh / 2;
    const bezel = new THREE.Mesh(planeGeo(sw + 0.35, sh + 0.35, 0.18), new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.3, metalness: 0.2 }));
    bezel.position.set(0, scrY, zf); root.add(bezel);
    const scr = screenMesh(sw, sh, 0.06); scr.position.set(0, scrY, zf + 0.005); root.add(scr);
    earpiece(root, H / 2 - topM * 0.45, zf);
    const kh = g.keypadH * IN * 0.92;
    const kp = keypadMesh(W * 0.88, kh, form === 'qwerty' ? 'qwerty' : 'num');
    kp.position.set(0, -H / 2 + kh / 2 + 0.1 * IN, zf + 0.004); root.add(kp);
    addAntenna(root, W, H, T);
  }
  addButtons(root, W, H, T);
  addBack(root, W, H, T, {});
  if (spec.cat === 'tablet') root.rotation.z = 0;
  return root;
}
