/* The hero's tile grid, drawn live. The guidelines' grid panel is 48 by 32
   tiles on a 50 unit pitch with a sea-angel silhouette cut out of it; the
   silhouette is the mask below (one row per 48 characters, 1 is a hole),
   sampled from brand/grid-pink-wide.png. The light tiles drift through the
   pink on a slow noise field, which is what the designer's motion tests do.
   A canvas keeps every tile crisp at any width and pixel ratio, where a
   scaled clip goes soft. Reduced motion draws one frame and stops. */
(function () {
  var MASK = "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000001100000000000000000000000000000000000111100000001110000000000000000000000000000000001111111000011111100000000000000000000000000000000011111110011111000000000000000000000000000000000001111111111111000000000000000000000000000000000001111111111111000000000000000000000000000000000001111111111110000000000000000000000000000000000000111111111110000000000000000000000000000000000000111111111111100000000000000000000000000000000000011111111111110000000000000000000000000000000000001111111111111000000000000000000000000000000000011111111111111000000000000000000000000000000000111111111111111000000000000000000000000000000000111111111110000000000000000000000000000000000000111111110000000000000000000000000000000000000001111111100000000000000000000000000000000000000001111111000000000000000000000000000000000000000011111100000000000000000000000000000000000000001111111100000000000000000000000000000000000000011111111000000000000000000000000000000000000000111111100000000000000000000000000000000000000011111110000000000000000000000000000000000000000011111000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
  var COLS = 48, ROWS = 32;
  var PINK = "#ef285e", LIGHT = "#ffd2de", DARK = "#171717";

  var el = document.getElementById("hero-tiles");
  if (!el || !el.getContext) return;
  var ctx = el.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rounded = typeof ctx.roundRect === "function";

  // Value noise in three dimensions: the third is time.
  function hash(x, y, z) {
    var n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function noise(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    var a = lerp(lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), xf), lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), xf), yf);
    var b = lerp(lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), xf), lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), xf), yf);
    return lerp(a, b, zf);
  }
  // Two octaves of drifting blobs, so about a third of the tiles are light
  // at any moment, plus a sparse sprinkle of single light tiles.
  function light(c, r, t) {
    var x = c * 0.1 + t * 0.05, y = r * 0.1 - t * 0.025;
    var v = noise(x, y, t * 0.07) * 0.65 + noise(x * 2.4 + 7, y * 2.4 + 3, t * 0.11) * 0.35;
    if (v > 0.555) return true;
    return hash(c, r, Math.floor(t * 0.6)) > 0.985;
  }

  var w = 0, h = 0, pitch = 0, ox = 0, oy = 0, tile = 0, rad = 0;
  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = el.getBoundingClientRect();
    w = Math.round(rect.width); h = Math.round(rect.height);
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fit the panel: the grid is scaled to the smaller of the two fits and
    // centred, so the whole silhouette always shows.
    pitch = Math.min(w / COLS, h / ROWS);
    ox = (w - pitch * COLS) / 2; oy = (h - pitch * ROWS) / 2;
    tile = pitch * 0.88; rad = Math.max(1, pitch * 0.14);
  }

  function draw(t) {
    ctx.fillStyle = DARK; ctx.fillRect(0, 0, w, h);
    for (var r = 0; r < ROWS; r++) {
      var y = oy + r * pitch;
      if (y + pitch < 0 || y > h) continue;
      for (var c = 0; c < COLS; c++) {
        if (MASK.charAt(r * COLS + c) === "1") continue;
        var x = ox + c * pitch;
        ctx.fillStyle = light(c, r, t) ? LIGHT : PINK;
        if (rounded) { ctx.beginPath(); ctx.roundRect(x, y, tile, tile, rad); ctx.fill(); }
        else ctx.fillRect(x, y, tile, tile);
      }
    }
  }

  var running = false, visible = true, last = 0, start = performance.now();
  function frame(now) {
    if (!running) return;
    // Thirty frames a second is plenty for tiles that change state.
    if (now - last >= 33) { last = now; draw((now - start) / 1000); }
    requestAnimationFrame(frame);
  }
  function play() {
    if (reduce || running || !visible || document.hidden) return;
    running = true; requestAnimationFrame(frame);
  }
  function stop() { running = false; }

  size(); draw(0);
  if (reduce) return;
  window.addEventListener("resize", function () { size(); draw((performance.now() - start) / 1000); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) play(); else stop();
    }).observe(el);
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else play(); });
  play();
})();
