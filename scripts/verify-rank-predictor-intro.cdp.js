/**
 * Rank Predictor entry-animation verification driver — headless Edge over CDP
 * (no test deps). Signs nothing itself: it needs the dev stack running and a
 * logged-in student session cookie, like the other verify-*.cdp.js drivers.
 *
 * Checks, in one consolidated browser session:
 *   A. desktop: click Rank Predictor -> overlay + muted inline video, plays,
 *      a second rapid click adds no second video, navigation to /predictor
 *      happens only after `ended`, predictor page renders, back returns.
 *   B. replay: clicking again from the dashboard plays the animation again;
 *      leaving mid-transition cleans up and never navigates afterwards.
 *   C. prefers-reduced-motion: click navigates immediately, no overlay/video.
 *   D. mobile viewport: overlay covers the screen and playback completes.
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

  // Instrument the intro video as soon as it exists, so `ended` timing is
  // observable even though the element unmounts on navigation.
  const instrumentVideo = async () => {
    await evaluate(`(() => {
      window.__introEnded = false;
      const hook = () => {
        const video = document.querySelector('div[role=status] video');
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
    const videos = [...document.querySelectorAll('video')];
    const video = videos[0];
    return {
      videoCount: videos.length,
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

  // ---- A. desktop happy path -------------------------------------------------
  await navigate('http://localhost:5173/dashboard');
  await waitForStable("() => document.body.innerText.includes('Hi,') && !!document.querySelector(\"a[href='/predictor']\")", 30000, 'dashboard settled');
  await sleep(1000);
  await instrumentVideo();

  if (!(await clickRankPredictor())) throw new Error('Rank Predictor link not found');
  await waitFor("() => !!document.querySelector('div[role=status] video')", 5000, 'intro overlay + video');

  let state = await videoState();
  console.log('intro state on click:', JSON.stringify(state));
  if (state.videoCount !== 1 || !state.overlayPresent) failures.push('A: overlay/video missing on click');
  if (!state.muted || !state.playsInline) failures.push('A: video not muted/playsInline');
  if (state.controls) failures.push('A: native controls visible');
  if (!state.bodyScrollLocked) failures.push('A: body scroll not locked during intro');

  await waitFor("() => { const v = document.querySelector('video'); return v && !v.paused && v.readyState >= 3; }", 8000, 'playback started');
  state = await videoState();
  if (state.videoWidth !== 1920 || state.videoHeight !== 1080) failures.push(`A: unexpected video dimensions ${state.videoWidth}x${state.videoHeight}`);
  const fullBleed = await evaluate(`(() => {
    const video = document.querySelector('div[role=status] video');
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    const style = getComputedStyle(video);
    const doc = document.documentElement;
    return {
      objectFit: style.objectFit,
      widthMatches: Math.round(rect.width) === doc.clientWidth,
      heightMatches: Math.round(rect.height) === window.innerHeight,
      noScrollbarGutter: doc.clientWidth === window.innerWidth,
    };
  })()`);
  if (!fullBleed || fullBleed.objectFit !== 'cover' || !fullBleed.widthMatches || !fullBleed.heightMatches) {
    failures.push(`A: video is not full-bleed cover: ${JSON.stringify(fullBleed)}`);
  }
  if (!fullBleed || !fullBleed.noScrollbarGutter) {
    failures.push(`A: scrollbar gutter survives beside the intro overlay: ${JSON.stringify(fullBleed)}`);
  }
  await sleep(1500);
  await screenshot('01-intro-playing');

  // Rapid re-click during playback must not add a second video or navigate early.
  await clickRankPredictor();
  await sleep(600);
  state = await videoState();
  if (state.videoCount !== 1) failures.push('A2: duplicate playback after rapid re-click');
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
  if (!endedFired) failures.push('A3: navigation happened without the video ending first');

  await waitForStable("() => document.body.innerText.includes('Rank & Branch Predictor')", 30000, 'predictor page settled');
  await sleep(800);
  const afterPredictor = await videoState();
  if (afterPredictor.overlayPresent || afterPredictor.videoCount > 0) failures.push('A4: intro overlay survived navigation');
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
  await waitFor("() => !!document.querySelector('div[role=status] video') && !document.querySelector('video').paused", 8000, 'replay started');
  await screenshot('03-replay-playing');
  console.log('B: animation replays on every click');

  // Leaving mid-transition must clean up and never navigate afterwards.
  // (This back() crosses into the session's first entry, so the browser does
  // a full document reload — the evaluate can die with the old context even
  // though the navigation itself went through.)
  await evaluate('history.back()').catch(() => {});
  await sleep(1500);
  await waitFor("() => !document.querySelector('div[role=status] video')", 8000, 'overlay cleared after mid-transition leave');
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
  if (reducedState.overlayPresent || reducedState.videoCount > 0) failures.push('C: overlay played despite prefers-reduced-motion');
  await screenshot('04-reduced-motion-direct');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  console.log('C: reduced motion navigates immediately, no overlay');

  // ---- D. mobile viewport -----------------------------------------------------
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await navigate('http://localhost:5173/dashboard');
  await waitForStable("() => document.body.innerText.includes('Hi,') && !!document.querySelector(\"a[href='/predictor']\")", 30000, 'dashboard (mobile)');
  await instrumentVideo();
  if (!(await clickRankPredictor())) throw new Error('Rank Predictor link not found (mobile)');
  await waitFor("() => !!document.querySelector('div[role=status] video') && !document.querySelector('video').paused", 8000, 'mobile playback started');
  const mobileCover = await evaluate(`(() => {
    const overlay = document.querySelector('div[role=status]');
    const rect = overlay ? overlay.getBoundingClientRect() : null;
    const video = document.querySelector('div[role=status] video');
    const videoRect = video ? video.getBoundingClientRect() : null;
    return {
      coversViewport: rect ? rect.width === window.innerWidth && rect.height === window.innerHeight : false,
      videoFullBleed: videoRect
        ? Math.round(videoRect.width) === window.innerWidth && Math.round(videoRect.height) === window.innerHeight
        : false,
      noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth,
      noScrollbarGutter: document.documentElement.clientWidth === window.innerWidth,
    };
  })()`);
  if (!mobileCover.coversViewport) failures.push('D: overlay does not cover the mobile viewport');
  if (!mobileCover.videoFullBleed) failures.push('D: video is not full-bleed on mobile');
  if (!mobileCover.noHorizontalScroll) failures.push('D: horizontal scroll introduced on mobile');
  if (!mobileCover.noScrollbarGutter) failures.push('D: scrollbar gutter survives on mobile');
  await sleep(1500);
  await screenshot('05-mobile-playing');
  await waitFor("() => location.pathname === '/predictor'", 20000, 'mobile navigation after playback');
  console.log('D: mobile playback + navigation ok');

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
