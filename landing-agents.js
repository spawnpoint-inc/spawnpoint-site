/* A measured, compositor-driven loop. Pointer activity never changes its clock. */
(() => {
  const viewport = document.querySelector('.lp-agent-carousel');
  if (!viewport || !Element.prototype.animate) return;
  const track = viewport.querySelector('.lp-agent-track');
  const group = track.querySelector('.lp-agent-list');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const speed = 28;
  let animation = null;
  let duration = 0;
  let phase = 0;
  let visible = false;
  let pageActive = true;
  let measuredWidth = 0;
  let measuredViewport = 0;

  function syncPlayback() {
    if (!animation) return;
    if (visible && !document.hidden && pageActive) animation.play();
    else animation.pause();
  }

  function rebuild() {
    if (reduced.matches) {
      if (animation && duration) phase = (Number(animation.currentTime || 0) % duration) / duration;
      animation?.cancel();
      animation = null;
      track.querySelectorAll('[data-agent-copy]').forEach(copy => copy.remove());
      viewport.classList.remove('is-running');
      measuredWidth = measuredViewport = 0;
      return;
    }
    viewport.classList.add('is-running');
    const width = group.getBoundingClientRect().width;
    const viewportWidth = viewport.clientWidth;
    if (!width || (animation && width === measuredWidth && viewportWidth === measuredViewport)) return;
    if (animation && duration) phase = (Number(animation.currentTime || 0) % duration) / duration;
    animation?.cancel();
    track.querySelectorAll('[data-agent-copy]').forEach(copy => copy.remove());
    // An extra full group covers the right edge even at the end of each cycle.
    for (let i = 0; i < Math.ceil(viewportWidth / width); i++) {
      const copy = group.cloneNode(true);
      copy.dataset.agentCopy = '';
      copy.setAttribute('aria-hidden', 'true');
      copy.inert = true;
      copy.querySelectorAll('img').forEach(img => { img.alt = ''; });
      track.append(copy);
    }
    measuredWidth = width;
    measuredViewport = viewportWidth;
    duration = width / speed * 1000;
    animation = track.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${-width}px)` }
    ], { duration, iterations: Infinity, easing: 'linear' });
    animation.pause();
    animation.currentTime = phase * duration;
    syncPlayback();
  }

  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    syncPlayback();
  }).observe(viewport);
  new ResizeObserver(rebuild).observe(viewport);
  // Observe the source group too: artwork and gaps can resize after loading or at a breakpoint.
  new ResizeObserver(rebuild).observe(group);
  reduced.addEventListener('change', rebuild);
  document.addEventListener('visibilitychange', syncPlayback);
  window.addEventListener('pagehide', () => { pageActive = false; syncPlayback(); });
  window.addEventListener('pageshow', () => { pageActive = true; syncPlayback(); });
  rebuild();
})();
