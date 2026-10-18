// Fig 2 on the landing page: the gate in front of every spawnpoint project,
// drawn as an office speed gate with a badge reader and a mode dial.
//
//   node figures/turnstile/build.mjs            writes brand/fig-turnstile.js
//   node figures/turnstile/build.mjs --audit    also proves the geometry
//   node figures/turnstile/build.mjs --page out.html   also writes a standalone page for checks
//
// Built with the Anatomy kit (figures/anatomy, MIT).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../anatomy/kit/iso-kit.mjs";
import * as G from "../anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../anatomy/kit/tube.mjs";
import * as A from "../anatomy/kit/audit.mjs";
import { kitScript } from "../anatomy/scripts/inline-kit.mjs";
import { MODES, PEOPLE, TOUR, verdict, LISTED, DOMAIN } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const argv = process.argv.slice(2);
const pageOut = argv.includes("--page") ? argv[argv.indexOf("--page") + 1] : null;

const W = 600;
const H = 400;
const AZIMUTH = 52;
const ELEVATION = 30;

// World units are about a centimetre: a waist-high gate, 170 long.
const PLATE = { x: -118, y: -68, w: 236, d: 128, r: 10 };
const PLATE_H = 10;
const FOOT_H = 5;
const CAB = { x: -85, y: -58, w: 170, d: 32, r: 5 };
const FACE_Y = CAB.y + CAB.d;
const SKIRT = k.insetPlan(CAB, -1.5);
const BODY_Z = [5, 86];
const TOP_Z = 91;
const HEAD = { x: -84, y: -56, w: 46, d: 26, r: 3 };
const HEAD_TOP = 115;
const EXIT = { x: 50, y: -55, w: 32, d: 24, r: 3 };
const EXIT_TOP = 101;
const CARD = { w: 20, h: 26, t: 0.8 };
const CARD_Y = -43.5;
const SLOT = { d: 2.2, w: 24 };
const SLOT_IN = { x: -71, y: CARD_Y - SLOT.d / 2, w: SLOT.w, d: SLOT.d, r: 1 };
const SLOT_OUT = { x: 53, y: CARD_Y - SLOT.d / 2, w: SLOT.w, d: SLOT.d, r: 1 };
const DIAL = [8, -36];
const POST = [10, -19];
const POST_R = 4.5;
const PADDLE = { r0: 4.8, r1: 50, t: 2.4, z0: 30, z1: 84, tip: 1.4 };
const MATE = { x: 5, y: 35, w: 10, d: 10, r: 2.5 };
const MAT = { x: -78, y: -12, w: 160, d: 44, r: 3 };
const FILE_IN = { x: -108, y: -16, w: 26, d: 22, r: 1.5 };
const FILE_OUT = { x: 82, y: -16, w: 26, d: 22, r: 1.5 };
const FILE_WALL = 1.2;
const FILE_H = 14;
const PITCH = 3.4;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [HEAD.x, HEAD.y, 146], [HEAD.x + HEAD.w, HEAD.y + HEAD.d, 146], [EXIT.x + EXIT.w, EXIT.y, 132], [-100, 0, 60]],
  W,
  H,
  { pad: 14, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const f2 = (v) => Math.round(v * 100) / 100;
const f3 = (v) => v.toFixed(3);
function planeMatrix(o, ex, ey) {
  const p0 = at(o);
  const px = at(G.add3(o, ex));
  const py = at(G.add3(o, ey));
  return `matrix(${f3(px[0] - p0[0])} ${f3(px[1] - p0[1])} ${f3(py[0] - p0[0])} ${f3(py[1] - p0[1])} ${f2(p0[0])} ${f2(p0[1])})`;
}
// A rounded rectangle as a closed path in some face plane, from (u, v) pairs.
const flatRect = (u0, v0, u1, v1, r) => {
  const ring = k.roundedPlan({ x: u0, y: v0, w: u1 - u0, d: v1 - v0, r }, 4);
  return `M${ring.map(([u, v]) => `${f2(u)} ${f2(v)}`).join("L")}Z`;
};
// Points on the lane face (y = FACE_Y) from (x, z).
const onFace = (x, z, y = FACE_Y) => [x, y, z];

const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "gate", ...rest });
}
function slab(name, plan, z, h, style = {}, { steps = 4, bevel = 0, extra = "", inner = "", bias = 0, ref, owner } = {}) {
  const shape = record(A.slab(plan, z, h, { name, owner }, steps));
  put(name, ref ?? [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], S(k.slabOf(plan, z, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function post(name, x, y, r, z, h, style = {}, { steps = 32, bevel = 0, extra = "", inner = "", bias = 0, owner } = {}) {
  const shape = record(A.cylinder(x, y, r, z, h, { name, owner }));
  put(name, [x, y, z + h / 2], S(k.cylinder(x, y, r, z, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}

// ---- the floor: plate, feet, ruler, label plate (always behind) ----
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
  back.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  record(A.cylinder(x, y, 5.4, -PLATE_H - FOOT_H, FOOT_H, { name: "stand.foot", ground: true }));
}
back.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: Ln(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
record(A.slab(PLATE, -PLATE_H, PLATE_H, { name: "stand.plate", ground: true }, 8));
back.push(Ln(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
const plateScrews = k.corners(PLATE, 10);
back.push(Ln(plateScrews.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(plateScrews.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
const STRIP = { x: PLATE.x + 30, y: PLATE.y + PLATE.d - 12, w: 140, d: 6, r: 1 };
back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
const ticks = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 4, 5, STRIP.y, 0.6, [1.8, 3.4], P);
back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
back.push(Dots([at([STRIP.x + 2, STRIP.y + 3, 0.6]), at([STRIP.x + STRIP.w - 2, STRIP.y + 3, 0.6])], { size: 0.45 }));
const LABEL = { x: STRIP.x + STRIP.w + 10, y: PLATE.y + PLATE.d - 20, w: 30, d: 13, r: 1.2 };
back.push(S(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 4), { tone: "faint" }));
back.push(Ln([[4, 4, 18], [4, 7, 12], [4, 10, 15]].map(([dx, dy, len]) => k.lineOnTop([LABEL.x + dx, LABEL.y + dy], [LABEL.x + dx + len, LABEL.y + dy], 0.8, P)).join(""), { tone: "lo", free: true }));
back.push(Dots([at([LABEL.x + LABEL.w - 3.4, LABEL.y + 3.4, 0.8]), at([LABEL.x + LABEL.w - 3.4, LABEL.y + LABEL.d - 3.4, 0.8])], { size: 0.45 }));

// ---- the lane mat with its grooves and two chevrons ----
{
  const grooves = [];
  for (let i = 0; i < 6; i++) {
    const y = MAT.y + 7 + i * 8.2;
    if (y > MAT.y + MAT.d - 5) break;
    grooves.push(k.planOutline({ x: MAT.x + 8, y, w: MAT.w - 16, d: 1.4, r: 0.7 }, 0.8, P, 3));
  }
  const arrow = (x0) => k.onTop([[x0, -3], [x0 + 8, 0], [x0, 3], [x0 + 2.4, 0]].map(([x, y]) => [x, MAT.y + MAT.d - 9 + y]), 0.8, P, true);
  slab("lane.mat", MAT, 0, 0.8, { tone: "lo", crease: "none" }, { steps: 3, extra: Ln(grooves.join(""), { tone: "faint" }) + Ln(arrow(-60) + arrow(-48) + arrow(40) + arrow(52), { tone: "lo" }) });
}

// ---- the cabinet ----
slab("cab.skirt", SKIRT, 0, BODY_Z[0], { tone: "lo" }, { steps: 6 });
{
  const seams = Ln(k.sideSeam(CAB, 14, P, 6), { tone: "faint" });
  const joints = [-30, 50].map((x) => path3([onFace(x, 14), onFace(x, BODY_Z[1])])).join("");
  const endX = CAB.x + CAB.w;
  const door = path3([[endX, -52, 22], [endX, -32, 22], [endX, -32, 78], [endX, -52, 78]], true);
  slab("cab.body", CAB, BODY_Z[0], BODY_Z[1] - BODY_Z[0], { tone: "mid", inner: seams + Ln(joints, { tone: "faint" }) }, { steps: 6, extra: "" });
  // Things on the two faces you can see: vents and two lock cylinders on the
  // lane face, a service door with its lock on the exit end.
  const vents = [];
  for (let i = 0; i < 6; i++) {
    const x = -78 + i * 7.6;
    vents.push(path3([onFace(x, 19.5, FACE_Y + 0.05), onFace(x + 5, 19.5, FACE_Y + 0.05), onFace(x + 5, 24.5, FACE_Y + 0.05), onFace(x, 24.5, FACE_Y + 0.05)], true));
  }
  const locks = [[-37, 74], [57, 74]];
  const lockRings = locks.map(([x, z]) => k.sideRing([x, FACE_Y + 0.05, z], 2.2, "y", P, 20)).join("");
  const lockSlots = locks.map(([x, z]) => path3([onFace(x, z - 1.2, FACE_Y + 0.05), onFace(x, z + 1.2, FACE_Y + 0.05)])).join("");
  const doorLock = k.sideRing([endX + 0.05, -42, 70], 2, "x", P, 20);
  // The one engraved label: the maker's name above the door.
  const nameplate = k.faceTextSvg(k.sideMatrix([endX + 0.05, -34.2, 0], 16.5, P, "right"), "spawnpoint", { size: 2.8, tone: "lo" });
  put(
    "cab.faces",
    [0, FACE_Y + 0.2, 50],
    Ln(vents.join(""), { tone: "lo" }) + Ln(lockRings, { tone: "lo" }) + Ln(lockSlots, { tone: "mid" }) + Ln(door, { tone: "faint" }) + Ln(doorLock, { tone: "lo" }) + Dots([at([endX + 0.05, -42, 70])], { size: 0.5 }) + nameplate,
    [record(A.box([-80, FACE_Y, 18], [62, FACE_Y + 0.1, 77], { name: "cab.faces" }))],
    { bias: 0.4 },
  );
}
{
  const KICK = { x: CAB.x + 8, y: FACE_Y, w: CAB.w - 16, d: 0.8, r: 0.3 };
  const screws = [-70, -40, -10, 30, 60].map((x) => at([x, FACE_Y + 0.85, 9.5]));
  slab("cab.kick", KICK, 6, 7, { tone: "lo" }, { steps: 2, extra: Dots(screws, { size: 0.4, tone: "mid" }) });
}
{
  // A light bar under the top's lip, screws along the skirt's ledge, two
  // floor anchors at the ends and the door's two hinge knuckles.
  slab("cab.lightbar", { x: -70, y: FACE_Y, w: 140, d: 0.7, r: 0.3 }, 80, 2.6, { tone: "lo" }, { steps: 2 });
  const ledge = [-75, -45, -15, 35, 65].map((x) => at([x, FACE_Y + 0.75, BODY_Z[0]]));
  put("cab.ledge", [0, FACE_Y + 0.75, BODY_Z[0]], Dots(ledge, { size: 0.4, tone: "mid" }), [record(A.box([-76, FACE_Y, BODY_Z[0] - 0.1], [66, FACE_Y + 1.5, BODY_Z[0]], { name: "cab.ledge" }))], { bias: 0.1 });
  for (const [x0, sign] of [[SKIRT.x - 6, -1], [SKIRT.x + SKIRT.w, 1]]) {
    const plan = { x: x0, y: -46, w: 6, d: 9, r: 0.6 };
    slab(`cab.anchor.${sign}`, plan, 0, 1.4, { tone: "lo" }, { steps: 2, bevel: 0.2, extra: Dots([at([x0 + 3, -43.6, 1.4]), at([x0 + 3, -39.4, 1.4])], { size: 0.4 }) });
  }
  for (const z of [26, 68]) post(`cab.hinge.${z}`, CAB.x + CAB.w + 0.6, -52.4, 0.8, z, 6, { tone: "mid" }, { steps: 12 });
}
slab("cab.top", SKIRT, BODY_Z[1], TOP_Z - BODY_Z[1], { tone: "mid" }, { steps: 6, bevel: 0.8, extra: Ln(k.planOutline(k.insetPlan(SKIRT, 4), TOP_Z, P, 6), { tone: "faint" }) });

// ---- the reader head: screen on the lane side, card slot and lamp on top ----
const SCREEN = { u0: 3, u1: 43, v0: 3, v1: 19 };
const SCREEN_M = planeMatrix([HEAD.x, HEAD.y + HEAD.d + 0.05, HEAD_TOP], [1, 0, 0], [0, 0, -1]);
const SCREEN_SPEC = {
  // Three lines: the mode, the email on the badge, and what the gate says.
  lines: [
    { v: 7.3, size: 2.9, tone: "mid" },
    { v: 12.4, size: 4, tone: "hi" },
    { v: 17, size: 2.9, tone: "hi" },
  ],
  u: 6,
};
{
  const head = HEAD;
  const lampPlan = k.insetPlan(SLOT_IN, -2.6);
  const slotDark = `<path class="ts-slot" d="${k.planOutline(SLOT_IN, HEAD_TOP, P, 3)}"/>`;
  const grille = k.dotGrid(HEAD.x + 32, HEAD.y + 4, 4, 2, 2.6, HEAD_TOP, P);
  const topScrews = [[HEAD.x + 3.4, HEAD.y + 3.4], [HEAD.x + 3.4, HEAD.y + HEAD.d - 3.4], [HEAD.x + HEAD.w - 3.4, HEAD.y + HEAD.d - 3.4]];
  const screen = [
    `<g transform="${SCREEN_M}">`,
    `<path class="ts-bezel" d="${flatRect(SCREEN.u0 - 1.4, SCREEN.v0 - 1.4, SCREEN.u1 + 1.4, SCREEN.v1 + 1.4, 2.2)}"/>`,
    `<path class="iso-line" data-tone="faint" d="${flatRect(SCREEN.u0 - 1.4, SCREEN.v0 - 1.4, SCREEN.u1 + 1.4, SCREEN.v1 + 1.4, 2.2)}"/>`,
    `<clipPath id="ts-screen-clip"><path d="${flatRect(SCREEN.u0, SCREEN.v0, SCREEN.u1, SCREEN.v1, 1.2)}"/></clipPath>`,
    `<path class="ts-glass" d="${flatRect(SCREEN.u0, SCREEN.v0, SCREEN.u1, SCREEN.v1, 1.2)}"/>`,
    `<g clip-path="url(#ts-screen-clip)" data-part="screen">`,
    ...SCREEN_SPEC.lines.map((line, i) => `<text class="ts-text" data-line="${i}" data-tone="${line.tone}" x="${SCREEN_SPEC.u}" y="${line.v}" font-size="${line.size}">${i === 0 ? "PRIVATE" : ""}</text>`),
    `</g>`,
    `<path class="iso-line" data-tone="lo" d="${flatRect(SCREEN.u0, SCREEN.v0, SCREEN.u1, SCREEN.v1, 1.2)}"/>`,
    `</g>`,
  ].join("");
  const lamp = `<path class="ts-glow" data-part="glow" d="${k.planOutline(k.insetPlan(SLOT_IN, -4.2), HEAD_TOP, P, 4)}"/>` + `<path class="iso-line ts-lamp" data-part="lamp" data-tone="lo" d="${k.planOutline(lampPlan, HEAD_TOP, P, 4)}"/>`;
  const seam = Ln(k.sideSeam(head, 94.5, P, 4), { tone: "faint" });
  const hx = HEAD.x + HEAD.w + 0.05;
  const vents = [0, 1, 2].map((i) => path3([[hx, -50 + i * 4.6, 100], [hx, -47.4 + i * 4.6, 100], [hx, -47.4 + i * 4.6, 110], [hx, -50 + i * 4.6, 110]], true)).join("");
  slab("head.body", head, TOP_Z, HEAD_TOP - TOP_Z, { tone: "mid", inner: seam }, {
    steps: 4,
    bevel: 0.8,
    extra: slotDark + Ln(k.planOutline(SLOT_IN, HEAD_TOP, P, 3), { tone: "lo" }) + lamp + Dots(grille, { size: 0.45, tone: "lo" }) + Ln(topScrews.map(([x, y]) => k.ring(x, y, 1.3, HEAD_TOP, P, 12)).join(""), { tone: "lo" }) + Dots(topScrews.map(([x, y]) => at([x, y, HEAD_TOP])), { size: 0.4 }) + Ln(vents, { tone: "lo" }) + screen,
  });
}

// ---- the exit block with the slot a badge comes out of ----
{
  const slotDark = `<path class="ts-slot" d="${k.planOutline(SLOT_OUT, EXIT_TOP, P, 3)}"/>`;
  const screws = [[EXIT.x + 3.2, EXIT.y + 3.2], [EXIT.x + EXIT.w - 3.2, EXIT.y + EXIT.d - 3.2]];
  slab("exit.block", EXIT, TOP_Z, EXIT_TOP - TOP_Z, { tone: "mid" }, {
    steps: 4,
    bevel: 0.6,
    extra: slotDark + Ln(k.planOutline(SLOT_OUT, EXIT_TOP, P, 3), { tone: "lo" }) + Ln(k.planOutline(k.insetPlan(SLOT_OUT, -2.4), EXIT_TOP, P, 4), { tone: "faint" }) + Ln(screws.map(([x, y]) => k.ring(x, y, 1.3, EXIT_TOP, P, 12)).join(""), { tone: "lo" }) + Dots(screws.map(([x, y]) => at([x, y, EXIT_TOP])), { size: 0.4 }),
  });
}

// ---- the mode dial: escutcheon, four detent marks, knurled knob, pointer ----
const DETENTS = [125, 155, 185, 215];
const DIAL_R = 10;
const KNOB = { skirt: 6.8, r: 4.8, z0: TOP_Z + 1.4, z1: TOP_Z + 1.4 + 2, z2: TOP_Z + 1.4 + 2 + 6 };
const dirOf = (deg) => [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)];
const pointerAt = (deg) => {
  const [dx, dy] = dirOf(deg);
  return k.lineOnTop([DIAL[0] + dx * 0.9, DIAL[1] + dy * 0.9], [DIAL[0] + dx * (KNOB.r - 0.7), DIAL[1] + dy * (KNOB.r - 0.7)], KNOB.z2, P);
};
{
  const [cx, cy] = DIAL;
  const marks = DETENTS.map((deg) => {
    const [dx, dy] = dirOf(deg);
    return k.lineOnTop([cx + dx * KNOB.skirt, cy + dy * KNOB.skirt], [cx + dx * (DIAL_R - 1.4), cy + dy * (DIAL_R - 1.4)], TOP_Z + 1.4, P);
  });
  const screws = [35, 325].map((deg) => {
    const [dx, dy] = dirOf(deg);
    return [cx + dx * 8.6, cy + dy * 8.6];
  });
  post("dial.plate", cx, cy, DIAL_R, TOP_Z, 1.4, { tone: "mid" }, {
    steps: 64,
    bevel: 0.4,
    extra:
      Ln(k.ring(cx, cy, DIAL_R - 1.4, TOP_Z + 1.4, P, 64), { tone: "lo" }) +
      DETENTS.map((deg, i) => `<path class="iso-line" data-tone="lo" data-mark="${i}" d="${marks[i]}"/>`).join("") +
      Ln(screws.map(([x, y]) => k.ring(x, y, 1, TOP_Z + 1.4, P, 12)).join(""), { tone: "lo" }) +
      Dots(screws.map(([x, y]) => at([x, y, TOP_Z + 1.4])), { size: 0.35 }),
  });
  post("dial.skirt", cx, cy, KNOB.skirt, KNOB.z0, KNOB.z1 - KNOB.z0, { tone: "mid" }, { steps: 48, bevel: 0.3 });
  post("dial.knob", cx, cy, KNOB.r, KNOB.z1, KNOB.z2 - KNOB.z1, { tone: "hi", crease: "lo" }, {
    steps: 48,
    extra: Ln(k.knurl(cx, cy, KNOB.r, KNOB.z1 + 0.6, KNOB.z2, 30, P, 0.3), { tone: "lo" }) + Ln(k.sideArc(cx, cy, KNOB.r, KNOB.z1 + 0.6, P, 24), { tone: "faint" }) + `<path class="iso-line" data-tone="hi" data-part="pointer" data-free="end" d="${pointerAt(DETENTS[0])}" style="stroke-width:1"/>` + Dots([at([cx, cy, KNOB.z2])], { size: 0.5, tone: "hi" }),
  });
}

// ---- a cable on the top from the reader head to the exit block, in clips ----
const CABLES = [];
function cable(name, points, r, { tone = "mid", bend = 3, shells = [false, false], rings, maxLength = 18, bias = 0.05, gaps: extraGaps = [] } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  const total = G.pathLength(route);
  const SHELL = Math.max(1.8, r * 2.4);
  const gaps = [...(shells[0] ? [[0, SHELL]] : []), ...extraGaps, ...(shells[1] ? [[total - SHELL, total]] : [])];
  R.route(name, route, r, { gaps, limp: true, rims: shells.map((on) => (on ? r * 1.9 : r)), piece: "gate" });
  CABLES.push(name);
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.6, Math.min(1.6, r)), gaps, ...(rings ? { rings } : {}) }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { bias }),
  );
  [0, 1].forEach((index) => {
    if (!shells[index]) return;
    const end = index ? route[route.length - 1] : route[0];
    const tangent = G.tangentAlong(route, index ? total : 0);
    const F = G.frameAlong(end, tangent);
    const [s0, s1] = index ? [-SHELL, 0] : [0, SHELL];
    const shape = record(A.disc(F, s0, s1, r * 1.9, { name: `${name}.shell${index}`, owner: name }));
    put(`${name}.shell${index}`, G.add3(end, G.mul3(tangent, (s0 + s1) / 2)), S(G.disc(s0, s1, r * 1.9, F, P, { steps: 24, bevel: 0.2 }), { tone: "mid" }), [shape], { bias: bias + 0.1 });
  });
  return route;
}
{
  const r = 1.1;
  const y = -49.8;
  const z = TOP_Z + r + 0.7;
  const points = [[HEAD.x + HEAD.w, y, 97], [HEAD.x + HEAD.w + 6, y, 97], [HEAD.x + HEAD.w + 12, y, z], [EXIT.x - 8, y, z], [EXIT.x - 3, y, 95], [EXIT.x, y, 95]];
  // Two saddle clips hold it to the top; the cable is gapped under each.
  const CLIPS = [-14, 28];
  const route = G.fillet(points, Math.max(3.4, r * 2.6), 10, { P, tube: r });
  const clipGaps = CLIPS.map((x) => {
    const i = route.findIndex((p) => p[0] >= x);
    const at0 = G.pathLength(route.slice(0, i)) + (x - route[i - 1][0]);
    return [at0 - 1.3, at0 + 1.3];
  });
  cable("cable.reader", points, r, { tone: "mid", bend: 3.4, shells: [true, true], rings: { pitch: 1.2, fade: [0.1, 0.55] }, gaps: clipGaps });
  for (const x of CLIPS) {
    const plan = { x: x - 1.3, y: y - 3.4, w: 2.6, d: 6.8, r: 0.5 };
    slab(`cable.clip.${x}`, plan, TOP_Z, 2 * r + 0.7, { tone: "mid" }, { steps: 2, bevel: 0.2, extra: Dots([at([x, y - 2.6, TOP_Z + 2 * r + 0.7]), at([x, y + 2.6, TOP_Z + 2 * r + 0.7])], { size: 0.35 }), owner: "cable.reader" });
  }
}

// ---- the paddle post, its collars and brackets ----
// The shaft is cut at each collar, so a collar sits on the shaft below it
// and carries the shaft above, flush, rather than wrapping it.
post("post.flange", POST[0], POST[1], 5.5, 0, 2, { tone: "lo" }, { steps: 40, bevel: 0.3, owner: "post" });
post("post.shaft.low", POST[0], POST[1], POST_R, 2, PADDLE.z0 - 4 - 2, { tone: "mid", crease: "none" }, { steps: 40, inner: Ln(k.sideArc(POST[0], POST[1], POST_R, 12, P, 20), { tone: "faint" }), owner: "post" });
post("post.collar.low", POST[0], POST[1], 6, PADDLE.z0 - 4, 4, { tone: "mid" }, { steps: 40, bevel: 0.3, owner: "post" });
post("post.shaft", POST[0], POST[1], POST_R, PADDLE.z0, PADDLE.z1 - PADDLE.z0, { tone: "mid", crease: "none" }, { steps: 40, owner: "post" });
post("post.collar.top", POST[0], POST[1], 6, PADDLE.z1, BODY_Z[1] - PADDLE.z1, { tone: "mid" }, { steps: 40, bevel: 0.3, owner: "post" });
for (const z of [16, 62]) slab(`post.bracket.${z}`, { x: POST[0] - 1.5, y: FACE_Y, w: 3, d: POST[1] - POST_R - FACE_Y + 0.35, r: 0.3 }, z, 6, { tone: "lo" }, { steps: 2 });

{
  const bolts = [45, 135, 225, 315].map((deg) => at([POST[0] + 5 * Math.cos((deg * Math.PI) / 180), POST[1] + 5 * Math.sin((deg * Math.PI) / 180), 2]));
  put("post.bolts", [POST[0], POST[1], 2.1], Dots(bolts, { size: 0.4 }), [record(A.cylinder(POST[0], POST[1], 5.4, 2, 0.05, { name: "post.bolts" }))], { bias: -0.2 });
  // A cable protector across the lane, from the post's foot to the mate.
  const F = G.frameOf([POST[0], MAT.y, 0.8], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const shape = [[-4.6, 0], [4.6, 0], [2.6, 2.2], [-2.6, 2.2]];
  const len = MATE.y - 2 - 1 - MAT.y;
  const grooves = [-1.1, 1.1].map((u) => path3([[POST[0] + u, MAT.y, 3], [POST[0] + u, MAT.y + len, 3]])).join("");
  put("lane.ramp", [POST[0], MAT.y + len / 2, 1.9], S(G.prismOf(F, shape, 0, len, P), { tone: "lo", inner: Ln(grooves, { tone: "faint" }) }), [record(A.prism(F, shape, 0, len, { name: "lane.ramp" }))]);
}

// ---- the paddle, at rest closed; the page rebuilds it as it swings ----
function paddlePaths(deg) {
  const a = (deg * Math.PI) / 180;
  const d = [Math.sin(a), Math.cos(a)];
  const n = [Math.cos(a), -Math.sin(a)];
  const t = PADDLE.t / 2;
  const p = (s, w) => [POST[0] + d[0] * s + n[0] * w, POST[1] + d[1] * s + n[1] * w];
  const ring = [p(PADDLE.r0, -t), p(PADDLE.r1, -t), p(PADDLE.r1, t), p(PADDLE.r0, t)];
  const panel = k.extrude(ring, PADDLE.z0, PADDLE.z1 - PADDLE.z0, P, { bevel: 0.4 });
  const facing = n[0] * V[0] + n[1] * V[1] > 0 ? 1 : -1;
  const inset = [
    [p(PADDLE.r0 + 4, facing * (t + 0.02)), PADDLE.z0 + 4],
    [p(PADDLE.r1 - 4, facing * (t + 0.02)), PADDLE.z0 + 4],
    [p(PADDLE.r1 - 4, facing * (t + 0.02)), PADDLE.z1 - 4],
    [p(PADDLE.r0 + 4, facing * (t + 0.02)), PADDLE.z1 - 4],
  ].map(([[x, y], z]) => [x, y, z]);
  const tip = p(PADDLE.r1, 0);
  const bumper = k.cylinder(tip[0], tip[1], PADDLE.tip, PADDLE.z0, PADDLE.z1 - PADDLE.z0, P, 16);
  return { panel, inset: path3(inset, true), bumper };
}
const paddleSvg = (deg) => {
  const p = paddlePaths(deg);
  return S(p.panel, { tone: "hi", crease: "lo", inner: Ln(p.inset, { tone: "faint" }) }) + S(p.bumper, { tone: "lo", crease: "none" });
};
{
  const t = PADDLE.t / 2;
  put("paddle", [POST[0], POST[1] + (PADDLE.r0 + PADDLE.r1) / 2, (PADDLE.z0 + PADDLE.z1) / 2], `<g data-part="paddle">${paddleSvg(0)}</g>`, [
    record(A.box([POST[0] - t, POST[1] + PADDLE.r0, PADDLE.z0], [POST[0] + t, POST[1] + PADDLE.r1 + PADDLE.tip, PADDLE.z1], { name: "paddle" })),
  ], { bias: 0.2 });
}

// ---- the mate post across the lane, with a bumper pad ----
slab("mate.foot", k.insetPlan(MATE, -2), 0, 1.5, { tone: "lo" }, { steps: 3, extra: Dots(k.corners(k.insetPlan(MATE, -2), 1.6).map(([x, y]) => at([x, y, 1.5])), { size: 0.4 }) });
slab("mate.body", MATE, 1.5, 86.5, { tone: "mid", inner: Ln(k.sideSeam(MATE, 12, P, 4), { tone: "faint" }) }, { steps: 4 });
slab("mate.cap", k.insetPlan(MATE, -0.6), 88, 4, { tone: "mid" }, { steps: 4, bevel: 0.5 });
slab("mate.pad", { x: MATE.x + 1.5, y: MATE.y - 1.6, w: MATE.w - 3, d: 1.6, r: 0.4 }, PADDLE.z0 + 2, PADDLE.z1 - PADDLE.z0 - 4, { tone: "lo" }, { steps: 2 });

// ---- the two badge files, recorded for the checks and drawn by the page ----
function fileWalls(name, F) {
  const w = FILE_WALL;
  const walls = {
    floor: { x: F.x, y: F.y, w: F.w, d: F.d, r: F.r },
    back: { x: F.x, y: F.y, w: F.w, d: w, r: 0.4 },
    left: { x: F.x, y: F.y, w: w, d: F.d, r: 0.4 },
    right: { x: F.x + F.w - w, y: F.y, w: w, d: F.d, r: 0.4 },
    front: { x: F.x, y: F.y + F.d - w, w: F.w, d: w, r: 0.4 },
  };
  for (const [part, plan] of Object.entries(walls)) record(A.slab(plan, part === "floor" ? 0 : 1.2, part === "floor" ? 1.2 : FILE_H - 1.2, { name: `${name}.${part}` }, 2));
  const svg = (part) => S(k.slabOf(walls[part], part === "floor" ? 0 : 1.2, part === "floor" ? 1.2 : FILE_H - 1.2, P, 2, part === "floor" ? 0 : 0.3), { tone: part === "floor" ? "lo" : "mid" });
  const rule = path3([[F.x + 6, F.y + F.d + 0.05, 7.4], [F.x + F.w - 6, F.y + F.d + 0.05, 7.4], [F.x + F.w - 6, F.y + F.d + 0.05, 4.2], [F.x + 6, F.y + F.d + 0.05, 4.2]], true);
  return {
    behind: svg("floor") + svg("back") + svg("left"),
    front: svg("right") + svg("front") + Ln(rule, { tone: "faint" }),
  };
}
const files = { queue: fileWalls("file.queue", FILE_IN), done: fileWalls("file.done", FILE_OUT) };

// ---- the badges: one card per person, built at its own origin ----
const CARD_FACE = (person, i) => {
  const o = [-CARD.w / 2, CARD.t / 2 + 0.02, CARD.h];
  const m = planeMatrix(o, [1, 0, 0], [0, 0, -1]);
  const lengths = [[6, 4.4, 6.4], [6.8, 3.8, 5.4], [5, 6, 4], [6.2, 3.2, 5]][i];
  const rules = lengths.map((len, j) => `M11 ${f2(8 + j * 2.4)}H${f2(11 + len)}`).join("");
  const head = [5.8, 9];
  const photo = flatRect(2.4, 5.6, 9.2, 14.2, 0.8);
  const shoulders = `M3.3 14.2C3.5 11.5 4.6 11.2 ${head[0]} 11.2S8.1 11.5 8.3 14.2`;
  const band = person.owner ? `<path class="ts-band" d="M0 20.6H20V26H0Z"/>` : "";
  return [
    `<g transform="${m}">`,
    band,
    `<path class="iso-line" data-tone="lo" d="${flatRect(7.2, 1.8, 12.8, 3.4, 0.8)}"/>`,
    `<path class="iso-line" data-tone="mid" d="${photo}"/>`,
    `<circle class="ts-head" cx="${head[0]}" cy="${head[1]}" r="1.5"/>`,
    `<path class="iso-line" data-tone="mid" d="${shoulders}"/>`,
    `<path class="iso-line" data-tone="lo" data-free="" d="${rules}"/>`,
    `<path class="iso-line" data-tone="faint" d="M0 19.2H20"/>`,
    `<path class="iso-line" data-tone="lo" data-free="" d="M2.4 23H${person.owner ? 8.4 : 6.8}"/>`,
    `</g>`,
  ].join("");
};
const cardSvg = (person, i) => {
  const plan = { x: -CARD.w / 2, y: -CARD.t / 2, w: CARD.w, d: CARD.t, r: 0.3 };
  return S(k.slabOf(plan, 0, CARD.h, P, 2, 0), { tone: "hi", crease: "lo" }) + CARD_FACE(person, i);
};

// ---- settle the order, then write the picture ----
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const groups = R.items.map((item) => `<g class="it" data-name="${item.name}">${item.svg}</g>`);

// The clip a badge passes through on its way into or out of a slot: the
// region above the slot's front lip, in the badge's own plane.
const clipAbove = (slot, top) => {
  const lip = slot.y + slot.d;
  const x0 = slot.x - 2;
  const x1 = slot.x + slot.w + 2;
  return path3([[x0, lip, top], [x1, lip, top], [x1, CARD_Y, top + 200], [x0, CARD_Y, top + 200]], true);
};
const lips = Ln(path3([[SLOT_IN.x + 1, SLOT_IN.y + SLOT_IN.d, HEAD_TOP], [SLOT_IN.x + SLOT_IN.w - 1, SLOT_IN.y + SLOT_IN.d, HEAD_TOP]]), { tone: "lo" }) + Ln(path3([[SLOT_OUT.x + 1, SLOT_OUT.y + SLOT_OUT.d, EXIT_TOP], [SLOT_OUT.x + SLOT_OUT.w - 1, SLOT_OUT.y + SLOT_OUT.d, EXIT_TOP]]), { tone: "lo" });

const LABEL_TEXT =
  "An office speed gate on a floor plate: a cabinet with a glass paddle across the lane, a reader head with a screen and a badge slot, a slot on the far end where a badge comes out, and a dial with four positions for who may come in. Two files of badges stand on the floor, one at the entrance and one past the gate.";
const svg = k.figureSvg({
  width: W,
  height: H,
  label: LABEL_TEXT,
  className: "ts-svg",
  body: [
    `<defs><clipPath id="ts-clip-in"><path d="${clipAbove(SLOT_IN, HEAD_TOP)}"/></clipPath><clipPath id="ts-clip-out"><path d="${clipAbove(SLOT_OUT, EXIT_TOP)}"/></clipPath></defs>`,
    ...back,
    `<g class="ts-gate">${groups.join("")}</g>`,
    `<g data-file="queue">${files.queue.behind}<g data-cards="queue"></g>${files.queue.front}</g>`,
    `<g data-file="done">${files.done.behind}<g data-cards="done"></g>${files.done.front}</g>`,
    `<g data-part="fly"></g>`,
    `<g data-part="lips">${lips}</g>`,
    `<g hidden data-part="deck">${PEOPLE.map((person, i) => `<g class="ts-card" data-card="${person.id}">${cardSvg(person, i)}</g>`).join("")}</g>`,
  ],
});

// Where the badges go, in world units: each file holds its badges upright
// one behind another; the slots take them straight down.
const fileSpot = (F, index, fromFront) => {
  const y = fromFront ? F.y + F.d - 3.2 - index * PITCH : F.y + 3.6 + index * PITCH;
  return [F.x + F.w / 2, y, 1.2];
};
const DATA = {
  P,
  V,
  card: CARD,
  cardY: CARD_Y,
  slotIn: { x: SLOT_IN.x + SLOT_IN.w / 2, top: HEAD_TOP },
  slotOut: { x: SLOT_OUT.x + SLOT_OUT.w / 2, top: EXIT_TOP },
  queue: [0, 1, 2, 3].map((i) => fileSpot(FILE_IN, i, true)),
  done: [0, 1, 2, 3].map((i) => fileSpot(FILE_OUT, i, false)),
  fileTop: FILE_H,
  dial: { c: DIAL, r: KNOB.r, z: KNOB.z2, detents: DETENTS },
  post: POST,
  paddle: PADDLE,
  modes: MODES,
  people: PEOPLE,
  listed: LISTED,
  domain: DOMAIN,
  tour: TOUR,
};

const CSS = readFileSync(join(HERE, "turnstile.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8")
  .replace("__DATA__", JSON.stringify(DATA))
  .replace("__VERDICT__", verdict.toString());

const plate = k.plateHtml({
  fig: "Fig 2",
  title: "Who gets in",
  hint: "Tap to change who gets in",
  readout: "private · you in",
  body: `<div class="iso-stage ts-stage" tabindex="0" role="slider" aria-valuemin="1" aria-valuemax="4" aria-valuenow="1" aria-valuetext="${MODES[0].say}" aria-label="The gate in front of a spawnpoint project. Tap, or press 1 to 4 or the arrow keys, to change who it lets in.">${svg}<span class="ts-sr" role="status" aria-live="polite" data-status></span></div>`,
});

const paddleFns = `const PADDLE_GEOM = ${JSON.stringify({ POST, PADDLE, V: [V[0], V[1]] })};\n`;
const script = `(function () {
const host = document.getElementById("fig-turnstile");
if (!host || host.dataset.drawn) return;
host.dataset.drawn = "1";
${kitScript()}
if (!document.getElementById("iso-css")) { const s = document.createElement("style"); s.id = "iso-css"; s.textContent = ISO_CSS; document.head.appendChild(s); }
if (!document.getElementById("fig-turnstile-css")) { const s = document.createElement("style"); s.id = "fig-turnstile-css"; s.textContent = ${JSON.stringify(CSS)}; document.head.appendChild(s); }
host.innerHTML = ${JSON.stringify(plate)};
${paddleFns}${LIVE}
})();
`;

mkdirSync(join(ROOT, "brand"), { recursive: true });
writeFileSync(join(ROOT, "brand", "fig-turnstile.js"), script);
console.log("wrote brand/fig-turnstile.js", `${(script.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `scale ${KS.toFixed(3)}`);

if (pageOut) {
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Who gets in</title><style>body{margin:0;background:#171717;color:#a3a3a3;font:14px/1.6 ui-sans-serif,system-ui,sans-serif}.wrap{width:min(720px,100% - 32px);margin:48px auto}:root{--font-data:ui-monospace,SFMono-Regular,Menlo,monospace}</style></head><body><div class="wrap"><div id="fig-turnstile" class="iso fig-turnstile"></div></div><script>${script.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;
  writeFileSync(pageOut, page);
  console.log("wrote", pageOut);
}

A.auditOrExit(R, P, {});
