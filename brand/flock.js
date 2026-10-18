/* The hero's flock, drawn live. brand/flock-frames.js holds the clip
   brand/flock-pink.mp4 as tile keyframes (scripts/build-flock.py); this plays
   them on a canvas that covers the hero, so every tile stays crisp at any
   width and pixel ratio, where the clip goes soft when stretched. The clip
   ends on a crossfade back to its first keyframe; here the tiles that differ
   flip one at a time over the same half second instead. Reduced motion draws
   the first keyframe and stops. */
(function () {
  var F = window.spawnpointFlock;
  var el = document.getElementById("hero-flock");
  if (!F || !el || !el.getContext) return;
  var ctx = el.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rounded = typeof ctx.roundRect === "function";
  var COLS = F.cols, ROWS = F.rows, N = COLS * ROWS;
  var FILL = [null, "#ef285e", "#ffd2de"], DARK = "#171717";
  var DISSOLVE = 467; // the clip's crossfade: 14 frames at 30 fps

  // One byte a tile per keyframe, unpacked from four tiles a byte.
  var raw = window.atob(F.keys), per = Math.ceil(N / 4), keys = [];
  for (var k = 0; k < F.hold.length; k++) {
    var key = new Uint8Array(N);
    for (var i = 0; i < N; i++) key[i] = (raw.charCodeAt(k * per + (i >> 2)) >> ((i & 3) * 2)) & 3;
    keys.push(key);
  }
  var starts = [], cycle = 0;
  for (k = 0; k < F.hold.length; k++) { starts.push(cycle); cycle += F.hold[k]; }
  var dissolveAt = cycle;
  cycle += DISSOLVE;

  // When each tile flips during the dissolve: a fixed scatter, so the loop
  // looks the same every time round.
  var flip = new Float32Array(N);
  for (i = 0; i < N; i++) {
    var n = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    flip[i] = (n - Math.floor(n)) * DISSOLVE;
  }

  var w = 0, h = 0, pitch = 0, ox = 0, oy = 0, tile = 0, rad = 0;
  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = el.getBoundingClientRect();
    w = Math.round(rect.width); h = Math.round(rect.height);
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Cover the stage: the grid is scaled to the larger of the two fits and
    // centred, so no edge of the clip ever shows.
    pitch = Math.max(w / COLS, h / ROWS);
    ox = (w - pitch * COLS) / 2; oy = (h - pitch * ROWS) / 2;
    tile = pitch * 0.85; rad = Math.max(1, pitch * 0.15);
  }

  // The state of tile i at time t (ms into the cycle).
  function frameAt(t) {
    if (t >= dissolveAt) return -1;
    var lo = 0, hi = starts.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (starts[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }

  function draw(t) {
    var f = frameAt(t), from = keys[keys.length - 1], to = keys[0], p = t - dissolveAt;
    ctx.fillStyle = DARK; ctx.fillRect(0, 0, w, h);
    // One path per colour, so a frame is two fills however many tiles.
    for (var s = 1; s <= 2; s++) {
      ctx.beginPath();
      for (var r = 0; r < ROWS; r++) {
        var y = oy + r * pitch;
        if (y + pitch < 0 || y > h) continue;
        for (var c = 0; c < COLS; c++) {
          var j = r * COLS + c;
          var v = f >= 0 ? keys[f][j] : (p >= flip[j] ? to[j] : from[j]);
          if (v !== s) continue;
          var x = ox + c * pitch;
          if (rounded) ctx.roundRect(x, y, tile, tile, rad); else ctx.rect(x, y, tile, tile);
        }
      }
      ctx.fillStyle = FILL[s]; ctx.fill();
    }
  }

  var running = false, visible = true, shown = null, start = performance.now();
  function frame(now) {
    if (!running) return;
    var t = (now - start) % cycle;
    // Redraw only when something changed: a new keyframe, or the next
    // thirtieth of a second of the dissolve.
    var id = t >= dissolveAt ? "d" + Math.floor((t - dissolveAt) / 33) : frameAt(t);
    if (id !== shown) { shown = id; draw(t); }
    requestAnimationFrame(frame);
  }
  function play() {
    if (reduce || running || !visible || document.hidden) return;
    running = true; requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  size(); draw(0);
  if (reduce) return;
  window.addEventListener("resize", function () { size(); shown = null; draw((performance.now() - start) % cycle); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) play(); else stop();
    }).observe(el);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else play(); });
  play();
})();
