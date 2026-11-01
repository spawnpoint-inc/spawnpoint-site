/* Browser regression checks for the homepage increment. See README.md. */
const { chromium, request } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const base = process.env.HOMEPAGE_URL || 'http://127.0.0.1:8874';
const out = process.env.HOMEPAGE_OUTPUT || path.join(require('node:os').tmpdir(), 'spawnpoint-homepage-release');
const baseline = cp.execFileSync('git', ['show', `${process.env.HOMEPAGE_BASE || '20bc154cd5dcd7b55ac3a333ccaec80617456838'}:index.html`], { encoding: 'utf8' });
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const lower = html => html.slice(html.indexOf('      <section id="how"'), html.indexOf('    </footer>'));
assert.equal(lower(source), lower(baseline), 'All later sections and the footer retain production markup');
assert.equal(source.includes('combined-review'), false);
assert.equal(source.includes('prototypes/'), false);
assert.equal(fs.readFileSync(path.join(__dirname, '../llms-full.txt'), 'utf8').includes('SPAWNPOINT_TEAM=k7q2'), false);
fs.mkdirSync(out, { recursive: true });

async function lowerStyles(page) {
  return page.evaluate(() => [...document.querySelectorAll('#how h2, #how h3, #how p, #teams h2, #teams h3, #teams p, #features h2, #features h3, #features p, #sharing h2, #sharing h3, #sharing p, #pricing h2, #pricing p, #faq summary, #blog h3, .lp-close h2, .lp-close p, .lp-footer h4, .lp-footer p, .lp-footer a')].map(e => {
    const c = getComputedStyle(e), r = e.getBoundingClientRect();
    return { text: e.textContent.trim(), width: r.width, height: r.height, font: c.font, color: c.color, margin: c.margin, padding: c.padding, letterSpacing: c.letterSpacing };
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const errors = [], badResponses = [], cases = [], layouts = [];
  function track(page) {
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });
  }
  for (const width of [320, 390, 680, 880, 881, 960, 1024, 1200, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    track(page);
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector('[data-terminal]').dataset.playback === 'reduced');
    const geometry = await page.evaluate(() => {
      const hero = document.querySelector('.lp-hero-v2'), hb = hero.getBoundingClientRect();
      const zones = [['heading', '#hero-title', 48], ['lead', '.lp-hero-lead', 36], ['buttons', '.lp-hero-cta', 36], ['terminal', '.lp-term', 24]].map(([kind, selector, pad]) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { kind, left: r.left - hb.left - pad, right: r.right - hb.left + pad, top: r.top - hb.top - pad, bottom: r.bottom - hb.top + pad };
      });
      zones.push({ kind: 'nav', left: -24, right: innerWidth + 24, top: 0, bottom: document.querySelector('#lpNav').offsetHeight + 24 });
      return { width: innerWidth, height: hb.height, pageWidth: document.documentElement.scrollWidth, zones, background: getComputedStyle(hero).backgroundColor,
        cards: [...document.querySelectorAll('.fc-visual')].map(e => ({ time: +e.dataset.motionTime, scale: +e.querySelector('.fc-stage').style.getPropertyValue('--fc-scale'), width: e.clientWidth })),
        brokenImages: [...document.images].filter(e => e.complete && !e.naturalWidth).map(e => e.src) };
    });
    assert.equal(geometry.pageWidth, width, `No horizontal overflow at ${width}px`);
    assert.equal(geometry.background, 'rgb(224, 34, 88)');
    assert.deepEqual(geometry.brokenImages, []);
    assert.deepEqual(geometry.cards.map(x => x.time), [3600, 4800, 4500]);
    geometry.cards.forEach(x => assert.ok(Math.abs(x.scale * 393 - x.width) < 1));
    assert.equal(await page.locator('[data-agent-copy]').count(), 0);
    if ([881, 1024, 1200, 1440, 1920].includes(width)) layouts.push({ width, height: geometry.height, zones: geometry.zones });
    const old = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    await old.route(base + '/', r => r.fulfill({ body: baseline, contentType: 'text/html' }));
    await old.goto(base);
    await old.evaluate(() => document.fonts.ready);
    assert.deepEqual(await lowerStyles(page), await lowerStyles(old), `Lower-page computed styles match production at ${width}px`);
    await old.close();
    if (await page.locator('#lpNavToggle').isVisible()) {
      await page.locator('#lpNavToggle').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#lpNavToggle').getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#lpNavToggle').getAttribute('aria-expanded'), 'false');
      await page.locator('#lpNavToggle').click();
      await page.locator('#lpNavLinks a[href="#how"]').click();
      assert.equal(await page.locator('#lpNavToggle').getAttribute('aria-expanded'), 'false');
      await page.evaluate(() => scrollTo(0, 0));
    }
    if ([390, 1440].includes(width)) {
      await page.screenshot({ path: path.join(out, `hero-${width}.png`) });
      await page.locator('#app-home').screenshot({ path: path.join(out, `cards-${width}.png`) });
      await page.locator('#agents').screenshot({ path: path.join(out, `carousel-${width}.png`) });
    }
    cases.push({ width, overflow: false, lowerPageUnchanged: true, reducedMotion: true });
    await page.close();
  }
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, javaScriptEnabled: false });
    track(page); await page.goto(base); await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    assert.equal(await page.locator('.lp-term-scene:visible').count(), 1);
    assert.equal(await page.locator('.lp-agent-list img').count(), 4);
    assert.equal(await page.locator('.fc-card').count(), 3);
    assert.match(await page.locator('.fc-copy').nth(1).textContent(), /On Pro\./);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  track(page); await page.goto(base); await page.evaluate(() => document.fonts.ready);
  await page.locator('#agents').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.lp-agent-track').getAnimations()[0]?.playState === 'running');
  const carousel = () => page.evaluate(() => {
    const a = document.querySelector('.lp-agent-track').getAnimations()[0];
    return { time: a.currentTime, state: a.playState };
  });
  const initial = await carousel(); await page.waitForTimeout(180);
  assert.ok((await carousel()).time > initial.time);
  assert.ok(await page.locator('[data-agent-copy][aria-hidden="true"][inert]').count() > 0);
  const seam = await page.evaluate(() => {
    const track = document.querySelector('.lp-agent-track'), a = track.getAnimations()[0];
    a.pause(); a.currentTime = a.effect.getTiming().duration - 1;
    const v = document.querySelector('.lp-agent-carousel').getBoundingClientRect();
    const groups = [...track.children].map(e => e.getBoundingClientRect());
    const covered = groups[0].left <= v.left && groups.at(-1).right >= v.right;
    a.play(); return covered;
  });
  assert.ok(seam, 'Carousel covers both viewport edges at the loop seam');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const paused = await carousel(); await page.waitForTimeout(180);
  assert.equal((await carousel()).time, paused.time);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.locator('#app-home .fc-grid').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.fc-visual').dataset.motionState === 'playing');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const cardTimes = () => page.locator('.fc-visual').evaluateAll(es => es.map(e => e.dataset.motionTime));
  const stoppedCards = await cardTimes(); await page.waitForTimeout(180);
  assert.deepEqual(await cardTimes(), stoppedCards);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot(); // Flush the browser rendering update after media emulation.
  await page.waitForFunction(() => [...document.querySelectorAll('.fc-visual')].every(e => e.dataset.motionState === 'complete'));
  assert.equal(await page.locator('[data-agent-copy]').count(), 0);
  await page.close();

  const phone = await browser.newPage({ viewport: { width: 390, height: 900 } });
  track(phone); await phone.goto(base);
  await phone.locator('.fc-visual').nth(1).scrollIntoViewIfNeeded();
  await phone.waitForFunction(() => document.querySelectorAll('.fc-visual')[1].dataset.motionState === 'playing');
  const before = await phone.locator('.fc-visual').evaluateAll(es => es.map(e => +e.dataset.motionTime));
  await phone.waitForTimeout(250);
  const after = await phone.locator('.fc-visual').evaluateAll(es => es.map(e => +e.dataset.motionTime));
  assert.equal(after[0], before[0]); assert.ok(after[1] > before[1]); assert.equal(after[2], before[2]);
  await phone.close();

  const links = [...source.matchAll(/(?:href|src)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|mailto:|data:)/.test(u));
  const requests = await request.newContext();
  for (const url of new Set(links)) {
    const response = (await requests.get(base + '/' + url.replace(/^\//, ''))).status();
    assert.ok(response < 400, `${url}: ${response}`);
  }
  await requests.dispose();
  await browser.close(); assert.deepEqual(errors, []); assert.deepEqual(badResponses, []);
  fs.writeFileSync(path.join(out, 'measured-layouts.json'), JSON.stringify(layouts, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'validation.json'), JSON.stringify({ passed: true, cases, noJavaScript: true, carouselSeam: true, syntheticHiddenPause: true, mobileCardVisibility: true, errors, badResponses }, null, 2));
  console.log(`Passed ${cases.length} responsive cases, production parity, navigation, fallbacks, carousel, card lifecycle, and local links.`);
})().catch(e => { console.error(e); process.exit(1); });
