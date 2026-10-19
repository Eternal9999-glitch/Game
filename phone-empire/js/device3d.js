'use strict';
// ============================================================================
//  3D device preview (three.js r128). The model is rebuilt from the spec and
//  its evaluation on every change: the body per form factor (car phone with
//  trunk box, bag phone, brick, bar, flip, slider, slate, foldable), real 3D
//  keys, the screen per display tech, and every layout element (ports,
//  buttons, grilles, cameras, logo…) at the position the player gave it.
//  Scene units are centimetres; the model's evaluation is in millimetres.
//  Without WebGL/three.js the Phone Lab falls back to a 2D drawing.
// ============================================================================

const MM = 0.1;   // cm per mm

const Device3D = {
  renderer: null, scene: null, camera: null, model: null, shadow: null, raf: 0,
  yaw: -0.5, pitch: 0.18, tYaw: -0.5, tPitch: 0.18, zoom: 1, idle: 0, spin: true,
  open: 1, tOpen: 1, spec: null, ev: null, dirty: false, radius: 8, failed: false, hl: null, hlGroup: null, clock: 0,

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
    try { if (!this.renderer) this.init(); } catch (e) { this.failed = true; return false; }
    container.appendChild(this.renderer.domElement);
    this.container = container;
    this.resize();
    if (!this.ro && typeof ResizeObserver !== 'undefined') this.ro = new ResizeObserver(() => this.resize());
    if (this.ro) { this.ro.disconnect(); this.ro.observe(container); }
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
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.5, 2000);
    scene.add(new THREE.HemisphereLight(0xe6eeff, 0x1a1e28, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(6, 9, 12); scene.add(key);
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
    rg.addColorStop(0, 'rgba(0,0,0,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);
    // orbit controls
    const el = r.domElement;
    el.style.touchAction = 'none';
    let drag = null;
    el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } this.idle = 0; this.spin = false; });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      this.tYaw += (e.clientX - drag.x) * 0.012; this.tPitch = clamp(this.tPitch + (e.clientY - drag.y) * 0.008, -1.45, 1.45);
      drag = { x: e.clientX, y: e.clientY }; this.idle = 0;
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('pointercancel', () => { drag = null; });
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoom = clamp(this.zoom * (e.deltaY > 0 ? 1.08 : 0.93), 0.45, 2.2); }, { passive: false });
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
    if (v === 'side') { this.tYaw = base - Math.PI / 2; this.tPitch = 0.05; }
    if (v === 'top') { this.tYaw = base; this.tPitch = 1.35; }
    if (v === 'open') this.tOpen = this.tOpen > 0.5 ? 0 : 1;
    this.idle = 0;
  },

  setSpec(spec, ev) {
    this.spec = JSON.parse(JSON.stringify(spec));
    this.ev = ev;
    this.dirty = true;
  },

  highlight(type) {
    if (type === this.hl) return;
    this.hl = type || null;
    this.applyHighlight();
  },

  applyHighlight() {
    if (this.hlGroup) {
      for (const m of this.hlGroup) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }
      this.hlGroup = null;
    }
    if (!this.hl || !this.model) return;
    this.hlGroup = [];
    for (const p of this.model.userData.places || []) {
      if (p.t !== this.hl) continue;
      const w = p.w + 0.12, h = p.h + 0.12;
      const pts = [new THREE.Vector3(-w / 2, -h / 2, 0), new THREE.Vector3(w / 2, -h / 2, 0), new THREE.Vector3(w / 2, h / 2, 0), new THREE.Vector3(-w / 2, h / 2, 0)];
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x6aa8ff, transparent: true, depthTest: false }));
      const fillM = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x6aa8ff, transparent: true, opacity: 0.25, depthTest: false, side: THREE.DoubleSide }));
      for (const m of [line, fillM]) {
        m.position.copy(p.pos).addScaledVector(p.n, 0.04);
        m.quaternion.copy(p.q);
        m.renderOrder = 999;
        p.parent.add(m);
        this.hlGroup.push(m);
      }
    }
  },

  loop(ts) {
    const r = this.renderer;
    if (!r || !document.body.contains(r.domElement)) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(t => this.loop(t));
    const dt = Math.min(0.05, (ts - (this.last || ts)) / 1000);
    this.last = ts;
    this.clock += dt;
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
    if (this.hlGroup) for (const m of this.hlGroup) m.material.opacity = (m.type === 'LineLoop' ? 0.7 : 0.18) + 0.3 * Math.sin(this.clock * 6);
    const fit = Math.min(1, this.camera.aspect);           // tall viewports need more distance
    const d = this.radius / Math.sin((this.camera.fov / 2) * Math.PI / 180) * 0.92 / Math.sqrt(fit) * this.zoom;
    this.camera.position.set(0, this.radius * 0.08, d);
    this.camera.lookAt(0, 0, 0);
    r.render(this.scene, this.camera);
  },

  rebuild() {
    if (this.hlGroup) this.hlGroup = null;
    if (this.model) { this.scene.remove(this.model); disposeTree(this.model); this.model = null; }
    if (!this.spec || !this.ev) return;
    try { this.model = buildDeviceModel(this.spec, this.ev); }
    catch (e) { console.error('3D model failed', e); return; }
    linearizeColors(this.model);
    this.scene.add(this.model);
    // frame the main device in its largest (open) pose; accessories (trunk box, bag) may spill a little
    const anim = this.model.userData.animate;
    if (anim) anim(1);
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model.userData.main || this.model);
    const size = box.getSize(new THREE.Vector3());
    const all = new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3());
    if (anim) anim(this.open);
    const rMain = Math.max(size.x, size.y, size.z) * 0.62 + 0.4;
    const rAll = Math.max(all.x, all.y, all.z) * 0.55;
    this.radius = Math.max(rMain, rAll * 0.7);
    this.shadow.position.set(0, -this.radius * 1.02, 0);
    this.shadow.scale.set(this.radius * 2.2, this.radius * 1.2, 1);
    this.applyHighlight();
  },
};

// colors are authored in sRGB; three r128 treats material colors as linear
function linearizeColors(obj) {
  const seen = new Set();
  obj.traverse(o => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (m.color) m.color.convertSRGBToLinear();
      if (m.emissive && !m.emissiveMap) m.emissive.convertSRGBToLinear();
    }
  });
}
function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { for (const k of ['map', 'emissiveMap', 'roughnessMap', 'alphaMap']) if (m[k]) m[k].dispose(); m.dispose(); }
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
// a rounded slab centered on the origin, thickness along z. edge: 'round' | 'flat' | 'chamfer'
function slabGeo(w, h, d, r, edge) {
  let bev, segs;
  if (edge === 'flat') { bev = Math.min(0.04, d * 0.1); segs = 1; }
  else if (edge === 'chamfer') { bev = Math.min(d * 0.22, r * 0.8, 0.18); segs = 1; }
  else { bev = Math.min(d * 0.42, r * 0.9, 0.4); segs = 4; }
  bev = Math.max(0.005, Math.min(bev, w * 0.2, h * 0.2));
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w - bev * 2, h - bev * 2, Math.max(0.01, r - bev)),
    { depth: Math.max(0.01, d - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: segs, curveSegments: 12 });
  geo.translate(0, 0, -(d - bev * 2) / 2);
  return geo;
}
// flat rounded rectangle with 0..1 UVs (screens, keypads, glass)
function planeGeo(w, h, r) {
  const geo = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 10);
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
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(4, Math.round(w)); c.height = Math.max(4, Math.round(h)); return c; }
function roundRect(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const lum = c => { const k = new THREE.Color(c); return k.r * 0.3 + k.g * 0.59 + k.b * 0.11; };
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const brandText = spec => ((spec.style && spec.style.logo) || (typeof S !== 'undefined' && S && S.company ? S.company.split(' ')[0] : 'NIMBUS')).toUpperCase().slice(0, 12);

// ---- materials ----------------------------------------------------------------------------
const GLASS_BACKS = { glass: 1, steel: 1, ceramic: 1, ti: 1 };
function bodyMaterial(mat, color, finish) {
  const c = new THREE.Color(color);
  const silver = new THREE.Color('#c9ccd1');
  const fr = (FINISHES[finish] || FINISHES.gloss).rough;
  switch (mat) {
    case 'alu': return new THREE.MeshStandardMaterial({ color: c, roughness: finish === 'gloss' ? 0.28 : fr, metalness: 0.85 });
    case 'mg': return new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#9aa0a8'), 0.3), roughness: Math.max(0.35, fr), metalness: 0.75 });
    case 'glass': return new THREE.MeshStandardMaterial({ color: c.clone().lerp(silver, 0.35), roughness: 0.25, metalness: 0.9 });
    case 'steel': return new THREE.MeshStandardMaterial({ color: c.clone().lerp(silver, 0.6), roughness: 0.1, metalness: 1.0 });
    case 'ceramic': return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
    case 'ti': return new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#8b8f94'), 0.6), roughness: 0.4, metalness: 0.9 });
    default: return new THREE.MeshStandardMaterial({ color: c, roughness: finish === 'matte' ? 0.85 : finish === 'gloss' ? 0.32 : fr, metalness: 0.02 });
  }
}
function backPanelMaterial(mat, color, finish) {
  if (!GLASS_BACKS[mat] || mat === 'ceramic') return null;
  const frosted = finish === 'frosted' || finish === 'matte';
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: frosted ? 0.5 : 0.08, metalness: 0.05, clearcoat: frosted ? 0.3 : 1, clearcoatRoughness: frosted ? 0.4 : 0.03 });
}
const darkGlass = () => new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 });
const holeMat = () => new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.9, metalness: 0 });
function brushedMap() {
  const cv = makeCanvas(256, 256), g = cv.getContext('2d');
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const y = Math.random() * 256, a = 0.15 + Math.random() * 0.35; g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${a * 0.25})`; g.fillRect(0, y, 256, 0.6 + Math.random()); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  return t;
}

// ---- 2D art on screens, keys and grilles ------------------------------------------------------
const SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };
function drawSeg(g, x, y, w, h, ch, on, off) {
  const t = Math.max(1, w * 0.16), segs = SEG7[ch] || '';
  const P = {
    a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, y + h / 2 - t / 2, w - 2 * t, t],
    f: [x, y + t, t, h / 2 - t], b: [x + w - t, y + t, t, h / 2 - t], e: [x, y + h / 2, t, h / 2 - t], c: [x + w - t, y + h / 2, t, h / 2 - t],
  };
  for (const k of 'abcdefg') {
    g.fillStyle = segs.includes(k) ? on : off;
    const [px, py, pw, ph] = P[k];
    roundRect(g, px, py, pw, ph, t / 2); g.fill();
  }
}
function drawScreen(kind, spec, wPx, hPx, extra) {
  const cv = makeCanvas(wPx, hPx), g = cv.getContext('2d');
  const W = cv.width, H = cv.height, u = Math.min(W, H) / 100;
  const name = brandText(spec);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'plate') {
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#c9cdd3'); grd.addColorStop(0.5, '#9ea4ad'); grd.addColorStop(1, '#c4c8ce');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = '#23262c'; g.font = `800 ${Math.round(H * 0.32)}px sans-serif`; g.fillText(name, W / 2, H * 0.42);
    g.font = `600 ${Math.round(H * 0.17)}px sans-serif`; g.fillText('MOBILE TELEPHONE', W / 2, H * 0.76);
    return cv;
  }
  if (kind === 'led' || kind === 'lcdseg') {
    const led = kind === 'led';
    g.fillStyle = led ? '#120607' : '#9aa68a'; g.fillRect(0, 0, W, H);
    if (!led) { const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = grd; g.fillRect(0, 0, W, H); }
    const digits = '5550123'.split('');
    const n = clamp(extra && extra.chars ? extra.chars : 7, 4, 10);
    const str = digits.concat(['-', '4', '2']).slice(0, n);
    const dw = W / (n + 1), dh = Math.min(H * 0.7, dw * 1.7);
    str.forEach((ch, i) => drawSeg(g, dw * 0.5 + i * dw + dw * 0.12, (H - dh) / 2, dw * 0.72, dh, ch, led ? '#ff3b2f' : '#1c2419', led ? 'rgba(255,40,30,0.07)' : 'rgba(20,30,20,0.06)'));
    if (led) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,60,40,0.06)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
    return cv;
  }
  if (kind === 'dot' || kind === 'outer') {
    const bl = !extra || extra.backlit !== false;
    g.fillStyle = kind === 'outer' ? '#0a0d10' : bl ? '#b7c9a0' : '#a3ad94'; g.fillRect(0, 0, W, H);
    if (kind === 'outer') { g.fillStyle = '#9ecbff'; g.font = `bold ${Math.round(H * 0.32)}px monospace`; g.fillText('12:45', W / 2, H / 2); return cv; }
    g.fillStyle = '#1f2c1e';
    for (let i = 0; i < 4; i++) g.fillRect(4 * u + i * 4 * u, 14 * u - i * 3 * u, 2.6 * u, 3 * u + i * 3 * u);
    g.fillRect(W - 14 * u, 6 * u, 9 * u, 6 * u); g.fillStyle = bl ? '#b7c9a0' : '#a3ad94'; g.fillRect(W - 13 * u, 7 * u, 3 * u, 4 * u); g.fillStyle = '#1f2c1e';
    g.font = `bold ${Math.round(15 * u)}px monospace`; g.fillText(name.slice(0, 9), W / 2, H * 0.42);
    g.font = `${Math.round(11 * u)}px monospace`; g.fillText('12:45', W / 2, H * 0.62);
    g.font = `bold ${Math.round(9 * u)}px monospace`; g.textAlign = 'left'; g.fillText('Menu', 4 * u, H - 7 * u);
    g.textAlign = 'right'; g.fillText('Names', W - 4 * u, H - 7 * u);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    const px = Math.max(2, u * 1.6);
    for (let x = 0; x < W; x += px) g.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += px) g.fillRect(0, y, W, 1);
    return cv;
  }
  const seed = hashStr(spec.name || name);
  const hue = seed % 360;
  const dim = extra && extra.cstn;
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, `hsl(${hue},${dim ? 35 : 65}%,${dim ? 52 : 46}%)`);
  grd.addColorStop(1, `hsl(${(hue + 70) % 360},${dim ? 35 : 65}%,${dim ? 30 : 16}%)`);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  if (kind === 'feature') {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, 12 * u);
    g.fillStyle = '#fff';
    g.font = `bold ${Math.round(8 * u)}px sans-serif`; g.textAlign = 'left'; g.fillText('▮▮▮▯', 3 * u, 6 * u);
    g.textAlign = 'right'; g.fillText('▭', W - 3 * u, 6 * u);
    g.textAlign = 'center';
    g.font = `bold ${Math.round(22 * u)}px sans-serif`; g.fillText('12:45', W / 2, H * 0.4);
    g.font = `${Math.round(9 * u)}px sans-serif`; g.fillText(name, W / 2, H * 0.56);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, H - 14 * u, W, 14 * u);
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(8.5 * u)}px sans-serif`;
    g.textAlign = 'left'; g.fillText('Menu', 4 * u, H - 7 * u); g.textAlign = 'right'; g.fillText('Contacts', W - 4 * u, H - 7 * u);
    return cv;
  }
  // touch home screen: status bar, app grid, dock
  const cols = W > H * 1.1 ? 7 : W > H * 0.75 ? 6 : 4;
  const cell = W / cols, icon = cell * 0.6;
  const top = extra && extra.topInset ? extra.topInset * H : cell * 0.45;
  const rows = Math.max(1, Math.floor((H - top - cell * 1.6) / (cell * 1.05)));
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = `600 ${Math.round(cell * 0.17)}px sans-serif`;
  g.fillText('9:41', W * 0.14, top * 0.5);
  g.textAlign = 'right'; g.fillText('▮▮▮ ▭', W * 0.95, top * 0.5); g.textAlign = 'center';
  let k = seed;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    k = (Math.imul(k, 1103515245) + 12345) >>> 0;
    const x = c * cell + (cell - icon) / 2, y = top + cell * 0.2 + r * cell * 1.05;
    g.fillStyle = `hsl(${k % 360},65%,${50 + (k >> 8) % 15}%)`;
    roundRect(g, x, y, icon, icon, icon * 0.24); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(g, cell * 0.2, H - cell * 1.2, W - cell * 0.4, cell * 0.95, cell * 0.3); g.fill();
  const dc = Math.min(cols, 5), dcell = (W - cell * 0.4) / dc;
  for (let c = 0; c < dc; c++) {
    k = (Math.imul(k, 1103515245) + 12345) >>> 0;
    g.fillStyle = `hsl(${k % 360},60%,55%)`;
    roundRect(g, cell * 0.2 + c * dcell + (dcell - icon) / 2, H - cell * 1.2 + (cell * 0.95 - icon) / 2, icon, icon, icon * 0.24); g.fill();
  }
  if (extra && extra.notch) {
    const nw = extra.notch * W;
    g.fillStyle = '#000'; roundRect(g, (W - nw) / 2, -nw * 0.2, nw, nw * 0.34, nw * 0.12); g.fill();
  }
  return cv;
}
function screenKind(dp, disp, touch) {
  if (!dp || dp.emit === 'none') return 'plate';
  if (dp.emit === 'led') return 'led';
  if (dp.matrix === 'segment') return 'lcdseg';
  if (!disp.color) return 'dot';
  return touch ? 'touch' : 'feature';
}
// grille: a grid of holes on transparent background
function grilleTex(wMm, hMm, pitchMm, holeMm) {
  const s = 12;
  const cv = makeCanvas(Math.min(512, wMm * s), Math.min(512, hMm * s)), g = cv.getContext('2d');
  const px = cv.width / wMm;
  g.fillStyle = '#06070a';
  const p = pitchMm * px, r = Math.max(1, holeMm * px / 2);
  let row = 0;
  for (let y = r + 1; y < cv.height - r; y += p * 0.87, row++) {
    for (let x = r + 1 + (row % 2 ? p / 2 : 0); x < cv.width - r; x += p) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }
  return canvasTex(cv);
}
function labelAtlas(labels, color) {
  const n = Math.ceil(Math.sqrt(labels.length)), cs = 64;
  const cv = makeCanvas(n * cs, n * cs), g = cv.getContext('2d');
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  labels.forEach((l, i) => {
    const x = (i % n) * cs, y = Math.floor(i / n) * cs;
    g.font = `bold ${l.length > 2 ? 18 : l.length > 1 ? 24 : 34}px sans-serif`;
    g.fillText(l, x + cs / 2, y + cs / 2 + 2);
  });
  return { tex: canvasTex(cv), n };
}
function drawLogo(text, color) {
  const cv = makeCanvas(256, 64), g = cv.getContext('2d');
  g.fillStyle = lum(color) > 0.55 ? 'rgba(20,24,32,0.6)' : 'rgba(255,255,255,0.65)';
  g.font = '800 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  return cv;
}

// ---- face frames: where (u, v) on a face sits on a slab centered in its parent ------------------
// returns {pos, n, q} for a body of size W×H×T (cm) centered at `c`
const FACE_AXES = {
  front: [[1, 0, 0], [0, 0, 1]], back: [[-1, 0, 0], [0, 0, -1]], top: [[1, 0, 0], [0, 1, 0]], bottom: [[1, 0, 0], [0, -1, 0]],
  left: [[0, 1, 0], [-1, 0, 0]], right: [[0, 1, 0], [1, 0, 0]],
};
function faceFrame(face, W, H, T, c) {
  const [U, N] = FACE_AXES[face].map(a => new THREE.Vector3(...a));
  const V = new THREE.Vector3().crossVectors(N, U);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(U, V, N));
  c = c || new THREE.Vector3();
  return (u, v) => {
    let p;
    switch (face) {
      case 'front': p = [(u - 0.5) * W, (v - 0.5) * H, T / 2]; break;
      case 'back': p = [(0.5 - u) * W, (v - 0.5) * H, -T / 2]; break;
      case 'top': p = [(u - 0.5) * W, H / 2, (v - 0.5) * T]; break;
      case 'bottom': p = [(u - 0.5) * W, -H / 2, (v - 0.5) * T]; break;
      case 'left': p = [-W / 2, (u - 0.5) * H, (v - 0.5) * T]; break;
      default: p = [W / 2, (u - 0.5) * H, (v - 0.5) * T];
    }
    return { pos: new THREE.Vector3(...p).add(c), n: N.clone(), q: q.clone() };
  };
}

// ---- the model ------------------------------------------------------------------------------
// The viewer rotates the outer group; open/close animations move the inner one.
function buildDeviceModel(spec, ev) {
  const inner = buildDeviceInner(spec, ev);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.userData = inner.userData;
  return outer;
}
function buildDeviceInner(spec, ev) {
  const g = ev.geom, form = g.form;
  const W = g.W * MM, H = g.H * MM, T = Math.max(0.5, g.T * MM);
  const dp = partParams(spec.display), disp = ev.parts.disp || {};
  const touch = !isKeypadForm(form) && form !== 'car' && form !== 'bag';
  const style = spec.style || {};
  const fin = spec.body.finish || 'gloss';
  const root = new THREE.Group();
  root.userData.places = [];
  const bodyMat = bodyMaterial(spec.body.mat, spec.color, fin);
  if (fin === 'brushed' && /alu|mg|ti/.test(spec.body.mat)) { bodyMat.roughnessMap = brushedMap(); }
  const backMat = backPanelMaterial(spec.body.mat, spec.color, fin);
  // accent: buttons, camera island and (optionally) keys in a second color
  const accent = style.accent || null, keyTone = style.keyTone || 'auto';
  const keyLight = keyTone === 'light' ? true : keyTone === 'dark' ? false : keyTone === 'accent' && accent ? lum(accent) > 0.55 : lum(spec.color) > 0.55;
  const keyMat = new THREE.MeshStandardMaterial({ color: keyTone === 'accent' && accent ? accent : keyLight ? 0xeef0f3 : 0x2b2f38, roughness: 0.42, metalness: 0.05 });
  const btnMat = bodyMaterial(spec.body.mat === 'plastic' ? 'plastic' : 'alu', accent || spec.color, 'gloss');
  const frontWhite = style.front === 'white';
  const frontGlass = () => frontWhite ? new THREE.MeshPhysicalMaterial({ color: 0xeceef2, roughness: 0.08, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 }) : darkGlass();
  const cornerR = (w, h) => lerp(Math.min(w, h) * 0.05, Math.min(w, h) * 0.24, clamp(style.radius == null ? 0.5 : style.radius, 0, 1));
  const lay = ev.lay || [];
  const sizeOf = el => layoutSize(el, spec, g).map(v => v * MM);

  // ---------- generic builders ----------
  const slab = (w, h, d, mat, r) => new THREE.Mesh(slabGeo(w, h, d, r == null ? cornerR(w, h) : r, style.edge || 'round'), mat);
  const screenMesh = (w, h, r, kind, extra) => {
    const ar = w / h;
    const px = ar >= 1 ? [512, 512 / ar] : [512 * ar, 512];
    const tex = canvasTex(drawScreen(kind, spec, Math.max(48, px[0]), Math.max(48, px[1]), extra));
    const emissive = kind !== 'plate' && kind !== 'lcdseg' && !(kind === 'dot' && extra && extra.backlit === false);
    const m = new THREE.MeshStandardMaterial(emissive ? { color: 0x000000, emissive: 0xffffff, emissiveMap: tex, roughness: 0.15, metalness: 0.1 }
      : { map: tex, roughness: 0.5, metalness: kind === 'plate' ? 0.6 : 0.05 });
    return new THREE.Mesh(planeGeo(w, h, r), m);
  };
  const place = (parent, frame, el, obj, w, h) => {
    const f = frame(el.u, el.v);
    obj.position.copy(f.pos);
    obj.quaternion.copy(f.q);
    parent.add(obj);
    root.userData.places.push({ t: el.t, parent, pos: f.pos.clone(), q: f.q.clone(), n: f.n.clone(), w, h });
    return obj;
  };
  // one layout element as a small object in its local frame (plane facing +z)
  const elementObj = el => {
    const [w, h] = sizeOf(el);
    const grp = new THREE.Group();
    const add = (geo, mat, z) => { const m = new THREE.Mesh(geo, mat); m.position.z = z == null ? 0.006 : z; grp.add(m); return m; };
    switch (el.t) {
      case 'earpiece': case 'speaker': case 'speaker2': {
        if (el.t === 'earpiece' && touch) add(planeGeo(w, Math.max(0.08, h), Math.min(w, h) / 2), holeMat());
        else if (el.f === 'front' || el.f === 'back') add(planeGeo(w, h, Math.min(w, h) * 0.3), new THREE.MeshBasicMaterial({ map: grilleTex(w / MM, h / MM, 1.1, 0.6), transparent: true }));
        else add(planeGeo(w, h, Math.min(w, h) * 0.45), new THREE.MeshBasicMaterial({ map: grilleTex(w / MM, h / MM, 1.4, 0.8), transparent: true }));
        break;
      }
      case 'mic': add(new THREE.CircleGeometry(Math.max(0.035, w * 0.3), 14), holeMat()); break;
      case 'port': case 'jack': case 'sim': case 'sd': {
        const p = spec.port;
        if (el.t === 'port' && p === 'cord') {
          const b = add(new THREE.CylinderGeometry(w * 0.45, w * 0.5, 0.25, 18), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.7 }), 0.12);
          b.rotation.x = Math.PI / 2;
          break;
        }
        if (el.t === 'port' && p === 'none') break;
        if (el.t === 'jack' || (el.t === 'port' && p === 'barrel')) {
          add(new THREE.RingGeometry(w * 0.32, w * 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x9ea3ab, roughness: 0.3, metalness: 0.9 }), 0.007);
          add(new THREE.CircleGeometry(w * 0.33, 20), holeMat());
          break;
        }
        if (el.t === 'sim' && el.f === 'back') {
          // battery door outline
          const ln = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => new THREE.Vector3(x, y, 0.008))),
            new THREE.LineBasicMaterial({ color: keyLight ? 0x777777 : 0x0d0f13, transparent: true, opacity: 0.6 }));
          grp.add(ln);
          break;
        }
        add(planeGeo(w, h, Math.min(w, h) * (el.t === 'port' && /usbc|slim/.test(p) ? 0.5 : 0.25)), holeMat());
        if (el.t === 'port' && /usbc|microusb|miniusb/.test(p)) add(planeGeo(w * 0.62, h * 0.3, h * 0.12), new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.5 }), 0.009);
        if (el.t === 'sim' || el.t === 'sd') add(new THREE.CircleGeometry(Math.min(0.04, h * 0.3), 10), new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.8, roughness: 0.3 }), 0.009).position.x = w * 0.38;
        break;
      }
      case 'power': case 'volume': case 'camkey': case 'action': {
        const b = add(slabGeo(w, h, 0.07, Math.min(w, h) * 0.45, 'round'), el.t === 'action' ? new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4 }) : btnMat, 0.03);
        b.userData.btn = true;
        if (el.t === 'volume') add(planeGeo(0.04, h * 0.7, 0.01), holeMat(), 0.067);
        break;
      }
      case 'fcam': {
        add(new THREE.CircleGeometry(Math.max(0.12, w * 0.4), 24), new THREE.MeshStandardMaterial({ color: 0x0a0f1d, roughness: 0.1, metalness: 0.4 }), 0.012);
        add(new THREE.CircleGeometry(Math.max(0.05, w * 0.16), 16), new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.05 }), 0.014);
        break;
      }
      case 'flash': {
        add(new THREE.CircleGeometry(Math.max(0.12, w * 0.45), 20), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0x332a10, roughness: 0.3 }), 0.01);
        if (spec.flash === 'dual' || spec.flash === 'xenon') add(new THREE.CircleGeometry(Math.max(0.05, w * 0.2), 16), new THREE.MeshStandardMaterial({ color: 0xffd28a, roughness: 0.3 }), 0.012);
        break;
      }
      case 'fp': {
        if (el.f === 'front') add(planeGeo(w, h, Math.min(w, h) / 2), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.4, metalness: 0.3 }), 0.008);
        else {
          add(new THREE.RingGeometry(w * 0.38, w * 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x9ea3ab, metalness: 0.9, roughness: 0.25 }), 0.008);
          add(new THREE.CircleGeometry(w * 0.38, 32), new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.color).multiplyScalar(0.7), roughness: 0.6 }), 0.007);
        }
        break;
      }
      case 'logo': {
        add(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: canvasTex(drawLogo(brandText(spec), spec.color)), transparent: true }), 0.008);
        break;
      }
      case 'led': add(new THREE.CircleGeometry(Math.max(0.05, w * 0.4), 12), new THREE.MeshStandardMaterial({ color: 0x113322, emissive: 0x22ff88, emissiveIntensity: 0.6 }), 0.01); break;
      case 'ir': add(planeGeo(w, h, Math.min(w, h) * 0.3), new THREE.MeshPhysicalMaterial({ color: 0x3a0508, roughness: 0.1, clearcoat: 1 }), 0.01); break;
      case 'lanyard': {
        const tr = add(new THREE.TorusGeometry(w * 0.32, w * 0.09, 8, 20), btnMat, 0.0);
        tr.rotation.x = Math.PI / 2;
        break;
      }
      case 'stylus': {
        add(new THREE.CircleGeometry(w * 0.42, 18), new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.4 }), 0.012);
        add(new THREE.CircleGeometry(w * 0.15, 12), new THREE.MeshStandardMaterial({ color: 0x9ea3ab, metalness: 0.9, roughness: 0.3 }), 0.015);
        break;
      }
      case 'antenna': {
        const len = Math.max(1.2, ((ev.parts.radio && ev.parts.radio.antLen) || 32) * MM * (ev.parts.radio && ev.parts.radio.antLen > 100 ? 0.75 : 1));
        const rr = Math.max(0.16, w * 0.5);
        const am = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.55 });
        const a = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.6, rr, len, 20), am);
        a.rotation.x = Math.PI / 2; a.position.z = len / 2; grp.add(a);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(rr * 0.85, 16, 12), am);
        tip.position.z = len; grp.add(tip);
        if (len > 6) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.35, rr * 0.35, len * 0.5, 12), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 1, roughness: 0.25 })); seg.rotation.x = Math.PI / 2; seg.position.z = len * 0.6; grp.add(seg); }
        break;
      }
      case 'cam': {
        const cams = ['main', 'ultra', 'tele'].filter(k => ev.parts.cams && ev.parts.cams[k]).map(k => [k, ev.parts.cams[k]]);
        if (!cams.length) break;
        const bump = Math.max(0.05, (g.bump || 0) * MM + 0.04);
        const n = cams.length;
        let isl = style.island || 'auto';
        if (isl === 'auto') isl = n === 1 ? (touch ? 'square' : 'none') : 'square';
        const isMat = accent ? btnMat : backMat || bodyMat;
        if (isl === 'square') add(slabGeo(w, h, bump, Math.min(w, h) * 0.28, 'round'), isMat, bump / 2);
        else if (isl === 'circle') { const c = add(new THREE.CylinderGeometry(Math.max(w, h) * 0.55, Math.max(w, h) * 0.56, bump, 40), isMat, bump / 2); c.rotation.x = Math.PI / 2; }
        else if (isl === 'bar') add(slabGeo(Math.min(W * 0.92, w * (n > 1 ? 1.9 : 1.3)), h * (n > 1 ? 0.62 : 1), bump, h * 0.25, 'round'), isMat, bump / 2);
        const top = isl === 'none' ? 0.02 : bump;
        const spots = isl === 'bar' ? cams.map((c, i) => [(i - (n - 1) / 2) * w * 0.55, 0])
          : n === 1 ? [[0, 0]] : n === 2 ? [[0, h * 0.24], [0, -h * 0.24]] : [[-w * 0.24, h * 0.24], [-w * 0.24, -h * 0.24], [w * 0.24, 0]];
        cams.forEach(([k, c], i) => {
          const r = clamp((c.diag * 0.42 + 1.1) * MM, 0.12, Math.min(w, h) * (n === 1 ? 0.42 : 0.23));
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.22, r * 1.28, 0.08, 32), new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.25, metalness: 1 }));
          ring.rotation.x = Math.PI / 2; ring.position.set(spots[i][0], spots[i][1], top + 0.03); grp.add(ring);
          const glass = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshPhysicalMaterial({ color: 0x0b1020, roughness: 0.04, metalness: 0.3, clearcoat: 1 }));
          glass.position.set(spots[i][0], spots[i][1], top + 0.072); grp.add(glass);
          const iris = new THREE.Mesh(new THREE.CircleGeometry(r * 0.45, 24), new THREE.MeshStandardMaterial({ color: 0x1d2c52, roughness: 0.05, metalness: 0.6 }));
          iris.position.set(spots[i][0], spots[i][1], top + 0.074); grp.add(iris);
          if (k === 'tele' && partParams(spec.cams.tele) && partParams(spec.cams.tele).periscope) {
            const sq = new THREE.Mesh(planeGeo(r * 1.2, r * 1.2, r * 0.15), new THREE.MeshStandardMaterial({ color: 0x0e1426, roughness: 0.1 }));
            sq.position.set(spots[i][0], spots[i][1], top + 0.076); grp.add(sq);
          }
        });
        break;
      }
    }
    return [grp, w, h];
  };
  // all elements on given faces of one body part
  const addElements = (parent, frames, filter) => {
    for (const el of lay) {
      if (!frames[el.f] || (filter && !filter(el))) continue;
      const [obj, w, h] = elementObj(el);
      place(parent, frames[el.f], el, obj, w, h);
    }
  };
  const slabFrames = (w, h, d, c) => Object.fromEntries(LAYOUT_FACES.map(f => [f, faceFrame(f, w, h, d, c)]));
  // keys inside a rect (mm, front-face coordinates of a body of height Hmm), placed on `parent` at z
  const addKeys = (parent, rect, Wmm, Hmm, z, kind) => {
    if (!rect) return;
    const [rx, ry, rw, rh] = rect;
    const toX = x => (x - Wmm / 2) * MM, toY = y => (y - Hmm / 2) * MM;
    const nav = rh - (FORMS[form] ? FORMS[form].geo.kpH : rh) > 5;
    let keys = [];
    if (kind === 'qwerty') {
      const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
      const kw = rw / 10.4, kh = rh / 4.4;
      rows.forEach((row, ri) => {
        const off = rx + (rw - row.length * kw) / 2;
        for (let i = 0; i < row.length; i++) keys.push({ x: off + (i + 0.5) * kw, y: ry + rh - (ri + 0.6) * kh, w: kw * 0.82, h: kh * 0.74, l: row[i] });
      });
      keys.push({ x: rx + rw / 2, y: ry + kh * 0.45, w: rw * 0.45, h: kh * 0.62, l: '' });
      keys.push({ x: rx + rw * 0.12, y: ry + kh * 0.45, w: rw * 0.16, h: kh * 0.62, l: '⇧' });
      keys.push({ x: rx + rw * 0.88, y: ry + kh * 0.45, w: rw * 0.16, h: kh * 0.62, l: '↵' });
    } else {
      let top = ry + rh;
      if (nav) {
        const nh = 10;
        keys.push({ x: rx + rw * 0.16, y: top - nh * 0.3, w: rw * 0.24, h: nh * 0.34, l: '' });
        keys.push({ x: rx + rw * 0.84, y: top - nh * 0.3, w: rw * 0.24, h: nh * 0.34, l: '' });
        keys.push({ x: rx + rw * 0.16, y: top - nh * 0.75, w: rw * 0.24, h: nh * 0.32, l: '', c: 0x3fae5a });
        keys.push({ x: rx + rw * 0.84, y: top - nh * 0.75, w: rw * 0.24, h: nh * 0.32, l: '', c: 0xd24b4b });
        keys.push({ x: rx + rw / 2, y: top - nh * 0.5, w: nh * 0.86, h: nh * 0.86, l: '', round: true });
        top -= nh;
      }
      const labels = nav ? [] : ['SND', 'CLR', 'END'];
      labels.push('1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#');
      const rows = labels.length / 3, ch = (top - ry) / rows, cw = rw / 3;
      labels.forEach((l, i) => {
        const c = i % 3, r = Math.floor(i / 3);
        keys.push({ x: rx + (c + 0.5) * cw, y: top - (r + 0.5) * ch, w: cw * 0.78, h: ch * 0.74, l, c: l === 'SND' ? 0x3fae5a : l === 'END' ? 0xd24b4b : null });
      });
    }
    const atlas = labelAtlas([...new Set(keys.map(k => k.l).filter(Boolean))], keyLight ? '#2a2d33' : '#e9edf5');
    const idx = {}; [...new Set(keys.map(k => k.l).filter(Boolean))].forEach((l, i) => { idx[l] = i; });
    const labMat = new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true });
    // key styles: classic rounded keys, round buttons, a flush (gapless, flat) pad, or pillowy bubble keys
    const ks = style.keys || 'classic';
    const kd = ks === 'flush' ? 0.025 : ks === 'bubble' ? 0.11 : 0.07;
    for (const k of keys) {
      const w = k.w * MM, h = k.h * MM;
      const mat = k.c ? new THREE.MeshStandardMaterial({ color: k.c, roughness: 0.4 }) : keyMat;
      const disc = k.round || (ks === 'round' && k.l);
      const kw = ks === 'flush' ? w * 1.18 : w, kh = ks === 'flush' ? h * 1.25 : h, rr = k.round ? w / 2 : Math.min(w, h) / 2;
      const geo = disc ? new THREE.CylinderGeometry(rr, rr, kd, 28) : slabGeo(kw, kh, kd, Math.min(kw, kh) * (ks === 'bubble' ? 0.5 : ks === 'flush' ? 0.12 : 0.35), 'round');
      const m = new THREE.Mesh(geo, mat);
      if (disc) m.rotation.x = Math.PI / 2;
      m.position.set(toX(k.x), toY(k.y), z + kd / 2);
      parent.add(m);
      if (k.round) {
        const dot = new THREE.Mesh(new THREE.CircleGeometry(w * 0.2, 20), new THREE.MeshStandardMaterial({ color: keyLight ? 0xc8ccd3 : 0x15171c, roughness: 0.5 }));
        dot.position.set(toX(k.x), toY(k.y), z + kd + 0.002); parent.add(dot);
      }
      if (k.l) {
        const s = Math.min(w, h) * 0.8;
        const pg = new THREE.PlaneGeometry(s, s);
        const i = idx[k.l], n = atlas.n, uv = pg.attributes.uv;
        for (let j = 0; j < uv.count; j++) uv.setXY(j, ((i % n) + uv.getX(j)) / n, 1 - (Math.floor(i / n) + 1 - uv.getY(j)) / n);
        const lm = new THREE.Mesh(pg, labMat);
        lm.position.set(toX(k.x), toY(k.y), z + kd + 0.003);
        parent.add(lm);
      }
    }
  };
  // screen window (keypad phones): black bezel module + active area
  const addKeypadScreen = (parent, rect, Wmm, Hmm, z) => {
    if (!rect && (!dp || dp.emit === 'none') && g.keypadRect && Hmm) {
      // dial-only handsets: a name plate above the keys
      const kr = g.keypadRect, top = kr[1] + kr[3];
      rect = [(Wmm - Math.min(40, Wmm - 10)) / 2, top + (Hmm - top) * 0.32, Math.min(40, Wmm - 10), Math.min(12, (Hmm - top) * 0.4)];
    }
    if (!rect) return;
    const [rx, ry, rw, rh] = rect;
    const cx = (rx + rw / 2 - Wmm / 2) * MM, cy = (ry + rh / 2 - Hmm / 2) * MM;
    const kind = screenKind(dp, disp, false);
    if (kind === 'plate') {
      const pm = screenMesh(rw * MM, rh * MM, 0.15, 'plate');
      pm.position.set(cx, cy, z + 0.004); parent.add(pm);
      return;
    }
    const bez = new THREE.Mesh(planeGeo(rw * MM, rh * MM, Math.min(rw, rh) * MM * 0.12), new THREE.MeshPhysicalMaterial({ color: frontWhite ? 0xe9ebef : 0x0b0c10, roughness: 0.15, metalness: 0.2, clearcoat: 1 }));
    bez.position.set(cx, cy, z + 0.003); parent.add(bez);
    const sw = Math.max(4, disp.w || rw - 4) * MM, sh = Math.max(2, disp.h || rh - 4) * MM;
    const sm = screenMesh(sw, sh, 0.04, kind, { chars: disp.res ? disp.res[0] : 7, backlit: dp.bl !== 'none' || DISP_EMIT[dp.emit].emissive, cstn: dp.matrix === 'passive' });
    sm.position.set(cx, cy, z + 0.006); parent.add(sm);
  };
  // glass front + screen for touch devices
  const addTouchFront = (parent, Wc, Hc, z, rectMm, Wmm, Hmm) => {
    const r = cornerR(Wc, Hc);
    const front = new THREE.Mesh(planeGeo(Wc * 0.985, Hc * 0.99, r * 0.95), frontGlass());
    front.position.z = z + 0.002; parent.add(front);
    if (!rectMm) return;
    const [rx, ry, rw, rh] = rectMm;
    const shape = dp ? dp.shape : 'bezel';
    const sw = rw * MM, sh = rh * MM;
    const sr = shape === 'bezel' ? 0.06 : Math.min(r * 0.92, Math.min(sw, sh) * 0.12);
    const extra = { notch: shape === 'notch' ? 0.42 : 0, topInset: shape === 'notch' ? 0.06 : 0 };
    const sm = screenMesh(sw, sh, sr, screenKind(dp, disp, true), extra);
    sm.position.set((rx + rw / 2 - Wmm / 2) * MM, (ry + rh / 2 - Hmm / 2) * MM, z + 0.005);
    parent.add(sm);
    if (shape === 'curved') {
      for (const s of [-1, 1]) {
        const hl = new THREE.Mesh(new THREE.PlaneGeometry(0.12, sh * 0.92), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 }));
        hl.position.set(s * (sw / 2 - 0.08), sm.position.y, z + 0.007); parent.add(hl);
      }
    }
    // home button on classic-bezel touch phones
    const chin = ry;
    if (shape === 'bezel' && chin >= 9 && spec.cat === 'phone' && !lay.some(e => e.t === 'fp' && e.f === 'front')) {
      const hb = new THREE.Mesh(new THREE.RingGeometry(Math.min(0.42, chin * MM * 0.3), Math.min(0.5, chin * MM * 0.36), 32), new THREE.MeshBasicMaterial({ color: 0x5a6070 }));
      hb.position.set(0, (chin / 2 - Hmm / 2) * MM, z + 0.006); parent.add(hb);
    }
  };
  const addBackPanel = (parent, Wc, Hc, z, cx, cy) => {
    if (!backMat) return;
    const p = new THREE.Mesh(planeGeo(Wc * 0.95, Hc * 0.97, cornerR(Wc, Hc) * 0.9), backMat);
    p.position.set(cx || 0, cy || 0, z - 0.003); p.rotation.y = Math.PI; parent.add(p);
  };
  // standard slab device (candybar, qwerty, brick, touch, slate) built into `grp`
  const buildSlab = (grp, w, h, d, Wmm, Hmm) => {
    const body = slab(w, h, d, bodyMat);
    grp.add(body);
    const zf = d / 2;
    if (touch) addTouchFront(grp, w, h, zf, g.screenRect, Wmm, Hmm);
    else {
      addKeypadScreen(grp, g.screenRect, Wmm, Hmm, zf);
      addKeys(grp, g.keypadRect, Wmm, Hmm, zf, FORMS[form].kp === 'qwerty' ? 'qwerty' : 'num');
    }
    addBackPanel(grp, w, h, -zf);
    addElements(grp, slabFrames(w, h, d));
  };
  // coiled cord between two points
  const coiledCord = (a, b, turns, radius) => {
    const pts = [];
    const dir = new THREE.Vector3().subVectors(b, a), len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3(0, 0, 1).cross(dir);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(dir, side).normalize();
    for (let i = 0; i <= turns * 24; i++) {
      const k = i / (turns * 24), ang = k * turns * Math.PI * 2;
      const sag = Math.sin(k * Math.PI) * len * 0.18;
      pts.push(a.clone().addScaledVector(dir, k * len).addScaledVector(side, Math.cos(ang) * radius).addScaledVector(up, Math.sin(ang) * radius).add(new THREE.Vector3(0, -sag, 0)));
    }
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, radius * 0.22, 6, false), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6 }));
  };
  const portPoint = (grp, d) => {
    const p = root.userData.places.find(x => x.t === 'port');
    return p ? p.pos.clone().applyMatrix4(grp.matrix) : new THREE.Vector3(0, -H / 2, 0).applyMatrix4(grp.matrix);
  };

  // ---------- forms ----------
  if (form === 'car' || form === 'bag') {
    const hs = new THREE.Group();
    buildSlab(hs, W, H, T, g.W, g.H);
    root.add(hs);
    root.userData.main = hs;
    const vol = Math.max(200, g.unitVol || 2000);
    if (form === 'car') {
      // cradle behind the handset
      const cr = slab(W * 1.12, H * 0.62, T * 0.7, new THREE.MeshStandardMaterial({ color: 0x1c1f25, roughness: 0.55 }), W * 0.12);
      cr.position.set(0, -H * 0.12, -T * 0.72); root.add(cr);
      const foot = slab(W * 1.5, 0.6, T * 2.2, cr.material.clone(), 0.2);
      foot.position.set(0, -H * 0.45, -T * 0.7); root.add(foot);
      // trunk transceiver box
      const a = Math.cbrt(vol / 0.672);
      const bw = a * 1.6, bd = a, bh = a * 0.42;
      const boxM = new THREE.MeshStandardMaterial({ color: 0x40454e, roughness: 0.45, metalness: 0.6 });
      const box = slab(bw, bh, bd, boxM, 0.4);
      box.position.set(W * 0.6, -H / 2 - bh / 2 - 3, -bd / 2 - T * 2.5);
      root.add(box);
      for (let i = 0; i < 6; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.62, 0.18, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5, metalness: 0.5 }));
        fin.position.set(box.position.x, box.position.y - bh * 0.28 + i * bh * 0.11, box.position.z + bd / 2 + 0.05); root.add(fin);
      }
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(8, bw * 0.4), Math.min(2, bw * 0.1)), new THREE.MeshBasicMaterial({ map: canvasTex(drawLogo(brandText(spec), '#40454e')), transparent: true }));
      lab.position.set(box.position.x, box.position.y + bh / 2 + 0.01, box.position.z); lab.rotation.x = -Math.PI / 2; root.add(lab);
      hs.updateMatrix();
      root.add(coiledCord(portPoint(hs), new THREE.Vector3(box.position.x - bw / 2, box.position.y, box.position.z + bd * 0.3), 9, 0.32));
    } else {
      const a = Math.cbrt(vol / 0.54);
      const bw = a * 1.2, bh = a, bd = a * 0.45;
      const bagM = new THREE.MeshStandardMaterial({ color: '#2c3038', roughness: 0.95 });
      const bag = slab(bw, bh, bd, bagM, Math.min(bw, bh) * 0.18);
      bag.position.set(W * 0.35 + bw * 0.25, -H / 2 + bh / 2 - 0.3, -T / 2 - bd / 2 - 0.4);
      root.add(bag);
      const flap = slab(bw * 0.98, bh * 0.35, 0.25, new THREE.MeshStandardMaterial({ color: '#23272e', roughness: 0.95 }), Math.min(bw, bh) * 0.15);
      flap.position.set(bag.position.x, bag.position.y + bh * 0.33, bag.position.z + bd / 2 + 0.05); root.add(flap);
      // stitched seam around the front panel
      const sw2 = bw * 0.86, sh2 = bh * 0.84;
      const seamPts = roundedRectShape(sw2, sh2, Math.min(sw2, sh2) * 0.15).getPoints(48).map(p => new THREE.Vector3(p.x + bag.position.x, p.y + bag.position.y, bag.position.z + bd / 2 + 0.02));
      const seam = new THREE.Line(new THREE.BufferGeometry().setFromPoints(seamPts), new THREE.LineDashedMaterial({ color: 0xbfb8a6, dashSize: 0.35, gapSize: 0.25 }));
      seam.computeLineDistances(); root.add(seam);
      const buckle = new THREE.Mesh(planeGeo(1.4, 0.9, 0.2), new THREE.MeshStandardMaterial({ color: 0xa8acb3, metalness: 0.9, roughness: 0.3 }));
      buckle.position.set(bag.position.x, bag.position.y + bh * 0.2, bag.position.z + bd / 2 + 0.19); root.add(buckle);
      const strapPts = [];
      for (let i = 0; i <= 30; i++) { const k = i / 30, ang = Math.PI * k; strapPts.push(new THREE.Vector3(bag.position.x - Math.cos(ang) * bw * 0.46, bag.position.y + bh / 2 + Math.sin(ang) * bh * 0.55, bag.position.z)); }
      root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strapPts), 40, 0.18, 6, false), new THREE.MeshStandardMaterial({ color: 0x1a1c21, roughness: 0.9 })));
      hs.updateMatrix();
      root.add(coiledCord(portPoint(hs), new THREE.Vector3(bag.position.x, bag.position.y + bh * 0.1, bag.position.z + bd / 2), 7, 0.28));
      hs.rotation.z = -0.06;
    }
    return root;
  }

  if (form === 'flip') {
    // base (keypad half) below the hinge, lid (screen half) above; T split between them
    const Tb = T * 0.56, Tl = T * 0.44;
    const base = new THREE.Group(), pivot = new THREE.Group(), lid = new THREE.Group();
    const bm = slab(W, H, Tb, bodyMat); bm.position.y = -H / 2; base.add(bm);
    const hingeR = Math.min(Tb * 0.5, 0.6);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(hingeR, hingeR, W * 0.92, 24), bodyMat);
    hinge.rotation.z = Math.PI / 2; hinge.position.set(0, -0.05, Tb / 2 - hingeR * 0.6); base.add(hinge);
    // inner faces: the front face is the open inner surface, Hface = 2H
    const Hf = g.Hface || g.H * 2;
    const lm = slab(W, H, Tl, bodyMat); lm.position.set(0, H / 2, -Tl / 2); lid.add(lm);
    // screen rect is on the lid: convert to lid-local mm (origin = hinge)
    if (g.screenRect) {
      const [rx, ry, rw, rh] = g.screenRect;
      const rect = [rx, ry - g.H, rw, rh];
      addKeypadScreen(lid, rect, g.W, 0, 0.002);
    }
    if (g.keypadRect) addKeys(base, g.keypadRect, g.W, 2 * g.H, Tb / 2, 'num');
    // front-face elements: upper half on the lid, lower half on the base
    for (const el of lay) {
      if (el.f !== 'front') continue;
      const y = el.v * Hf;
      const [obj, w, h] = elementObj(el);
      if (y >= g.H) {
        const fr = () => ({ pos: new THREE.Vector3((el.u - 0.5) * W, (y - g.H) * MM, 0.002), n: new THREE.Vector3(0, 0, 1), q: new THREE.Quaternion() });
        place(lid, fr, el, obj, w, h);
      } else {
        const fr = () => ({ pos: new THREE.Vector3((el.u - 0.5) * W, (y - g.H) * MM, Tb / 2), n: new THREE.Vector3(0, 0, 1), q: new THREE.Quaternion() });
        place(base, fr, el, obj, w, h);
      }
    }
    // back face = lid outer surface
    addBackPanel(lid, W, H, -Tl, 0, H / 2);
    const backC = new THREE.Vector3(0, H / 2, -Tl / 2);
    addElements(lid, { back: faceFrame('back', W, H, Tl, backC) });
    if (disp.color && !lay.some(e => e.t === 'cam' && e.f === 'back' && e.v < 0.75 && e.v > 0.4)) {
      const os = screenMesh(W * 0.42, W * 0.3, 0.1, 'outer');
      os.position.set(0, H * 0.55, -Tl - 0.004); os.rotation.y = Math.PI; lid.add(os);
    }
    // edges on the base (closed phone: top = hinge end)
    addElements(base, { top: faceFrame('top', W, H, Tb, new THREE.Vector3(0, -H / 2, 0)), bottom: faceFrame('bottom', W, H, Tb, new THREE.Vector3(0, -H / 2, 0)),
      left: faceFrame('left', W, H, Tb, new THREE.Vector3(0, -H / 2, 0)), right: faceFrame('right', W, H, Tb, new THREE.Vector3(0, -H / 2, 0)) });
    pivot.position.set(0, 0, Tb / 2);
    lid.position.set(0, 0, 0);
    pivot.add(lid);
    root.add(base, pivot);
    root.userData.main = root;
    root.userData.animate = k => { pivot.rotation.x = -0.22 * k + (1 - k) * (Math.PI - 0.02); root.position.y = (1 - k) * H / 2; };
    return root;
  }

  if (form === 'slider') {
    const Tf = T * 0.55, Tk = T * 0.45;
    const front = new THREE.Group(), back = new THREE.Group();
    const fm = slab(W, H, Tf, bodyMat); front.add(fm);
    addKeypadScreen(front, g.screenRect, g.W, g.H, Tf / 2);
    const bkM = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.color).multiplyScalar(0.55), roughness: 0.5 });
    const km = slab(W * 0.98, H * 0.98, Tk, bkM); back.add(km);
    const G2 = FORMS.slider.geo;
    addKeys(back, [(g.W - G2.kpW) / 2, G2.chin * 0.6, G2.kpW, Math.min(G2.kpH, g.H * 0.5)], g.W, g.H, Tk / 2, 'num');
    addBackPanel(back, W, H, -Tk / 2);
    addElements(front, Object.fromEntries(['front', 'top', 'bottom', 'left', 'right'].map(f => [f, faceFrame(f, W, H, Tf)])));
    addElements(back, { back: faceFrame('back', W, H, Tk) });
    front.position.z = Tk / 2; back.position.z = -Tf / 2;
    root.add(front, back);
    root.userData.main = root;
    root.userData.animate = k => { front.position.y = H * 0.44 * k; root.position.y = -H * 0.22 * k; };
    return root;
  }

  if (form === 'fold') {
    const Th = Math.max(0.25, (T - 0.04) / 2);
    const base = new THREE.Group(), pivot = new THREE.Group(), lid = new THREE.Group();
    const bmesh = slab(W, H, Th, bodyMat, cornerR(W, H) * 0.8); bmesh.position.set(-W / 2, 0, -Th / 2); base.add(bmesh);
    const lmesh = slab(W, H, Th, bodyMat, cornerR(W, H) * 0.8); lmesh.position.set(W / 2, 0, -Th / 2); lid.add(lmesh);
    // inner screen across both halves (one texture, split in two)
    const sw = (disp.w || g.W * 2 - 4) * MM, sh = (disp.h || g.H - 6) * MM;
    const tex = canvasTex(drawScreen('touch', spec, 512, Math.round(512 * sh / sw)));
    const half = (x0, parent, cx) => {
      const geo = planeGeo(sw / 2 - 0.02, sh, 0.25);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, x0 + uv.getX(i) * 0.5);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveMap: tex, roughness: 0.15 }));
      m.position.set(cx, 0, 0.006); parent.add(m);
    };
    for (const [par, sx] of [[base, -1], [lid, 1]]) {
      const fg = new THREE.Mesh(planeGeo(W * 0.99, H * 0.99, cornerR(W, H) * 0.7), frontGlass());
      fg.position.set(sx * W / 2, 0, 0.002); par.add(fg);
    }
    half(0, base, -sw / 4 - 0.01);
    half(0.5, lid, sw / 4 + 0.01);
    // cover screen on the lid's outer face; front-face layout elements live there
    const cover = screenMesh(W * 0.9, H * 0.92, cornerR(W, H) * 0.7, 'touch');
    cover.position.set(W / 2, 0, -Th - 0.004); cover.rotation.y = Math.PI; lid.add(cover);
    addElements(lid, { front: faceFrame('back', W, H, Th, new THREE.Vector3(W / 2, 0, -Th / 2)) });
    addBackPanel(base, W, H, -Th, -W / 2, 0);
    const bc = new THREE.Vector3(-W / 2, 0, -Th / 2);
    addElements(base, { back: faceFrame('back', W, H, Th, bc), top: faceFrame('top', W, H, Th, bc), bottom: faceFrame('bottom', W, H, Th, bc),
      left: faceFrame('left', W, H, Th, bc), right: faceFrame('right', W, H, Th, bc) });
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(Th * 0.55, Th * 0.55, H * 0.96, 20), new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.8, roughness: 0.35 }));
    spine.position.set(0, 0, -Th * 0.5); base.add(spine);
    root.add(base, pivot);
    pivot.add(lid);
    root.userData.main = root;
    root.userData.animate = k => { pivot.rotation.y = -(1 - k) * Math.PI * 0.995; root.position.x = (1 - k) * W / 2; };
    return root;
  }

  // single slab: brick, candybar, qwerty, touch, tablet
  buildSlab(root, W, H, T, g.W, g.H);
  root.userData.main = root;
  return root;
}
