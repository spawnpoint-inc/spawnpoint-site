// Fig 1 on the landing page: a two-bay cartridge changer that shows what
// "deploy again" does. The machine keeps one address (the plate on its
// plinth). A new version arrives in the empty bay, the shuttle slides it
// under the reading head and sets the running one aside, and the head
// starts the new one. If it starts, it serves and the old one leaves. If
// it fails, the shuttle slides the old one back and it serves again.
//
//   node figures/changer/build.mjs                 writes brand/fig-changer.js
//   node figures/changer/build.mjs --preview out.html   also a standalone page for checks
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../anatomy/kit/iso-kit.mjs";
import * as G from "../anatomy/kit/lathe.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..", "..");
const argAfter = (flag) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? null : process.argv[at + 1];
};

const WIDTH = 600;
const HEIGHT = 330;
const AZIMUTH = 57;

// World layout, in units of about a pixel: x along the shuttle, y toward
// the viewer, z up. The base top is z = 0.
const PLATE = { x: -140, y: -66, w: 264, d: 128, r: 8 };
const PLATE_H = 16;
const FOOT_H = 5;
const FRONT = PLATE.y + PLATE.d;

const RAIL_X = [-104, 104];
const RAILS = [-6, 27];
const RAIL_D = 5;
const RAIL_H = 3;
const STOP_W = 6;
const SCREW = { y: 13.5, z: 5.5, r: 2 };
const MOTOR = { x: -134, y: 3.5, w: 18, d: 20, r: 2 };
const MOTOR_H = 11;

const PLAYER = { x: -34, y: -60, w: 68, d: 38, r: 3 };
const PLAYER_H = 70;
const PLAYER_FRONT = PLAYER.y + PLAYER.d;
const ARM = { x: -7, y: PLAYER_FRONT, w: 14, d: 24, r: 1 };
const ARM_Z = [60, 67];
const HEAD = { x: -11, y: 2, w: 22, d: 18, r: 2 };
const HEAD_Z = [50, 67];
const SHOE = { x: -8, y: 5, w: 16, d: 12, r: 1 };
const LIFT = 6;

// The shuttle, built with its centre at x = 0 and moved along x. Each bay
// sits BAY units either side of the centre, so a stop at +BAY puts bay A
// under the head and a stop at -BAY puts bay B there.
const BAY = 32;
const STOPS = [BAY, -BAY];
const CARRIAGE = { x: -62, y: -10, w: 124, d: 44, r: 3 };
const CARRIAGE_Z = [8, 13];
const CART_W = 24;
const CART_D = 10;
const CART_Y = 6;
const CART_Z = [16, 42];
const ARRIVE = 46;

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    ...k.boxCorners(PLAYER, 0, PLAYER_H + 8),
    [64, CART_Y, CART_Z[1] + 14],
    [-64, CART_Y, CART_Z[1] + 14],
  ],
  WIDTH,
  HEIGHT,
  { pad: 14, azimuth: AZIMUTH },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const along = (o, a) => G.frameAlong(o, a);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const rectAt = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
const rect = (w, h, r) => rectAt(0, 0, w, h, r);
// A group drawn flat on the face that looks at the viewer (normal +y),
// with local x along world x and local y running down.
const onFront = (x, y, z, inner) => `<g transform="${k.sideMatrix([x, y], z, P, "left")}">${inner}</g>`;
// The same on the right-hand face (normal +x): local x runs along -y.
const onRight = (x, y, z, inner) => `<g transform="${k.sideMatrix([x, y], z, P, "right")}">${inner}</g>`;

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H + 4, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  // The ruler under the shuttle's pointer, with a mark at both stops.
  const strip = { x: -102, y: 43, w: 204, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(-100, 100, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(STOPS.map((x) => k.lineOnTop([x, strip.y + 0.8], [x, strip.y + 5.6], 0.6, P)).join(""), { tone: "hi" }));
  out.push(D([at([strip.x + 1.6, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 1.6, strip.y + 3.5, 0.6])], { size: 0.45 }));

  // Label plate, back right.
  const label = { x: 72, y: -54, w: 34, d: 18, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "mid", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: "faint" }));
  out.push(
    L(
      [
        [label.x + 5, label.x + 26, label.y + 6],
        [label.x + 5, label.x + 22, label.y + 9.5],
        [label.x + 5, label.x + 17, label.y + 13],
      ]
        .map(([a, b, y]) => k.lineOnTop([a, y], [b, y], 0.8, P))
        .join(""),
      { tone: "lo", free: true },
    ),
  );
  out.push(D([at([label.x + label.w - 3.5, label.y + 4, 0.8]), at([label.x + label.w - 3.5, label.y + label.d - 4, 0.8])], { size: 0.42 }));
  return out.join("");
}

// The address plate on the plinth: the one thing that never changes.
const ADDRESS = { x: -60, w: 118, z: [-13, -3], proud: 1.4 };
const LAMP = { x: 74, z: -8 };
function address() {
  const out = [];
  const plan = { x: ADDRESS.x, y: FRONT, w: ADDRESS.w, d: ADDRESS.proud, r: 0.6 };
  out.push(S(k.slabOf(plan, ADDRESS.z[0], ADDRESS.z[1] - ADDRESS.z[0], P, 3, 0.4), { tone: "mid" }));
  const face = FRONT + ADDRESS.proud;
  const h = ADDRESS.z[1] - ADDRESS.z[0];
  out.push(
    onFront(
      ADDRESS.x,
      face,
      ADDRESS.z[1],
      `<path class="iso-line" data-tone="faint" d="${rectAt(1.6, 1.4, ADDRESS.w - 3.2, h - 2.8, 0.6)}"/>` +
        `<text class="iso-face-text fc-address" data-tone="hi" x="${ADDRESS.w / 2}" y="${h / 2 + 2.45}" font-size="6.8" text-anchor="middle">lunch-orders.spwt.app</text>`,
    ),
  );
  out.push(D([[ADDRESS.x + 3, ADDRESS.z[1] - 2.2], [ADDRESS.x + ADDRESS.w - 3, ADDRESS.z[1] - 2.2], [ADDRESS.x + 3, ADDRESS.z[0] + 2.2], [ADDRESS.x + ADDRESS.w - 3, ADDRESS.z[0] + 2.2]].map(([x, z]) => at([x, face, z])), { size: 0.5 }));

  // The lamp beside it, lit while the address serves.
  const F = along([LAMP.x, FRONT, LAMP.z], [0, 1, 0]);
  out.push(S(G.disc(0, 1.8, 4.6, F, P), { tone: "mid" }));
  out.push(S(G.disc(1.8, 2.8, 3.2, F, P), { tone: "hi" }));
  const lens = G.circleOf(F, 2.8, 2.6, P);
  out.push(`<path class="fc-glow" d="${G.circleOf(F, 2.8, 6, P)}"/>`);
  out.push(`<path class="fc-lens" d="${lens}"/>`);
  out.push(L(G.circleOf(F, 1.8, 3.9, P), { tone: "faint" }));
  return out.join("");
}

function drive() {
  const out = [];
  // Motor at the far left, its coupler and the lead screw it turns.
  out.push(`<path class="iso-halo" d="${k.haloOf(MOTOR, 0, 1, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.slabOf(MOTOR, 0, MOTOR_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(MOTOR, 5, P, 4), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(MOTOR, 2.5), MOTOR_H, P, 4), { tone: "faint" }));
  out.push(D(k.corners(MOTOR, 3).map(([x, y]) => at([x, y, MOTOR_H])), { size: 0.45 }));
  // Vent slots on the motor's front face, as closed outlines.
  out.push(
    onFront(
      MOTOR.x,
      MOTOR.y + MOTOR.d,
      MOTOR_H,
      `<path class="iso-line" data-tone="lo" d="${[0, 1, 2, 3].map((i) => rectAt(3.6 + i * 3.2, 2.2, 1.4, MOTOR_H - 4.4, 0.7)).join("")}"/>`,
    ),
  );
  const motorFace = MOTOR.x + MOTOR.w;
  const Fs = along([motorFace, SCREW.y, SCREW.z], [1, 0, 0]);
  out.push(S(G.disc(0, 3, 4.4, Fs, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(Fs, 0, 3, 4.4, 22, P, { fade: [0.1, 0.55] }), { tone: "lo" }));
  out.push(S(G.disc(3, RAIL_X[0] - STOP_W - motorFace, 2.6, Fs, P), { tone: "mid" }));
  return out.join("");
}

function railsAndStops() {
  const out = [];
  const stop = (x) => {
    const plan = { x, y: RAILS[0] - 3, w: STOP_W, d: RAILS[1] + RAIL_D - RAILS[0] + 6, r: 1.2 };
    const parts = [S(k.slabOf(plan, 0, 12, P, 3, 0.5), { tone: "mid" })];
    parts.push(D([at([x + STOP_W / 2, plan.y + 3, 12]), at([x + STOP_W / 2, plan.y + plan.d - 3, 12])], { size: 0.45 }));
    return parts.join("");
  };
  const rail = (y) => {
    const plan = { x: RAIL_X[0], y, w: RAIL_X[1] - RAIL_X[0], d: RAIL_D, r: 1 };
    return S(k.slabOf(plan, 0, RAIL_H, P, 3, 0.4), { tone: "mid" }) + D([-90, -60, -30, 0, 30, 60, 90].map((x) => at([x, y + RAIL_D / 2, RAIL_H])), { size: 0.38, tone: "lo" });
  };
  out.push(stop(RAIL_X[0] - STOP_W));
  out.push(limitSwitch(-1, "body"), limitSwitch(1, "body"));
  out.push(rail(RAILS[0]));
  // The lead screw between the rails, threaded along its length.
  const F = along([RAIL_X[0], SCREW.y, SCREW.z], [1, 0, 0]);
  const length = RAIL_X[1] - RAIL_X[0];
  const threads = [];
  for (let s = 2; s < length - 1; s += 2.4) threads.push(G.arcOf(F, s, SCREW.r, P, { trim: 0.2 }));
  out.push(S(G.disc(0, length, SCREW.r, F, P), { tone: "mid", crease: "none", inner: L(threads.join(""), { tone: "lo" }) }));
  out.push(rail(RAILS[1]));
  out.push(stop(RAIL_X[1]));
  // The screw's bearing on the left stop's face.
  out.push(L(k.sideRing([RAIL_X[0], SCREW.y, SCREW.z], SCREW.r + 1.2, "x", P, 24), { tone: "lo" }));
  return out.join("");
}

function player() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLAYER, 0, 1, P)}" style="filter:blur(6px)"/>`];
  const flange = k.insetPlan(PLAYER, -3.5);
  out.push(S(k.slabOf(flange, 0, 3, P, 6, 0.5), { tone: "mid" }));
  out.push(D([...k.corners(flange, 2.4), [0, flange.y + flange.d - 1.8]].map(([x, y]) => at([x, y, 3])), { size: 0.5 }));
  const seams = [12, PLAYER_H - 10].map((z) => k.sideSeam(PLAYER, z, P, 6)).join("");
  out.push(S(k.slabOf(PLAYER, 0, PLAYER_H, P, 6, 1), { tone: "mid", inner: L(seams, { tone: "faint" }) }));
  const lid = k.insetPlan(PLAYER, 2);
  out.push(S(k.slabOf(lid, PLAYER_H, 3, P, 6, 0.6), { tone: "mid" }));
  out.push(D(k.corners(lid, 4).map(([x, y]) => at([x, y, PLAYER_H + 3])), { size: 0.5 }));
  // A row of vent slots on the right face.
  out.push(
    onRight(
      PLAYER.x + PLAYER.w,
      PLAYER_FRONT - 4,
      PLAYER_H - 18,
      `<path class="iso-line" data-tone="lo" d="${Array.from({ length: 6 }, (_, i) => rectAt(2 + i * 5, 0, 1.8, 26, 0.9)).join("")}"/>`,
    ),
  );
  // A recessed panel low on the front face, perforated for air, with a
  // gland where the motor's cable leaves.
  const panel = { x: PLAYER.x + 6, w: 26, z0: 14, z1: 44 };
  out.push(
    onFront(
      panel.x,
      PLAYER_FRONT,
      panel.z1,
      `<path class="iso-line" data-tone="lo" d="${rectAt(0, 0, panel.w, panel.z1 - panel.z0, 1.6)}"/>` +
        `<path class="iso-line" data-tone="faint" d="${rectAt(1.4, 1.4, panel.w - 2.8, panel.z1 - panel.z0 - 2.8, 1)}"/>`,
    ),
  );
  const holes = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 6; col++) holes.push(at([panel.x + 4.5 + col * 3.4, PLAYER_FRONT, panel.z1 - 4.5 - row * 3.4]));
  out.push(D(holes, { size: 0.55, tone: "lo" }));
  out.push(D([[panel.x + 2.6, panel.z1 - 2.6], [panel.x + panel.w - 2.6, panel.z1 - 2.6], [panel.x + 2.6, panel.z0 + 2.6], [panel.x + panel.w - 2.6, panel.z0 + 2.6]].map(([x, z]) => at([x, PLAYER_FRONT, z])), { size: 0.45 }));
  // A knurled knob on the lid.
  const knob = [PLAYER.x + PLAYER.w - 14, PLAYER.y + 12];
  out.push(S(k.cylinder(knob[0], knob[1], 5.4, PLAYER_H + 3, 5, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(knob[0], knob[1], 5.4, PLAYER_H + 3, PLAYER_H + 8, 32, P), { tone: "lo" }));
  out.push(L(k.lineOnTop(knob, [knob[0] + 4.6, knob[1]], PLAYER_H + 8, P), { tone: "hi" }));
  out.push(D([at([knob[0], knob[1], PLAYER_H + 8])], { size: 0.5, tone: "hi" }));
  return out.join("");
}

function arm() {
  const out = [];
  // A gusset under the arm, against the player's face.
  const F = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const gusset = [
    [PLAYER_FRONT, ARM_Z[0]],
    [PLAYER_FRONT + 15, ARM_Z[0]],
    [PLAYER_FRONT, ARM_Z[0] - 15],
  ];
  out.push(S(G.prismOf(F, gusset, -2.2, 2.2, P), { tone: "mid" }));
  out.push(S(k.slabOf(ARM, ARM_Z[0], ARM_Z[1] - ARM_Z[0], P, 3, 0.5), { tone: "mid" }));
  out.push(L(k.lineOnTop([0, ARM.y], [0, ARM.y + ARM.d], ARM_Z[1], P), { tone: "faint" }));
  out.push(D([at([-4, ARM.y + 4, ARM_Z[1]]), at([4, ARM.y + 4, ARM_Z[1]])], { size: 0.45 }));
  return out.join("");
}

function shoe() {
  return S(k.slabOf(SHOE, CART_Z[1], HEAD_Z[0] + 2 - CART_Z[1], P, 3, 0.4), { tone: "hi", crease: "lo" });
}

function head() {
  const out = [];
  out.push(S(k.slabOf(HEAD, HEAD_Z[0], HEAD_Z[1] - HEAD_Z[0], P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(HEAD, HEAD_Z[0] + 4, P, 4), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(HEAD, 2.4), HEAD_Z[1], P, 4), { tone: "faint" }));
  out.push(D(k.corners(HEAD, 3.2).map(([x, y]) => at([x, y, HEAD_Z[1]])), { size: 0.45 }));
  out.push(D([at([HEAD.x + 4, HEAD.y + HEAD.d, HEAD_Z[1] - 4]), at([HEAD.x + HEAD.w - 4, HEAD.y + HEAD.d, HEAD_Z[1] - 4])], { size: 0.45 }));
  return out.join("");
}

// The shuttle: bushings on the rails, the plate, a pointer over the ruler
// and the two cradles. Cartridges sit in the cradles in their own groups.
function cradle(bx, side) {
  const plan = { x: bx - 16, y: 0, w: 32, d: 22, r: 1.5 };
  const cheek = (x) => S(k.slabOf({ x, y: 2, w: 3.5, d: 18, r: 0.8 }, CARRIAGE_Z[1] + 3, 12, P, 2, 0.3), { tone: "mid" }) + D([at([x + 1.75, 5, CARRIAGE_Z[1] + 15]), at([x + 1.75, 17, CARRIAGE_Z[1] + 15])], { size: 0.4 });
  const parts = {
    base: S(k.slabOf(plan, CARRIAGE_Z[1], 3, P, 3, 0.4), { tone: "mid" }) + L(k.planOutline({ x: bx - 12.6, y: CART_Y - 0.6, w: CART_W + 1.2, d: CART_D + 1.2, r: 1.6 }, CARRIAGE_Z[1] + 3, P, 3), { tone: "faint" }),
    back: cheek(bx - 16),
    front: cheek(bx + 12.5),
  };
  return parts[side];
}

function cartridge(bx, id, version) {
  const plan = { x: bx - CART_W / 2, y: CART_Y, w: CART_W, d: CART_D, r: 1.4 };
  const h = CART_Z[1] - CART_Z[0];
  const out = [];
  out.push(S(k.slabOf(plan, CART_Z[0], h, P, 3, 0.6), { tone: "hi", crease: "lo" }));
  // Grip ridges at both ends of the top, contacts in the middle.
  out.push(L([-9.5, -7.5, 7.5, 9.5].map((dx) => k.lineOnTop([bx + dx, CART_Y], [bx + dx, CART_Y + CART_D], CART_Z[1], P)).join(""), { tone: "lo" }));
  out.push(D([-4, -2, 0, 2, 4].map((dx) => at([bx + dx, CART_Y + CART_D / 2, CART_Z[1]])), { size: 0.42, tone: "mid" }));
  // A key groove down the right side, so it only goes in one way.
  out.push(L(k.segment([bx + CART_W / 2, CART_Y + CART_D / 2, CART_Z[0]], [bx + CART_W / 2, CART_Y + CART_D / 2, CART_Z[1]], P), { tone: "lo" }));
  // The label on the front face: an inset card with the block mark and
  // the version printed on it.
  const lw = 18;
  const lh = 21;
  const cell = 3.6;
  const S4 = [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ];
  const mark = S4.map(([cx, cy]) => `M${4.6 + cx * cell} ${3 + cy * cell}h${cell - 0.5}v${cell - 0.5}h${-(cell - 0.5)}Z`).join("");
  out.push(
    onFront(
      bx - lw / 2,
      CART_Y + CART_D,
      CART_Z[1] - 2.5,
      `<path class="iso-line" data-tone="lo" d="${rect(lw, lh, 1.2)}"/>` +
        `<path class="fc-mark" d="${mark}"/>` +
        `<text class="iso-face-text fc-version" data-tone="hi" x="${lw / 2}" y="${lh - 3.4}" font-size="6.2" text-anchor="middle" data-version="${id}">${version}</text>`,
    ),
  );
  return out.join("");
}

function shuttle() {
  const out = [];
  const bush = (x, y) => S(k.slabOf({ x: x - 6, y: y - 2, w: 12, d: RAIL_D + 4, r: 1.2 }, RAIL_H - 0.6, CARRIAGE_Z[0] - RAIL_H + 0.6, P, 3, 0.3), { tone: "mid" });
  for (const [x, y] of byDepth([
    [-50, RAILS[0]],
    [50, RAILS[0]],
    [-50, RAILS[1]],
    [50, RAILS[1]],
  ]))
    out.push(bush(x, y));
  out.push(S(k.slabOf(CARRIAGE, CARRIAGE_Z[0], CARRIAGE_Z[1] - CARRIAGE_Z[0], P, 5, 0.6), { tone: "mid" }));
  out.push(D([-56, -46, 46, 56].map((x) => at([x, CARRIAGE.y + CARRIAGE.d - 2.6, CARRIAGE_Z[1]])), { size: 0.4, tone: "lo" }));
  out.push(D([-56, -46, 46, 56].map((x) => at([x, CARRIAGE.y + 2.6, CARRIAGE_Z[1]])), { size: 0.4, tone: "lo" }));
  // Pointer reaching over the ruler, with its index line.
  const pointer = { x: -2.2, y: CARRIAGE.y + CARRIAGE.d - 8, w: 4.4, d: 20, r: 0.8 };
  out.push(S(k.slabOf(pointer, CARRIAGE_Z[1], 1.2, P, 2, 0.3), { tone: "mid" }));
  out.push(L(k.lineOnTop([0, pointer.y], [0, pointer.y + pointer.d], CARRIAGE_Z[1] + 1.2, P), { tone: "hi" }));
  out.push(D([at([0, pointer.y + 3, CARRIAGE_Z[1] + 1.2])], { size: 0.45 }));
  for (const [bay, bx] of [
    ["A", -BAY],
    ["B", BAY],
  ]) {
    out.push(cradle(bx, "base"));
    out.push(cradle(bx, "back"));
    out.push(`<g data-bay="${bay}"><g data-cart="${bay}">${cartridge(bx, bay, bay === "A" ? "v3" : "v4")}</g></g>`);
    out.push(cradle(bx, "front"));
  }
  return out.join("");
}

// Limit switches behind the back rail, one at each end of the shuttle's
// travel: the carriage's end presses the lever when it reaches a stop.
const SWITCH_X = CARRIAGE.w / 2 + BAY;
function limitSwitch(side, part) {
  const x0 = side > 0 ? SWITCH_X + 0.4 : -SWITCH_X - 10.4;
  const body = { x: x0, y: -21, w: 10, d: 8, r: 1 };
  if (part === "body")
    return (
      S(k.slabOf(body, 0, 8, P, 3, 0.4), { tone: "mid" }) +
      D([at([x0 + 2.5, -17, 8]), at([x0 + 7.5, -17, 8])], { size: 0.42 }) +
      S(k.slabOf({ x: side > 0 ? SWITCH_X + 0.4 : -SWITCH_X - 3.4, y: -13, w: 3, d: 2.4, r: 0.6 }, 5, 4, P, 2), { tone: "mid", crease: "none" })
    );
  const lever = { x: side > 0 ? SWITCH_X + 0.2 : -SWITCH_X - 1.6, y: -12.4, w: 1.4, d: 4.6, r: 0.5 };
  return S(k.slabOf(lever, 9, 2.6, P, 2), { tone: "mid", crease: "none" });
}

const units = {
  x: k.axisVector(P, [1, 0, 0]),
  z: k.axisVector(P, [0, 0, 1]),
};

const LABEL =
  "A cartridge changer on a base plate. The plate on its front carries one address, lunch-orders.spwt.app. A shuttle on two rails holds two cartridges, each a version of the app. A new version drops into the empty bay, the shuttle slides it under the reading head and sets the running version aside, and the head starts it. If it starts, it serves and the old one leaves. If it fails, the shuttle slides the old version back and it serves again. The address never changes.";

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: LABEL,
  body: [
    base(),
    address(),
    drive(),
    railsAndStops(),
    player(),
    arm(),
    limitSwitch(-1, "lever"),
    `<g data-part="shuttle" transform="${k.translateAlong(P, [STOPS[0], 0, 0])}">${shuttle()}</g>`,
    limitSwitch(1, "lever"),
    `<g data-part="shoe">${shoe()}</g>`,
    head(),
  ],
});

const markup = `<div class="iso-plate fc-plate">
<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">Deploy again</span></div>
<div class="fc-stage" tabindex="0" role="group" aria-label="Changer: press Enter to deploy a new version, or F to deploy a broken one">${svg}</div>
<div class="fc-bar"><div class="fc-actions"><button type="button" class="fc-btn" data-act="ok">Deploy</button><button type="button" class="fc-btn" data-act="fail">Deploy a broken one</button></div><span class="fc-readout" data-readout>v3 live · same link</span></div>
<span class="fc-say" aria-live="polite"></span>
</div>`;

const FIG_CSS = `
#fig-changer{--anatomy-card:#121213;--anatomy-paper:#121213;--anatomy-lit:#ef285e;--anatomy-lit-top:#2a161c;--anatomy-lit-shade:#1e1317;--anatomy-mono:var(--font-data,ui-monospace,SFMono-Regular,Menlo,monospace);--fc-pink:#ef285e;--fc-lamp:0;display:block;width:100%}
#fig-changer .fc-plate{padding:44px 20px 16px;border-radius:var(--radius-l,16px);background:var(--anatomy-card);box-shadow:inset 0 1px 0 #ffffff14,0 0 0 1px #ffffff12,0 24px 48px -24px #000}
#fig-changer .fc-stage{outline:none;touch-action:pan-y;cursor:pointer;-webkit-tap-highlight-color:transparent;border-radius:8px}
#fig-changer .fc-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
#fig-changer .fc-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;margin-top:10px}
#fig-changer .fc-actions{display:flex;flex-wrap:wrap;gap:8px}
#fig-changer .fc-btn{appearance:none;border:0;margin:0;min-height:32px;padding:0 12px;border-radius:999px;background:#ffffff0d;box-shadow:inset 0 0 0 1px #ffffff1a;color:var(--anatomy-strong);font:500 10.5px/1 var(--anatomy-mono);letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:background .2s,color .2s,opacity .2s}
#fig-changer .fc-btn:hover{background:#ffffff1a}
#fig-changer .fc-btn:focus-visible{outline:2px solid var(--fc-pink);outline-offset:2px}
#fig-changer .fc-btn[aria-disabled="true"]{opacity:.45;cursor:default}
#fig-changer .fc-readout{color:var(--anatomy-text);font:10.5px/1.4 var(--anatomy-mono);letter-spacing:.04em;font-variant-numeric:tabular-nums;white-space:nowrap}
#fig-changer .fc-say{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
#fig-changer .fc-lens{fill:var(--fc-pink);opacity:calc(.12 + var(--fc-lamp) * .88)}
#fig-changer .fc-glow{fill:var(--fc-pink);filter:blur(5px);opacity:calc(var(--fc-lamp) * .7)}
#fig-changer .fc-mark{fill:var(--anatomy-lo);stroke:none}
#fig-changer [data-live] .fc-mark{fill:var(--fc-pink)}
#fig-changer .fc-address{letter-spacing:.02em}
#fig-changer .iso-plate-corner{font-size:10.5px}
@media (max-width:560px){#fig-changer .fc-plate{padding:40px 12px 14px;overflow:hidden}#fig-changer .fc-stage{margin:-4px -9% 0}#fig-changer .fc-bar{margin-top:6px}#fig-changer .fc-btn{padding:0 10px}}
`;

const DATA = {
  ux: units.x,
  uz: units.z,
  stops: STOPS,
  lift: LIFT,
  arrive: ARRIVE,
};

// The live code. Everything moves by translate on prebuilt groups, so the
// page needs no kit at runtime: a world offset is a sum of the two unit
// screen vectors.
const LIVE = `
const D = ${JSON.stringify(DATA)};
const svg = root.querySelector("svg");
const stage = root.querySelector(".fc-stage");
const shuttleEl = svg.querySelector('[data-part="shuttle"]');
const shoeEl = svg.querySelector('[data-part="shoe"]');
const cartEl = { A: svg.querySelector('[data-cart="A"]'), B: svg.querySelector('[data-cart="B"]') };
const versionEl = { A: svg.querySelector('[data-version="A"]'), B: svg.querySelector('[data-version="B"]') };
const readout = root.querySelector("[data-readout]");
const say = root.querySelector(".fc-say");
const buttons = [...root.querySelectorAll(".fc-btn")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const tr = (dx, dz) => "translate(" + (dx * D.ux[0] + dz * D.uz[0]).toFixed(2) + " " + (dx * D.ux[1] + dz * D.uz[1]).toFixed(2) + ")";
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// State: which bay is under the head (stop 0 puts A there), what each bay
// holds, and the lamp. Each bay's cartridge has a height above its cradle
// and an opacity, for arriving and leaving.
const S = {
  stop: 0, x: D.stops[0], lift: 0, lamp: 1,
  bay: { A: { v: 3, z: 0, a: 1 }, B: { v: 0, z: D.arrive, a: 0 } },
  live: "A", next: 4, text: "v3 live · same link",
};
const other = (bay) => (bay === "A" ? "B" : "A");

function draw() {
  shuttleEl.setAttribute("transform", tr(S.x, 0));
  shoeEl.setAttribute("transform", tr(0, S.lift * D.lift));
  for (const bay of ["A", "B"]) {
    const b = S.bay[bay];
    cartEl[bay].setAttribute("transform", b.z ? tr(0, b.z) : "");
    cartEl[bay].setAttribute("opacity", b.a.toFixed(3));
    cartEl[bay].style.display = b.a < 0.002 ? "none" : "";
    const label = b.v ? "v" + b.v : "";
    if (versionEl[bay].textContent !== label) versionEl[bay].textContent = label;
    cartEl[bay].toggleAttribute("data-live", bay === S.live && S.lamp > 0.5 && b.a > 0.99);
  }
  root.style.setProperty("--fc-lamp", S.lamp.toFixed(3));
  if (readout.textContent !== S.text) readout.textContent = S.text;
}

// A deploy is a list of steps; each step eases some values over a time,
// then may run a function. The same list runs instantly under reduced
// motion.
let steps = [], step = null, stepAt = 0, from = null;
function plan(ok) {
  const incoming = other(S.live);
  const old = S.live;
  const v = S.next;
  const oldV = S.bay[old].v;
  const away = D.stops[1 - S.stop];
  const home = D.stops[S.stop];
  S.next += 1;
  const seq = [
    { set: () => { S.bay[incoming] = { v, z: D.arrive, a: 0 }; S.text = "sending v" + v; } },
    { t: 1.1, to: { ["bay." + incoming + ".z"]: 0, ["bay." + incoming + ".a"]: 1 }, curve: "drop" },
    { t: 0.5, to: { lift: 1, lamp: 0 }, set: () => { S.text = "v" + v + " swapping in"; } },
    { t: 1.15, to: { x: away }, set: () => { S.stop = 1 - S.stop; S.live = incoming; } },
    { t: 0.45, to: { lift: 0 }, set: () => { S.text = "v" + v + " starting"; } },
  ];
  if (ok) {
    seq.push({ t: 1.2, to: { lamp: 1 } });
    seq.push({ set: () => { S.text = "v" + v + " live · same link"; announce("v" + v + " is live at the same link"); } });
    seq.push({ wait: 0.5 });
    seq.push({ t: 1.0, to: { ["bay." + old + ".z"]: D.arrive, ["bay." + old + ".a"]: 0 }, curve: "rise" });
    seq.push({ set: () => { S.bay[old].v = 0; } });
  } else {
    seq.push({ t: 1.3, to: { lamp: 0 }, curve: "flicker" });
    seq.push({ set: () => { S.text = "v" + v + " failed"; } });
    seq.push({ wait: 0.45 });
    seq.push({ t: 0.5, to: { lift: 1 } });
    seq.push({ t: 1.15, to: { x: home }, set: () => { S.stop = 1 - S.stop; S.live = old; } });
    seq.push({ t: 0.45, to: { lift: 0 } });
    seq.push({ t: 0.9, to: { lamp: 1 } });
    seq.push({ set: () => { S.text = "v" + v + " failed · v" + oldV + " back"; announce("v" + v + " failed to start, v" + oldV + " is back at the same link"); } });
    seq.push({ wait: 0.5 });
    seq.push({ t: 1.0, to: { ["bay." + incoming + ".z"]: D.arrive, ["bay." + incoming + ".a"]: 0 }, curve: "rise" });
    seq.push({ set: () => { S.bay[incoming].v = 0; } });
  }
  return seq;
}
const get = (path) => path.split(".").reduce((o, key) => o[key], S);
const put = (path, value) => { const keys = path.split("."); const last = keys.pop(); keys.reduce((o, key) => o[key], S)[last] = value; };
function shape(curve, t) {
  if (curve === "drop") { const e = 1 - Math.pow(1 - Math.min(1, t * 1.25), 3); return t < 0.8 ? e : 1 + Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.035; }
  if (curve === "rise") return Math.pow(t, 2);
  return ease(t);
}
function begin(next) {
  step = next;
  if (step.set) step.set();
  stepAt = clock;
  from = {};
  if (step.to) for (const key in step.to) from[key] = get(key);
}
function advance(now) {
  while (true) {
    if (!step) { if (!steps.length) return false; begin(steps.shift()); }
    const length = step.t || step.wait || 0;
    const t = length ? Math.min(1, (now - stepAt) / length) : 1;
    if (step.to) for (const key in step.to) put(key, step.curve === "flicker" ? flicker(t) : from[key] + (step.to[key] - from[key]) * shape(step.curve, t));
    if (t < 1) return true;
    if (step.to) for (const key in step.to) put(key, step.to[key]);
    step = null;
  }
}
function flicker(t) {
  // The lamp starts to warm, stutters, and goes out.
  if (t < 0.3) return ease(t / 0.3) * 0.7;
  const fade = (t - 0.3) / 0.7;
  return 0.7 * (1 - fade) * (Math.sin(fade * 40) > 0.1 ? 1 : 0.3);
}
function finishNow() {
  while (steps.length || step) {
    if (!step) begin(steps.shift());
    if (step.to) for (const key in step.to) put(key, step.to[key]);
    step = null;
  }
}

let clock = 0, last = 0, frame = 0, visible = false, touring = !still.matches, tourAt = 1.4, tourNext = true, quiet = 0;
function busy() { return Boolean(step || steps.length); }
function deploy(ok, byHand) {
  if (busy()) return;
  if (byHand) { touring = false; clearTimeout(quiet); }
  steps = plan(ok);
  if (still.matches) { finishNow(); draw(); settle(); return; }
  run();
}
function settle() {
  buttons.forEach((b) => b.setAttribute("aria-disabled", busy() ? "true" : "false"));
  if (!busy() && !touring && !still.matches) { clearTimeout(quiet); quiet = setTimeout(() => { touring = true; tourAt = clock + 1.4; run(); }, 6000); }
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  if (touring && !busy() && clock >= tourAt) { steps = plan(tourNext); tourNext = !tourNext; }
  const moving = advance(clock);
  draw();
  buttons.forEach((b) => b.setAttribute("aria-disabled", busy() ? "true" : "false"));
  if (!moving && touring && !busy() && tourAt <= clock) tourAt = clock + 2.4;
  if (!moving) settle();
  frame = visible && (moving || touring) ? requestAnimationFrame(tick) : 0;
}
function run() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } }
function announce(text) { say.textContent = text; }
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
still.addEventListener?.("change", () => { if (still.matches) { touring = false; finishNow(); draw(); } });
buttons.forEach((b) => b.addEventListener("click", () => deploy(b.dataset.act === "ok", true)));
stage.addEventListener("click", () => deploy(true, true));
stage.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); deploy(true, true); }
  else if (event.key === "f" || event.key === "F") { event.preventDefault(); deploy(false, true); }
});
draw();
`;

const ISO_CSS = readFileSync(join(HERE, "..", "anatomy", "kit", "iso.css"), "utf8");

const js = `/* Fig 1, the cartridge changer in "How it works". Generated by
   figures/changer/build.mjs from the anatomy kit (figures/anatomy, MIT):
   edit the build, not this file. */
(function () {
  var root = document.getElementById("fig-changer");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "1";
  function css(id, text) {
    if (document.getElementById(id)) return;
    var el = document.createElement("style");
    el.id = id;
    el.textContent = text;
    document.head.appendChild(el);
  }
  css("iso-css", ${JSON.stringify(ISO_CSS)});
  css("fig-changer-css", ${JSON.stringify(FIG_CSS.trim())});
  root.innerHTML = ${JSON.stringify(markup)};
  ${LIVE}
})();
`;

const out = join(SITE, "brand", "fig-changer.js");
writeFileSync(out, js);
console.log("wrote", out, (js.length / 1024).toFixed(1) + " KB");

const preview = argAfter("--preview");
if (preview) {
  const page = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Changer preview</title><link rel="stylesheet" href="${resolve(SITE, "styles.css")}"></head><body class="lp" style="background:#000;margin:0"><main style="max-width:600px;margin:0 auto;padding:40px 16px"><div id="fig-changer" class="iso"></div></main><script>${js}</script></body></html>`;
  writeFileSync(resolve(preview), page);
  console.log("wrote", resolve(preview));
}
