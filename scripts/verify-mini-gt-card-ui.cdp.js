/**
 * Mini GT dashboard-card UI check — headless Edge over CDP (no test deps).
 * Loads /dashboard with the dev E2E student's session cookie, asserts the
 * redesigned card (no subjects, description, question/minute/mark attributes,
 * History + CTA), captures console errors, and saves desktop + mobile
 * screenshots of the card.
 *
 * Usage: node scripts/verify-mini-gt-card-ui.cdp.js <cookie-value>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const COOKIE = process.argv[2];
if (!COOKIE) {
  console.error('usage: node verify-mini-gt-card-ui.cdp.js <ec_app_session value>');
  process.exit(2);
}
const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`;
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'minigt-card-'));
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
  const shot = async (name) => {
    const img = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, name);
    fs.writeFileSync(file, Buffer.from(img.data, 'base64'));
    console.log(`saved ${file}`);
  };
  const viewport = async (width, height) =>
    send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });

  // ---- Desktop ------------------------------------------------------------
  await viewport(1380, 1000);
  await send('Page.navigate', { url: 'http://localhost:5173/dashboard' });
  await waitFor(() => !!document.querySelector('h3') && [...document.querySelectorAll('h3')].some((h) => h.textContent.includes('Mini GT')), 20000, 'Mini GT card');
  // Let the rest of the dashboard settle (comparison card, readiness chips).
  await sleep(2500);

  const card = () => [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('Mini GT'))?.closest('.rounded-2xl');
  const findCard = `(${card.toString()})()`;
  const facts = await evaluate(`(() => {
    const card = ${findCard};
    if (!card) return null;
    const text = card.innerText;
    const rect = card.getBoundingClientRect();
    return {
      text,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hasBadge: text.includes('Mini Grand Test'),
      hasSubjects: /PSYCHIATRY|DERMATOLOGY|ORTHOPAEDICS/i.test(text),
      hasDescription: text.includes('A short, focused test for regular practice'),
      hasQuestions: /30\\s+Questions/.test(text),
      hasMinutes: /30\\s+Minutes/.test(text),
      hasMarks: /120\\s+Marks/.test(text),
      hasHistory: text.includes('History'),
      hasStart: text.includes('Start Mini GT') || text.includes('Resume') || text.includes('View Analysis'),
      overflowsX: card.scrollWidth > card.clientWidth + 1,
    };
  })()`);
  console.log('card facts:', JSON.stringify(facts, null, 2));
  await shot('dashboard-desktop.png');

  // Card-only crop via clip rect.
  if (facts) {
    const rect = await evaluate(`(() => { const c = ${findCard}; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
    const img = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
    fs.writeFileSync(path.join(OUT, 'card-desktop.png'), Buffer.from(img.data, 'base64'));
    console.log(`saved ${path.join(OUT, 'card-desktop.png')}`);
  }

  // ---- Mobile -------------------------------------------------------------
  await viewport(390, 844);
  await sleep(1200);
  const mobile = await evaluate(`(() => {
    const card = ${findCard};
    if (!card) return null;
    const text = card.innerText;
    return {
      width: Math.round(card.getBoundingClientRect().width),
      hasSubjects: /PSYCHIATRY|DERMATOLOGY|ORTHOPAEDICS/i.test(text),
      hasQuestions: /30\\s+Questions/.test(text),
      hasMinutes: /30\\s+Minutes/.test(text),
      hasMarks: /120\\s+Marks/.test(text),
      overflowsX: card.scrollWidth > card.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  })()`);
  console.log('mobile facts:', JSON.stringify(mobile, null, 2));
  await shot('dashboard-mobile.png');

  console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');
  console.log('page errors:', pageErrors.length ? pageErrors : 'none');

  const failures = [];
  if (!facts) failures.push('card not found');
  else {
    if (facts.hasSubjects) failures.push('subject names still present');
    if (!facts.hasBadge) failures.push('Mini Grand Test badge missing');
    if (!facts.hasDescription) failures.push('description missing');
    if (!facts.hasQuestions) failures.push('Questions attribute missing');
    if (!facts.hasMinutes) failures.push('Minutes attribute missing');
    if (!facts.hasMarks) failures.push('Marks attribute missing');
    if (!facts.hasHistory) failures.push('History link missing');
    if (!facts.hasStart) failures.push('CTA missing');
    if (facts.overflowsX) failures.push('horizontal overflow on desktop');
  }
  if (mobile) {
    if (mobile.hasSubjects) failures.push('subject names present on mobile');
    if (!mobile.hasQuestions || !mobile.hasMinutes || !mobile.hasMarks) failures.push('attributes missing on mobile');
    if (mobile.overflowsX) failures.push('horizontal overflow on mobile');
  }
  if (consoleErrors.length || pageErrors.length) failures.push('console/page errors captured');

  console.log(failures.length ? `FAIL: ${failures.join('; ')}` : 'PASS: all checks green');
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
