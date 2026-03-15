// ── Constants ────────────────────────────────────────────────
const COLS = { character: '#6c8eff', prop: '#4ade9a', camera: '#f0b429', light: '#ff9944', wall: '#9898aa', path: '#a78bfa' };
const SEL = '#f472b6';
const GRID = 20;

// ── State ────────────────────────────────────────────────────
let mode = 'character';
let objects = [];
let selIds = new Set();
let dragId = null;
let dragOff = { x: 0, y: 0 };
let idCnt = 0;
let activeCamId = null;
let snapOn = false;
let thirds = false;
let safe = false;
let curAR = '2.39:1';
let wasDrag = false;
let undoStack = [];
let redoStack = [];
let pathDraw = false;
let pathPts = [];
let wallDraw = false;
let wallStart = null;
let todVal = 55;

// ── DOM refs ─────────────────────────────────────────────────
const tdC = document.getElementById('top-down');
const ctx = tdC.getContext('2d');
const pvC = document.getElementById('preview');
const ovC = document.getElementById('overlay-canvas');
const octx = ovC.getContext('2d');
let tdW = 0, tdH = 0;

// ── Three.js refs ────────────────────────────────────────────
let scene, renderer, cam3d, meshMap = {}, sunLight, skyLight, fillLight;

// ── Presets ──────────────────────────────────────────────────
const LENS = { '14mm': { fov: 100 }, '24mm': { fov: 74 }, '35mm': { fov: 54 }, '50mm': { fov: 40 }, '85mm': { fov: 24 }, '135mm': { fov: 15 } };

const SHOTS = {
  'Extreme Wide': { k: '14mm', h: 0.7, t: 0 },
  'Wide':         { k: '24mm', h: 0.6, t: -2 },
  'Medium':       { k: '50mm', h: 0.5, t: -3 },
  'Close-Up':     { k: '85mm', h: 0.5, t: -4 },
  'Extreme CU':   { k: '135mm', h: 0.5, t: -5 },
  'Low Angle':    { k: '35mm', h: 0.1, t: 12 },
  'High Angle':   { k: '35mm', h: 0.9, t: -20 },
  "Bird's Eye":   { k: '24mm', h: 1.0, t: -85 },
};

const CHAR_P = { 'Adult (1.8m)': 1.8, 'Teen (1.6m)': 1.6, 'Child (1.2m)': 1.2, 'Toddler (0.8m)': 0.8, 'Giant (2.4m)': 2.4 };
const PROP_P  = { 'Small (.3m)': 0.3, 'Medium (.8m)': 0.8, 'Large (1.5m)': 1.5, 'Vehicle (4m)': 4, 'Building (10m)': 10 };

const TOD_STOPS = [
  { t: 0,   name: 'Night',      icon: '🌙', sky: 0x060a14, amb: 0x101830, sun: 0x2040a0, si: 0.05, sx: -1,   sy: 0.3  },
  { t: 15,  name: 'Dawn',       icon: '🌅', sky: 0x1a1228, amb: 0x402818, sun: 0xff6030, si: 0.6,  sx: -0.8, sy: 0.15 },
  { t: 30,  name: 'Sunrise',    icon: '🌄', sky: 0x4a2010, amb: 0x703820, sun: 0xff8040, si: 0.8,  sx: -0.5, sy: 0.25 },
  { t: 45,  name: 'Morning',    icon: '🌤', sky: 0x5888cc, amb: 0x304860, sun: 0xffe0a0, si: 1.0,  sx: -0.2, sy: 0.55 },
  { t: 55,  name: 'Afternoon',  icon: '☀️', sky: 0x4070b0, amb: 0x304060, sun: 0xfff0d0, si: 1.1,  sx: 0.1,  sy: 0.85 },
  { t: 70,  name: 'Golden Hr',  icon: '🌇', sky: 0x7a3820, amb: 0x602818, sun: 0xff9040, si: 0.9,  sx: 0.5,  sy: 0.3  },
  { t: 85,  name: 'Sunset',     icon: '🌆', sky: 0x3a1818, amb: 0x401820, sun: 0xff5020, si: 0.6,  sx: 0.8,  sy: 0.12 },
  { t: 100, name: 'Dusk',       icon: '🌃', sky: 0x080c1a, amb: 0x101828, sun: 0x2030a0, si: 0.08, sx: 1,    sy: 0.08 },
];

// ── Helpers ───────────────────────────────────────────────────
const sc    = v => snapOn ? Math.round(v / GRID) * GRID : v;
const td2w  = (x, y) => ({ x: (x - tdW / 2) / GRID, z: (y - tdH / 2) / GRID });
const selOne = () => selIds.size === 1 ? objects.find(o => o.id === [...selIds][0]) : null;

function lerpStops(val) {
  let a = TOD_STOPS[0], b = TOD_STOPS[TOD_STOPS.length - 1];
  for (let i = 0; i < TOD_STOPS.length - 1; i++) {
    if (val >= TOD_STOPS[i].t && val <= TOD_STOPS[i + 1].t) { a = TOD_STOPS[i]; b = TOD_STOPS[i + 1]; break; }
  }
  const f = a.t === b.t ? 0 : (val - a.t) / (b.t - a.t);
  const lerp  = (a, b, f) => a + (b - a) * f;
  const lerpC = (ac, bc, f) => {
    const ar = (ac >> 16) & 0xff, ag = (ac >> 8) & 0xff, ab = ac & 0xff;
    const br = (bc >> 16) & 0xff, bg = (bc >> 8) & 0xff, bb = bc & 0xff;
    return (Math.round(lerp(ar, br, f)) << 16) | (Math.round(lerp(ag, bg, f)) << 8) | Math.round(lerp(ab, bb, f));
  };
  return { name: f < 0.5 ? a.name : b.name, icon: f < 0.5 ? a.icon : b.icon, sky: lerpC(a.sky, b.sky, f), amb: lerpC(a.amb, b.amb, f), sun: lerpC(a.sun, b.sun, f), si: lerp(a.si, b.si, f), sx: lerp(a.sx, b.sx, f), sy: lerp(a.sy, b.sy, f) };
}

// ── Time of Day ───────────────────────────────────────────────
function setTOD(v) {
  todVal = v;
  const s = lerpStops(v);
  document.getElementById('tod-icon').textContent = s.icon;
  document.getElementById('tod-label').textContent = s.name;
  if (!scene) return;
  scene.background = new THREE.Color(s.sky);
  scene.fog = new THREE.Fog(s.sky, 20, 65);
  skyLight.color.setHex(s.amb); skyLight.intensity = s.si * 0.4;
  sunLight.color.setHex(s.sun); sunLight.intensity = s.si;
  sunLight.position.set(s.sx * 20, s.sy * 20 + 2, s.sx * 5 - 10);
  fillLight.color.setHex(s.amb); fillLight.intensity = s.si * 0.15;
}

// ── Undo / Redo ───────────────────────────────────────────────
function saveState() {
  undoStack.push(JSON.stringify({ objects, activeCamId, idCnt, todVal }));
  if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
  refreshUB();
}

function restoreSnap(s) {
  const d = JSON.parse(s);
  objects.forEach(o => { if (meshMap[o.id]) { scene.remove(meshMap[o.id]); delete meshMap[o.id]; } });
  objects = d.objects; activeCamId = d.activeCamId; idCnt = d.idCnt;
  if (d.todVal !== undefined) { todVal = d.todVal; document.getElementById('tod-slider').value = todVal; setTOD(todVal); }
  objects.forEach(o => { if (o.type !== 'camera' && o.type !== 'path') buildMesh(o); });
  selIds = new Set(); draw(); updateSidebar(); updateShotBar(); renderProps();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(undoStack.pop());
  restoreSnap(undoStack.length ? undoStack[undoStack.length - 1] : JSON.stringify({ objects: [], activeCamId: null, idCnt: 0, todVal: 55 }));
  refreshUB(); ss('Undone.');
}

function redo() {
  if (!redoStack.length) return;
  const s = redoStack.pop(); undoStack.push(s); restoreSnap(s); refreshUB(); ss('Redone.');
}

function refreshUB() {
  document.getElementById('btn-undo').disabled = !undoStack.length;
  document.getElementById('btn-redo').disabled = !redoStack.length;
}

// ── Toggles ───────────────────────────────────────────────────
function toggleSnap()   { snapOn = !snapOn; document.getElementById('btn-snap').classList.toggle('tog-on', snapOn); ss(snapOn ? 'Snap on.' : 'Snap off.'); }
function toggleThirds() { thirds = !thirds; document.getElementById('btn-thirds').classList.toggle('tog-on', thirds); drawOverlay(); }
function toggleSafe()   { safe   = !safe;   document.getElementById('btn-safe').classList.toggle('tog-on', safe);   drawOverlay(); }

// ── Aspect Ratio ──────────────────────────────────────────────
function setAR(ar) {
  curAR = ar;
  const pw = document.getElementById('preview-wrap'), W = pw.clientWidth, H = pw.clientHeight;
  const [rw, rh] = ar.split(':').map(Number), bH = Math.max(0, Math.round((H - W / (rw / rh)) / 2));
  const t = document.getElementById('ar-top'), b = document.getElementById('ar-bot');
  if (bH > 0) { t.style.height = bH + 'px'; b.style.height = bH + 'px'; t.style.display = 'block'; b.style.display = 'block'; }
  else { t.style.display = 'none'; b.style.display = 'none'; }
  drawOverlay();
}

function drawOverlay() {
  const pw = document.getElementById('preview-wrap'), W = pw.clientWidth, H = pw.clientHeight;
  ovC.width = W; ovC.height = H; octx.clearRect(0, 0, W, H);
  const [rw, rh] = curAR.split(':').map(Number), bH = Math.max(0, Math.round((H - W / (rw / rh)) / 2));
  const top = bH, bot = H - bH, ih = bot - top;
  if (thirds) {
    octx.strokeStyle = 'rgba(255,255,255,.22)'; octx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      octx.beginPath(); octx.moveTo(W * i / 3, top); octx.lineTo(W * i / 3, bot); octx.stroke();
      octx.beginPath(); octx.moveTo(0, top + ih * i / 3); octx.lineTo(W, top + ih * i / 3); octx.stroke();
    }
  }
  if (safe) {
    octx.setLineDash([4, 4]);
    octx.strokeStyle = 'rgba(108,142,255,.6)'; octx.lineWidth = 1;
    octx.strokeRect(W * 0.05, top + ih * 0.05, W * 0.9, ih * 0.9);
    octx.strokeStyle = 'rgba(240,180,41,.5)';
    octx.strokeRect(W * 0.1, top + ih * 0.1, W * 0.8, ih * 0.8);
    octx.setLineDash([]);
    octx.fillStyle = 'rgba(108,142,255,.7)'; octx.font = '9px DM Mono, monospace';
    octx.fillText('ACTION SAFE', W * 0.05 + 4, top + ih * 0.05 + 11);
    octx.fillStyle = 'rgba(240,180,41,.6)';
    octx.fillText('TITLE SAFE', W * 0.1 + 4, top + ih * 0.1 + 11);
  }
}

// ── Three.js init ─────────────────────────────────────────────
function initThree() {
  scene = new THREE.Scene();
  const pw = document.getElementById('preview-wrap');
  renderer = new THREE.WebGLRenderer({ canvas: pvC, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setSize(pw.clientWidth, pw.clientHeight);
  cam3d = new THREE.PerspectiveCamera(60, pw.clientWidth / pw.clientHeight, 0.1, 200);

  scene.add(new THREE.GridHelper(80, 80, 0x1a1a20, 0x141418));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x0d0d10 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; floor.receiveShadow = true; scene.add(floor);

  skyLight  = new THREE.AmbientLight(0x304060, 0.4); scene.add(skyLight);
  sunLight  = new THREE.DirectionalLight(0xfff0d0, 1.1);
  sunLight.position.set(2, 17, -10); sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024; sunLight.shadow.mapSize.height = 1024;
  scene.add(sunLight);
  fillLight = new THREE.DirectionalLight(0x304060, 0.15); fillLight.position.set(-8, 4, 8); scene.add(fillLight);

  setTOD(55);
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  updateCam3d();
  renderer.render(scene, cam3d);
}

function updateCam3d() {
  const cam = objects.find(o => o.type === 'camera' && o.id === activeCamId) || objects.find(o => o.type === 'camera');
  if (!cam) { cam3d.position.set(0, 3, 12); cam3d.lookAt(0, 1, 0); return; }
  const w = td2w(cam.x, cam.y), h = cam.camH ?? 1.6, tr = (cam.tilt || 0) * Math.PI / 180, a = cam.angle || 0;
  cam3d.position.set(w.x, h, w.z);
  cam3d.lookAt(w.x + Math.sin(a) * Math.cos(tr) * 10, h + Math.sin(tr) * 10, w.z - Math.cos(a) * Math.cos(tr) * 10);
  cam3d.fov = cam.fov || 60; cam3d.updateProjectionMatrix();
}

// ── Mesh building ─────────────────────────────────────────────
function buildMesh(obj) {
  if (meshMap[obj.id]) { scene.remove(meshMap[obj.id]); delete meshMap[obj.id]; }
  const col = obj.color ? new THREE.Color(obj.color) : null;
  let mesh;
  const h = obj.height || 1;

  if (obj.type === 'character') {
    const grp = new THREE.Group();
    const bc = col || new THREE.Color(0x6c8eff);
    const hc = col ? col.clone().lerp(new THREE.Color(1, 1, 1), 0.25) : new THREE.Color(0x8fb0ff);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.15, h * 0.15, h * 0.75, 12), new THREE.MeshLambertMaterial({ color: bc }));
    body.position.y = h * 0.38; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.13, 12, 12), new THREE.MeshLambertMaterial({ color: hc }));
    head.position.y = h * 0.9; head.castShadow = true;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(h * 0.04, 6, 6), new THREE.MeshLambertMaterial({ color: hc }));
    nose.position.set(0, h * 0.9, h * 0.13);
    grp.add(body, head, nose);
    grp.rotation.y = -(obj.facing || 0);
    mesh = grp;
  } else if (obj.type === 'prop') {
    const s = obj.height || 0.8;
    mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshLambertMaterial({ color: col || new THREE.Color(0x4ade9a) }));
    mesh.position.y = s / 2; mesh.castShadow = true;
  } else if (obj.type === 'light') {
    const lc = new THREE.Color(obj.lightColor || '#ffffff');
    let tl = obj.lightType === 'point' ? new THREE.PointLight(lc, obj.intensity * 2, 20) : new THREE.DirectionalLight(lc, obj.intensity);
    if (obj.lightType !== 'point') tl.castShadow = true;
    tl.position.set(0, obj.lightH || 3, 0);
    const ind = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: lc }));
    ind.position.y = obj.lightH || 3;
    const grp = new THREE.Group(); grp.add(tl, ind); mesh = grp;
  } else if (obj.type === 'wall' && obj.x2 !== undefined) {
    const wx1 = td2w(obj.x, obj.y), wx2 = td2w(obj.x2, obj.y2);
    const dx = wx2.x - wx1.x, dz = wx2.z - wx1.z, len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) return;
    const wH = obj.wallH || 2.5, tk = obj.thickness || 0.2;
    mesh = new THREE.Mesh(new THREE.BoxGeometry(len, wH, tk), new THREE.MeshLambertMaterial({ color: col || new THREE.Color(0x5a5a6e) }));
    mesh.position.set((wx1.x + wx2.x) / 2, wH / 2, (wx1.z + wx2.z) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    mesh.castShadow = true; mesh.receiveShadow = true;
  }

  if (mesh) {
    if (obj.type !== 'wall') { const w = td2w(obj.x, obj.y); mesh.position.x = w.x; mesh.position.z = w.z; }
    scene.add(mesh); meshMap[obj.id] = mesh;
  }
}

// ── Top-down drawing ──────────────────────────────────────────
function draw() {
  if (!tdW) return;
  ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 0, tdW, tdH);

  ctx.strokeStyle = '#1e1e24'; ctx.lineWidth = 0.5;
  for (let x = ((tdW / 2) % GRID + GRID) % GRID; x < tdW; x += GRID) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, tdH); ctx.stroke(); }
  for (let y = ((tdH / 2) % GRID + GRID) % GRID; y < tdH; y += GRID) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(tdW, y); ctx.stroke(); }

  ctx.strokeStyle = '#26262e'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tdW / 2, 0); ctx.lineTo(tdW / 2, tdH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, tdH / 2); ctx.lineTo(tdW, tdH / 2); ctx.stroke();

  if (snapOn) {
    ctx.fillStyle = 'rgba(108,142,255,.18)';
    for (let x = ((tdW / 2) % GRID + GRID) % GRID; x < tdW; x += GRID)
      for (let y = ((tdH / 2) % GRID + GRID) % GRID; y < tdH; y += GRID) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
  }

  if (pathDraw && pathPts.length) {
    ctx.beginPath(); ctx.moveTo(pathPts[0].x, pathPts[0].y);
    for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    pathPts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#a78bfa'; ctx.fill(); });
  }
  if (wallDraw && wallStart) {
    ctx.beginPath(); ctx.moveTo(wallStart.x, wallStart.y); ctx.lineTo(wallStart.ex ?? wallStart.x, wallStart.ey ?? wallStart.y);
    ctx.strokeStyle = '#9898aa'; ctx.lineWidth = 3; ctx.stroke();
  }

  for (const obj of objects) {
    const isSel = selIds.has(obj.id);
    const color = isSel ? SEL : (obj.color || COLS[obj.type]);

    if (obj.type === 'path') {
      const pts = obj.points || []; if (pts.length < 2) continue;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = isSel ? SEL : (obj.pathColor || '#a78bfa'); ctx.lineWidth = isSel ? 2.5 : 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      const l = pts[pts.length - 1], p = pts[pts.length - 2], a = Math.atan2(l.y - p.y, l.x - p.x);
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9, -4); ctx.lineTo(-9, 4); ctx.closePath();
      ctx.fillStyle = isSel ? SEL : (obj.pathColor || '#a78bfa'); ctx.fill(); ctx.restore();
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = isSel ? SEL : (obj.pathColor || '#a78bfa'); ctx.fill(); });
      ctx.fillStyle = 'rgba(232,232,240,.6)'; ctx.font = '10px DM Sans, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(obj.name, pts[Math.floor(pts.length / 2)].x, pts[Math.floor(pts.length / 2)].y - 9);
      continue;
    }

    if (obj.type === 'wall') {
      if (obj.x2 === undefined) continue;
      const tk = Math.max(2, (obj.thickness || 0.2) * GRID * 0.8);
      ctx.beginPath(); ctx.moveTo(obj.x, obj.y); ctx.lineTo(obj.x2, obj.y2);
      ctx.strokeStyle = isSel ? SEL : '#5a5a6e'; ctx.lineWidth = tk; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
      if (isSel) { [{ x: obj.x, y: obj.y }, { x: obj.x2, y: obj.y2 }].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = SEL; ctx.fill(); }); }
      const wlen = Math.round(Math.sqrt((obj.x2 - obj.x) ** 2 + (obj.y2 - obj.y) ** 2) / GRID * 10) / 10;
      ctx.fillStyle = 'rgba(152,152,170,.8)'; ctx.font = '9px DM Mono, monospace'; ctx.textAlign = 'center';
      ctx.fillText(obj.name + ' ' + wlen + 'm', (obj.x + obj.x2) / 2, (obj.y + obj.y2) / 2 - 7);
      continue;
    }

    if (obj.type === 'camera') {
      const isAct = obj.id === activeCamId, fR = (obj.fov || 60) * Math.PI / 180, range = 80, a = obj.angle || 0;
      ctx.beginPath(); ctx.moveTo(obj.x, obj.y);
      ctx.lineTo(obj.x + Math.sin(a - fR / 2) * range, obj.y - Math.cos(a - fR / 2) * range);
      ctx.arc(obj.x, obj.y, range, a - fR / 2 - Math.PI / 2, a + fR / 2 - Math.PI / 2);
      ctx.lineTo(obj.x, obj.y);
      ctx.fillStyle = isSel ? 'rgba(244,114,182,.08)' : isAct ? 'rgba(240,180,41,.1)' : 'rgba(240,180,41,.04)'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = isSel ? 1.5 : 0.7; ctx.stroke();
      const r = 9;
      ctx.save(); ctx.translate(obj.x, obj.y); ctx.rotate(a);
      ctx.beginPath(); ctx.roundRect(-r * 0.7, -r * 0.55, r * 1.0, r * 1.1, 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.05, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.05, -r * 0.05, r * 0.1, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill();
      if (isAct && !isSel) { ctx.beginPath(); ctx.arc(-r * 0.1, 0, r * 1.1, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(152,152,170,.8)'; ctx.font = '9px DM Mono, monospace'; ctx.textAlign = 'center';
      ctx.fillText((obj.lens || '50mm') + (obj.tilt ? ` ${obj.tilt > 0 ? '↑' : '↓'}${Math.abs(Math.round(obj.tilt))}°` : ''), obj.x, obj.y - 14);
    } else if (obj.type === 'light') {
      const lc = obj.lightColor || '#ff9944'; const r = 9;
      if (isSel) { ctx.beginPath(); ctx.arc(obj.x, obj.y, r + 5, 0, Math.PI * 2); ctx.strokeStyle = SEL; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }
      for (let i = 0; i < 8; i++) {
        const ang = i * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(obj.x + Math.cos(ang) * (r + 2), obj.y + Math.sin(ang) * (r + 2));
        ctx.lineTo(obj.x + Math.cos(ang) * (r + 7), obj.y + Math.sin(ang) * (r + 7));
        ctx.strokeStyle = lc; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(obj.x, obj.y, r * 0.8, 0, Math.PI * 2); ctx.fillStyle = lc + 'cc'; ctx.fill();
      ctx.beginPath(); ctx.arc(obj.x, obj.y, r * 0.4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
    } else if (obj.type === 'character') {
      const r = Math.max(7, Math.min(13, (obj.height || 1) * 4.5));
      const facing = obj.facing || 0;
      ctx.save(); ctx.translate(obj.x, obj.y); ctx.rotate(facing);
      if (isSel) { ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, Math.PI * 2); ctx.strokeStyle = SEL; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, r * 0.72, r * 0.33, r * 0.48, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.45); ctx.lineTo(0, -r * 1.35);
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r * 1.35); ctx.lineTo(-4, -r * 1.05); ctx.moveTo(0, -r * 1.35); ctx.lineTo(4, -r * 1.05);
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      if (obj.height) { ctx.fillStyle = 'rgba(152,152,170,.7)'; ctx.font = '9px DM Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(obj.height.toFixed(1) + 'm', obj.x, obj.y + r + 11); }
    } else if (obj.type === 'prop') {
      const r = Math.max(6, Math.min(13, (obj.height || 1) * 4));
      if (isSel) { ctx.beginPath(); ctx.rect(obj.x - r - 3, obj.y - r - 3, r * 2 + 6, r * 2 + 6); ctx.strokeStyle = SEL; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.roundRect(obj.x - r, obj.y - r, r * 2, r * 2, 2); ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(obj.x - r, obj.y - r); ctx.lineTo(obj.x + r, obj.y + r);
      ctx.moveTo(obj.x + r, obj.y - r); ctx.lineTo(obj.x - r, obj.y + r);
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.stroke();
      if (obj.height) { ctx.fillStyle = 'rgba(152,152,170,.7)'; ctx.font = '9px DM Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(obj.height.toFixed(1) + 'm', obj.x, obj.y + r + 11); }
    }

    ctx.fillStyle = 'rgba(232,232,240,.7)'; ctx.font = '10px DM Sans, sans-serif'; ctx.textAlign = 'center';
    const labelY = obj.type === 'camera' ? obj.y + 22 : obj.type === 'light' ? obj.y + 22 : obj.y + Math.max(7, Math.min(13, (obj.height || 1) * 4.5)) + 22;
    ctx.fillText(obj.name, obj.x, labelY);
  }
}

// ── Properties panel ──────────────────────────────────────────
function renderProps() {
  const panel = document.getElementById('props'), obj = selOne();
  if (!obj) {
    panel.innerHTML = selIds.size > 1
      ? `<div id="no-sel">${selIds.size} selected<button class="action-btn danger" style="margin-top:8px" onclick="deleteSelected()">Delete all</button></div>`
      : '<div id="no-sel">Select an object<br>to edit properties</div>';
    return;
  }

  let h = `<div><div class="prop-label">NAME</div><input type="text" value="${obj.name}" onchange="setProp('name',this.value);updateSidebar();updateShotBar();draw()"></div>`;

  if (obj.type === 'character') {
    h += `<div><div class="prop-label">COLOR</div><input type="color" value="${obj.color || COLS.character}" onchange="setProp('color',this.value);rebuildSel()"></div>`;
    const op = Object.keys(CHAR_P).map(k => `<option value="${k}"${obj.charPreset === k ? ' selected' : ''}>${k}</option>`).join('');
    h += `<div><div class="prop-label">SIZE PRESET</div><select onchange="applyCP(this.value)">${op}</select></div>`;
    h += `<div><div class="prop-label">HEIGHT</div><div class="range-row"><input type="range" min=".5" max="3" step=".1" value="${obj.height}" oninput="setProp('height',+this.value);rebuildSel();draw();document.getElementById('hv').textContent=(+this.value).toFixed(1)+'m'"><span class="range-val" id="hv">${obj.height.toFixed(1)}m</span></div></div>`;
    const fDeg = Math.round(((obj.facing || 0) * 180 / Math.PI + 360) % 360);
    h += `<div><div class="prop-label">FACING — <span style="font-size:10px;color:var(--text3)">Shift+scroll on canvas</span></div><div class="range-row"><input type="range" min="0" max="360" step="1" value="${fDeg}" oninput="setProp('facing',(+this.value)*Math.PI/180);rebuildSel();draw();document.getElementById('fv').textContent=this.value+'°'"><span class="range-val" id="fv">${fDeg}°</span></div></div>`;
  }
  if (obj.type === 'prop') {
    h += `<div><div class="prop-label">COLOR</div><input type="color" value="${obj.color || COLS.prop}" onchange="setProp('color',this.value);rebuildSel()"></div>`;
    const op = Object.keys(PROP_P).map(k => `<option value="${k}"${obj.propPreset === k ? ' selected' : ''}>${k}</option>`).join('');
    h += `<div><div class="prop-label">SIZE PRESET</div><select onchange="applyPP(this.value)">${op}</select></div>`;
    h += `<div><div class="prop-label">SIZE</div><div class="range-row"><input type="range" min=".1" max="12" step=".1" value="${obj.height}" oninput="setProp('height',+this.value);rebuildSel();draw();document.getElementById('hv').textContent=(+this.value).toFixed(1)+'m'"><span class="range-val" id="hv">${obj.height.toFixed(1)}m</span></div></div>`;
  }
  if (obj.type === 'camera') {
    const lo = Object.keys(LENS).map(k => `<option value="${k}"${obj.lens === k ? ' selected' : ''}>${k}</option>`).join('');
    const qo = ['standard', 'cinematic', 'flat'].map(q => `<option value="${q}"${obj.quality === q ? ' selected' : ''}>${q}</option>`).join('');
    h += `<div><div class="prop-label">SHOT PRESET</div><div class="preset-grid">${Object.keys(SHOTS).map(k => `<div class="preset-btn" onclick="applyShot('${k}')">${k}</div>`).join('')}</div></div>`;
    h += `<div><div class="prop-label">LENS</div><select onchange="applyLens(this.value)">${lo}</select></div>`;
    const ch = obj.camH ?? 1.6, tilt = obj.tilt || 0;
    h += `<div><div class="prop-label">FOV</div><div class="range-row"><input type="range" min="5" max="120" step="1" value="${Math.round(obj.fov || 60)}" oninput="setProp('fov',+this.value);draw();document.getElementById('fv').textContent=this.value+'°'"><span class="range-val" id="fv">${Math.round(obj.fov || 60)}°</span></div></div>`;
    h += `<div><div class="prop-label">HEIGHT</div><div class="range-row"><input type="range" min=".1" max="8" step=".1" value="${ch}" oninput="setProp('camH',+this.value);document.getElementById('chv').textContent=(+this.value).toFixed(1)+'m'"><span class="range-val" id="chv">${ch.toFixed(1)}m</span></div></div>`;
    h += `<div><div class="prop-label">TILT</div><div class="range-row"><input type="range" min="-85" max="85" step="1" value="${Math.round(tilt)}" oninput="setProp('tilt',+this.value);draw();document.getElementById('tv').textContent=(this.value>0?'+':'')+this.value+'°'"><span class="range-val" id="tv">${tilt > 0 ? '+' : ''}${Math.round(tilt)}°</span></div></div>`;
    h += `<div><div class="prop-label">LOOK</div><select onchange="setProp('quality',this.value)">${qo}</select></div>`;
    h += `<button class="action-btn${obj.id === activeCamId ? ' primary' : ''}" onclick="setActiveCam(${obj.id})">${obj.id === activeCamId ? '★ Active camera' : 'Set as active'}</button>`;
  }
  if (obj.type === 'light') {
    const to = ['key', 'fill', 'rim', 'point'].map(k => `<option value="${k}"${obj.lightType === k ? ' selected' : ''}>${{ key: 'Key light', fill: 'Fill light', rim: 'Rim light', point: 'Point light' }[k]}</option>`).join('');
    h += `<div><div class="prop-label">TYPE</div><select onchange="setLP('lightType',this.value)">${to}</select></div>`;
    h += `<div><div class="prop-label">COLOR</div><input type="color" value="${obj.lightColor || '#ffffff'}" onchange="setLP('lightColor',this.value)"></div>`;
    h += `<div><div class="prop-label">INTENSITY</div><div class="range-row"><input type="range" min="0" max="3" step=".1" value="${obj.intensity || 1}" oninput="setLP('intensity',+this.value);document.getElementById('iv').textContent=(+this.value).toFixed(1)"><span class="range-val" id="iv">${(obj.intensity || 1).toFixed(1)}</span></div></div>`;
    h += `<div><div class="prop-label">HEIGHT</div><div class="range-row"><input type="range" min=".5" max="12" step=".1" value="${obj.lightH || 3}" oninput="setLP('lightH',+this.value);document.getElementById('lhv').textContent=(+this.value).toFixed(1)+'m'"><span class="range-val" id="lhv">${(obj.lightH || 3).toFixed(1)}m</span></div></div>`;
  }
  if (obj.type === 'wall') {
    const wlen = obj.x2 !== undefined ? Math.round(Math.sqrt((obj.x2 - obj.x) ** 2 + (obj.y2 - obj.y) ** 2) / GRID * 10) / 10 : 0;
    h += `<div><div class="prop-label">COLOR</div><input type="color" value="${obj.color || '#5a5a6e'}" onchange="setProp('color',this.value);rebuildSel()"></div>`;
    h += `<div><div class="prop-label">THICKNESS</div><div class="wall-thick-row">${[['Thin', 0.1], ['Normal', 0.2], ['Thick', 0.4]].map(([l, v]) => `<div class="wt-btn${(obj.thickness || 0.2) === v ? ' active' : ''}" onclick="setProp('thickness',${v});rebuildSel()">${l}</div>`).join('')}</div></div>`;
    h += `<div><div class="prop-label">WALL HEIGHT</div><div class="range-row"><input type="range" min=".5" max="6" step=".1" value="${obj.wallH || 2.5}" oninput="setProp('wallH',+this.value);rebuildSel();document.getElementById('whv').textContent=(+this.value).toFixed(1)+'m'"><span class="range-val" id="whv">${(obj.wallH || 2.5).toFixed(1)}m</span></div></div>`;
    h += `<div><div class="prop-label">LENGTH</div><div class="prop-val">${wlen}m</div></div>`;
  }
  if (obj.type === 'path') {
    h += `<div><div class="prop-label">PATH COLOR</div><input type="color" value="${obj.pathColor || '#a78bfa'}" onchange="setProp('pathColor',this.value);draw()"></div>`;
    h += `<div><div class="prop-label">WAYPOINTS</div><div class="prop-val">${(obj.points || []).length}</div></div>`;
    h += `<button class="action-btn danger" onclick="setProp('points',[]);draw();renderProps()">Clear waypoints</button>`;
  }
  h += `<div><div class="prop-label">NOTES</div><textarea rows="2" placeholder="Director notes…" onchange="setProp('notes',this.value)">${obj.notes || ''}</textarea></div>`;
  panel.innerHTML = h;
}

function setProp(k, v)  { const o = selOne(); if (o) o[k] = v; }
function rebuildSel()   { const o = selOne(); if (o) buildMesh(o); }
function setLP(k, v)    { const o = selOne(); if (!o) return; o[k] = v; buildMesh(o); draw(); }
function applyCP(p)     { const o = selOne(); if (!o) return; saveState(); o.charPreset = p; o.height = CHAR_P[p]; buildMesh(o); draw(); renderProps(); }
function applyPP(p)     { const o = selOne(); if (!o) return; saveState(); o.propPreset = p; o.height = PROP_P[p]; buildMesh(o); draw(); renderProps(); }
function applyLens(l)   { const o = selOne(); if (!o) return; o.lens = l; o.fov = LENS[l]?.fov || 40; draw(); renderProps(); }
function applyShot(n)   { const o = selOne(); if (!o || o.type !== 'camera') return; saveState(); const p = SHOTS[n]; o.lens = p.k; o.fov = LENS[p.k]?.fov || 40; o.camH = p.h * 3.5; o.tilt = p.t; draw(); renderProps(); ss(`Shot: ${n}`); }
function setActiveCam(id) { activeCamId = id; draw(); updateSidebar(); updateShotBar(); renderProps(); }

// ── Scene operations ──────────────────────────────────────────
function addObj(x, y) {
  const id = ++idCnt, cnt = objects.filter(o => o.type === mode).length + 1;
  const nm = { character: `Actor ${cnt}`, prop: `Prop ${cnt}`, camera: `Cam ${cnt}`, light: `Light ${cnt}`, wall: `Wall ${cnt}`, path: `Path ${cnt}` };
  const defs = {
    character: { height: 1.8, charPreset: 'Adult (1.8m)', color: '#6c8eff', facing: 0 },
    prop:      { height: 0.8, propPreset: 'Medium (.8m)', color: '#4ade9a' },
    camera:    { fov: 40, lens: '50mm', camH: 1.6, tilt: 0, angle: 0, quality: 'standard' },
    light:     { lightType: 'key', intensity: 1.0, lightColor: '#ffffff', lightH: 3.0 },
    wall:      { x2: sc(x) + GRID * 2, y2: sc(y), thickness: 0.2, wallH: 2.5, color: '#5a5a6e' },
    path:      { points: [{ x: sc(x), y: sc(y) }], pathColor: '#a78bfa' },
  };
  const obj = { id, type: mode, x: sc(x), y: sc(y), name: nm[mode], notes: '', ...defs[mode] };
  objects.push(obj);
  if (mode === 'camera' && !activeCamId) activeCamId = id;
  if (mode !== 'camera' && mode !== 'path') buildMesh(obj);
  selIds = new Set([id]); saveState(); draw(); updateSidebar(); updateShotBar(); renderProps();
  return obj;
}

function dupeSelected() {
  if (!selIds.size) return; saveState();
  const nIds = [];
  [...selIds].forEach(sid => {
    const o = objects.find(o => o.id === sid); if (!o) return;
    const id = ++idCnt, copy = { ...JSON.parse(JSON.stringify(o)), id, x: o.x + GRID, y: o.y + GRID, name: o.name + ' 2' };
    if (copy.x2 !== undefined) { copy.x2 += GRID; copy.y2 += GRID; }
    if (copy.points) copy.points = copy.points.map(p => ({ x: p.x + GRID, y: p.y + GRID }));
    objects.push(copy);
    if (copy.type !== 'camera' && copy.type !== 'path') buildMesh(copy);
    nIds.push(id);
  });
  selIds = new Set(nIds); draw(); updateSidebar(); updateShotBar(); renderProps(); ss('Duplicated.');
}

function deleteSelected() {
  if (!selIds.size) return; saveState();
  selIds.forEach(sid => {
    if (meshMap[sid]) { scene.remove(meshMap[sid]); delete meshMap[sid]; }
    objects = objects.filter(o => o.id !== sid);
    if (activeCamId === sid) { const nc = objects.find(o => o.type === 'camera'); activeCamId = nc ? nc.id : null; }
  });
  selIds = new Set(); draw(); updateSidebar(); updateShotBar(); renderProps(); ss('Deleted.');
}

function updateSidebar() {
  const list = document.getElementById('obj-list'); list.innerHTML = '';
  objects.forEach(obj => {
    const item = document.createElement('div');
    item.className = 'obj-item' + (selIds.has(obj.id) ? ' sel' : '');
    item.innerHTML = `<span class="obj-dot" style="background:${obj.color || COLS[obj.type]}"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${obj.name}${obj.id === activeCamId ? ' ★' : ''}</span><span class="obj-type">${obj.type.slice(0, 3).toUpperCase()}</span>`;
    item.onclick = e => {
      if (e.shiftKey) { if (selIds.has(obj.id)) selIds.delete(obj.id); else selIds.add(obj.id); }
      else selIds = new Set([obj.id]);
      draw(); updateSidebar(); renderProps();
    };
    list.appendChild(item);
  });
  document.getElementById('obj-count').textContent = objects.length;
}

function updateShotBar() {
  const cams = objects.filter(o => o.type === 'camera');
  document.getElementById('shot-chips').innerHTML = cams.map(c => `<span class="shot-chip${c.id === activeCamId ? ' active' : ''}" onclick="setActiveCam(${c.id})">${c.name}${c.notes ? ' ✎' : ''}</span>`).join('');
}

function clearScene() {
  saveState();
  objects.forEach(o => { if (meshMap[o.id]) scene.remove(meshMap[o.id]); });
  objects = []; meshMap = {}; selIds = new Set(); idCnt = 0; activeCamId = null;
  draw(); updateSidebar(); updateShotBar(); renderProps(); ss('Scene cleared.');
}

// ── Import / Export ───────────────────────────────────────────
function exportScene() {
  const d = { version: '7.0', activeCamId, todVal, objects };
  const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'scene.json'; a.click();
  ss('Scene exported.');
}

function importScene(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result); if (!d.objects) throw 0;
      saveState();
      objects.forEach(o => { if (meshMap[o.id]) scene.remove(meshMap[o.id]); }); meshMap = {}; objects = [];
      idCnt = Math.max(0, ...d.objects.map(o => o.id || 0));
      activeCamId = d.activeCamId || null;
      if (d.todVal !== undefined) { todVal = d.todVal; document.getElementById('tod-slider').value = todVal; setTOD(todVal); }
      d.objects.forEach(o => { objects.push(o); if (o.type !== 'camera' && o.type !== 'path') buildMesh(o); if (o.type === 'camera' && !activeCamId) activeCamId = o.id; });
      selIds = new Set(); draw(); updateSidebar(); updateShotBar(); renderProps(); ss(`Imported: ${file.name}`);
    } catch { ss('Import failed.'); }
  };
  r.readAsText(file); e.target.value = '';
}

function exportPNG() {
  renderer.render(scene, cam3d);
  const a = document.createElement('a'); a.download = 'shot.png'; a.href = pvC.toDataURL('image/png'); a.click();
  ss('Preview saved as PNG.');
}

// ── Mode & path/wall helpers ──────────────────────────────────
function setMode(m) {
  if (pathDraw && m !== 'path') finishPath();
  if (wallDraw && m !== 'wall') finishWall();
  mode = m;
  ['character', 'prop', 'camera', 'light', 'wall', 'path', 'select'].forEach(id => document.getElementById('btn-' + id)?.classList.remove('mode-active'));
  document.getElementById('btn-' + m)?.classList.add('mode-active');
  tdC.style.cursor = m === 'select' ? 'default' : 'crosshair';
  const hints = {
    character: 'Click to place actor.',
    prop:      'Click to place prop.',
    camera:    'Click to place camera.',
    light:     'Click to place light.',
    wall:      'Click start point, then end point to draw a wall. Esc to cancel.',
    path:      'Click to add waypoints. Double-click or Esc to finish.',
    select:    'Click to select. Shift+click for multi-select. Drag to move. Scroll = rotate cam. Shift+scroll = rotate actor facing.',
  };
  ss(hints[m] || '');
}

function finishPath() {
  if (pathPts.length >= 2) {
    const id = ++idCnt, cnt = objects.filter(o => o.type === 'path').length + 1;
    objects.push({ id, type: 'path', x: pathPts[0].x, y: pathPts[0].y, name: `Path ${cnt}`, points: [...pathPts], pathColor: '#a78bfa', notes: '' });
    selIds = new Set([id]); saveState(); updateSidebar(); renderProps();
  }
  pathDraw = false; pathPts = []; draw();
}

function finishWall() {
  if (wallStart && wallStart.ex !== undefined) {
    const id = ++idCnt, cnt = objects.filter(o => o.type === 'wall').length + 1;
    const obj = { id, type: 'wall', x: sc(wallStart.x), y: sc(wallStart.y), x2: sc(wallStart.ex), y2: sc(wallStart.ey), name: `Wall ${cnt}`, thickness: 0.2, wallH: 2.5, color: '#5a5a6e', notes: '' };
    objects.push(obj); buildMesh(obj); selIds = new Set([id]); saveState(); updateSidebar(); renderProps();
  }
  wallDraw = false; wallStart = null; draw();
}

function getObjAt(x, y) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type === 'path') {
      const pts = o.points || [];
      for (let j = 0; j < pts.length - 1; j++) {
        const dx = pts[j + 1].x - pts[j].x, dy = pts[j + 1].y - pts[j].y, len = Math.sqrt(dx * dx + dy * dy);
        if (!len) continue;
        const t = Math.max(0, Math.min(1, ((x - pts[j].x) * dx + (y - pts[j].y) * dy) / (len * len)));
        if (Math.sqrt((x - pts[j].x - t * dx) ** 2 + (y - pts[j].y - t * dy) ** 2) < 8) return o;
      }
      continue;
    }
    if (o.type === 'wall' && o.x2 !== undefined) {
      const dx = o.x2 - o.x, dy = o.y2 - o.y, len = Math.sqrt(dx * dx + dy * dy);
      if (!len) continue;
      const t = Math.max(0, Math.min(1, ((x - o.x) * dx + (y - o.y) * dy) / (len * len)));
      if (Math.sqrt((x - o.x - t * dx) ** 2 + (y - o.y - t * dy) ** 2) < 8) return o;
      continue;
    }
    if (Math.sqrt((x - o.x) ** 2 + (y - o.y) ** 2) < 14) return o;
  }
  return null;
}

function ss(m) { document.getElementById('status-text').textContent = m; }
function showHelp() { document.getElementById('help-overlay').classList.add('show'); }
function hideHelp() { document.getElementById('help-overlay').classList.remove('show'); }

// ── Canvas resize ─────────────────────────────────────────────
function resizeCanvases() {
  const tw = document.getElementById('td-wrap'), pw = document.getElementById('preview-wrap');
  tdW = tw.clientWidth; tdH = tw.clientHeight;
  tdC.width = tdW; tdC.height = tdH;
  const pW = pw.clientWidth, pH = pw.clientHeight;
  pvC.width = pW; pvC.height = pH; pvC.style.width = pW + 'px'; pvC.style.height = pH + 'px';
  ovC.width = pW; ovC.height = pH; ovC.style.width = pW + 'px'; ovC.style.height = pH + 'px';
  if (renderer) { renderer.setSize(pW, pH); cam3d.aspect = pW / pH; cam3d.updateProjectionMatrix(); }
  draw(); setAR(curAR);
}

// ── Event listeners ───────────────────────────────────────────
tdC.addEventListener('mousedown', e => {
  const rect = tdC.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
  wasDrag = false;
  if (mode === 'path') { if (!pathDraw) { pathDraw = true; pathPts = []; } pathPts.push({ x: sc(x), y: sc(y) }); draw(); return; }
  if (mode === 'wall') { if (!wallDraw) { wallDraw = true; wallStart = { x: sc(x), y: sc(y), ex: sc(x), ey: sc(y) }; } else { wallStart.ex = sc(x); wallStart.ey = sc(y); finishWall(); } draw(); return; }
  if (mode === 'select') {
    const hit = getObjAt(x, y);
    if (hit) {
      if (e.shiftKey) { if (selIds.has(hit.id)) selIds.delete(hit.id); else selIds.add(hit.id); }
      else if (!selIds.has(hit.id)) selIds = new Set([hit.id]);
      dragId = hit.id; dragOff = { x: x - hit.x, y: y - hit.y };
      draw(); updateSidebar(); renderProps();
    } else if (!e.shiftKey) { selIds = new Set(); draw(); updateSidebar(); renderProps(); }
  } else { addObj(x, y); }
});

tdC.addEventListener('dblclick', e => { if (mode === 'path' && pathDraw) finishPath(); });

tdC.addEventListener('mousemove', e => {
  const rect = tdC.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (wallDraw && wallStart) { wallStart.ex = sc(x); wallStart.ey = sc(y); draw(); return; }
  if (dragId === null) return; wasDrag = true;
  const main = objects.find(o => o.id === dragId); if (!main) return;
  const nx = sc(x - dragOff.x), ny = sc(y - dragOff.y), dx = nx - main.x, dy = ny - main.y;
  selIds.forEach(sid => {
    const o = objects.find(o => o.id === sid); if (!o) return;
    o.x += dx; o.y += dy;
    if (o.x2 !== undefined) { o.x2 += dx; o.y2 += dy; }
    if (o.points) o.points = o.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    if (meshMap[o.id]) { if (o.type === 'wall') buildMesh(o); else { const w = td2w(o.x, o.y); meshMap[o.id].position.x = w.x; meshMap[o.id].position.z = w.z; } }
  });
  draw();
});

tdC.addEventListener('mouseup', () => { if (wasDrag && dragId !== null) saveState(); dragId = null; wasDrag = false; });
tdC.addEventListener('mouseleave', () => { if (wasDrag && dragId !== null) saveState(); dragId = null; wasDrag = false; });

tdC.addEventListener('wheel', e => {
  const o = selOne(); if (!o) return;
  e.preventDefault();
  if (o.type === 'camera') {
    o.angle = (o.angle || 0) + e.deltaY * 0.006;
    draw(); renderProps(); ss(`Cam angle: ${Math.round(((o.angle * 180 / Math.PI) % 360 + 360) % 360)}°`);
  } else if (o.type === 'character' && e.shiftKey) {
    o.facing = (((o.facing || 0) + e.deltaY * 0.008) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    buildMesh(o); draw(); renderProps(); ss(`Facing: ${Math.round(o.facing * 180 / Math.PI)}°`);
  }
}, { passive: false });

document.addEventListener('keydown', e => {
  const ctrl = e.metaKey || e.ctrlKey, tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (ctrl && e.shiftKey && e.key === 'z') { e.preventDefault(); redo(); }
  else if (ctrl && e.key === 'z') { e.preventDefault(); undo(); }
  else if (ctrl && e.key === 'd') { e.preventDefault(); dupeSelected(); }
  else if (ctrl && e.key === 'p') { e.preventDefault(); exportPNG(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  else if (e.key === 'a') setMode('character');
  else if (e.key === 'c') setMode('camera');
  else if (e.key === 'l') setMode('light');
  else if (e.key === 'g') toggleSnap();
  else if (e.key === 't') toggleThirds();
  else if (e.key === 'z' && !ctrl) toggleSafe();
  else if (e.key === '?') showHelp();
  else if (e.key === 'Escape') { hideHelp(); if (mode === 'path' && pathDraw) finishPath(); else if (mode === 'wall' && wallDraw) finishWall(); setMode('select'); }
  else if (e.key === 's') setMode('select');
});

window.addEventListener('resize', resizeCanvases);

// ── Boot ──────────────────────────────────────────────────────
initThree();
setTimeout(() => { resizeCanvases(); setAR('2.39:1'); }, 100);
