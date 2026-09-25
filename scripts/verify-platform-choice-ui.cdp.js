/**
 * Feature 06 UI verification driver — headless Edge over CDP (no test deps).
 * Loads /platform-choice with the dev E2E student's session cookie, checks the
 * prefilled form, submits, captures the result cards, then checks the
 * Dashboard card. Prints console errors if any.
 *
 * Usage: node scripts/verify-platform-choice-ui.cdp.js <cookie-value>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const COOKIE = process.argv[2];
if (!COOKIE) {
  console.error('usage: node verify-platform-choice-ui.cdp.js <ec_app_session value>');
  process.exit(2);
}
const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`;
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-ui-'));
const consoleErrors = [];
const pageErrors = [];

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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1380, height: 1000, deviceScaleFactor: 1, mobile: false,
  });

  // Session cookie on the dev origin (page + /api share localhost).
  await send('Network.enable');
  await send('Network.setCookie', {
    name: 'ec_app_session', value: COOKIE, url: 'http://localhost:5173',
    path: '/', httpOnly: true, sameSite: 'Lax',
  });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
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
  /**
   * Cold-profile vite dep-optimizer reloads mid-flow: a condition can be true,
   * then the page reloads and the DOM resets before the next probe. Wait until
   * the condition holds across TWO consecutive polls with a quiet gap — i.e.
   * the app has settled — before trusting the DOM.
   */
  const waitForStable = async (expression, timeoutMs, label) => {
    const started = Date.now();
    let consecutive = 0;
    let polls = 0;
    let lastReason = 'unknown';
    while (Date.now() - started < timeoutMs) {
      try {
        polls += 1;
        if (await evaluate(`(${expression})()`)) {
          consecutive += 1;
          lastReason = 'true';
          if (consecutive >= 2) return true;
        } else {
          consecutive = 0;
          lastReason = 'false';
        }
      } catch (error) { consecutive = 0; lastReason = `threw: ${error.message}`; }
      if (polls % 5 === 0) {
        const debug = await evaluate(
          'document.readyState + " | " + location.href + " | " + document.body.innerText.replace(/\\s+/g," ").slice(0, 140)'
        ).catch(() => 'debug-evaluate-failed');
        console.error(`[wait:${label}] polls=${polls} last=${lastReason} page=${debug}`);
      }
      await sleep(600);
    }
    throw new Error(`timeout waiting (stable) for ${label}`);
  };
  const screenshot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('screenshot:', file);
  };
  const navigate = (url) => send('Page.navigate', { url });

  // ---- /platform-choice: prefilled form ------------------------------------
  await navigate('http://localhost:5173/platform-choice');
  await waitForStable(
    "() => !!document.querySelector('form') && document.body.innerText.toUpperCase().includes('TARGET EXAM')",
    30000, 'form settled'
  );
  await sleep(1000); // final settle after stability

  const prefill = await evaluate(`(() => {
    const text = document.body.innerText;
    const pressed = [...document.querySelectorAll('[aria-pressed=true],[role=radio][aria-checked=true]')].map(e => e.textContent.trim());
    return {
      examSelected: pressed,
      hasMiniCctRail: text.includes('From your latest Mini CCT'),
      subjectHint: text.includes('Pre-filled from your latest Mini CCT'),
      submitEnabled: [...document.querySelectorAll('button')].some(b => b.textContent.includes('Get My Recommendations') && !b.disabled),
      pickedCount: (text.match(/\\d\\/3 subjects picked/) || [])[0] || null,
    };
  })()`);
  console.log('form prefill:', JSON.stringify(prefill, null, 1));
  await screenshot('01-form');

  // ---- submit ---------------------------------------------------------------
  // Cold-profile vite reload can recreate the form mid-flight: re-click if needed.
  let submitted = false;
  for (let attempt = 0; attempt < 4 && !submitted; attempt += 1) {
    await waitForStable(
      "() => !!document.querySelector('form') && document.body.innerText.toUpperCase().includes('TARGET EXAM')",
      15000, 'form before submit'
    );
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Get My Recommendations'));
      if (button && !button.disabled) button.click();
    })()`);
    try {
      await waitForStable("() => document.body.innerText.toUpperCase().includes('YOUR PLATFORM RECOMMENDATIONS') && !!document.querySelector('a')", 25000, 'results settled');
      submitted = true;
    } catch {
      // fall through: form may have been recreated by a reload — retry
    }
  }
  if (!submitted) throw new Error('results never appeared');

  const result = await evaluate(`(() => ({
    tierBadges: [...document.querySelectorAll('span')].map(s => s.textContent.trim()).filter(t => ['Highly Recommended','Good Alternative','Also Consider'].includes(t)),
    platformNames: [...document.querySelectorAll('h3')].map(h => h.textContent.trim()).filter(n => ['Marrow','PrepLadder','Cerebellum Academy','DAMS','DBMCI'].includes(n)),
    hasVisitCta: [...document.querySelectorAll('a')].some(a => a.textContent.includes('Visit Platform')),
    hasKnowMore: [...document.querySelectorAll('button')].some(b => b.textContent.includes('Know More')),
    matchScores: [...document.querySelectorAll('span')].map(s => s.textContent.trim()).filter(t => /^\\d+% match/.test(t)),
  }))()`);
  console.log('result view:', JSON.stringify(result, null, 1));
  await screenshot('02-results');

  // Expand "Know More" on the first card for the factor breakdown.
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Know More'));
    if (button) button.click();
  })()`);
  await sleep(400);
  await screenshot('03-results-breakdown');

  // ---- Dashboard card --------------------------------------------------------
  await navigate('http://localhost:5173/dashboard');
  await waitForStable("() => document.body.innerText.toUpperCase().includes('PLATFORM CHOICE') && document.body.innerText.includes('Hi,')", 30000, 'dashboard settled');
  await sleep(1000);
  const dashboard = await evaluate(`(() => ({
    cardPresent: document.body.innerText.toUpperCase().includes('PLATFORM CHOICE'),
    showsLatest: document.body.innerText.includes('Last recommended for you'),
    quickLink: [...document.querySelectorAll('a')].some(a => a.getAttribute('href') === '/platform-choice'),
  }))()`);
  console.log('dashboard:', JSON.stringify(dashboard, null, 1));
  await screenshot('04-dashboard');

  console.log('console errors:', consoleErrors.length ? JSON.stringify(consoleErrors, null, 1) : 'none');
  console.log('page errors:', pageErrors.length ? JSON.stringify(pageErrors, null, 1) : 'none');
  ws.close();
  process.exit(consoleErrors.length || pageErrors.length ? 1 : 0);
}

main().catch((error) => {
  console.error('DRIVER FAILED:', error.message);
  console.error('console errors:', consoleErrors);
  process.exit(1);
});
