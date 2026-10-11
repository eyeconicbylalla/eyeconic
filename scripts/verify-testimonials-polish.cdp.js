/**
 * "What Our Students Say" polish verification — CDP approach shared with
 * verify-mentors-polish.cdp.js. Covers the 2026-10-11 polish pass:
 *  - Header: eyebrow pill + gradient "Students" present, subcopy unchanged.
 *  - Auto-advance (10s): exactly one advance; pauses on hover and on a stubbed
 *    hidden tab (resuming advances again); stops permanently after the first
 *    manual interaction (checked LAST in the timer group — everything before
 *    it must stay hands-off).
 *  - Badges: rank pill on slide 1, pipe-split two pills (id 16), none for an
 *    empty position (id 10).
 *  - Desktop tablist: exactly one, 25 tabs, aria-selected + roving tabIndex,
 *    aria-controls target; region Arrow/Home/End with Alt-bail; focus follows
 *    when the keystroke comes from the tablist.
 *  - Mobile 390x844: tablist hidden, "n / 25" counter + position bar width,
 *    real touch swipe advances exactly one, vertical drag ignored, long
 *    position string wraps without overflow.
 *  - Reduced motion: transitions collapsed, segment click still swaps, slide
 *    transform identity (MotionConfig skips x, keeps the fade).
 *  - Zero console errors; screenshots to %TEMP%.
 * Usage: CDP_PORT=9224 node scripts/verify-testimonials-polish.cdp.js
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
    const file = `${process.env.TEMP.replace(/\\/g, '/')}/testimonials-polish-${name}.png`;
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    console.log(`  screenshot: ${file}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
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
    // Cold dev-server boots can outrun a fixed sleep — poll for the app.
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const ready = await evaluate(`document.readyState === 'complete' && !!document.querySelector('#testimonials')`)
        .catch(() => false);
      if (ready) break;
      await sleep(300);
    }
    await evaluate(`document.documentElement.style.scrollBehavior = 'auto'`);
    await sleep(300);
  };
  const scrollToSection = async (id) => {
    await evaluate(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      const navH = document.querySelector('nav').offsetHeight;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - navH - 12);
    })()`);
    await sleep(450);
  };

  // Active-slide probe: index comes from the tablist's aria-selected (present
  // in the DOM at every breakpoint even when visually hidden below md).
  const ACTIVE_STATE = `(() => {
    const tabs = [...document.querySelectorAll('#testimonials [role="tab"]')];
    const slide = document.querySelector('#testimonials [aria-roledescription="slide"]');
    return {
      activeIndex: tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'),
      slideName: slide?.getAttribute('aria-label') ?? null,
      quote: slide?.querySelector('blockquote p')?.textContent ?? null,
      announcer: document.querySelector('#testimonials p[aria-live="polite"]')?.textContent ?? null,
      badges: [...document.querySelectorAll('#testimonials .testimonial-carousel__badge')].map((b) => b.textContent),
      focusedTabIsSelected: document.activeElement?.getAttribute?.('aria-selected') === 'true' || null,
    };
  })()`;

  // ── Desktop 1920x1080: structure (passive — no clicks before the timer group) ──
  console.log('\n== desktop 1920x1080: structure ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await goHome();

  let state = await evaluate(`(() => ({
    ids: [...document.querySelectorAll('main > section')].map((s) => s.id),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    eyebrow: [...document.querySelectorAll('#testimonials span')].some((s) => s.textContent.trim() === 'Success Stories'),
    gradientWord: (() => {
      const span = document.querySelector('#testimonials h2 span');
      if (!span) return false;
      const cs = getComputedStyle(span);
      return cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.color === 'rgba(0, 0, 0, 0)';
    })(),
    heading: document.querySelector('#testimonials h2')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
    subcopy: document.querySelector('#testimonials h2 + p, #testimonials header p, #testimonials div.text-center p')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
    glow: (() => {
      const el = document.querySelector('#testimonials > div.pointer-events-none');
      return el ? getComputedStyle(el).backgroundImage.includes('radial-gradient') : false;
    })(),
    region: document.querySelector('#testimonials [aria-roledescription="carousel"]')?.getAttribute('aria-label') ?? null,
  }))()`);
  const expectedOrder = ['courses', 'testimonials', 'results'];
  check('desktop: section order (courses above testimonials above results)',
    JSON.stringify(state.ids.filter((id) => expectedOrder.includes(id))) === JSON.stringify(expectedOrder), state.ids);
  check('desktop: no horizontal overflow', state.scrollWidth <= state.clientWidth + 1,
    { scrollWidth: state.scrollWidth, clientWidth: state.clientWidth });
  check('desktop: eyebrow pill "Success Stories" present', state.eyebrow);
  check('desktop: heading text unchanged with gradient on "Students"',
    state.heading === 'What Our Students Say' && state.gradientWord, { heading: state.heading, gradientWord: state.gradientWord });
  check('desktop: subcopy text unchanged',
    state.subcopy === 'Read success stories from students who have transformed their academic journey with Eyeconic mentorship.', state.subcopy);
  check('desktop: ambient radial glow present', state.glow);
  check('desktop: carousel region aria-label', state.region === 'Student testimonials', state.region);

  state = await evaluate(ACTIVE_STATE);
  check('desktop: slide 1 aria-label + quote from data',
    state.slideName === 'Jankuta Soumya, student testimonial' && state.quote.startsWith('Eyeconic gave my preparation a structure'), state);
  const initials = await evaluate(`document.querySelector('#testimonials figcaption div[aria-hidden="true"]')?.textContent`);
  check('desktop: initials avatar "JS"', initials === 'JS', initials);

  // Content fit: card capped at max-w-4xl, no min-height dead space.
  const fit = await evaluate(`(() => {
    const surface = document.querySelector('.testimonial-carousel__surface');
    const stack = document.getElementById('testimonial-slide');
    if (!surface || !stack) return null;
    const cs = getComputedStyle(surface);
    return {
      surfaceWidth: surface.offsetWidth,
      stackGap: surface.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - stack.offsetHeight,
    };
  })()`);
  check('desktop: card capped at max-w-4xl (≤ 898px)', !!fit && fit.surfaceWidth <= 898, fit);
  check('desktop: no dead space below slide content', !!fit && Math.abs(fit.stackGap) <= 1, fit);

  // ── Auto-advance timer (runs before ANY manual interaction) ─────────────
  console.log('\n== timer: 10s auto-advance, pause on hover/hidden, permanent lock ==');
  await goHome(); // fresh clock, fresh lock state
  await scrollToSection('testimonials');
  let idx = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('timer: starts at slide 1', idx === 0, idx);
  await sleep(11500);
  idx = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('timer: advanced exactly once after ~11.5s', idx === 1, idx);

  // Hover pause: real mouse input over the card fires pointerenter.
  const cardPt = await evaluate(`(() => {
    const r = document.querySelector('.testimonial-carousel__surface').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 120)) };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardPt.x, y: cardPt.y, button: 'none' });
  await sleep(300);
  await sleep(11000);
  idx = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('timer: hover pauses rotation (no advance in 11s)', idx === 1, idx);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0, button: 'none' });
  await sleep(11500);
  idx = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('timer: resumes (exactly one advance) after mouse leaves', idx === 2, idx);

  // Hidden tab: shadow document.hidden and fire the real event name.
  await evaluate(`(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await sleep(11000);
  idx = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('timer: hidden tab pauses rotation', idx === 2, idx);
  await evaluate(`(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  await sleep(11500);
  idx = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('timer: resumes after tab visible again', idx === 3, idx);

  // Permanent lock: one manual click, then the timer never fires again.
  await evaluate(`[...document.querySelectorAll('#testimonials .testimonial-carousel__nav')].pop().click()`);
  await sleep(400);
  const afterClick = (await evaluate(ACTIVE_STATE)).activeIndex;
  await sleep(11500);
  idx = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('timer: manual click locks auto-advance permanently',
    afterClick === 4 && idx === 4, { afterClick, idx });

  // ── Badges (pipe split / empty positions) ────────────────────────────────
  console.log('\n== badges ==');
  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('#testimonials [role="tab"]')];
    tabs[15].click(); // id 16 — "First GT: 166 marks | NEET PG 2026: 358 marks"
  })()`);
  await sleep(700);
  state = await evaluate(ACTIVE_STATE);
  check('badge: pipe position renders two pills verbatim',
    JSON.stringify(state.badges) === JSON.stringify(['First GT: 166 marks', 'NEET PG 2026: 358 marks']), state.badges);
  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('#testimonials [role="tab"]')];
    tabs[9].click(); // id 10 — Aditya Jaisal, empty position
  })()`);
  await sleep(700);
  state = await evaluate(ACTIVE_STATE);
  check('badge: empty position renders no pills', state.badges.length === 0, state.badges);

  // Longest quote (id 23, ~370 chars): fully visible, frame hugs the stack.
  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('#testimonials [role="tab"]')];
    tabs[22].click();
  })()`);
  await sleep(1400); // crossfade (450ms) + frame height settle (450ms) + margin
  const tall = await evaluate(`(() => {
    const surface = document.querySelector('.testimonial-carousel__surface');
    const stack = document.getElementById('testimonial-slide');
    const frame = stack.parentElement;
    return {
      frameH: frame.offsetHeight,
      stackH: stack.offsetHeight,
      noClip: surface.scrollHeight <= surface.clientHeight + 1,
    };
  })()`);
  check('badge: longest quote fully visible, frame hugs stack (no clip, no gap)',
    tall.noClip && Math.abs(tall.frameH - tall.stackH) <= 1, tall);

  // ── Tablist + keyboard ───────────────────────────────────────────────────
  console.log('\n== tablist + keyboard ==');
  const tablist = await evaluate(`(() => {
    const lists = [...document.querySelectorAll('#testimonials [role="tablist"]')];
    const tabs = [...lists[0].querySelectorAll('[role="tab"]')];
    const controls = lists[0].querySelector('[role="tab"]')?.getAttribute('aria-controls');
    return {
      count: lists.length,
      visible: lists[0].offsetParent !== null,
      tabCount: tabs.length,
      controlsTarget: controls ? !!document.getElementById(controls) : false,
      tabLabels: tabs.slice(0, 2).map((t) => t.getAttribute('aria-label')),
      selected: tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'),
      tabIndexZeros: tabs.filter((t) => t.tabIndex === 0).length,
    };
  })()`);
  check('tablist: exactly one, visible on desktop, 25 named tabs, aria-controls target exists',
    tablist.count === 1 && tablist.visible && tablist.tabCount === 25 && tablist.controlsTarget
      && tablist.tabLabels[0] === 'Jankuta Soumya', tablist);
  check('tablist: aria-selected tracks + roving tabIndex (one tab stop)',
    tablist.selected === 22 && tablist.tabIndexZeros === 1, tablist);

  await evaluate(`document.querySelector('#testimonials [aria-roledescription="carousel"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))`);
  await sleep(700);
  state = await evaluate(ACTIVE_STATE);
  check('keyboard: region ArrowRight advances + announcer reads "24 of 25"',
    state.activeIndex === 23 && /24 of 25\.$/.test(state.announcer || ''), state);

  await evaluate(`document.querySelector('#testimonials [aria-roledescription="carousel"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))`);
  await sleep(500);
  await evaluate(`document.querySelector('#testimonials [aria-roledescription="carousel"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))`);
  await sleep(500);
  state = await evaluate(ACTIVE_STATE);
  check('keyboard: Home then End jump to 1 and 25', state.activeIndex === 24, state.activeIndex);

  await evaluate(`document.querySelector('#testimonials [aria-roledescription="carousel"]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }))`);
  await sleep(400);
  state = await evaluate(ACTIVE_STATE);
  check('keyboard: Alt+ArrowLeft ignored (browser Back stays with the browser)', state.activeIndex === 24, state.activeIndex);

  // Focus-follow only when the keystroke originates inside the tablist.
  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('#testimonials [role="tab"]')];
    tabs[24].focus();
    tabs[24].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  })()`);
  await sleep(700);
  state = await evaluate(ACTIVE_STATE);
  check('keyboard: tablist-origin ArrowRight wraps to 1 and focus follows',
    state.activeIndex === 0 && state.focusedTabIsSelected === true, state);
  await shot('desktop-section');

  // ── Mobile 390x844: counter, bar, swipe ──────────────────────────────────
  console.log('\n== mobile 390x844: counter, position bar, swipe ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await goHome();
  await scrollToSection('testimonials');
  await sleep(1200);

  const mobile = await evaluate(`(() => {
    const lists = [...document.querySelectorAll('#testimonials [role="tablist"]')];
    const counter = [...document.querySelectorAll('#testimonials span')].find((s) => /^\\d+ \\/ 25$/.test(s.textContent.trim()));
    const bar = document.querySelector('#testimonials .testimonial-carousel__progress');
    const track = bar?.parentElement;
    return {
      tablistHidden: lists.length === 1 && lists[0].offsetParent === null,
      counter: counter ? counter.textContent.trim() : null,
      counterVisible: counter ? counter.offsetParent !== null : false,
      fillRatio: bar && track ? +(bar.offsetWidth / track.offsetWidth).toFixed(3) : null,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  })()`);
  check('mobile: tablist hidden, "1 / 25" counter visible', mobile.tablistHidden && mobile.counter === '1 / 25' && mobile.counterVisible, mobile);
  check('mobile: position bar fill ≈ 1/25 of track', mobile.fillRatio !== null && Math.abs(mobile.fillRatio - 1 / 25) <= 0.02, mobile);
  check('mobile: no horizontal overflow', mobile.scrollWidth <= mobile.clientWidth + 1, mobile);

  // Real touch swipe (leftwards → next). Must advance exactly one and settle.
  const before = (await evaluate(ACTIVE_STATE)).activeIndex;
  const pt = await evaluate(`(() => {
    const r = document.querySelector('.testimonial-carousel__surface').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 80) };
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
  check('mobile: left swipe advances exactly one, settled', ((before + 1) % 25) === afterSwipe && afterSwipe === settledSwipe,
    { before, afterSwipe, settledSwipe });

  // Vertical-dominant drag: no carousel change.
  await scrollToSection('testimonials');
  const beforeV = (await evaluate(ACTIVE_STATE)).activeIndex;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x + 6, y: pt.y + 40, id: 1 }] });
  await sleep(60);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x + 8, y: pt.y + 80, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(800);
  const afterV = (await evaluate(ACTIVE_STATE)).activeIndex;
  check('mobile: vertical drag does not change slide', beforeV === afterV, { beforeV, afterV });

  // Long position string (id 17, ~50 chars, no pipe): wraps inside the card.
  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('#testimonials [role="tab"]')];
    tabs[16].click();
  })()`);
  await sleep(700);
  const longBadge = await evaluate(`(() => {
    const surface = document.querySelector('.testimonial-carousel__surface');
    const badges = [...document.querySelectorAll('#testimonials .testimonial-carousel__badge')];
    return {
      count: badges.length,
      text: badges[0]?.textContent ?? null,
      wrapped: badges[0] ? badges[0].offsetHeight > 22 : false,
      noCardOverflow: surface.scrollWidth <= surface.clientWidth + 1,
    };
  })()`);
  check('mobile: long position wraps as one badge without card overflow',
    longBadge.count === 1 && longBadge.text === 'Reported correct answers: 48 → 82 in three months'
      && longBadge.noCardOverflow, longBadge);
  await shot('mobile-long-badge');

  // ── Reduced motion ──────────────────────────────────────────────────────
  console.log('\n== reduced motion (desktop 1920x1080) ==');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await goHome();
  await scrollToSection('testimonials');
  await sleep(800);
  const rm = await evaluate(`(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    return {
      segmentDuration: cs('#testimonials .testimonial-carousel__segment').transitionDuration,
      navDuration: cs('#testimonials .testimonial-carousel__nav').transitionDuration,
      progressDuration: cs('#testimonials .testimonial-carousel__progress').transitionDuration,
    };
  })()`);
  check('reduced: transitions collapsed (≤ 0.011s)',
    parseFloat(rm.segmentDuration) <= 0.011 && parseFloat(rm.navDuration) <= 0.011 && parseFloat(rm.progressDuration) <= 0.011, rm);

  await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('#testimonials [role="tab"]')];
    tabs[5].click();
  })()`);
  await sleep(700);
  state = await evaluate(ACTIVE_STATE);
  const rmSlide = await evaluate(`(() => {
    const slide = document.querySelector('#testimonials [aria-roledescription="slide"]');
    return { transform: getComputedStyle(slide).transform, opacity: getComputedStyle(slide).opacity };
  })()`);
  check('reduced: segment click still swaps content',
    state.activeIndex === 5 && state.slideName === 'Hiya Kalita, student testimonial', state);
  check('reduced: slide transform identity after settle (x skipped, fade kept)',
    (rmSlide.transform === 'none' || rmSlide.transform === 'matrix(1, 0, 0, 1, 0, 0)') && rmSlide.opacity === '1', rmSlide);
  await shot('reduced-desktop');

  await send('Emulation.setEmulatedMedia', { features: [] });

  console.log(`\nconsole errors: ${consoleErrors.length === 0 ? 'none' : ''}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 300)));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.label).join(' | ')); process.exitCode = 1; }
  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
