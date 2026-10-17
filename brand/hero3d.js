/* The hero's background: the tile grid in three dimensions. Same 48 by 32 grid and sea-angel
   mask as brand/tiles.js, but each tile is a lit block that rises when it
   turns light and sinks when it turns pink, the whole slab tilts toward the
   pointer, and tiles near the pointer lift. On load the grid assembles from
   below. If WebGL is unavailable the 2D canvas underneath stays as is;
   reduced motion renders one settled frame and stops. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const MASK = "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000001100000000000000000000000000000000000111100000001110000000000000000000000000000000001111111000011111100000000000000000000000000000000011111110011111000000000000000000000000000000000001111111111111000000000000000000000000000000000001111111111111000000000000000000000000000000000001111111111110000000000000000000000000000000000000111111111110000000000000000000000000000000000000111111111111100000000000000000000000000000000000011111111111110000000000000000000000000000000000001111111111111000000000000000000000000000000000011111111111111000000000000000000000000000000000111111111111111000000000000000000000000000000000111111111110000000000000000000000000000000000000111111110000000000000000000000000000000000000001111111100000000000000000000000000000000000000001111111000000000000000000000000000000000000000011111100000000000000000000000000000000000000001111111100000000000000000000000000000000000000011111111000000000000000000000000000000000000000111111100000000000000000000000000000000000000011111110000000000000000000000000000000000000000011111000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
const COLS = 48, ROWS = 32;
// The panel is padded with plain tiles so the slab fills any viewport
// without zooming into the angel. How many depends on the stage's shape:
// size() measures what the camera sees and grows the padding to match.
const PINK = new THREE.Color("#ef285e"), LIGHT = new THREE.Color("#ffd2de"), DARK = "#171717";

const panel = document.querySelector(".lp-hero-stage");
const hero = document.querySelector(".lp-hero") || panel;
const flat = document.getElementById("hero-tiles");
if (!panel) throw new Error("no hero stage");

// ?still renders the settled frame too, for screenshots.
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("still");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch (e) {
  throw e; // the 2D canvas stays
}
renderer.setClearColor(DARK, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
const canvas = renderer.domElement;
canvas.className = "lp-hero-canvas";
canvas.setAttribute("aria-hidden", "true");
panel.appendChild(canvas);
if (flat) flat.style.display = "none";

// Value noise in three dimensions, the third is time: identical to tiles.js so
// the two renderers drift the same way.
function hash(x, y, z) { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); }
function smooth(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }
function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const a = lerp(lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), xf), lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), xf), yf);
  const b = lerp(lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), xf), lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), xf), yf);
  return lerp(a, b, zf);
}
function field(c, r, t) {
  const x = c * 0.1 + t * 0.05, y = r * 0.1 - t * 0.025;
  return noise(x, y, t * 0.07) * 0.65 + noise(x * 2.4 + 7, y * 2.4 + 3, t * 0.11) * 0.35;
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(DARK, 60, 110);
const camera = new THREE.PerspectiveCamera(30, 3 / 2, 0.1, 200);

// Lights: a cool key from upper left, a warm pink bounce from below right,
// and a soft fill so the sides of the blocks still read.
scene.add(new THREE.HemisphereLight("#ffffff", "#3a0d18", 0.55));
const key = new THREE.DirectionalLight("#ffffff", 1.6);
key.position.set(-18, 24, 30);
scene.add(key);
const bounce = new THREE.PointLight("#ef285e", 180, 90, 1.6);
bounce.position.set(14, -12, 14);
scene.add(bounce);

const slab = new THREE.Group();
scene.add(slab);

const geo = new RoundedBoxGeometry(0.86, 0.86, 1.0, 3, 0.16);
// A touch of self-light keeps the brand pink from going maroon in shadow.
const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05, emissive: new THREE.Color("#ef285e"), emissiveIntensity: 0.22 });
const color = new THREE.Color();
const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(1, 1, 1);

// One instanced mesh for every tile outside the mask, padded by pad tiles
// on each side of the panel. A rebuild keeps each surviving tile's state, so
// growing the slab on a resize does not replay the entry.
let cells = [], N = 0, mesh = null, zNow, lit, delay;
const pad = { l: 0, r: 0, t: 0, b: 0 };
function build() {
  const was = new Map();
  cells.forEach(({ c, r }, i) => was.set(c + "," + r, i));
  const oldZ = zNow, oldLit = lit, old = mesh;
  cells = [];
  for (let r = -pad.t; r < ROWS + pad.b; r++) for (let c = -pad.l; c < COLS + pad.r; c++) {
    const inPanel = c >= 0 && c < COLS && r >= 0 && r < ROWS;
    if (inPanel && MASK.charAt(r * COLS + c) === "1") continue;
    cells.push({ c, r });
  }
  N = cells.length;
  mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // the slab always spans the view
  zNow = new Float32Array(N); lit = new Float32Array(N); delay = new Float32Array(N);
  // A tile new to a slab that has already settled starts in place.
  const fresh = !old || reduce || performance.now() - start < 3500 ? -14 : 0;
  for (let i = 0; i < N; i++) {
    const { c, r } = cells[i];
    const dx = c - COLS / 2 + 0.5, dy = r - ROWS / 2 + 0.5;
    // The entry wave spreads out from the centre, with a little jitter.
    delay[i] = Math.sqrt(dx * dx + dy * dy) * 0.035 + hash(c, r, 9) * 0.25;
    const j = was.get(c + "," + r);
    zNow[i] = j === undefined ? fresh : oldZ[j];
    lit[i] = j === undefined ? 0 : oldLit[j];
    mesh.setColorAt(i, PINK);
  }
  mesh.instanceColor.needsUpdate = true;
  slab.add(mesh);
  if (old) { slab.remove(old); old.dispose(); }
}

// How far the slab must reach from the panel's middle, in tiles, so no edge
// of the view looks past it: rays from the view's border onto the slab's
// plane, at the extremes of the pointer tilt. A hit beyond the fog is the
// background colour either way, so it asks for nothing.
const probe = new THREE.Object3D(), probePlane = new THREE.Plane(), normal = new THREE.Vector3();
function reach() {
  const need = { l: 0, r: 0, t: 0, b: 0 }, at = new THREE.Vector2(), p = new THREE.Vector3();
  probe.position.copy(slab.position);
  for (const tx of [-0.11, 0, 0.11]) for (const ty of [-0.14, 0, 0.14]) {
    probe.rotation.set(-0.22 + tx, ty, 0);
    probe.updateMatrixWorld();
    probePlane.setFromNormalAndCoplanarPoint(normal.set(0, 0, 1).applyQuaternion(probe.quaternion), probe.position);
    for (let k = 0; k <= 16; k++) {
      const s = -1 + k / 8;
      for (const [x, y] of [[-1, s], [1, s], [s, 1], [s, -1]]) {
        ray.setFromCamera(at.set(x, y), camera);
        if (!ray.ray.intersectPlane(probePlane, p) || p.distanceTo(camera.position) > scene.fog.far) continue;
        probe.worldToLocal(p);
        need.l = Math.max(need.l, -p.x); need.r = Math.max(need.r, p.x);
        need.t = Math.max(need.t, p.y); need.b = Math.max(need.b, -p.y);
      }
    }
  }
  return need;
}

// A plane the pointer is cast against to find which tile it hovers.
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2(2, 2), hit = new THREE.Vector3();
let hover = null, tiltX = 0, tiltY = 0, wantX = 0, wantY = 0;
hero.addEventListener("pointermove", (e) => {
  const b = panel.getBoundingClientRect();
  const u = (e.clientX - b.left) / b.width, v = (e.clientY - b.top) / b.height;
  ndc.set(u * 2 - 1, -(v * 2 - 1));
  wantY = (u - 0.5) * 0.28; wantX = (v - 0.5) * 0.22;
});
hero.addEventListener("pointerleave", () => { ndc.set(2, 2); wantX = 0; wantY = 0; });

function size() {
  const b = panel.getBoundingClientRect();
  const w = Math.max(1, Math.round(b.width)), h = Math.max(1, Math.round(b.height));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Fit the angel's rows into the view; the padding fills the width.
  // On wide screens the angel sits in the right half, beside the copy;
  // on narrow ones it is centred under it.
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const dist = (ROWS / 2 + 2) / Math.tan(vfov / 2);
  camera.position.set(0, -3, dist);
  scene.fog.near = dist + 14; scene.fog.far = dist + 70;
  const halfVisW = Math.tan(vfov / 2) * dist * camera.aspect;
  const angelX = -9; // the silhouette's centre column, from the slab's middle
  slab.position.x = camera.aspect > 1.1 ? halfVisW * 0.32 - angelX : -angelX;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // Grow the padding to what this view needs, plus a tile; never shrink it.
  const need = reach();
  const want = {
    l: Math.ceil(need.l - COLS / 2 + 1), r: Math.ceil(need.r - COLS / 2 + 1),
    t: Math.ceil(need.t - ROWS / 2 + 1), b: Math.ceil(need.b - ROWS / 2 + 1),
  };
  let grow = !mesh;
  for (const k in pad) if (want[k] > pad[k]) { pad[k] = want[k]; grow = true; }
  if (grow) build();
}

const ease = (x) => 1 - Math.pow(1 - x, 3);
const start = performance.now();
let last = 0;
function step(now) {
  const t = (now - start) / 1000;
  // Pointer hover: which tile, if any.
  ray.setFromCamera(ndc, camera);
  hover = ndc.x > 1 ? null : (ray.ray.intersectPlane(plane, hit) ? slab.worldToLocal(hit.clone()) : null);
  tiltX += (wantX - tiltX) * 0.06; tiltY += (wantY - tiltY) * 0.06;
  slab.rotation.x = -0.22 + tiltX; slab.rotation.y = tiltY;
  // Settle the whole slab in from a steeper angle on load.
  const intro = reduce ? 1 : Math.min(1, t / 2.2);
  slab.rotation.x -= (1 - ease(intro)) * 0.5;
  slab.position.y = (1 - ease(intro)) * -6;

  for (let i = 0; i < N; i++) {
    const { c, r } = cells[i];
    const x = c - COLS / 2 + 0.5, y = -(r - ROWS / 2 + 0.5);
    const v = field(c, r, t);
    const isLight = v > 0.555 || hash(c, r, Math.floor(t * 0.6)) > 0.985;
    lit[i] += ((isLight ? 1 : 0) - lit[i]) * 0.08;
    let target = lit[i] * 1.1;
    if (hover) {
      const d = Math.hypot(hover.x - x, hover.y - y);
      if (d < 5) target += (1 - d / 5) * (1 - d / 5) * 3.2;
    }
    const entry = reduce ? 1 : ease(Math.max(0, Math.min(1, (t - 0.1 - delay[i]) / 1.1)));
    const z = lerp(-14, target, entry);
    zNow[i] += (z - zNow[i]) * 0.18;
    pos.set(x, y, zNow[i]);
    m4.compose(pos, quat, scl);
    mesh.setMatrixAt(i, m4);
    color.copy(PINK).lerp(LIGHT, Math.min(1, lit[i] + (hover ? Math.max(0, 1 - Math.hypot(hover.x - x, hover.y - y) / 3) * 0.7 : 0)));
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  renderer.render(scene, camera);
}

let running = false, visible = true;
const budget = window.innerWidth < 900 ? 33 : 16; // phones get 30 fps
function frame(now) {
  if (!running) return;
  if (now - last >= budget) { last = now; step(now); }
  requestAnimationFrame(frame);
}
function play() { if (reduce || running || !visible || document.hidden) return; running = true; requestAnimationFrame(frame); }
function stop() { running = false; }

size();
function settle() { for (let k = 0; k < 40; k++) step(start + 4000 + k * 16); }
if (reduce) {
  // One settled frame: run the field forward so the tiles are in place,
  // and again whenever the stage changes size.
  settle();
  new ResizeObserver(() => { size(); settle(); }).observe(panel);
} else {
  new ResizeObserver(size).observe(panel);
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible) play(); else stop(); }).observe(panel);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else play(); });
  play();
}
