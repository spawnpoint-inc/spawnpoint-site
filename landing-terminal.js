// One elapsed-time clock owns typing, tool entrances, reading holds, and resets.
// The complete HTML transcripts remain intrinsic sizing content and the fallback.
(() => {
  'use strict';
  const terminal = document.querySelector('[data-terminal]');
  if (!terminal) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const timing = { scene: 7400, inputEnd: 2200, output: [2400, 2900, 3300, 3600, 3800], toolEnter: 200, replyEnter: 400, hold: 4200, reset: 7200 };
  const clamp = n => Math.max(0, Math.min(1, n));
  // Lookup for cubic-bezier(0.4, 0, 0.2, 1), shared by entrances and reset.
  const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  const easing = Array.from({ length: 1001 }, (_, i) => {
    let lo = 0, hi = 1;
    for (let n = 0; n < 16; n++) { const t = (lo + hi) / 2; if (cubic(t, .4, .2) < i / 1000) lo = t; else hi = t; }
    return i === 0 ? 0 : i === 1000 ? 1 : cubic((lo + hi) / 2, 0, 1);
  });
  const ease = n => easing[Math.round(clamp(n) * 1000)];
  // Uniform character intervals preserve the full input window without phrase pauses.
  function checkpoints(value) {
    const points = [{ at: 0, count: 0 }];
    for (let i = 1; i <= value.length; i++) {
      points.push({ at: 600 + 1600 * i / value.length, count: i });
    }
    return points;
  }
  const prefixAt = (points, t) => {
    let count = 0;
    for (const point of points) { if (point.at > t) break; count = point.count; }
    return count;
  };
  const scenes = [...terminal.querySelectorAll('.lp-term-scene')].map(root => ({
    root,
    rows: [...root.querySelectorAll('li')].map((row, index) => {
      const full = row.querySelector('[data-full]');
      const live = document.createElement('span'); live.className = 'lp-term-live';
      const typed = index === 0;
      const content = typed ? document.createTextNode('') : full.cloneNode(true);
      if (!typed) content.removeAttribute('data-full');
      live.append(content);
      let caret;
      if (index === 0) { caret = document.createElement('span'); caret.className = 'lp-term-caret'; live.append(caret); }
      full.parentElement.append(live);
      const value = full.textContent;
      return { row, content, value, caret, count: -1, progress: null, points: typed ? checkpoints(value) : null };
    })
  }));
  let elapsed = reduce.matches ? timing.hold : 0;
  let started = false, visible = false, ready = false, suspended = false;
  let raf = 0, last = null, active = -1;
  const text = (row, count) => {
    count = Math.max(0, Math.min(row.value.length, count));
    if (row.count !== count) { row.content.textContent = row.value.slice(0, count); row.count = count; }
  };
  function render() {
    const index = Math.floor(elapsed / timing.scene) % scenes.length;
    const t = elapsed % timing.scene, complete = reduce.matches;
    if (active !== index) {
      scenes.forEach((s, i) => { s.root.dataset.active = String(i === index); });
      active = index; terminal.dataset.scenario = scenes[index].root.dataset.scene;
    }
    const { root, rows } = scenes[index];
    root.style.opacity = complete ? 1 : 1 - ease((t - timing.reset) / (timing.scene - timing.reset));
    text(rows[0], complete ? rows[0].value.length : prefixAt(rows[0].points, t));
    rows[0].caret.hidden = complete || t >= timing.inputEnd;
    for (let i = 1; i <= 5; i++) {
      const fraction = (t - timing.output[i - 1]) / (i <= 4 ? timing.toolEnter : timing.replyEnter);
      const progress = complete ? 1 : i <= 4 ? ease(fraction) : clamp(fraction);
      const row = rows[i];
      // One clock freezes the whole entrance on pause. Settled rows need no work.
      if (row.progress !== progress) {
        row.row.style.opacity = progress;
        row.row.style.filter = progress === 1 ? 'none' : `blur(${2 * (1 - progress)}px)`;
        row.progress = progress;
      }
    }
    terminal.dataset.elapsed = String(Math.round(elapsed));
  }
  function running() { return ready && started && visible && !document.hidden && !suspended && !reduce.matches; }
  function frame(now) {
    raf = 0;
    if (!running()) { last = null; return; }
    if (last !== null) elapsed += now - last;
    last = now; render(); raf = requestAnimationFrame(frame);
  }
  function update() {
    terminal.dataset.playback = reduce.matches ? 'reduced' : running() ? 'playing' : 'waiting';
    if (!running()) { cancelAnimationFrame(raf); raf = 0; last = null; }
    else if (!raf) raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver(entries => {
    const entry = entries[0];
    visible = entry.isIntersecting && entry.intersectionRatio > 0;
    if (entry.intersectionRatio >= .5) started = true;
    update();
  }, { threshold: [0, .5] }).observe(terminal);
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pagehide', () => { suspended = true; update(); });
  window.addEventListener('pageshow', () => { suspended = false; update(); });
  reduce.addEventListener('change', () => {
    if (reduce.matches) elapsed = Math.floor(elapsed / timing.scene) * timing.scene + timing.hold;
    render(); update();
  });
  // CSS sizing content responds to width/font changes without resetting playback.
  Promise.resolve(document.fonts?.ready).then(() => {
    ready = true; render(); terminal.classList.add('is-enhanced'); update();
  });
})();
