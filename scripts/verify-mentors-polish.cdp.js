/**
 * "Meet the Mentors" polish verification — CDP approach shared with
 * verify-home-section-order-spy.cdp.js. Covers the 2026-10-11 polish pass:
 *  - Header: eyebrow pill + gradient "Mentors" present.
 *  - Desktop: segmented bars tablist (dots hidden), aria-pressed + roving
 *    tabIndex, Arrow/Home/End keyboard nav with focus follow, Alt+Arrow
 *    ignored, hover peek (flex-grow 1.35, pointer devices only — hover:none
 *    kills it), nav buttons pulse-free, one-shot mentor-settle on the active
 *    image only, entrance stagger gated by data-inview and settling back to
 *    cascade opacity, no horizontal overflow.
 *  - Mobile: single visible card, active card aspect ratio 4:5 (art never
 *    cropped), real touch swipes (Input.dispatchTouchEvent) advance exactly
 *    one mentor and swallow the synthetic click, vertical drags do nothing,
 *    dots tablist present with aria-selected tracking.
 *  - Reduced motion: animations off, transitions ~1ms, cards visible
 *    immediately, keyboard nav still functional.
 *  - Zero console errors; mentor image payload reported (WebP).
 * Screenshots saved to %TEMP%. Usage: CDP_PORT=9224 node scripts/verify-mentors-polish.cdp.js
 */
const fs = require('fs');

const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`;
const URL = process.env.VERIFY_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tab = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.text);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    const file = `${process.env.TEMP.replace(/\\/g, '/')}/mentors-polish-${name}.png`;
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    console.log(`  screenshot: ${file}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // The home page easily exceeds the default 250-entry resource timing buffer
  // in dev (every module + image is a request), which silently drops the
  // late-loading lazy mentor images — raise it for every navigation.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'performance.setResourceTimingBufferSize(2000);',
  });

  const results = [];
  const check = (label, ok, detail) => {
    results.push({ label, ok });
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` → ${JSON.stringify(detail)}`}`);
  };
  const goHome = async () => {
    await send('Page.navigate', { url: URL });
    await sleep(4500);
    await evaluate(`document.documentElement.style.scrollBehavior = 'auto'`);
  };
  const scrollToSection = async (id) => {
    await evaluate(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      const navH = document.querySelector('nav').offsetHeight;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - navH - 12);
    })()`);
    await sleep(450);
  };

  const ACTIVE_STATE = `(() => {
    const cards = [...document.querySelectorAll('.mentor-carousel__card')];
    return {
      activeIndex: cards.findIndex((c) => c.dataset.active === 'true'),
      pressed: cards.map((c) => c.getAttribute('aria-pressed')),
      tabIndexes: cards.map((c) => c.tabIndex),
      focusedCard: document.activeElement?.classList?.contains('mentor-carousel__card') || null,
      focusedActive: document.activeElement?.dataset?.active ?? null,
      announcer: document.querySelector('p[aria-live="polite"]')?.textContent ?? null,
    };
  })()`;

  // ── Desktop 1920x1080 ───────────────────────────────────────────────────
  console.log('\n== desktop 1920x1080: header, a11y, keyboard, bars, hover, motion ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await goHome();

  let state = await evaluate(`(() => ({
    ids: [...document.querySelectorAll('main > section')].map((s) => s.id),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    eyebrow: [...document.querySelectorAll('#mentors span')].some((s) => s.textContent.trim() === 'Our Mentors'),
    gradientWord: (() => {
      const span = [...document.querySelectorAll('#mentors h2 span')][0];
      return span ? getComputedStyle(span).webkitTextFillColor === 'rgba(0, 0, 0, 0)' || getComputedStyle(span).color === 'rgba(0, 0, 0, 0)' : false;
    })(),
  }))()`);
  const expectedOrder = ['features', 'mentors', 'about'];
  check('desktop: section order (features above mentors above about)',
    JSON.stringify(state.ids.filter((id) => expectedOrder.includes(id))) === JSON.stringify(expectedOrder), state.ids);
  check('desktop: no horizontal overflow', state.scrollWidth <= state.clientWidth + 1,
    { scrollWidth: state.scrollWidth, clientWidth: state.clientWidth });
  check('desktop: eyebrow pill "Our Mentors" present', state.eyebrow);
  check('desktop: gradient word in heading', state.gradientWord);

  // Entrance: scroll to the section, animation must fire and settle to cascade.
  await scrollToSection('mentors');
  await sleep(250);
  let entrance = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.mentor-carousel__card')];
    return {
      inview: document.querySelector('.mentor-carousel__track')?.dataset.inview ?? null,
      animName: cards[0] ? getComputedStyle(cards[0]).animationName : null,
      earlyOpacity: cards[0] ? getComputedStyle(cards[0]).opacity : null,
    };
  })()`);
  check('desktop: entrance gated by data-inview', entrance.inview === 'true', entrance);
  check('desktop: entrance animation applied (mentorCardIn)', entrance.animName === 'mentorCardIn', entrance);
  await sleep(1600);
  entrance = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.mentor-carousel__card')];
    return { op0: getComputedStyle(cards[0]).opacity, op1: getComputedStyle(cards[1]).opacity, op6: getComputedStyle(cards[6]).opacity };
  })()`);
  check('desktop: cards settle to cascade opacity (active 1 / inactive 0.4)',
    entrance.op0 === '1' && entrance.op1 === '0.4' && entrance.op6 === '0.4', entrance);

  state = await evaluate(ACTIVE_STATE);
  check('desktop: aria-pressed true only on active card',
    state.pressed.filter((p) => p === 'true').length === 1 && state.pressed[state.activeIndex] === 'true', state);
  check('desktop: roving tabIndex (active -1, others 0)',
    state.tabIndexes[state.activeIndex] === -1 && state.tabIndexes.filter((t) => t === 0).length === 6, state);

  // Keyboard: ArrowRight advances + focus follows; Home/End jump; Alt+Arrow ignored.
  await evaluate(`document.querySelector('.mentor-carousel[role="region"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))`);
  await sleep(700);
  state = await evaluate(ACTIVE_STATE);
  check('desktop: ArrowRight advances selection', state.activeIndex === 1, state);
  check('desktop: focus follows selection', state.focusedCard === true && state.focusedActive === 'true', state);
  check('desktop: announcer text updates', /of 7\.$/.test(state.announcer || '') && state.announcer.includes('2 of 7'), state.announcer);

  await evaluate(`document.querySelector('.mentor-carousel[role="region"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))`);
  await sleep(700);
  state = await evaluate(ACTIVE_STATE);
  check('desktop: End jumps to last mentor', state.activeIndex === 6, state);

  await evaluate(`document.querySelector('.mentor-carousel[role="region"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))`);
  await sleep(700);
  state = await evaluate(ACTIVE_STATE);
  check('desktop: Home jumps to first mentor', state.activeIndex === 0, state);

  await evaluate(`document.querySelector('.mentor-carousel[role="region"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }))`);
  await sleep(400);
  state = await evaluate(ACTIVE_STATE);
  check('desktop: Alt+ArrowLeft ignored (browser Back stays with the browser)', state.activeIndex === 0, state);

  // Bars vs dots per breakpoint.
  const nav41 = await evaluate(`(() => {
    const bars = [...document.querySelectorAll('.mentor-carousel__bar')];
    const dots = [...document.querySelectorAll('#mentors [role="tab"]')].filter((t) => !t.className.includes('mentor-carousel__bar'));
    return {
      barsVisible: bars.length === 7 && bars[0].offsetParent !== null,
      dotsHidden: dots.length === 7 && dots[0].offsetParent === null,
      selected: bars.findIndex((b) => b.getAttribute('aria-selected') === 'true'),
      activeBarWidth: bars[0].offsetWidth,
    };
  })()`);
  check('desktop: 7 segmented bars visible', nav41.barsVisible, nav41);
  check('desktop: dots hidden on desktop', nav41.dotsHidden, nav41);
  check('desktop: bar aria-selected tracks active mentor', nav41.selected === 0, nav41);

  await evaluate(`(() => { const bars = document.querySelectorAll('.mentor-carousel__bar'); bars[4].click(); })()`);
  await sleep(700);
  const barState = await evaluate(ACTIVE_STATE);
  check('desktop: bar click selects mentor', barState.activeIndex === 4, barState);

  // Hover peek on an inactive card (real Input-domain hover).
  const hoverPt = await evaluate(`(() => {
    const c = document.querySelectorAll('.mentor-carousel__card')[2];
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverPt.x, y: hoverPt.y, button: 'none' });
  await sleep(450);
  let peek = await evaluate(`(() => {
    const c = document.querySelectorAll('.mentor-carousel__card')[2];
    return { flexGrow: getComputedStyle(c).flexGrow, opacity: getComputedStyle(c).opacity };
  })()`);
  check('desktop: hover peek grows side card (flex-grow > 1.2)', Number(peek.flexGrow) > 1.2, peek);
  await shot('desktop-hover-peek');

  // hover:none media emulation is ignored by this headless Edge build (same
  // gotcha as verify-navbar-about-dropdown.cdp.js), so the touch-safety of
  // the peek is asserted statically: the hover rule must live inside a
  // CSSMediaRule requiring min-width 768px AND hover:hover.
  const gate = await evaluate(`(() => {
    const hit = [];
    // NB: with native CSS nesting every CSSStyleRule has a truthy (empty)
    // cssRules list — check selectorText first or no rule is ever seen.
    const walk = (rules, media) => {
      for (const r of rules) {
        if (r.selectorText && r.selectorText.includes('.mentor-carousel__card:hover')) {
          hit.push({ selector: r.selectorText, media: media || null });
        }
        if (r.cssRules && r.cssRules.length) {
          walk(r.cssRules, media || (r.media ? r.media.mediaText : null));
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules, null); } catch (e) { /* cross-origin sheet */ }
    }
    return hit;
  })()`);
  check('desktop: hover peek is media-gated (min-width 768px + hover:hover, no sticky hover on touch)',
    gate.length === 1 && /min-width:\s*768px/.test(gate[0].media) && /hover:\s*hover/.test(gate[0].media), gate);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0, button: 'none' });

  // Motion inventory: no pulse anywhere, settle only on the active image.
  const motion = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.mentor-carousel__card')];
    const idx = cards.findIndex((c) => c.dataset.active === 'true');
    return {
      navAnim: getComputedStyle(document.querySelector('.mentor-carousel__nav')).animationName,
      activeImgAnim: getComputedStyle(cards[idx].querySelector('img')).animationName,
      inactiveImgAnim: getComputedStyle(cards[(idx + 1) % 7].querySelector('img')).animationName,
      imgWidth: cards[idx].querySelector('img').getAttribute('width'),
      imgLoading: cards.map((c) => c.querySelector('img').getAttribute('loading')),
    };
  })()`);
  check('desktop: nav pulse removed (animation none)', motion.navAnim === 'none', motion);
  check('desktop: one-shot settle on active image only',
    motion.activeImgAnim === 'mentor-settle' && motion.inactiveImgAnim === 'none', motion);
  check('desktop: images carry intrinsic width/height', motion.imgWidth === '1080', motion);
  check('desktop: lazy loading on non-leading images',
    motion.imgLoading.slice(0, 2).every((l) => l === 'eager') && motion.imgLoading.slice(2).every((l) => l === 'lazy'), motion);

  await shot('desktop-section');

  // ── Desktop 1366x768: quick layout pass ─────────────────────────────────
  console.log('\n== desktop 1366x768: layout sanity ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await goHome();
  await scrollToSection('mentors');
  await sleep(900);
  const layout = await evaluate(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    trackH: document.querySelector('.mentor-carousel__track').offsetHeight,
    barsVisible: document.querySelector('.mentor-carousel__bar').offsetParent !== null,
    activeVisible: [...document.querySelectorAll('.mentor-carousel__card')].every((c) => c.offsetHeight > 100),
  }))()`);
  check('1366x768: no horizontal overflow', layout.scrollWidth <= layout.clientWidth + 1, layout);
  check('1366x768: bars visible', layout.barsVisible, layout);
  await shot('desktop-1366');

  // ── Mobile 390x844: collapse, aspect, swipe ──────────────────────────────
  console.log('\n== mobile 390x844: single card, 4:5 fit, swipe ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }] });
  await goHome();
  await scrollToSection('mentors');
  await sleep(1200);

  const mobileLayout = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.mentor-carousel__card')];
    const active = cards.find((c) => c.dataset.active === 'true');
    const visible = cards.filter((c) => c.getBoundingClientRect().width > 1);
    const bars = document.querySelector('.mentor-carousel__bar');
    const dots = [...document.querySelectorAll('#mentors [role="tab"]')].filter((t) => !t.className.includes('mentor-carousel__bar'));
    return {
      visibleCount: visible.length,
      ratio: +(active.offsetWidth / active.offsetHeight).toFixed(3),
      barsHidden: bars.offsetParent === null,
      dotsVisible: dots.length === 7 && dots[0].offsetParent !== null,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  })()`);
  check('mobile: exactly one visible card', mobileLayout.visibleCount === 1, mobileLayout);
  check('mobile: active card ratio is 4:5 (0.8 ±0.02)', Math.abs(mobileLayout.ratio - 0.8) <= 0.02, mobileLayout);
  check('mobile: bars hidden, dots visible', mobileLayout.barsHidden && mobileLayout.dotsVisible, mobileLayout);
  check('mobile: no horizontal overflow', mobileLayout.scrollWidth <= mobileLayout.clientWidth + 1, mobileLayout);
  await shot('mobile-active');

  // Real touch swipe (leftwards → next). Must advance exactly one mentor.
  const before = (await evaluate(ACTIVE_STATE)).activeIndex;
  const pt = await evaluate(`(() => {
    const active = [...document.querySelectorAll('.mentor-carousel__card')].find((c) => c.dataset.active === 'true');
    const r = active.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x - 30, y: pt.y + 2, id: 1 }] });
  await sleep(60);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x - 62, y: pt.y + 4, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(900);
  let afterSwipe = (await evaluate(ACTIVE_STATE)).activeIndex;
  await sleep(600);
  const settledSwipe = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('mobile: left swipe advances exactly one mentor', ((before + 1) % 7) === afterSwipe && afterSwipe === settledSwipe,
    { before, afterSwipe, settledSwipe });
  await shot('mobile-after-swipe');

  // Vertical-dominant drag: no carousel change.
  await scrollToSection('mentors');
  const beforeV = (await evaluate(ACTIVE_STATE)).activeIndex;
  const ptV = await evaluate(`(() => {
    const active = [...document.querySelectorAll('.mentor-carousel__card')].find((c) => c.dataset.active === 'true');
    const r = active.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 40) };
  })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ptV.x, y: ptV.y, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ptV.x + 6, y: ptV.y + 40, id: 1 }] });
  await sleep(60);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ptV.x + 8, y: ptV.y + 80, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(800);
  const afterV = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('mobile: vertical drag does not change mentor', beforeV === afterV, { beforeV, afterV });

  // Dots still work on mobile.
  await evaluate(`(() => { const dots = [...document.querySelectorAll('#mentors [role="tab"]')].filter((t) => !t.className.includes('mentor-carousel__bar')); dots[3].click(); })()`);
  await sleep(700);
  check('mobile: dot click selects mentor', (await evaluate(ACTIVE_STATE)).activeIndex === 3);

  // ── Mobile 360x800: aspect holds at narrower width ──────────────────────
  console.log('\n== mobile 360x800: aspect sanity ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
  await goHome();
  await scrollToSection('mentors');
  await sleep(1000);
  const narrow = await evaluate(`(() => {
    const active = [...document.querySelectorAll('.mentor-carousel__card')].find((c) => c.dataset.active === 'true');
    return { ratio: +(active.offsetWidth / active.offsetHeight).toFixed(3), scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
  })()`);
  check('360x800: active card ratio is 4:5', Math.abs(narrow.ratio - 0.8) <= 0.02, narrow);
  check('360x800: no horizontal overflow', narrow.scrollWidth <= narrow.clientWidth + 1, narrow);

  // ── Reduced motion ──────────────────────────────────────────────────────
  console.log('\n== reduced motion (desktop 1920x1080) ==');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await goHome();
  await scrollToSection('mentors');
  await sleep(800);
  const rm = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.mentor-carousel__card')];
    const idx = cards.findIndex((c) => c.dataset.active === 'true');
    const cs = (el) => getComputedStyle(el);
    return {
      cardAnim: cs(cards[0]).animationName,
      cardDuration: cs(cards[0]).transitionDuration,
      imgAnim: cs(cards[idx].querySelector('img')).animationName,
      navAnim: cs(document.querySelector('.mentor-carousel__nav')).animationName,
      barDuration: cs(document.querySelector('.mentor-carousel__bar')).transitionDuration,
      opActive: cs(cards[idx]).opacity,
      opInactive: cs(cards[(idx + 1) % 7]).opacity,
    };
  })()`);
  check('reduced: card entrance animation off', rm.cardAnim === 'none', rm);
  check('reduced: image settle animation off', rm.imgAnim === 'none', rm);
  check('reduced: nav animation off', rm.navAnim === 'none', rm);
  check('reduced: transitions collapsed (≤ 0.011s)',
    parseFloat(rm.cardDuration) <= 0.011 && parseFloat(rm.barDuration) <= 0.011, rm);
  check('reduced: cards fully visible immediately (no stagger hold)',
    rm.opActive === '1' && rm.opInactive === '0.4', rm);
  await evaluate(`document.querySelector('.mentor-carousel[role="region"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))`);
  await sleep(300);
  check('reduced: keyboard nav still works', (await evaluate(ACTIVE_STATE)).activeIndex === 1);
  await shot('reduced-desktop');

  await send('Emulation.setEmulatedMedia', { features: [] });

  // ── Payload + console ───────────────────────────────────────────────────
  const payload = await evaluate(`(() => {
    const rows = performance.getEntriesByType('resource')
      .filter((r) => /assets\\/[1-7]\\.[a-z]+/.test(r.name))
      .map((r) => ({ name: r.name.split('/').pop().split('?')[0] }));
    return { names: [...new Set(rows.map((r) => r.name))].sort() };
  })()`);
  const webpAll = [1, 2, 3, 4, 5, 6, 7].every((n) => payload.names.includes(`${n}.webp`));
  const noPng = !payload.names.some((name) => /^[1-7]\.png$/.test(name));
  console.log(`  mentor image assets (dev serves each as module + asset): ${payload.names.join(', ')}`);
  check('payload: all 7 mentor images served as WebP, no PNG', webpAll && noPng, payload.names);

  console.log(`\nconsole errors: ${consoleErrors.length === 0 ? 'none' : ''}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 300)));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.label).join(' | ')); process.exitCode = 1; }
  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
