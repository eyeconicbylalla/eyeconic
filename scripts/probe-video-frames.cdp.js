/**
 * Dev-only video probe over headless Edge CDP (no test deps) - answers the
 * questions an animation integration needs: intrinsic dimensions, duration,
 * audio-track presence, and where the composition's readable content sits
 * relative to the frame edges (safe-margin measurement), plus PNG frames for
 * eyeballing. Used to derive INTRO_SAFE_MARGINS-style numbers for new clips.
 *
 * Usage: node scripts/probe-video-frames.cdp.js <video-abs-path> <out-dir> [frame-count]
 * Requires a headless Edge on CDP_PORT (see scripts/launch-edge-headless.ps1).
 * The clip is served from a throwaway localhost http server: a file:// media
 * document has an opaque origin, which taints the canvas and blocks
 * getImageData - over plain http the page and the video share an origin.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const VIDEO = process.argv[2];
const OUT = process.argv[3];
const FRAMES = Number(process.argv[4] || 8);
if (!VIDEO || !OUT) {
  console.error('usage: node probe-video-frames.cdp.js <video-abs-path> <out-dir> [frame-count]');
  process.exit(2);
}
const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`;
const videoPath = path.resolve(VIDEO);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' });
    fs.createReadStream(videoPath).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/${path.basename(videoPath)}`;
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
      pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1380, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(1200);
  await evaluate(`new Promise((resolve) => {
    const v = document.querySelector('video');
    if (!v) { resolve('NO VIDEO ELEMENT'); return; }
    if (v.readyState >= 1) { resolve('ready'); return; }
    v.addEventListener('loadedmetadata', () => resolve('ready'), { once: true });
    v.addEventListener('error', () => resolve('ERROR: ' + (v.error ? v.error.code : '?')), { once: true });
    setTimeout(() => resolve('TIMEOUT readyState=' + v.readyState), 8000);
  })`);

  const meta = await evaluate(`(() => {
    const v = document.querySelector('video');
    return v ? { videoWidth: v.videoWidth, videoHeight: v.videoHeight, duration: v.duration } : null;
  })()`);
  console.log('meta:', JSON.stringify(meta));
  if (!meta || !meta.videoWidth) throw new Error('no video metadata');

  // Try to detect an audio track (webkitAudioDecodedByteCount becomes > 0 only
  // after the decoder runs; play muted briefly first).
  const audio = await evaluate(`(async () => {
    const v = document.querySelector('video');
    v.muted = true;
    try { await v.play(); } catch (e) { return 'play-rejected'; }
    await new Promise((r) => setTimeout(r, 700));
    v.pause();
    const bytes = v.webkitAudioDecodedByteCount || 0;
    return bytes > 0 ? 'HAS AUDIO (' + bytes + ' bytes decoded)' : 'no audio decoded';
  })()`).catch((e) => 'audio probe failed: ' + e.message);
  console.log('audio:', audio);

  // Per-frame: save a downscaled PNG for viewing and run a numeric bright-pixel
  // edge scan at full resolution. Thresholds pick up bright text/lines; "min
  // run" ignores single-pixel noise. Returns px clearances per edge.
  const scan = (t, index) => evaluate(`(async () => {
    const v = document.querySelector('video');
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await new Promise((resolve) => {
      const done = () => { v.removeEventListener('seeked', done); requestAnimationFrame(resolve); };
      v.addEventListener('seeked', done);
      v.currentTime = ${t};
      setTimeout(resolve, 4000);
    });
    ctx.drawImage(v, 0, 0);
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h).data;
    const lum = (i) => 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
    const results = {};
    for (const T of [220, 180, 140, 100, 70, 45]) {
      const minRun = 4;
      const colBright = new Array(w).fill(0);
      const rowBright = new Array(h).fill(0);
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          if (lum((y * w + x) * 4) >= T) { colBright[x] += 2; rowBright[y] += 2; }
        }
      }
      const firstIdx = (arr, n) => { for (let i = 0; i < arr.length; i++) if (arr[i] >= n) return i; return -1; };
      const lastIdx = (arr, n) => { let last = -1; for (let i = 0; i < arr.length; i++) if (arr[i] >= n) last = i; return last; };
      const lx = firstIdx(colBright, minRun), rx = lastIdx(colBright, minRun);
      const ty = firstIdx(rowBright, minRun), by = lastIdx(rowBright, minRun);
      results['T' + T] = {
        left: lx, right: rx < 0 ? -1 : w - 1 - rx,
        top: ty, bottom: by < 0 ? -1 : h - 1 - by,
      };
    }
    const view = document.createElement('canvas');
    view.width = 540; view.height = Math.round(h * (540 / w));
    view.getContext('2d').drawImage(canvas, 0, 0, view.width, view.height);
    const png = view.toDataURL('image/png');
    // Coarse luminance grid (8 cols x 14 rows for 9:16) - a numeric picture of
    // the composition readable from the console, with the frame max for scale.
    const COLS = 8, ROWS = 14;
    const grid = [];
    let maxLum = 0;
    for (let gy = 0; gy < ROWS; gy++) {
      const row = [];
      for (let gx = 0; gx < COLS; gx++) {
        let sum = 0, n = 0;
        const x0 = Math.floor((gx * w) / COLS), x1 = Math.floor(((gx + 1) * w) / COLS);
        const y0 = Math.floor((gy * h) / ROWS), y1 = Math.floor(((gy + 1) * h) / ROWS);
        for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
          const l = lum((y * w + x) * 4); sum += l; n++; if (l > maxLum) maxLum = l;
        }
        row.push(n ? Math.round(sum / n) : 0);
      }
      grid.push(row);
    }
    return { t: ${t}, clearances: results, maxLum, grid, pngBytes: png.length, png: png };
  })()`);

  const summary = [];
  const seenPng = new Map();
  for (let i = 0; i < FRAMES; i++) {
    const t = ((i + 0.5) / FRAMES) * meta.duration;
    const r = await scan(t.toFixed(3), i);
    if (!r || !r.clearances) { console.log(`frame ${i} (t=${t.toFixed(2)}s): scan failed`); continue; }
    const file = path.join(OUT, `frame-${String(i).padStart(2, '0')}-t${t.toFixed(2)}.png`);
    fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
    const dupeOf = seenPng.get(r.pngBytes);
    seenPng.set(r.pngBytes, `frame-${i}`);
    console.log(`frame ${i} (t=${t.toFixed(2)}s) maxLum=${r.maxLum}${dupeOf ? ' [PNG same length as ' + dupeOf + ']' : ''}:`);
    console.log('  clearances:', JSON.stringify(r.clearances));
    for (const row of r.grid) console.log('  ', row.map((v) => String(v).padStart(3)).join(' '));
    summary.push({ t, clearances: r.clearances, maxLum: r.maxLum, grid: r.grid });
  }
  fs.writeFileSync(path.join(OUT, 'clearances.json'), JSON.stringify({ meta, audio, summary }, null, 2));
  ws.close();
  server.close();
  process.exit(0);
}

main().catch((error) => {
  console.error('PROBE FAILED:', error.message);
  process.exit(1);
});
