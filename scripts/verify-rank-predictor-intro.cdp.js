/**
 * Rank Predictor entry-animation verification driver — headless Edge over CDP
 * (no test deps). Signs nothing itself: it needs the dev stack running and a
 * logged-in student session cookie, like the other verify-*.cdp.js drivers.
 *
 * Checks, in one consolidated browser session:
 *   A. desktop: click Rank Predictor -> overlay + muted inline clip (over a
 *      blurred ambient twin), plays, a second rapid click adds no second
 *      playback, navigation to /predictor happens only after `ended`,
 *      predictor page renders, back returns.
 *   B. replay: clicking again from the dashboard plays the animation again;
 *      leaving mid-transition cleans up and never navigates afterwards.
 *   C. prefers-reduced-motion: click navigates immediately, no overlay/video.
 *   D. viewport matrix: desktop/laptop/small/tablet/portrait/narrow/landscape
 *      — overlay covers the viewport, the clip never shrinks below contain,
 *      never crops past its measured safe margins (corner text stays on
 *      screen), letterbox is filled by the blurred twin, no scrollbar gutter.
 *
 * Usage: node scripts/verify-rank-predictor-intro.cdp.js <cookie-value>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const COOKIE = process.argv[2];
if (!COOKIE) {
  console.error('usage: node verify-rank-predictor-intro.cdp.js <ec_app_session value>');
  process.exit(2);
}
const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`;
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-intro-'));
const consoleErrors = [];
const pageErrors = [];
const failures = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tab = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails.text);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1380, height: 1000, deviceScaleFactor: 1, mobile: false,
  });

  await send('Network.setCookie', {
    name: 'ec_app_session', value: COOKIE, url: 'http://localhost:5173',
    path: '/', httpOnly: true, sameSite: 'Lax',
  });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate failed');
    return r.result.value;
  };
  const waitFor = async (expression, timeoutMs, label) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        if (await evaluate(`(${expression})()`)) return true;
      } catch { /* page navigating */ }
      await sleep(300);
    }
    throw new Error(`timeout waiting for ${label}`);
  };
  // Cold-profile vite dep-optimizer reloads can reset the DOM mid-flow: trust
  // a condition only after it holds across two consecutive polls.
  const waitForStable = async (expression, timeoutMs, label) => {
    const started = Date.now();
    let consecutive = 0;
    while (Date.now() - started < timeoutMs) {
      try {
        if (await evaluate(`(${expression})()`)) {
          consecutive += 1;
          if (consecutive >= 2) return true;
        } else {
          consecutive = 0;
        }
      } catch { consecutive = 0; }
      await sleep(600);
    }
    throw new Error(`timeout waiting (stable) for ${label}`);
  };
  const screenshot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('screenshot:', file);
  };
  const navigate = (url) => send('Page.navigate', { url });

  // Instrument the intro clip as soon as it exists, so `ended` timing is
  // observable even though the element unmounts on navigation.
  const instrumentVideo = async () => {
    await evaluate(`(() => {
      window.__introEnded = false;
      const hook = () => {
        const video = document.querySelector('video.rp-intro-clip');
        if (video && !video.__hooked) {
          video.__hooked = true;
          video.addEventListener('ended', () => { window.__introEnded = true; });
        }
      };
      hook();
      if (!window.__introHook) { window.__introHook = setInterval(hook, 100); }
    })()`);
  };

  const clickRankPredictor = () => evaluate(`(() => {
    const link = [...document.querySelectorAll("a[href='/predictor']")]
      .find((a) => a.textContent.includes('Rank Predictor'));
    if (!link) return false;
    link.click();
    return true;
  })()`);

  const videoState = () => evaluate(`(() => {
    const video = document.querySelector('video.rp-intro-clip');
    return {
      overlayVideoCount: document.querySelectorAll('.rp-intro video').length,
      overlayPresent: !!document.querySelector('div[role=status][aria-label="Opening the Rank Predictor"]'),
      muted: video ? video.muted : null,
      playsInline: video ? video.hasAttribute('playsinline') : null,
      controls: video ? video.controls : null,
      paused: video ? video.paused : null,
      readyState: video ? video.readyState : null,
      videoWidth: video ? video.videoWidth : null,
      videoHeight: video ? video.videoHeight : null,
      bodyScrollLocked: video ? document.body.style.overflow === 'hidden' : null,
    };
  })()`);

  // Presentation geometry of one playback — the browser-side contract of
  // RankPredictorIntro.css + introSafeFitSize: the overlay owns the whole
  // viewport, the clip never shrinks below contain, never crops past its
  // safe margins (so the clip's corner text stays on screen), keeps its
  // aspect, and any letterbox is filled by the blurred twin.
  const presentationState = () => evaluate(`(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const overlay = document.querySelector('.rp-intro');
    const clip = document.querySelector('video.rp-intro-clip');
    const backdrop = document.querySelector('video.rp-intro-backdrop');
    if (!overlay || !clip) return { missing: true };
    const o = overlay.getBoundingClientRect();
    const c = clip.getBoundingClientRect();
    const bs = backdrop ? getComputedStyle(backdrop) : null;
    const AR = 16 / 9;
    const containW = Math.min(vw, vh * AR);
    const hidden = !backdrop || bs.display === 'none';
    return {
      vw, vh,
      overlayCovers: Math.round(o.width) === vw && Math.round(o.height) === vh && o.left === 0 && o.top === 0,
      noScrollbarGutter: document.documentElement.clientWidth === vw,
      noHorizontalScroll: document.documentElement.scrollWidth <= vw,
      neverSmallerThanContain: c.width >= containW - 0.5 && c.height >= containW / AR - 0.5,
      aspectKept: Math.abs(c.width / c.height - AR) < 0.02,
      safeBoxVisible: c.left + 0.035 * c.width >= -1.5 && c.right - 0.035 * c.width <= vw + 1.5
        && c.top + 0.055 * c.height >= -1.5 && c.bottom - 0.065 * c.height <= vh + 1.5,
      backdrop: {
        present: !!backdrop,
        hidden,
        // offsetWidth/Height: the layout box — the twin is intentionally
        // scale(1.2)-transformed, so its bounding rect exceeds the viewport.
        coversWhenDisplayed: hidden || (Math.round(backdrop.offsetWidth) === vw && Math.round(backdrop.offsetHeight) === vh),
        blurredWhenDisplayed: hidden || (bs.filter || '').includes('blur'),
        objectFitCoverWhenDisplayed: hidden || bs.objectFit === 'cover',
      },
      overlayVideoCount: document.querySelectorAll('.rp-intro video').length,
    };
  })()`);

  const assertPresentation = (state, label, opts = {}) => {
    const problems = [];
    if (!state || state.missing) problems.push('overlay/clip missing');
    if (state && !state.missing) {
      if (!state.overlayCovers) problems.push(`overlay !covers (${state.vw}x${state.vh})`);
      if (!state.noScrollbarGutter) problems.push('scrollbar gutter beside overlay');
      if (!state.noHorizontalScroll) problems.push('horizontal scroll');
      if (!state.neverSmallerThanContain) problems.push('clip below contain size');
      if (!state.aspectKept) problems.push('clip aspect drift');
      if (!state.safeBoxVisible) problems.push('safe box (corner text) clipped');
      if (!state.backdrop.present) problems.push('ambient twin missing');
      if (state.backdrop.present && !state.backdrop.hidden) {
        if (!state.backdrop.coversWhenDisplayed) problems.push('twin does not fill letterbox');
        if (!state.backdrop.blurredWhenDisplayed) problems.push('twin not blurred');
        if (!state.backdrop.objectFitCoverWhenDisplayed) problems.push('twin not object-cover');
      }
      if (state.overlayVideoCount !== 2) problems.push(`expected 2 overlay videos, saw ${state.overlayVideoCount}`);
      if (opts.expectBackdropDisplayed !== undefined && state.backdrop.hidden === opts.expectBackdropDisplayed) {
        problems.push(`twin display state unexpected (hidden=${state.backdrop.hidden})`);
      }
    }
    if (problems.length) failures.push(`${label}: ${problems.join('; ')}`);
    return problems.length === 0;
  };

  // ---- A. desktop happy path -------------------------------------------------
  await navigate('http://localhost:5173/dashboard');
  await waitForStable("() => document.body.innerText.includes('Hi,') && !!document.querySelector(\"a[href='/predictor']\")", 30000, 'dashboard settled');
  await sleep(1000);
  await instrumentVideo();

  if (!(await clickRankPredictor())) throw new Error('Rank Predictor link not found');
  await waitFor("() => !!document.querySelector('video.rp-intro-clip')", 5000, 'intro overlay + clip');

  let state = await videoState();
  console.log('intro state on click:', JSON.stringify(state));
  if (state.overlayVideoCount !== 2 || !state.overlayPresent) failures.push('A: overlay videos missing on click');
  if (!state.muted || !state.playsInline) failures.push('A: clip not muted/playsInline');
  if (state.controls) failures.push('A: native controls visible');
  if (!state.bodyScrollLocked) failures.push('A: body scroll not locked during intro');

  await waitFor("() => { const v = document.querySelector('video.rp-intro-clip'); return v && !v.paused && v.readyState >= 3; }", 8000, 'playback started');
  state = await videoState();
  if (state.videoWidth !== 1920 || state.videoHeight !== 1080) failures.push(`A: unexpected clip dimensions ${state.videoWidth}x${state.videoHeight}`);
  const desktop = await presentationState();
  console.log('desktop presentation:', JSON.stringify(desktop));
  // 1380x1000 (1.38:1) is outside the twin's hide band -> ambient twin visible
  assertPresentation(desktop, 'A: desktop presentation', { expectBackdropDisplayed: true });
  await sleep(1500);
  await screenshot('01-intro-playing');

  // Rapid re-click during playback must not add a second playback or navigate early.
  await clickRankPredictor();
  await sleep(600);
  state = await videoState();
  if (state.overlayVideoCount !== 2) failures.push(`A2: duplicate playback after rapid re-click (${state.overlayVideoCount} videos)`);
  if (!windowLocationIsDashboard(await evaluate('location.pathname'))) failures.push('A2: navigated early after re-click');

  // Navigation must follow `ended`, not precede it (clip is ~6.9s).
  const navDeadline = Date.now() + 20000;
  while (Date.now() < navDeadline) {
    const pathname = await evaluate('location.pathname').catch(() => '/dashboard');
    if (pathname === '/predictor') break;
    await sleep(250);
  }
  const endedFired = await evaluate('!!window.__introEnded');
  const finalPath = await evaluate('location.pathname');
  if (finalPath !== '/predictor') failures.push('A3: never navigated to /predictor');
  if (!endedFired) failures.push('A3: navigation happened without the clip ending first');

  await waitForStable("() => document.body.innerText.includes('Rank & Branch Predictor')", 30000, 'predictor page settled');
  await sleep(800);
  const afterPredictor = await videoState();
  if (afterPredictor.overlayPresent || afterPredictor.overlayVideoCount > 0) failures.push('A4: intro overlay survived navigation');
  if ((await evaluate("document.body.style.overflow")) === 'hidden') failures.push('A4: body scroll lock not restored');
  await screenshot('02-predictor-after-intro');
  console.log('A: desktop happy path done, endedFired=', endedFired, 'path=', finalPath);

  // Back button returns to the dashboard intact.
  await evaluate('history.back()');
  await waitForStable("() => document.body.innerText.includes('Hi,') && !!document.querySelector(\"a[href='/predictor']\")", 30000, 'dashboard after back');
  console.log('A5: back button restored dashboard');

  // ---- B. replay + mid-transition cleanup ------------------------------------
  await instrumentVideo();
  if (!(await clickRankPredictor())) throw new Error('Rank Predictor link not found (replay)');
  await waitFor("() => !!document.querySelector('video.rp-intro-clip') && !document.querySelector('video.rp-intro-clip').paused", 8000, 'replay started');
  await screenshot('03-replay-playing');
  console.log('B: animation replays on every click');

  // Leaving mid-transition must clean up and never navigate afterwards.
  // (This back() crosses into the session's first entry, so the browser does
  // a full document reload — the evaluate can die with the old context even
  // though the navigation itself went through.)
  await evaluate('history.back()').catch(() => {});
  await sleep(1500);
  await waitFor("() => !document.querySelector('.rp-intro video')", 8000, 'overlay cleared after mid-transition leave');
  const midLeavePath = await evaluate('location.pathname').catch(() => '');
  if (midLeavePath === '/predictor') failures.push('B2: stray navigation after leaving mid-transition');
  if ((await evaluate("document.body.style.overflow").catch(() => '')) === 'hidden') failures.push('B2: body scroll lock not restored');
  console.log('B2: mid-transition leave cleaned up, path=', midLeavePath);

  // ---- C. reduced motion ------------------------------------------------------
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate('http://localhost:5173/dashboard');
  await waitForStable("() => document.body.innerText.includes('Hi,') && !!document.querySelector(\"a[href='/predictor']\")", 30000, 'dashboard (reduced motion)');
  if (!(await clickRankPredictor())) throw new Error('Rank Predictor link not found (reduced motion)');
  await waitFor("() => location.pathname === '/predictor'", 4000, 'immediate navigation under reduced motion');
  const reducedState = await videoState();
  if (reducedState.overlayPresent || reducedState.overlayVideoCount > 0) failures.push('C: overlay played despite prefers-reduced-motion');
  await screenshot('04-reduced-motion-direct');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  console.log('C: reduced motion navigates immediately, no overlay');

  // ---- D. viewport matrix -----------------------------------------------------
  // Representative sizes (not hard-coded styles — the presentation must
  // adapt fluidly). expectBackdrop: whether the blurred twin must be
  // displayed (viewports inside ~1.69–1.97:1 hide it — the clip fully covers).
  const matrix = [
    { name: 'desktop-1920x1080', w: 1920, h: 1080, mobile: false, expectBackdrop: false },
    { name: 'laptop-1366x768', w: 1366, h: 768, mobile: false, expectBackdrop: false },
    { name: 'small-1024x768', w: 1024, h: 768, mobile: false, expectBackdrop: true },
    { name: 'mobile-390x844', w: 390, h: 844, mobile: true, expectBackdrop: true },
    { name: 'narrow-360x800', w: 360, h: 800, mobile: true, expectBackdrop: true },
    { name: 'landscape-844x390', w: 844, h: 390, mobile: true, expectBackdrop: true },
  ];
  for (const m of matrix) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: m.w, height: m.h, deviceScaleFactor: m.mobile ? 2 : 1, mobile: m.mobile,
    });
    await navigate('http://localhost:5173/dashboard');
    await waitForStable("() => document.body.innerText.includes('Hi,') && !!document.querySelector(\"a[href='/predictor']\")", 30000, `dashboard (${m.name})`);
    await instrumentVideo();
    if (!(await clickRankPredictor())) throw new Error(`Rank Predictor link not found (${m.name})`);
    await waitFor("() => { const v = document.querySelector('video.rp-intro-clip'); return v && !v.paused && v.readyState >= 2; }", 8000, `playback started (${m.name})`);
    await sleep(1200); // let the composition's corner text be on screen
    const st = await presentationState();
    console.log(`${m.name}:`, JSON.stringify(st));
    assertPresentation(st, `D ${m.name}`, { expectBackdropDisplayed: m.expectBackdrop });
    await screenshot(`05-${m.name}`);
    // leave without waiting for `ended` — cleanup is covered by phase B
    await navigate('http://localhost:5173/dashboard');
    await sleep(400);
  }
  console.log('D: viewport matrix done');

  console.log('console errors:', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
  console.log('page errors:', pageErrors.length ? JSON.stringify(pageErrors, null, 1) : 'none');
  console.log('failures:', failures.length ? JSON.stringify(failures, null, 1) : 'none');
  ws.close();
  process.exit(failures.length || consoleErrors.length || pageErrors.length ? 1 : 0);
}

function windowLocationIsDashboard(pathname) {
  return pathname === '/dashboard';
}

main().catch((error) => {
  console.error('DRIVER FAILED:', error.message);
  console.error('console errors:', consoleErrors);
  process.exit(1);
});
