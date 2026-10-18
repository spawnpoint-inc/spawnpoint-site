// The live half of Fig 2. Runs inside the figure's IIFE with the kit in
// scope (translateAlong, extrude, cylinder, solidSvg, lineSvg, lineOnTop,
// iso, pathOf). One loop moves the dial, the badges, the lamp, the screen
// and the paddle; everything it shows comes from verdict() in model.mjs.
const D = __DATA__;
const LISTED = D.listed;
const DOMAIN = D.domain;
const verdict = __VERDICT__;
const P = D.P;

const stage = host.querySelector(".ts-stage");
const svg = stage.querySelector("svg");
const readout = host.querySelector("[data-readout]");
const status = host.querySelector("[data-status]");
const $ = (sel) => svg.querySelector(sel);
const paddleG = $('[data-part="paddle"]');
const pointer = $('[data-part="pointer"]');
const marks = [...svg.querySelectorAll("[data-mark]")];
const lamp = $('[data-part="lamp"]');
const glow = $('[data-part="glow"]');
const lines = [...svg.querySelectorAll("[data-line]")];
const fly = $('[data-part="fly"]');
const fileEl = { queue: $('[data-cards="queue"]'), done: $('[data-cards="done"]') };
const still = matchMedia("(prefers-reduced-motion: reduce)");

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const follow = (x, target, dt, tau) => (still.matches ? target : x + (target - x) * (1 - Math.exp(-dt / tau)));
const modeOf = (id) => D.modes.find((m) => m.id === id);
const personOf = (id) => D.people.find((p) => p.id === id);
const whoOf = (person) => (person.owner ? "you" : person.email);
const SUMMARY = { private: "only you", people: "ana and you", domain: "anyone at " + DOMAIN, public: "anyone with the link" };
const SCREEN_SUMMARY = { private: "ONLY YOU", people: "ANA + YOU", domain: "ALL @" + DOMAIN.toUpperCase(), public: "ANYONE" };

// ---- badges ----
const cards = {};
svg.querySelectorAll("[data-card]").forEach((el) => {
  const wrap = document.createElementNS("http://www.w3.org/2000/svg", "g");
  wrap.appendChild(el);
  cards[el.dataset.card] = { id: el.dataset.card, el, wrap, pos: [0, 0, 0], where: "", anim: null };
});
const deck = $('[data-part="deck"]');
let queue = D.people.map((p) => p.id);
let done = [];
function place(card) {
  card.el.setAttribute("transform", translateAlong(P, card.pos));
}
function settleFiles() {
  queue.forEach((id, i) => {
    const card = cards[id];
    if (!card.anim) card.target = D.queue[i];
  });
  done.forEach((id, i) => {
    const card = cards[id];
    if (!card.anim) card.target = D.done[i];
  });
  // Back to front inside each file: the queue's back is its last badge.
  const order = { queue: [...queue].reverse(), done: [...done] };
  for (const name of ["queue", "done"]) {
    for (const id of order[name]) {
      const card = cards[id];
      if (card.anim && card.where === "fly") continue;
      if (card.wrap.parentNode !== fileEl[name] || card.wrap.nextSibling) fileEl[name].appendChild(card.wrap);
      card.where = name;
    }
  }
}
queue.forEach((id, i) => {
  cards[id].pos = D.queue[i].slice();
  cards[id].target = D.queue[i];
});
deck.remove();
settleFiles();
Object.values(cards).forEach(place);

function toFly(card, clip) {
  if (card.wrap.parentNode !== fly) fly.appendChild(card.wrap);
  card.where = "fly";
  if (clip) card.wrap.setAttribute("clip-path", `url(#${clip})`);
  else card.wrap.removeAttribute("clip-path");
}

// ---- the dial, the screen and the lamp ----
let modeId = D.tour[0];
let pointerDeg = D.dial.detents[0];
function modeIndex(id) {
  return D.modes.findIndex((m) => m.id === id);
}
function pointerAt(deg) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const [cx, cy] = D.dial.c;
  return lineOnTop([cx + dx * 0.9, cy + dy * 0.9], [cx + dx * (D.dial.r - 0.7), cy + dy * (D.dial.r - 0.7)], D.dial.z, P);
}
function screen(l0, l1, l2, tone2 = "hi") {
  const text = [l0, l1, l2];
  lines.forEach((el, i) => {
    if (el.textContent !== text[i]) el.textContent = text[i];
  });
  lines[2].setAttribute("data-tone", tone2);
}
function say(text) {
  if (readout.textContent !== text) readout.textContent = text;
}
function setMode(id, by) {
  if (id === modeId && !by) return;
  modeId = id;
  const mode = modeOf(id);
  const index = modeIndex(id);
  marks.forEach((el, i) => el.setAttribute("data-tone", i === index ? "hi" : "lo"));
  stage.setAttribute("aria-valuenow", String(index + 1));
  stage.setAttribute("aria-valuetext", mode.say);
  if (by) status.textContent = mode.say;
  if (by || !trip || trip.phase === "rest" || trip.phase === "lift" || trip.phase === "toSlot") say(`${mode.word} · ${SUMMARY[id]}`);
  if (!trip || trip.phase === "rest" || trip.phase === "lift" || trip.phase === "toSlot") screen(mode.screen, "", SCREEN_SUMMARY[id]);
  else lines[0].textContent = mode.screen;
}

// ---- the paddle ----
const PG = PADDLE_GEOM;
let paddle = { x: 0, v: 0 };
let shakeAt = -1;
let paddleDrawn = null;
function paddleSvg(deg) {
  const a = (deg * Math.PI) / 180;
  const d = [Math.sin(a), Math.cos(a)];
  const n = [Math.cos(a), -Math.sin(a)];
  const t = PG.PADDLE.t / 2;
  const p = (s, w) => [PG.POST[0] + d[0] * s + n[0] * w, PG.POST[1] + d[1] * s + n[1] * w];
  const ring = [p(PG.PADDLE.r0, -t), p(PG.PADDLE.r1, -t), p(PG.PADDLE.r1, t), p(PG.PADDLE.r0, t)];
  const panel = extrude(ring, PG.PADDLE.z0, PG.PADDLE.z1 - PG.PADDLE.z0, P, { bevel: 0.4 });
  const facing = n[0] * PG.V[0] + n[1] * PG.V[1] > 0 ? 1 : -1;
  const w = facing * (t + 0.02);
  const inset = [
    [...p(PG.PADDLE.r0 + 4, w), PG.PADDLE.z0 + 4],
    [...p(PG.PADDLE.r1 - 4, w), PG.PADDLE.z0 + 4],
    [...p(PG.PADDLE.r1 - 4, w), PG.PADDLE.z1 - 4],
    [...p(PG.PADDLE.r0 + 4, w), PG.PADDLE.z1 - 4],
  ];
  const tip = p(PG.PADDLE.r1, 0);
  const bumper = cylinder(tip[0], tip[1], PG.PADDLE.tip, PG.PADDLE.z0, PG.PADDLE.z1 - PG.PADDLE.z0, P, 16);
  const insetD = pathOf(inset.map((q) => iso(q, P)), true);
  return solidSvg(panel, { tone: "hi", crease: "lo", inner: lineSvg(insetD, { tone: "faint" }) }) + solidSvg(bumper, { tone: "lo", crease: "none" });
}
function drawPaddle(deg) {
  const key = Math.round(deg * 20) / 20;
  if (key === paddleDrawn) return;
  paddleDrawn = key;
  paddleG.innerHTML = paddleSvg(key);
}

// ---- trips: one badge at a time from the queue to the gate and on ----
const T = { lift: 0.28, toSlot: 0.62, down: 0.4, read: 0.45, owner: 0.35, open: 0.3, codeSent: 0.6, codeOk: 0.3, out: 0.85, up: 0.4, toFile: 0.62, drop: 0.28, rest: 0.45 };
let trip = null;
let tripIndex = 0;
let resetting = null;
let clock = 0;
let gateOpen = false;
let lampLevel = 0;
let lampTone = "lo";
let pulse = 0;

function arcPos(from, to, u, lift) {
  const p = lerp3(from, to, ease(u));
  p[2] += Math.sin(Math.PI * u) * lift;
  return p;
}
function startTrip() {
  if (!queue.length) return startReset();
  if (touring) setMode(D.tour[tripIndex % D.tour.length]);
  const id = queue.shift();
  const card = cards[id];
  const person = personOf(id);
  trip = { id, card, person, phase: "lift", t: 0, from: card.pos.slice(), verdict: null };
  card.anim = true;
  settleFiles();
}
function startReset() {
  if (touring) setMode(D.tour[0]);
  const order = D.people.map((p) => p.id).filter((id) => done.includes(id));
  resetting = order.map((id, i) => ({ id, card: cards[id], at: i * 0.22, t: -i * 0.22, from: null, spot: D.queue[i], phase: "wait" }));
  queue = [];
  trip = null;
}
function phase(next) {
  trip.phase = next;
  trip.t = 0;
  trip.from = trip.card.pos.slice();
}
function stepTrip(dt) {
  const tr = trip;
  const card = tr.card;
  const mode = modeOf(modeId);
  tr.t += dt;
  const u = clamp(tr.t / (T[tr.phase] || 1), 0, 1);
  const top = (slot) => [slot.x, D.cardY, slot.top + 3];
  const inside = (slot) => [slot.x, D.cardY, slot.top - D.card.h - 1];
  switch (tr.phase) {
    case "lift": {
      card.pos = lerp3(tr.from, [tr.from[0], tr.from[1], D.fileTop + 6], ease(u));
      if (u >= 1) {
        toFly(card);
        phase("toSlot");
      }
      break;
    }
    case "toSlot": {
      card.pos = arcPos(tr.from, top(D.slotIn), u, 26);
      if (u >= 1) {
        toFly(card, "ts-clip-in");
        phase("down");
      }
      break;
    }
    case "down": {
      card.pos = lerp3(tr.from, inside(D.slotIn), ease(u));
      if (u >= 1) {
        // A public project lets anyone in without a check.
        if (verdict(modeId, tr.person) === "open") {
          tr.verdict = "open";
          phase("open");
          screen(mode.screen, tr.person.email.toUpperCase(), "OPEN TO ALL", "lit");
          grant();
        } else {
          phase("read");
          say(`${mode.word} · reading ${whoOf(tr.person)}`);
          screen(mode.screen, tr.person.email.toUpperCase(), "READING");
        }
      }
      break;
    }
    case "read": {
      pulse = 1;
      if (u >= 1) {
        tr.verdict = verdict(modeId, tr.person);
        const v = tr.verdict;
        if (v === "owner") {
          phase("owner");
          screen(mode.screen, tr.person.email.toUpperCase(), "OWNER", "lit");
          grant();
        } else if (v === "open") {
          phase("open");
          screen(mode.screen, tr.person.email.toUpperCase(), "OPEN TO ALL", "lit");
          grant();
        } else if (v === "code") {
          phase("codeSent");
          say(`${mode.word} · code sent to ${whoOf(tr.person)}`);
          screen(mode.screen, tr.person.email.toUpperCase(), "CODE SENT");
        } else {
          phase("out");
          shakeAt = clock;
          lampTone = "mid";
          say(`${mode.word} · ${whoOf(tr.person)} kept out`);
          screen(mode.screen, tr.person.email.toUpperCase(), "NOT SHARED", "mid");
        }
      }
      break;
    }
    case "codeSent": {
      if (u >= 1) {
        phase("codeOk");
        screen(mode.screen, tr.person.email.toUpperCase(), "CODE OK", "lit");
        grant();
      }
      break;
    }
    case "owner":
    case "open":
    case "codeOk": {
      if (u >= 1) {
        card.pos = inside(D.slotOut);
        toFly(card, "ts-clip-out");
        phase("up");
        tr.exit = "out";
        say(`${mode.word} · ${whoOf(tr.person)} in`);
      }
      break;
    }
    case "out": {
      if (u >= 1) {
        phase("up");
        tr.exit = "back";
      }
      break;
    }
    case "up": {
      const slot = tr.exit === "out" ? D.slotOut : D.slotIn;
      card.pos = lerp3(tr.from, top(slot), ease(u));
      if (u >= 1) {
        toFly(card);
        if (tr.exit === "out") {
          done.push(tr.id);
          tr.spot = D.done[done.length - 1];
          tr.file = "done";
        } else {
          queue.push(tr.id);
          tr.spot = D.queue[queue.length - 1];
          tr.file = "queue";
        }
        phase("toFile");
      }
      break;
    }
    case "toFile": {
      const above = [tr.spot[0], tr.spot[1], D.fileTop + 6];
      card.pos = arcPos(tr.from, above, u, 22);
      if (tr.exit === "out" && tr.t > 0.35 && modeId !== "public") gateOpen = false;
      if (u >= 1) {
        card.anim = null;
        settleFiles();
        card.anim = true;
        fileEl[tr.file].appendChild(card.wrap);
        settleFiles();
        phase("drop");
      }
      break;
    }
    case "drop": {
      card.pos = lerp3(tr.from, tr.spot, ease(u));
      if (u >= 1) {
        card.anim = null;
        card.pos = tr.spot.slice();
        settleFiles();
        if (modeId !== "public") gateOpen = false;
        lampTone = "lo";
        phase("rest");
      }
      break;
    }
    case "rest": {
      if (u >= 1) {
        trip = null;
        tripIndex++;
        if (tripIndex >= D.tour.length && !queue.length) tripIndex = 0;
      }
      break;
    }
  }
  place(card);
}
function grant() {
  gateOpen = true;
  lampTone = "lit";
  lampLevel = 1;
}
function stepReset(dt) {
  let busy = false;
  for (const r of resetting) {
    r.t += dt;
    if (r.t < 0) {
      busy = true;
      continue;
    }
    const card = r.card;
    if (r.phase === "wait") {
      r.phase = "lift";
      r.from = card.pos.slice();
      r.t = 0;
      card.anim = true;
    }
    const dur = { lift: 0.22, fly: 0.55, drop: 0.22 }[r.phase];
    const u = clamp(r.t / dur, 0, 1);
    if (r.phase === "lift") {
      card.pos = lerp3(r.from, [r.from[0], r.from[1], D.fileTop + 6], ease(u));
      if (u >= 1) {
        done = done.filter((id) => id !== r.id);
        toFly(card);
        r.phase = "fly";
        r.t = 0;
        r.from = card.pos.slice();
      }
    } else if (r.phase === "fly") {
      card.pos = arcPos(r.from, [r.spot[0], r.spot[1], D.fileTop + 6], u, 18);
      if (u >= 1) {
        queue.push(r.id);
        fileEl.queue.appendChild(card.wrap);
        card.where = "queue";
        r.phase = "drop";
        r.t = 0;
        r.from = card.pos.slice();
      }
    } else if (r.phase === "drop") {
      card.pos = lerp3(r.from, r.spot, ease(u));
      if (u >= 1) {
        r.phase = "home";
        card.anim = null;
        card.pos = r.spot.slice();
        settleFiles();
      }
    }
    if (r.phase !== "home") busy = true;
    place(card);
  }
  if (!busy) {
    resetting = null;
    tripIndex = 0;
    queue = D.people.map((p) => p.id);
    settleFiles();
    restAt = clock;
  }
}

// ---- the loop ----
let frame = 0;
let last = 0;
let visible = false;
let touring = !still.matches;
let idleTimer = 0;
let restAt = -1;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  if (!still.matches) {
    if (resetting) stepReset(dt);
    else if (trip) stepTrip(dt);
    else if (clock - restAt > 0.6) startTrip();
  }
  // Badges waiting in a file slide forward when the one in front leaves.
  for (const card of Object.values(cards)) {
    if (card.anim || !card.target) continue;
    const before = card.pos[1];
    card.pos = [card.target[0], follow(card.pos[1], card.target[1], dt, 0.16), card.target[2]];
    if (Math.abs(card.pos[1] - card.target[1]) < 0.01) card.pos[1] = card.target[1];
    if (card.pos[1] !== before) place(card);
  }
  // The dial follows the mode.
  const want = D.dial.detents[modeIndex(modeId)];
  pointerDeg = follow(pointerDeg, want, dt, 0.16);
  if (Math.abs(pointerDeg - want) < 0.05) pointerDeg = want;
  pointer.setAttribute("d", pointerAt(pointerDeg));
  // The paddle: a damped spring toward open or shut, plus a short shake when
  // someone is kept out.
  const open = gateOpen || modeId === "public";
  const target = open ? 90 : 0;
  if (still.matches) paddle = { x: target, v: 0 };
  else {
    for (let i = 0; i < 4; i++) {
      const a = (target - paddle.x) * 140 - paddle.v * 21;
      paddle.v += (a * dt) / 4;
      paddle.x += (paddle.v * dt) / 4;
    }
    if (Math.abs(target - paddle.x) < 0.02 && Math.abs(paddle.v) < 0.02) paddle = { x: target, v: 0 };
  }
  let shake = 0;
  if (shakeAt >= 0 && !still.matches) {
    const age = clock - shakeAt;
    shake = age < 0.7 ? 2.2 * Math.sin(age * Math.PI * 2 * 6) * Math.exp(-age / 0.16) * Math.min(1, age / 0.04) : 0;
    if (age >= 0.7) shakeAt = -1;
  }
  drawPaddle(clamp(paddle.x + shake, 0, 92));
  // The lamp: a pulse while reading, pink while someone is let in.
  pulse = Math.max(0, pulse - dt * 2);
  const reading = trip && trip.phase === "read";
  const glowLevel = lampTone === "lit" ? 0.55 : reading ? 0.25 + 0.25 * Math.sin(clock * 14) : 0;
  lampLevel = follow(lampLevel, glowLevel, dt, 0.12);
  glow.style.opacity = lampLevel.toFixed(3);
  const tone = lampTone === "lit" || reading ? "lit" : lampTone;
  if (lamp.getAttribute("data-tone") !== tone) lamp.setAttribute("data-tone", tone);
  const moving = trip || resetting || paddle.v !== 0 || paddle.x !== target || pointerDeg !== want || shakeAt >= 0 || lampLevel > 0.002 || Object.values(cards).some((c) => !c.anim && c.target && c.pos[1] !== c.target[1]);
  frame = visible && (moving || touring || !still.matches) ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

function steer(id) {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    touring = !still.matches;
    run();
  }, 9000);
  setMode(id, true);
  if (still.matches) {
    const mode = modeOf(id);
    say(`${mode.word} · ${SUMMARY[id]}`);
    screen(mode.screen, "", SCREEN_SUMMARY[id]);
  }
  run();
}
const next = (step) => D.modes[(modeIndex(modeId) + step + D.modes.length) % D.modes.length].id;
stage.style.touchAction = "pan-y";
stage.addEventListener("click", () => steer(next(1)));
stage.addEventListener("keydown", (event) => {
  let id = null;
  if (/^[1-4]$/.test(event.key)) id = D.modes[Number(event.key) - 1].id;
  if (event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === " " || event.key === "Enter") id = next(1);
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") id = next(-1);
  if (event.key === "Home") id = D.modes[0].id;
  if (event.key === "End") id = D.modes[D.modes.length - 1].id;
  if (!id) return;
  event.preventDefault();
  steer(id);
});
setMode(modeId);
say(`${modeOf(modeId).word} · ${SUMMARY[modeId]}`);
drawPaddle(0);
pointer.setAttribute("d", pointerAt(pointerDeg));
