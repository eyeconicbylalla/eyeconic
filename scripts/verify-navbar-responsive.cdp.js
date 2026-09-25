/**
 * Mobile navbar responsiveness check — CDP approach shared with
 * verify-platform-choice-mobile.cdp.js. Drives the Home page at a matrix of
 * widths (small phone → tablet → lg), and for each: opens the hamburger
 * menu, asserts the panel's geometry/background/stacking, exercises
 * close-by-link, close-by-scrim and close-by-Escape, and checks horizontal
 * overflow + console errors. Screenshots saved to %TEMP%.
 * Usage: CDP_PORT=9223 node scripts/verify-navbar-responsive.cdp.js
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
    const file = `${process.env.TEMP.replace(/\\/g, '/')}/navbar-${name}.png`;
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    console.log(`  screenshot: ${file}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  // Full page load once; breakpoints are then exercised by resizing.
  await send('Page.navigate', { url: URL });
  await sleep(6000);

  // One shared probe: opens the menu, returns geometry + computed styles.
  const PROBE = `(() => {
    const toggle = document.querySelector('button[aria-controls="mobile-menu"]');
    if (!toggle) return { error: 'toggle not found' };
    if (toggle.getAttribute('aria-expanded') !== 'false') return { error: 'menu unexpectedly open on load' };
    toggle.click();
    return { opened: true };
  })()`;
  const MENU_STATE = `(() => {
    const nav = document.querySelector('nav');
    const panel = document.getElementById('mobile-menu');
    const scrim = document.querySelector('body > div.fixed.inset-0.z-40');
    const toggle = document.querySelector('button[aria-controls="mobile-menu"]');
    if (!panel) return { error: 'panel missing' };
    const navRect = nav.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const scrimStyle = scrim ? getComputedStyle(scrim) : null;
    const scrimRect = scrim ? scrim.getBoundingClientRect() : null;
    const hero = document.querySelector('#home h1');
    const heroRect = hero ? hero.getBoundingClientRect() : null;
    // Element the browser would put at the menu's centre if the panel were absent.
    const behind = panel ? document.elementFromPoint(
      Math.min(Math.max(panelRect.left + 8, 0), innerWidth - 1),
      Math.min(panelRect.top + 8, innerHeight - 1)
    ) : null;
    const behindIsMenu = behind === panel || (behind && panel.contains(behind));
    return {
      navBottom: Math.round(navRect.bottom),
      panelTop: Math.round(panelRect.top),
      panelLeft: Math.round(panelRect.left),
      panelRight: Math.round(panelRect.right),
      panelBottom: Math.round(panelRect.bottom),
      viewportW: innerWidth,
      viewportH: innerHeight,
      bg: style.backgroundColor,
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      zIndexPanel: style.zIndex,
      scrim: scrim ? {
        position: scrimStyle.position, zIndex: scrimStyle.zIndex, bg: scrimStyle.backgroundColor,
        top: Math.round(scrimRect.top), height: Math.round(scrimRect.height),
      } : null,
      heroTop: heroRect ? Math.round(heroRect.top) : null,
      heroVisibleUnderPanel: heroRect ? (heroRect.top < panelRect.bottom && heroRect.bottom > panelRect.top) : null,
      hitTestTopBehindPanel: behindIsMenu,
      bodyLocked: getComputedStyle(document.body).overflow === 'hidden',
      expanded: toggle.getAttribute('aria-expanded'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  })()`;
  const CLOSE_CHECK = `(() => ({
    panelGone: !document.getElementById('mobile-menu'),
    scrimGone: !document.querySelector('body > div.fixed.inset-0.z-40'),
    bodyUnlocked: getComputedStyle(document.body).overflow !== 'hidden',
  }))()`;

  const sizes = [
    { name: '320', w: 320, h: 640 },    // small Android
    { name: '375', w: 375, h: 667 },    // iPhone SE/8
    { name: '414', w: 414, h: 896 },    // large phone
    { name: '640', w: 640, h: 360 },    // phone landscape (short)
    { name: '768', w: 768, h: 1024 },   // tablet portrait
    { name: '820', w: 820, h: 1180 },   // iPad Air
    { name: '912', w: 912, h: 1368 },   // iPad Pro 12.9 portrait
    { name: '1024', w: 1024, h: 768 },  // lg boundary — desktop nav
  ];

  const results = [];
  const check = (label, ok, detail) => {
    results.push({ label, ok });
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` → ${JSON.stringify(detail)}`}`);
  };

  for (const { name, w, h } of sizes) {
    console.log(`\n== ${w}x${h} ==`);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await sleep(700);

    const isDesktop = w >= 1024;
    const toggleVisible = await evaluate(
      `(() => { const t = document.querySelector('button[aria-controls="mobile-menu"]'); return !!t && getComputedStyle(t).display !== 'none' && t.offsetParent !== null; })()`
    );

    if (isDesktop) {
      check('desktop: hamburger hidden', toggleVisible === false, { toggleVisible });
      const desktopNav = await evaluate(
        `(() => { const links = document.querySelector('nav .hidden.lg\\:flex'); return !!links && getComputedStyle(links).display !== 'none'; })()`
      );
      check('desktop: horizontal nav visible', desktopNav === true, { desktopNav });
      check('desktop: no horizontal scroll', await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'), {});
      await shot(`${name}-desktop`);
      continue;
    }

    check(`${name}: hamburger visible`, toggleVisible === true, { toggleVisible });
    check(`${name}: no horizontal scroll (closed)`, await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'));

    // Open the menu.
    await evaluate(PROBE);
    await sleep(350); // entrance animation
    const openState = await evaluate(MENU_STATE);
    if (openState.error) { check(`${name}: menu opens`, false, openState); continue; }
    check(`${name}: menu opens (aria-expanded)`, openState.expanded === 'true', openState.expanded);
    check(`${name}: panel starts below navbar`, openState.panelTop >= openState.navBottom - 1, openState);
    check(`${name}: panel spans viewport width`, openState.panelLeft >= -1 && openState.panelRight <= openState.viewportW + 1, openState);
    check(`${name}: panel background opaque (was the /98 bug)`, (() => {
      const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)/.exec(openState.bg || '');
      return !!m && parseFloat(m[4]) >= 0.9;
    })(), openState.bg);
    check(`${name}: panel height capped to viewport`, openState.panelBottom <= openState.viewportH + 1, openState);
    check(`${name}: hit-test: panel is topmost at its centre`, openState.hitTestTopBehindPanel === true, openState);
    check(`${name}: scrim covers viewport`, openState.scrim && openState.scrim.position === 'fixed' && openState.scrim.top === 0 && openState.scrim.height >= openState.viewportH - 1, openState.scrim);
    check(`${name}: scrim sits below navbar (z-40 < nav z-50)`, openState.scrim && parseInt(openState.scrim.zIndex, 10) < 50, openState.scrim && openState.scrim.zIndex);
    check(`${name}: body scroll locked while open`, openState.bodyLocked === true, openState.bodyLocked);
    check(`${name}: no horizontal scroll (open)`, openState.scrollWidth <= openState.clientWidth + 1, openState);
    await shot(`${name}-menu-open`);

    // Landscape-specific: menu content must scroll internally, all items reachable.
    if (h <= 500) {
      const scrollable = await evaluate(`(() => { const p = document.getElementById('mobile-menu'); return p ? p.scrollHeight > p.clientHeight : null; })()`);
      const lastItemVisible = await evaluate(`(() => {
        const p = document.getElementById('mobile-menu');
        const items = [...p.querySelectorAll('a, button')];
        const last = items[items.length - 1];
        p.scrollTop = p.scrollHeight;
        const r = last.getBoundingClientRect();
        return r.bottom <= innerHeight + 1;
      })()`);
      check(`${name}: tall menu scrolls internally to last item`, lastItemVisible === true, { scrollable, lastItemVisible });
    }

    // Close via a menu link (Courses → /#courses).
    await evaluate(`(() => { const a = [...document.querySelectorAll('#mobile-menu a')].find((x) => x.textContent.trim() === 'Courses'); a.click(); })()`);
    await sleep(300);
    let closed = await evaluate(CLOSE_CHECK);
    check(`${name}: link click closes menu + unlocks body`, closed.panelGone && closed.scrimGone && closed.bodyUnlocked, closed);
    check(`${name}: no horizontal scroll after link-nav`, await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'));

    // Re-open → close via scrim tap.
    await evaluate(PROBE);
    await sleep(250);
    await evaluate(`(() => document.querySelector('body > div.fixed.inset-0.z-40').click() )()`);
    await sleep(200);
    closed = await evaluate(CLOSE_CHECK);
    check(`${name}: scrim tap closes menu`, closed.panelGone && closed.scrimGone && closed.bodyUnlocked, closed);

    // Re-open → close via Escape.
    await evaluate(PROBE);
    await sleep(250);
    await evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
    await sleep(200);
    closed = await evaluate(CLOSE_CHECK);
    check(`${name}: Escape closes menu`, closed.panelGone && closed.scrimGone && closed.bodyUnlocked, closed);

    await shot(`${name}-menu-closed`);
  }

  // Resize-across-lg behaviour: open at mobile, grow to lg.
  console.log('\n== resize mobile → lg with menu open ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  await evaluate(PROBE);
  await sleep(250);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const resizeState = await evaluate(CLOSE_CHECK);
  check('crossing lg closes menu + unlocks body', resizeState.panelGone && resizeState.scrimGone && resizeState.bodyUnlocked, resizeState);

  console.log(`\nconsole errors: ${consoleErrors.length === 0 ? 'none' : ''}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 300)));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.label).join(' | ')); process.exitCode = 1; }
  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
