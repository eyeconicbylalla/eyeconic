/**
 * Feature 06 mobile-viewport check — same CDP approach as
 * verify-platform-choice-ui.cdp.js at 375px: form renders, results render,
 * no horizontal scroll, screenshots saved to %TEMP%.
 * Usage: CDP_PORT=9223 node scripts/verify-platform-choice-mobile.cdp.js <cookie>
 */
const fs = require('fs');

const COOKIE = process.argv[2];
const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`;
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
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = `${process.env.TEMP.replace(/\\/g, '/')}/pc-mobile-${name}.png`;
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    console.log('screenshot:', file);
  };

  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 2, mobile: true });
  await send('Network.setCookie', {
    name: 'ec_app_session', value: COOKIE, url: 'http://localhost:5173',
    path: '/', httpOnly: true, sameSite: 'Lax',
  });

  await send('Page.navigate', { url: 'http://localhost:5173/platform-choice' });
  await sleep(7000);
  console.log('form ok:', await evaluate('!!document.querySelector("form")'));
  console.log('no horizontal scroll (form):', await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'));
  await shot('form');

  await evaluate('(() => { const b = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Get My Recommendations")); if (b && !b.disabled) b.click(); })()');
  await sleep(6000);
  console.log('results ok:', await evaluate('document.body.innerText.toUpperCase().includes("YOUR PLATFORM RECOMMENDATIONS")'));
  console.log('no horizontal scroll (results):', await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'));
  await shot('results');
  process.exit(0);
}

main().catch((error) => { console.error('FATAL', error.message); process.exit(1); });
