/**
 * One-time helper: convert the seven mentor card PNGs (client/src/assets/1..7.png,
 * 1080x1350, ~800KB each) to WebP using headless Edge's canvas encoder — zero
 * new dependencies. The page must be same-origin with the Vite dev server so
 * the canvas is not tainted: we load the app and draw /src/assets/N.png.
 * Output: client/src/assets/N.webp. Original PNGs stay on disk untouched.
 *
 * Usage:
 *   powershell -File scripts\launch-edge-headless.ps1 9224 webp
 *   CDP_PORT=9224 node scripts/convert-mentor-images-webp.cdp.js [quality=0.85]
 */
const fs = require('fs');
const path = require('path');

const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`;
const URL = process.env.VERIFY_URL || 'http://localhost:5173/';
const OUT_DIR = path.join(__dirname, '..', 'client', 'src', 'assets');
const QUALITY = Number(process.argv[2] || 0.85);
const NUMS = [1, 2, 3, 4, 5, 6, 7];
const MAX_BYTES = 250 * 1024;

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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.enable');
  await send('Page.navigate', { url: URL });
  await new Promise((r) => setTimeout(r, 4000));

  let beforeTotal = 0;
  let afterTotal = 0;
  let failed = false;
  for (const n of NUMS) {
    const pngPath = path.join(OUT_DIR, `${n}.png`);
    const webpPath = path.join(OUT_DIR, `${n}.webp`);
    const before = fs.statSync(pngPath).size;

    const result = await evaluate(`(async () => {
      const img = new Image();
      const loaded = new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error('image load failed'));
      });
      img.src = '/src/assets/${n}.png';
      await loaded;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/webp', ${QUALITY});
      return {
        w: img.naturalWidth,
        h: img.naturalHeight,
        mime: dataUrl.slice(5, dataUrl.indexOf(';')),
        base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
      };
    })()`);

    if (!result.mime.includes('webp')) throw new Error(`encoder returned "${result.mime}" — Edge canvas WebP unavailable`);
    const buf = Buffer.from(result.base64, 'base64');
    if (result.w !== 1080 || result.h !== 1350) {
      console.error(`  ${n}.webp: unexpected dimensions ${result.w}x${result.h}`);
      failed = true;
    }
    if (buf.length > MAX_BYTES) {
      console.error(`  ${n}.webp: ${(buf.length / 1024).toFixed(0)}KB exceeds the 250KB budget`);
      failed = true;
    }
    fs.writeFileSync(webpPath, buf);
    beforeTotal += before;
    afterTotal += buf.length;
    console.log(`  ${n}.png ${(before / 1024).toFixed(0)}KB -> ${n}.webp ${(buf.length / 1024).toFixed(0)}KB (${result.w}x${result.h})`);
  }

  const saved = Math.round(100 - (afterTotal / beforeTotal) * 100);
  console.log(`\ntotal: ${(beforeTotal / 1048576).toFixed(2)}MB -> ${(afterTotal / 1048576).toFixed(2)}MB (${saved}% smaller)`);
  if (failed) process.exitCode = 1;
  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
