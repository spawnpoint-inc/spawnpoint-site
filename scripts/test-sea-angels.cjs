/* Run with node scripts/test-sea-angels.cjs. No runtime or test dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { settings, createSchool } = require('../landing-sea-angels.js');
const layouts = require('./sea-angel-layouts.json');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../brand/sea-angel/shape.js'), 'utf8'), context);
const shape = context.window.seaAngelShape;
const bodyCount = shape.body[0].length;
const wrap = v => Math.atan2(Math.sin(v), Math.cos(v));
const visible = b => b.right > 24 && b.left < currentWidth - 24 && b.bottom > 110 && b.top < currentHeight - 24;
let currentWidth, currentHeight;
function polygon(a) {
  const p = [];
  for (let i = 0; i < bodyCount; i += 6) p.push([a.points[i * 2], a.points[i * 2 + 1]]);
  return p;
}
function inside(p, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
function visibleOverlap(a, b, school) {
  if (!school.boundsIntersect(a.bounds, b.bounds, 0) || !visible(a.bounds) || !visible(b.bounds)) return false;
  const pa = polygon(a), pb = polygon(b);
  const inView = p => p[0] > 0 && p[0] < currentWidth && p[1] > 96 && p[1] < currentHeight;
  return pa.some(p => inView(p) && inside(p, pb)) || pb.some(p => inView(p) && inside(p, pa));
}
const results = [];
for (const layout of layouts) {
  for (const population of layout.width <= 1200 ? [settings.population.tablet] : [settings.population.desktop]) {
    currentWidth = layout.width; currentHeight = layout.height;
    const school = createSchool({ ...layout, settings, shape, population });
    const snapshots = school.fish.map(a => ({ minX: a.x, maxX: a.x, minY: a.y, maxY: a.y, minHeading: a.heading, maxHeading: a.heading, minTail: Infinity, maxTail: -Infinity }));
    const collisions = new Map();
    let maxCollisionSeconds = 0, minVisible = population, maxVisible = 0, totalVisible = 0;
    for (let frame = 0; frame < 3600; frame++) {
      school.step(1 / 60);
      let count = 0;
      for (const a of school.fish) {
        assert.ok(Number.isFinite(a.x + a.y + a.heading), 'finite simulation');
        assert.ok(a.speed >= 15 && a.speed <= 50.001, 'bounded speed');
        for (const z of layout.zones) assert.equal(school.boundsIntersect(a.bounds, z, 0), false, `${layout.width}/${population}: content collision`);
        if (visible(a.bounds)) count++;
        const s = snapshots[a.id];
        s.minX = Math.min(s.minX, a.x); s.maxX = Math.max(s.maxX, a.x);
        s.minY = Math.min(s.minY, a.y); s.maxY = Math.max(s.maxY, a.y);
        s.minHeading = Math.min(s.minHeading, a.heading); s.maxHeading = Math.max(s.maxHeading, a.heading);
        const tx = a.nodes[16] - a.nodes[14], ty = a.nodes[17] - a.nodes[15], len = Math.hypot(tx, ty);
        const tail = (-(a.spine[16] - a.nodes[16]) * ty + (a.spine[17] - a.nodes[17]) * tx) / len;
        s.minTail = Math.min(s.minTail, tail); s.maxTail = Math.max(s.maxTail, tail);
        let previous = Math.atan2(a.spine[3] - a.spine[1], a.spine[2] - a.spine[0]);
        for (let n = 2; n < 9; n++) {
          const h = Math.atan2(a.spine[n * 2 + 1] - a.spine[(n - 1) * 2 + 1], a.spine[n * 2] - a.spine[(n - 1) * 2]);
          assert.ok(Math.abs(wrap(h - previous)) <= settings.turning.jointLimit + 0.0001, 'bounded spine curvature'); previous = h;
        }
      }
      minVisible = Math.min(minVisible, count); maxVisible = Math.max(maxVisible, count); totalVisible += count;
      if (frame % 6 === 0) for (let i = 0; i < population; i++) for (let j = i + 1; j < population; j++) {
        const key = `${i}:${j}`;
        const duration = visibleOverlap(school.fish[i], school.fish[j], school) ? (collisions.get(key) || 0) + 0.1 : 0;
        collisions.set(key, duration); maxCollisionSeconds = Math.max(maxCollisionSeconds, duration);
      }
    }
    for (const s of snapshots) {
      assert.ok(Math.hypot(s.maxX - s.minX, s.maxY - s.minY) > 120, 'no stuck creatures');
      assert.ok(s.maxHeading - s.minHeading > Math.PI / 2, 'broad swimming turns');
    }
    assert.equal(school.stats.respawns, 0, 'continuous paths without teleports');
    assert.ok(school.stats.maxVisibleCorrection < settings.grid.tile, 'no visible correction jumps exceeding one tile');
    assert.ok(maxCollisionSeconds < 1.6, `persistent visible overlap: ${layout.width}/${population} ${maxCollisionSeconds.toFixed(1)}s`);
    if (layout.width === 1440) for (const s of snapshots.slice(0, 2)) assert.ok(s.maxTail - s.minTail >= 48 && s.maxTail - s.minTail <= 72.5, `large tail excursion approximately 48 to 72px: ${s.maxTail - s.minTail}`);
    results.push({ width: layout.width, population, protectedIntersections: 0, visible: [minVisible, maxVisible], meanVisible: +(totalVisible / 3600).toFixed(2), maxVisibleOverlapSeconds: +maxCollisionSeconds.toFixed(1), maxCorrectionPixels: +school.stats.maxCorrection.toFixed(2), maxVisibleCorrectionPixels: +school.stats.maxVisibleCorrection.toFixed(2), tailExcursionPixels: snapshots.slice(0, 2).map(s => +(s.maxTail - s.minTail).toFixed(1)) });
  }
}
const layout = layouts.find(l => l.width === 1440);
// A stroke on a fixed curved body must travel in its rest attachment frame,
// never acquire sideways motion by sampling a different spine location.
const fixedSettings = JSON.parse(JSON.stringify(settings));
fixedSettings.tail.amplitude = 0;
const fixed = createSchool({ ...layout, settings: fixedSettings, shape, population: 2 });
const originalPoints = [...shape.body, ...shape.highlight].flat();
let attachmentChecks = 0;
for (const curvature of [-0.14, 0.14]) {
  const a = fixed.fish[0];
  a.turn = 0;
  for (let n = 1; n < 9; n++) {
    const angle = a.heading + Math.PI + n * curvature;
    a.nodes[n * 2] = a.nodes[(n - 1) * 2] + Math.cos(angle) * 32.5 * a.scale;
    a.nodes[n * 2 + 1] = a.nodes[(n - 1) * 2 + 1] + Math.sin(angle) * 32.5 * a.scale;
  }
  let referenceNormals;
  for (let phase = 0; phase < 24; phase++) {
    a.phase = phase * Math.PI / 12;
    fixedSettings.wings.bend = 0; fixed.pose(a);
    const withoutStroke = a.points.slice();
    if (!referenceNormals) referenceNormals = a.normals.slice();
    assert.deepEqual(a.normals, referenceNormals, 'fixed curved attachment frame across stroke phases');
    fixedSettings.wings.bend = settings.wings.bend; fixed.pose(a);
    originalPoints.forEach(([x, y], i) => {
      const frame = require('../brand/sea-angel/rig').frame(a,y,new Float64Array(4));
      const nx = frame[2], ny = frame[3];
      const dx = a.points[i * 2] - withoutStroke[i * 2], dy = a.points[i * 2 + 1] - withoutStroke[i * 2 + 1];
      assert.ok(Math.abs(dx * nx + dy * ny) < 0.001, 'wing stroke adds no lateral wag on a curved spine');
      if (Math.abs(x) <= 22) assert.ok(Math.hypot(dx, dy) < 0.001, 'wing roots remain attached');
      attachmentChecks++;
    });
  }
}
const six = createSchool({ ...layout, settings, shape, population: 6 });
const eight = createSchool({ ...layout, settings, shape, population: 8 });
for (let i = 0; i < 6; i++) assert.deepEqual(six.fish[i].points, eight.fish[i].points, 'same first six starting creatures');
const repeat = createSchool({ ...layout, settings, shape, population: 6 });
for (let i = 0; i < 120; i++) { six.step(1 / 60); repeat.step(1 / 60); }
assert.deepEqual(six.fish.map(a => a.points), repeat.fish.map(a => a.points), 'deterministic seed and simulation');
console.log(JSON.stringify({ passed: true, attachmentChecks, simulatedSecondsPerCase: 60, results }, null, 2));
