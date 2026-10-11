/**
 * One-time helper: convert the three course poster PNGs (client/src/assets/36..38.png,
 * 6480x8640, ~31-35MB each) to right-sized 720x960 WebP using headless Edge's
 * canvas encoder — zero new dependencies. The page must be same-origin with the
 * Vite dev server so the canvas is not tainted: we load the app and draw
 * /src/assets/N.png. Display size is ~323px in the 3-col grid, so 720px keeps
 * ~2.2x retina headroom at exact 3:4 (zero crop). Original PNGs stay untouched.
 *
 * Budget ladder per file: 720x960 @ q0.85 → 720x960 @ q0.80 → 600x800 @ q0.80
 * (600x800 keeps the exact 3:4 ratio with integer dimensions).
 *
 * Usage:
 *   powershell -File scripts\launch-edge-headless.ps1 9224 webp
 *   CDP_PORT=9224 node scripts/convert-course-images-webp.cdp.js [quality=0.85]
 */
const fs = require('fs');
const path = require('path');

const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`;
const URL = process.env.VERIFY_URL || 'http://localhost:5173/';
const OUT_DIR = path.join(__dirname, '..', 'client', 'src', 'assets');
const QUALITY = Number(process.argv[2] || 0.85);
const NUMS = [36, 37, 38];
const MAX_BYTES = 220 * 1024;

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

  // Single high-quality pass at 9x downscale; if the result looks soft, the
  // documented fallback is two-step halving (6480x8640 -> 1620x2160 -> 720x960).
  const convert = (n, w, h, q) => evaluate(`(async () => {
    const img = new Image();
    const loaded = new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('image load failed'));
    });
    img.src = '/src/assets/${n}.png';
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = ${w};
    canvas.height = ${h};
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, ${w}, ${h});
    const dataUrl = canvas.toDataURL('image/webp', ${q});
    return {
      sw: img.naturalWidth,
      sh: img.naturalHeight,
      w: ${w},
      h: ${h},
      mime: dataUrl.slice(5, dataUrl.indexOf(';')),
      base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    };
  })()`);

  let beforeTotal = 0;
  let afterTotal = 0;
  let failed = false;
  for (const n of NUMS) {
    const pngPath = path.join(OUT_DIR, `${n}.png`);
    const webpPath = path.join(OUT_DIR, `${n}.webp`);
    const before = fs.statSync(pngPath).size;
    beforeTotal += before;

    const ladder = [
      [720, 960, QUALITY],
      [720, 960, 0.80],
      [600, 800, 0.80],
    ];
    let result;
    let buf;
    let usedQ;
    for (const [w, h, q] of ladder) {
      result = await convert(n, w, h, q);
      if (!result.mime.includes('webp')) throw new Error(`encoder returned "${result.mime}" — Edge canvas WebP unavailable`);
      buf = Buffer.from(result.base64, 'base64');
      usedQ = q;
      if (buf.length <= MAX_BYTES) break;
    }

    if (result.sw !== 6480 || result.sh !== 8640) {
      console.error(`  ${n}.webp: unexpected source dimensions ${result.sw}x${result.sh}`);
      failed = true;
    }
    if (buf.length > MAX_BYTES) {
      console.error(`  ${n}.webp: ${(buf.length / 1024).toFixed(0)}KB exceeds the ${MAX_BYTES / 1024}KB budget (lowest ladder rung)`);
      failed = true;
    }
    fs.writeFileSync(webpPath, buf);
    afterTotal += buf.length;
    console.log(`  ${n}.png ${(before / 1048576).toFixed(2)}MB -> ${n}.webp ${(buf.length / 1024).toFixed(0)}KB (${result.w}x${result.h}, q${usedQ})`);
  }

  const saved = Math.round(100 - (afterTotal / beforeTotal) * 100);
  console.log(`\ntotal: ${(beforeTotal / 1048576).toFixed(2)}MB -> ${(afterTotal / 1048576).toFixed(2)}MB (${saved}% smaller)`);
  if (failed) process.exitCode = 1;
  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
