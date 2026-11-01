/* Flat two-ink sea angels. Typography stays protected by geometry, not effects. */
(function () {
  "use strict";
  // Designer controls: CSS pixels, seconds, and radians. Six is the default.
  var SETTINGS = {
    population: {
      desktop: 6, tablet: 2,
      sizes: { large: [240, 264], medium: [192, 228], small: [168, 192] },
      tabletSize: [176, 196]
    },
    swim: { cruise: [24, 38], burst: 50, speed: 1 },
    turning: { rate: 0.55, jointLimit: 0.21, lookAhead: 1.4, response: 0.75, acceleration: 0.8 },
    separation: { lookAhead: 1.2, enter: 1.15, release: 1.35, spacing: 0.58 },
    tail: { amplitude: 25, waveLag: 4.8 },
    wings: { period: [2.5, 3.3], bend: 48, fold: 0.24 },
    clearance: { heading: 48, lead: 36, buttons: 36, terminal: 24, nav: 24 },
    grid: { tile: 12, gap: 0.14, corner: 2 },
    timing: { simulationHz: 60, drawHz: 40 },
    colors: { body: "#8A0F30", highlight: "#FFD2DE" },
    seed: 7
  };
  if (typeof module === "object" && module.exports) {
    module.exports = { settings: SETTINGS, createSchool: require("./brand/sea-angel/motion.js") };
    return;
  }

  var hero = document.querySelector("section.lp-hero-v2");
  var art = hero && hero.querySelector(".lp-hero-art");
  if (!art) return;
  var baseURL = document.currentScript.src;
  var wide = matchMedia("(min-width: 881px)");
  var reduced = matchMedia("(prefers-reduced-motion: reduce)");
  var desktopCount = SETTINGS.population.desktop;
  var canvas, ctx, sample, ink, school, state, marked;
  var width = 0, height = 0, dpr = 1, columns = 0, rows = 0, origin = 0;
  var zones = [], oldRects = [], dirty = [];
  var last = 0, painted = 0, accumulator = 0, raf = 0, resizeRAF = 0;
  var visible = false, loaded = false, loading = false, pageReady = false;
  var T = SETTINGS.grid.tile, SS = 3, step = 1 / SETTINGS.timing.simulationHz;

  function measure() {
    var hb = hero.getBoundingClientRect();
    zones = [];
    [["h1", "heading"], [".lp-hero-lead", "lead"], [".lp-hero-cta", "buttons"], [".lp-term", "terminal"]].forEach(function (entry) {
      var element = hero.querySelector(entry[0]);
      if (!element) return;
      var r = element.getBoundingClientRect(), pad = SETTINGS.clearance[entry[1]];
      zones.push({ kind: entry[1], left: r.left - hb.left - pad, right: r.right - hb.left + pad,
        top: r.top - hb.top - pad, bottom: r.bottom - hb.top + pad });
    });
    var nav = document.getElementById("lpNav");
    if (nav) zones.push({ kind: "nav", left: -SETTINGS.clearance.nav, right: width + SETTINGS.clearance.nav,
      top: 0, bottom: nav.offsetHeight + SETTINGS.clearance.nav });
  }

  function resize() {
    resizeRAF = 0;
    if (!loaded || !wide.matches) return;
    width = hero.clientWidth; height = hero.clientHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    origin = (width / 2) % T - T;
    columns = Math.ceil((width - origin) / T); rows = Math.ceil(height / T);
    sample.width = columns * SS; sample.height = rows * SS;
    state = new Uint8Array(columns * rows); marked = new Uint8Array(state.length);
    oldRects = []; accumulator = 0; last = 0;
    measure();
    school = window.createSeaAngelSchool({ settings: SETTINGS, shape: window.seaAngelShape,
      width: width, height: height, zones: zones,
      population: width <= 1200 ? SETTINGS.population.tablet : desktopCount });
    draw(1);
    art.classList.add("is-live");
    update();
  }

  function tileRect(bounds) {
    return {
      x0: Math.max(0, Math.floor((bounds.left - origin) / T) - 1),
      x1: Math.min(columns, Math.ceil((bounds.right - origin) / T) + 1),
      y0: Math.max(0, Math.floor(bounds.top / T) - 1),
      y1: Math.min(rows, Math.ceil(bounds.bottom / T) + 1)
    };
  }
  function mark(rect) {
    if (rect.x1 <= rect.x0 || rect.y1 <= rect.y0) return;
    for (var y = rect.y0; y < rect.y1; y++) for (var x = rect.x0; x < rect.x1; x++) {
      var i = y * columns + x;
      if (!marked[i]) { marked[i] = 1; dirty.push(i); }
    }
    ctx.clearRect(origin + rect.x0 * T, rect.y0 * T, (rect.x1 - rect.x0) * T, (rect.y1 - rect.y0) * T);
  }
  function blocked(x, y) {
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (x + T > z.left && x < z.right && y + T > z.top && y < z.bottom) return true;
    }
    return false;
  }
  function draw(alpha) {
    ink.setTransform(SS / T, 0, 0, SS / T, -origin * SS / T, 0);
    ink.clearRect(origin, 0, sample.width * T / SS, sample.height * T / SS);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty.length = 0;
    oldRects.forEach(mark);
    var rects = [];
    school.fish.forEach(function (a) {
      var bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      school.paths.forEach(function (path) {
        ink.fillStyle = path.tone === 1 ? "#808080" : "#ffffff";
        ink.beginPath();
        for (var i = path.start; i < path.start + path.count; i++) {
          var x = a.previous[i * 2] + (a.points[i * 2] - a.previous[i * 2]) * alpha;
          var y = a.previous[i * 2 + 1] + (a.points[i * 2 + 1] - a.previous[i * 2 + 1]) * alpha;
          if (i === path.start) ink.moveTo(x, y); else ink.lineTo(x, y);
          bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
          bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
        }
        ink.closePath(); ink.fill("evenodd");
      });
      var rect = tileRect(bounds); rects.push(rect); mark(rect);
    });
    oldRects = rects;
    var pixels = ink.getImageData(0, 0, sample.width, sample.height).data, sw = sample.width;
    for (var d = 0; d < dirty.length; d++) {
      var index = dirty[d], row = Math.floor(index / columns), col = index % columns;
      var cover = 0, pale = 0;
      for (var sy = 0; sy < SS; sy++) {
        var base = ((row * SS + sy) * sw + col * SS) * 4;
        for (var sx = 0; sx < SS; sx++) {
          var n = base + sx * 4;
          if (pixels[n + 3] > 127) { cover++; if (pixels[n] > 200) pale++; }
        }
      }
      var on = cover >= (state[index] ? 4 : 6);
      var highlight = pale / Math.max(cover, 1) >= (state[index] === 2 ? 0.4 : 0.6);
      state[index] = on && !blocked(origin + col * T, row * T) ? (highlight ? 2 : 1) : 0;
    }
    var size = T * (1 - SETTINGS.grid.gap), inset = (T - size) / 2;
    for (var tone = 1; tone <= 2; tone++) {
      ctx.fillStyle = tone === 1 ? SETTINGS.colors.body : SETTINGS.colors.highlight;
      ctx.beginPath();
      for (var j = 0; j < dirty.length; j++) {
        var cell = dirty[j];
        if (state[cell] !== tone) continue;
        ctx.roundRect(origin + cell % columns * T + inset, Math.floor(cell / columns) * T + inset,
          size, size, Math.min(SETTINGS.grid.corner, size / 2));
      }
      ctx.fill();
    }
    for (var c = 0; c < dirty.length; c++) marked[dirty[c]] = 0;
  }

  function running() {
    return loaded && wide.matches && visible && !document.hidden && !reduced.matches && SETTINGS.swim.speed > 0;
  }
  function frame(now) {
    raf = 0;
    if (!running()) { last = 0; return; }
    accumulator += last ? Math.min((now - last) / 1000, 0.1) * SETTINGS.swim.speed : 0;
    last = now;
    while (accumulator >= step) { school.step(step); accumulator -= step; }
    var interval = 1000 / SETTINGS.timing.drawHz;
    if (now - painted >= interval) {
      draw(accumulator / step);
      painted = now - (now - painted) % interval;
    }
    raf = requestAnimationFrame(frame);
  }
  function update() {
    if (!running()) { cancelAnimationFrame(raf); raf = 0; last = 0; return; }
    if (!raf) { last = 0; painted = 0; raf = requestAnimationFrame(frame); }
  }
  function scheduleResize() {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(resize);
  }
  function init() {
    if (!window.seaAngelShape || !window.createSeaAngelSchool) return;
    canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true");
    ctx = canvas.getContext("2d"); sample = document.createElement("canvas");
    ink = sample.getContext("2d", { willReadFrequently: true });
    if (!ctx || !ink) return;
    loaded = true; art.appendChild(canvas); resize();
    new ResizeObserver(scheduleResize).observe(hero);
    window.addEventListener("resize", scheduleResize);
    if (document.fonts) document.fonts.ready.then(scheduleResize);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    window.addEventListener("pagehide", function () { cancelAnimationFrame(raf); raf = 0; last = 0; });
    update();
  }
  function load(path) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script"); s.src = new URL(path, baseURL).href;
      s.onload = resolve; s.onerror = function () { s.remove(); reject(new Error("Sea-angel asset unavailable")); };
      document.head.appendChild(s);
    });
  }
  function start() {
    if (!pageReady || !wide.matches || loaded || loading) return;
    loading = true;
    Promise.all([load("brand/sea-angel/shape.js"), load("brand/sea-angel/rig.js"), load("brand/sea-angel/motion.js")]).then(function () {
      loading = false; init();
    }).catch(function () { loading = false; }); // The flat SVG fallback stays visible.
  }
  new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; update(); }).observe(hero);
  wide.addEventListener("change", function () { start(); if (loaded && wide.matches) resize(); update(); });
  reduced.addEventListener("change", function () { if (loaded && wide.matches && reduced.matches) draw(1); update(); });
  var nav = document.getElementById("lpNav");
  if (nav) {
    nav.classList.toggle("at-hero", hero.getBoundingClientRect().bottom > 72);
    new IntersectionObserver(function (entries) { nav.classList.toggle("at-hero", entries[0].isIntersecting); },
      { rootMargin: "-72px 0px 0px 0px" }).observe(hero);
  }
  function ready() { pageReady = true; start(); }
  if (document.readyState === "complete") ready();
  else window.addEventListener("load", ready, { once: true });
})();
