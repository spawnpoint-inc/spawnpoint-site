// One pausable clock drives the illustrations, including typing and easing.
// Completed HTML remains the no-script fallback. Hover never changes playback.
(() => {
  const STAGE = 393;
  const durations = [3600, 4800, 4500];
  const overlap = 350, hold = 3000, entryDelay = 1000;
  const starts = [0, durations[0] - overlap, durations[0] + durations[1] - overlap * 2];
  const end = starts[2] + durations[2], cycle = end + hold;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const stacked = matchMedia('(max-width: 960px)');
  const clamp = x => Math.max(0, Math.min(1, x));
  const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  const style = (el, key, value) => {
    value = String(value);
    if (key.startsWith('--')) {
      if (el.style.getPropertyValue(key) !== value) el.style.setProperty(key, value);
    } else if (el.style[key] !== value) el.style[key] = value;
  };
  // Solve CSS cubic-bezier curves once into a lookup table, not per element.
  function easing(value) {
    const [x1, y1, x2, y2] = value.match(/[\d.]+/g).map(Number);
    const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
    const values = Array.from({ length: 1001 }, (_, i) => {
      let lo = 0, hi = 1;
      for (let n = 0; n < 16; n++) { const m = (lo + hi) / 2; if (cubic(m, x1, x2) < i / 1000) lo = m; else hi = m; }
      return i === 0 ? 0 : i === 1000 ? 1 : cubic((lo + hi) / 2, y1, y2);
    });
    return x => values[Math.round(clamp(x) * 1000)];
  }
  function status(el, first, last) {
    el.className = 'fc-status';
    el.replaceChildren();
    const labels = [first, last].map((value, i) => {
      const span = document.createElement('span');
      span.className = 'pill ' + (i ? 'st-running' : 'st-spawning');
      span.textContent = value; el.append(span); return span;
    });
    return p => {
      style(labels[0], 'opacity', 1 - p); style(labels[1], 'opacity', p);
      labels[0].setAttribute('aria-hidden', String(p >= 0.5));
      labels[1].setAttribute('aria-hidden', String(p < 0.5));
      const state = p >= 1 ? last : first;
      if (el.dataset.state !== state) el.dataset.state = state;
    };
  }
  function scene(root, index, motion) {
    const q = s => root.querySelector(s), all = s => [...root.querySelectorAll(s)];
    const { move, soft, expand, enter, fade, pressIn, pressOut, travel } = motion;
    const ramp = (t, at, duration, ease = move) => ease((t - at) / duration);
    function type(el, value, t, start, speed, caret) {
      const count = Math.max(0, Math.min(value.length, Math.floor((t - start) / speed) + 1));
      text(el, value.slice(0, count));
      if (caret) style(caret, 'opacity', t >= start && count < value.length && Math.floor(t / 500) % 2 === 0 ? 1 : 0);
    }
    let render;
    if (index === 0) {
      const row = q('[data-row]'), grows = all('.fc-grow'), name = q('[data-name]');
      const by = q('[data-by]'), caret = q('[data-caret]'), setStatus = status(q('[data-status]'), 'spawning', 'running');
      render = t => {
        const prep = t < 200;
        const open = prep ? 1 - ramp(t, 0, 200, soft) : ramp(t, 350, expand);
        grows.forEach(e => style(e, 'gridTemplateRows', open + 'fr'));
        if (prep) { text(name, 'lunch-orders'); style(caret, 'opacity', 0); }
        else type(name, 'lunch-orders', t, 690, 55, caret);
        style(by, 'opacity', prep ? open : ramp(t, 1450, fade, soft));
        setStatus(prep ? 1 : ramp(t, 2750, fade, soft));
        const highlight = prep ? 0 : ramp(t, 350, fade, soft) * (1 - ramp(t, 3000, 600, soft));
        style(row, '--fc-highlight', (highlight * 12) + '%');
      };
    } else if (index === 1) {
      const typed = q('[data-typed]'), caret = q('[data-caret]'), ph = q('[data-ph]');
      const form = q('.fc-form'), record = q('.fc-record'), input = q('[data-input]'), btn = q('[data-btn]');
      const buttonBackground = getComputedStyle(btn).backgroundColor;
      const links = all('[data-link]'), setStatus = status(q('[data-check]'), 'checking', 'verified');
      const copy = q('[data-copy]'), finishedCopy = copy.innerHTML;
      copy.classList.add('fc-copy-swap'); copy.replaceChildren();
      const editing = document.createElement('span'), complete = document.createElement('span');
      editing.textContent = 'Give every team app a link under a domain your company owns.';
      complete.innerHTML = finishedCopy; copy.append(editing, complete);
      render = t => {
        const prep = t < 200;
        const result = prep ? 1 - ramp(t, 0, 200, soft) : ramp(t, 2000, expand);
        style(form, 'opacity', 1 - result); style(form, 'transform', `translateY(${-travel * result}px)`);
        style(record, 'opacity', result); style(record, 'transform', `translateY(${travel * (1 - result)}px)`);
        input.classList.toggle('is-focus', t >= 500 && t < 1600);
        if (prep) { text(typed, 'apps.acme.com'); style(caret, 'opacity', 0); }
        else type(typed, 'apps.acme.com', t, 500, 70, caret);
        ph.hidden = prep || t >= 500;
        const pressed = ramp(t, 1600, pressIn, soft) * (1 - ramp(t, 1740, pressOut, soft));
        style(btn, 'transform', `translateY(${pressed}px)`);
        style(btn, 'background', `color-mix(in srgb, var(--neutral-10) ${pressed * 16}%, ${buttonBackground})`);
        const verified = prep ? result : ramp(t, 2850, fade, soft);
        setStatus(verified);
        style(editing, 'opacity', 1 - verified); style(complete, 'opacity', verified);
        editing.setAttribute('aria-hidden', String(verified >= 0.5)); complete.setAttribute('aria-hidden', String(verified < 0.5));
        links.forEach((li, i) => {
          const at = 3350 + i * 260, open = prep ? result : ramp(t, at, expand);
          style(li.querySelector('.fc-new'), 'gridTemplateRows', open + 'fr');
          const value = li.dataset.name + '.apps.acme.com';
          if (prep) text(li.querySelector('[data-new]'), value);
          else type(li.querySelector('[data-new]'), value, t, at, 24);
          style(li.querySelector('.fc-old'), 'color', `color-mix(in srgb, var(--muted-foreground) ${open * 100}%, var(--brand))`);
        });
      };
    } else {
      const cmd = q('[data-cmd]'), value = cmd.textContent, caret = q('[data-caret]'), lines = all('[data-line]');
      const firstLine = 400 + value.length * 22 + 500;
      render = t => {
        const prep = t < 200, out = 1 - ramp(t, 0, 200, soft);
        if (prep) { text(cmd, value); style(cmd, 'opacity', out); style(caret, 'opacity', 0); }
        else { style(cmd, 'opacity', 1); type(cmd, value, t, 400, 22, caret); }
        lines.forEach((line, i) => {
          const at = firstLine + Math.min(i, 2) * 220 + Math.max(0, i - 2) * 340;
          const p = prep ? out : ramp(t, at, enter);
          style(line, 'opacity', p); style(line, 'transform', `translateY(${prep ? 0 : travel * (1 - p)}px)`);
        });
      };
    }
    root.classList.add('fc-sequenced');
    let last = null;
    return t => {
      if (t === last) return;
      last = t; render(t);
      root.dataset.motionTime = String(Math.round(t));
      root.dataset.motionState = t >= durations[index] ? 'complete' : t < 200 ? 'preparing' : 'playing';
    };
  }

  for (const section of document.querySelectorAll('.fc-section')) {
    const roots = [...section.querySelectorAll('.fc-visual[data-scene]')];
    if (roots.length !== 3) continue;
    const css = getComputedStyle(section), ms = name => parseFloat(css.getPropertyValue(name));
    const motion = {
      move: easing(css.getPropertyValue('--fc-ease-move')),
      soft: easing(css.getPropertyValue('--fc-ease-soft')),
      expand: ms('--fc-expand-ms'), enter: ms('--fc-enter-ms'), fade: ms('--fc-fade-ms'),
      pressIn: ms('--fc-press-in-ms'), pressOut: ms('--fc-press-out-ms'), travel: ms('--fc-travel')
    };
    const renders = roots.map((root, i) => scene(root, i, motion));
    const ratios = [0, 0, 0], mobileTimes = [0, 0, 0];
    let entryRemaining = entryDelay;
    let elapsed = 0, last = 0, raf = 0, started = false, mobile = stacked.matches, active = -1;
    function draw() {
      if (reduce.matches) renders.forEach((render, i) => render(durations[i]));
      else if (mobile) {
        // Keep each offscreen scene's last pose; only the visible one advances.
        if (active >= 0) renders[active](Math.min(mobileTimes[active] % (durations[active] + hold), durations[active]));
      } else {
        const t = elapsed % cycle;
        renders.forEach((render, i) => render(t < starts[i] ? durations[i] : Math.min(t - starts[i], durations[i])));
      }
    }
    function running() { return started && !reduce.matches && !document.hidden && (mobile ? active >= 0 : ratios.some(r => r > 0)); }
    function tick(now) {
      raf = 0;
      if (!running()) { last = 0; return; }
      const dt = last ? now - last : 0; last = now;
      if (entryRemaining > 0) {
        entryRemaining = Math.max(0, entryRemaining - dt);
        raf = requestAnimationFrame(tick);
        return;
      }
      if (mobile) mobileTimes[active] += dt; else elapsed += dt;
      draw(); raf = requestAnimationFrame(tick);
    }
    function update() {
      if (!running()) { cancelAnimationFrame(raf); raf = 0; last = 0; }
      else if (!raf) raf = requestAnimationFrame(tick);
    }
    function visibility() {
      if (Math.max(...ratios) >= 0.5) started = true;
      if (mobile) {
        const best = ratios.indexOf(Math.max(...ratios));
        const next = ratios[best] >= 0.5 ? best : active >= 0 && ratios[active] > 0 ? active : -1;
        if (next !== active) { active = next; last = 0; if (active >= 0 && mobileTimes[active] === 0) entryRemaining = entryDelay; }
      }
      update();
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) ratios[roots.indexOf(entry.target)] = entry.intersectionRatio;
      visibility();
    }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    const resize = new ResizeObserver(entries => {
      for (const entry of entries) style(entry.target.querySelector('.fc-stage'), '--fc-scale', entry.contentRect.width / STAGE);
    });
    roots.forEach((root, i) => { renders[i](durations[i]); observer.observe(root); resize.observe(root); });
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pagehide', () => { cancelAnimationFrame(raf); raf = 0; last = 0; });
    window.addEventListener('pageshow', update);
    reduce.addEventListener('change', () => {
      if (reduce.matches) draw();
      else { elapsed = 0; mobileTimes.fill(0); entryRemaining = entryDelay; }
      update();
    });
    stacked.addEventListener('change', () => {
      if (stacked.matches) {
        const t = elapsed % cycle;
        mobileTimes.forEach((_, i) => { mobileTimes[i] = t < starts[i] ? 0 : Math.min(t - starts[i], durations[i]); });
      } else if (active >= 0) elapsed = starts[active] + Math.min(mobileTimes[active] % (durations[active] + hold), durations[active]);
      mobile = stacked.matches; last = 0; visibility();
    });
    update();
  }
})();
