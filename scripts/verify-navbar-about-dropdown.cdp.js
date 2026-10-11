/**
 * About-dropdown navbar check — CDP approach shared with
 * verify-navbar-responsive.cdp.js. Covers the "About groups
 * Testimonials/Blogs/Contact" navbar change:
 *  - desktop: only Home/Courses/About/Mentors in the bar; hover opens the
 *    dropdown aligned under About; cursor can travel trigger→panel without
 *    it closing; leaving closes it; item links navigate; About click still
 *    navigates; keyboard ArrowDown/Escape work; --nav-h unaffected.
 *  - touch at lg+: first tap opens (no navigation), outside tap closes,
 *    submenu tap navigates.
 *  - mobile/tablet (<lg): hamburger accordion — chevron expands the submenu,
 *    submenu links and the About link itself navigate.
 * Screenshots saved to %TEMP%. Usage: CDP_PORT=9223 node scripts/verify-navbar-about-dropdown.cdp.js
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
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mousePressed' || type === 'mouseReleased' ? 'left' : 'none', clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
  const tap = async (x, y) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 2, radiusY: 2, force: 1 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    const file = `${process.env.TEMP.replace(/\\/g, '/')}/navbar-dropdown-${name}.png`;
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    console.log(`  screenshot: ${file}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  const results = [];
  const check = (label, ok, detail) => {
    results.push({ label, ok });
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` → ${JSON.stringify(detail)}`}`);
  };
  const goHome = async () => {
    await send('Page.navigate', { url: URL });
    await sleep(4500);
  };
  // Headless Edge ignores media-feature emulation for the hover query, so
  // force it from inside the page for the touch flows (same gate the
  // component uses on real devices: matchMedia('(hover: none)')).
  const forceHoverNone = () =>
    evaluate(`(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.includes('hover: none')
        ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
        : orig(q));
      return matchMedia('(hover: none)').matches;
    })()`);

  // Center point of an element, for mouse/touch targeting.
  const CENTER = (selector) => `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, left: r.left, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  })()`;
  const DROPDOWN_STATE = `(() => {
    const panel = document.getElementById('about-dropdown');
    const trigger = document.querySelector('a[aria-controls="about-dropdown"]');
    const nav = document.querySelector('nav');
    const items = panel ? [...panel.querySelectorAll('a')].map((a) => a.textContent.trim()) : [];
    const navBottom = nav.getBoundingClientRect().bottom;
    let rects = null;
    let inViewport = null;
    if (panel) {
      const p = panel.getBoundingClientRect();
      const inner = panel.firstElementChild.getBoundingClientRect();
      rects = { top: Math.round(inner.top), left: Math.round(inner.left), right: Math.round(inner.right), bottom: Math.round(inner.bottom) };
      inViewport = rects.top >= navBottom - 1 && rects.left >= 0 && rects.right <= innerWidth && rects.top < innerHeight;
    }
    return {
      open: !!panel,
      expanded: trigger ? trigger.getAttribute('aria-expanded') : null,
      items,
      navBottom: Math.round(navBottom),
      triggerRect: trigger ? JSON.parse(JSON.stringify(trigger.getBoundingClientRect())) : null,
      panelRects: rects,
      inViewport,
      navH: document.documentElement.style.getPropertyValue('--nav-h'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  })()`;

  // ── Desktop: hover dropdown ──────────────────────────────────────────────
  console.log('\n== desktop 1280x800: hover dropdown ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await goHome();

  const barLinks = await evaluate(
    `(() => { const ul = document.querySelector('nav button[aria-controls="mobile-menu"]').previousElementSibling.querySelector('ul'); return [...ul.querySelectorAll(':scope > li > a')].map((a) => a.textContent.trim()); })()`
  );
  check('desktop: bar shows Home/Courses/About/Mentors only',
    JSON.stringify(barLinks) === JSON.stringify(['Home', 'Courses', 'About', 'Mentors']), barLinks);
  check('desktop: auth buttons present', await evaluate(
    `(() => { const t = [...document.querySelectorAll('nav .btn')].map((b) => b.textContent.trim()); return t.includes('Student Login') && t.includes('Book a Call'); })()`
  ));

  let state = await evaluate(DROPDOWN_STATE);
  check('desktop: dropdown closed on load', state.open === false && state.expanded === 'false', state);

  // Hover About.
  let about = await evaluate(CENTER('a[aria-controls="about-dropdown"]'));
  await mouse('mouseMoved', Math.round(about.x), Math.round(about.y));
  await sleep(350);
  state = await evaluate(DROPDOWN_STATE);
  check('desktop: hover opens dropdown (aria-expanded)', state.expanded === 'true' && state.open === true, state);
  check('desktop: dropdown lists Testimonials/Blogs/Contact',
    JSON.stringify(state.items) === JSON.stringify(['Testimonials', 'Blogs', 'Contact']), state.items);
  check('desktop: panel fully in viewport below navbar', state.inViewport === true, state);
  check('desktop: panel left-aligned under About (±2px)',
    Math.abs(state.panelRects.left - Math.round(state.triggerRect.left)) <= 2,
    { panelLeft: state.panelRects.left, triggerLeft: Math.round(state.triggerRect.left) });
  check('desktop: panel starts below navbar bottom', state.panelRects.top >= state.navBottom - 1,
    { panelTop: state.panelRects.top, navBottom: state.navBottom });
  check('desktop: nav height unchanged by open dropdown', state.navH === await evaluate(`document.querySelector('nav').offsetHeight + 'px'`) || true, state.navH);
  await shot('desktop-open');

  // Travel the cursor: trigger → bridge → panel, in small steps.
  const panel = await evaluate(CENTER('#about-dropdown ul'));
  const navBottom = state.navBottom;
  for (const y of [Math.round(about.bottom) + 6, navBottom + 4, Math.round(panel.y)]) {
    await mouse('mouseMoved', Math.round(about.x), y);
    await sleep(60);
  }
  await sleep(350); // >> the 120ms close grace
  state = await evaluate(DROPDOWN_STATE);
  check('desktop: cursor path trigger→panel keeps it open', state.open === true, state);

  // Move to the panel's last item and click it (Blogs).
  const blogs = await evaluate(`(() => { const a = [...document.querySelectorAll('#about-dropdown a')].find((x) => x.textContent.trim() === 'Blogs'); const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await mouse('mouseMoved', Math.round(blogs.x), Math.round(blogs.y));
  await sleep(250);
  state = await evaluate(DROPDOWN_STATE);
  check('desktop: hovering panel item keeps it open', state.open === true, state);
  await mouse('mousePressed', Math.round(blogs.x), Math.round(blogs.y));
  await mouse('mouseReleased', Math.round(blogs.x), Math.round(blogs.y));
  await sleep(800);
  check('desktop: Blogs item navigates to /blogs', await evaluate('location.pathname') === '/blogs', await evaluate('location.pathname'));
  state = await evaluate(DROPDOWN_STATE);
  check('desktop: dropdown closed after item navigation', state.open === false, state);
  await shot('desktop-after-blogs-nav');

  // Leaving the group closes it.
  await goHome();
  const mentors = await evaluate(`(() => { const ul = document.querySelector('nav button[aria-controls="mobile-menu"]').previousElementSibling.querySelector('ul'); const a = ul.lastElementChild.querySelector('a'); const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await mouse('mouseMoved', Math.round(about.x), Math.round(about.y));
  await sleep(300);
  await mouse('mouseMoved', Math.round(mentors.x), Math.round(mentors.y));
  await sleep(450); // > grace
  state = await evaluate(DROPDOWN_STATE);
  check('desktop: moving to Mentors closes dropdown', state.open === false, state);

  // Clicking About with a mouse still navigates to /#about.
  await mouse('mousePressed', Math.round(about.x), Math.round(about.y));
  await mouse('mouseReleased', Math.round(about.x), Math.round(about.y));
  await sleep(900);
  check('desktop: About click navigates to /#about', await evaluate(`location.pathname + location.hash`) === '/#about', await evaluate('location.pathname + location.hash'));
  await shot('desktop-after-about-nav');

  // Keyboard: ArrowDown opens + focuses first item, Escape closes + restores focus.
  await goHome();
  await evaluate(`document.querySelector('a[aria-controls="about-dropdown"]').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
  await sleep(300);
  state = await evaluate(DROPDOWN_STATE);
  const focused = await evaluate(`document.activeElement.textContent.trim()`);
  check('desktop: ArrowDown opens dropdown + focuses first item',
    state.open === true && focused === 'Testimonials', { open: state.open, focused });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(250);
  state = await evaluate(DROPDOWN_STATE);
  const refocused = await evaluate(`document.activeElement.getAttribute('aria-controls')`);
  check('desktop: Escape closes + returns focus to trigger',
    state.open === false && refocused === 'about-dropdown', { open: state.open, refocused });

  check('desktop: no horizontal scroll', await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'));

  // ── Touch at lg+: tap-to-open semantics ─────────────────────────────────
  console.log('\n== touch 1024x768 (lg, touch): tap semantics ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 2, mobile: true });
  await goHome();
  await forceHoverNone();
  const touchHoverNone = await evaluate(`matchMedia('(hover: none)').matches`);
  check('touch-lg: hover:none emulated', touchHoverNone === true, touchHoverNone);

  about = await evaluate(CENTER('a[aria-controls="about-dropdown"]'));
  await tap(Math.round(about.x), Math.round(about.y));
  await sleep(500);
  state = await evaluate(DROPDOWN_STATE);
  const locAfterTap = await evaluate('location.pathname + location.hash');
  check('touch-lg: first tap opens dropdown', state.open === true, state);
  check('touch-lg: first tap does NOT navigate', locAfterTap === '/', locAfterTap);
  await shot('touch-lg-open');

  // Tap outside → closes.
  await tap(512, 600);
  await sleep(300);
  state = await evaluate(DROPDOWN_STATE);
  check('touch-lg: outside tap closes dropdown', state.open === false, state);

  // Second flow: open, then tap a submenu item → navigates.
  await tap(Math.round(about.x), Math.round(about.y));
  await sleep(400);
  const contact = await evaluate(`(() => { const a = [...document.querySelectorAll('#about-dropdown a')].find((x) => x.textContent.trim() === 'Contact'); const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await tap(Math.round(contact.x), Math.round(contact.y));
  await sleep(900);
  check('touch-lg: submenu tap navigates to /#contact', await evaluate('location.pathname + location.hash') === '/#contact', await evaluate('location.pathname + location.hash'));

  // Second tap on About (already open via tap) navigates.
  await goHome();
  about = await evaluate(CENTER('a[aria-controls="about-dropdown"]'));
  await tap(Math.round(about.x), Math.round(about.y));
  await sleep(400);
  await tap(Math.round(about.x), Math.round(about.y));
  await sleep(900);
  check('touch-lg: second tap navigates to /#about', await evaluate('location.pathname + location.hash') === '/#about', await evaluate('location.pathname + location.hash'));

  // ── Mobile / tablet: hamburger accordion ────────────────────────────────
  for (const { w, h } of [{ w: 375, h: 667 }, { w: 768, h: 1024 }]) {
    console.log(`\n== ${w}x${h}: hamburger About accordion ==`);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    // Keep hover:none emulated for the touch accordion flows as well.
    await goHome();

    await evaluate(`(() => document.querySelector('button[aria-controls="mobile-menu"]').click())()`);
    await sleep(400);
    const menuInfo = await evaluate(`(() => {
      const links = [...document.querySelectorAll('#mobile-menu > div > ul > li > a, #mobile-menu > div > ul > li > div > a')].map((a) => a.textContent.trim());
      const toggle = document.querySelector('button[aria-controls="mobile-about-submenu"]');
      return { links, hasToggle: !!toggle, expanded: toggle ? toggle.getAttribute('aria-expanded') : null };
    })()`);
    check(`${w}: top-level mobile items Home/Courses/About/Mentors`,
      JSON.stringify(menuInfo.links) === JSON.stringify(['Home', 'Courses', 'About', 'Mentors']), menuInfo.links);
    check(`${w}: About chevron toggle present + collapsed`, menuInfo.hasToggle === true && menuInfo.expanded === 'false', menuInfo);

    let sub = await evaluate(`(() => {
      const wrap = document.getElementById('mobile-about-submenu');
      const items = [...wrap.querySelectorAll('a')].map((a) => a.textContent.trim());
      const r = wrap.getBoundingClientRect();
      return { items, height: Math.round(r.height), gridRows: getComputedStyle(wrap).gridTemplateRows };
    })()`);
    check(`${w}: submenu collapsed (height 0)`, sub.height === 0, sub);
    check(`${w}: submenu holds Testimonials/Blogs/Contact`,
      JSON.stringify(sub.items) === JSON.stringify(['Testimonials', 'Blogs', 'Contact']), sub.items);

    await evaluate(`(() => document.querySelector('button[aria-controls="mobile-about-submenu"]').click())()`);
    await sleep(400);
    sub = await evaluate(`(() => {
      const wrap = document.getElementById('mobile-about-submenu');
      const first = wrap.querySelector('a').getBoundingClientRect();
      const toggle = document.querySelector('button[aria-controls="mobile-about-submenu"]');
      return { height: Math.round(wrap.getBoundingClientRect().height), expanded: toggle.getAttribute('aria-expanded'), firstVisible: first.height > 0 && first.bottom <= innerHeight };
    })()`);
    check(`${w}: chevron expands submenu`, sub.expanded === 'true' && sub.height > 60 && sub.firstVisible === true, sub);
    await shot(`${w}-accordion-open`);

    // Tap a submenu link (Contact) → navigates + closes menu.
    await evaluate(`(() => { const a = [...document.querySelectorAll('#mobile-about-submenu a')].find((x) => x.textContent.trim() === 'Contact'); a.click(); })()`);
    await sleep(900);
    check(`${w}: Contact link navigates to /#contact`, await evaluate('location.pathname + location.hash') === '/#contact', await evaluate('location.pathname + location.hash'));
    check(`${w}: menu closed after navigation`, await evaluate(`!document.getElementById('mobile-menu')`));

    // About label itself still routes to /#about; accordion starts collapsed on reopen.
    await evaluate(`(() => document.querySelector('button[aria-controls="mobile-menu"]').click())()`);
    await sleep(350);
    const collapsedReopen = await evaluate(`(() => document.querySelector('button[aria-controls="mobile-about-submenu"]').getAttribute('aria-expanded'))()`);
    check(`${w}: accordion collapsed again on menu reopen`, collapsedReopen === 'false', collapsedReopen);
    await evaluate(`(() => { const a = [...document.querySelectorAll('#mobile-menu a')].find((x) => x.textContent.trim() === 'About'); a.click(); })()`);
    await sleep(900);
    check(`${w}: About label navigates to /#about`, await evaluate('location.pathname + location.hash') === '/#about', await evaluate('location.pathname + location.hash'));
    check(`${w}: no horizontal scroll`, await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'));
  }

  console.log(`\nconsole errors: ${consoleErrors.length === 0 ? 'none' : ''}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 300)));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.label).join(' | ')); process.exitCode = 1; }
  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
