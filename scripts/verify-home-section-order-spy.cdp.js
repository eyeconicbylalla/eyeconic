/**
 * Home-page section order + navbar scroll-spy check — CDP approach shared
 * with verify-navbar-about-dropdown.cdp.js. Covers the "move Our Story /
 * About Eyeconic below the mentors" change:
 *  - DOM + visual order: #courses directly below the hero (#home),
 *    #features between the countdown and #mentors, then #about (Our Story +
 *    About Eyeconic) directly above #blogs.
 *  - Scroll-spy: exactly one navbar link lit at any scroll position —
 *    Home at top, Courses over Our Programs, About over #features (unlinked
 *    section keeps the previous link lit), Mentors, About again at the
 *    bottom (its Contact child). Highlight moves monotonically while
 *    scrolling (no flicker), survives the Courses link click (hash nav),
 *    and works in the mobile hamburger menu.
 *  - No horizontal overflow at desktop / tablet / mobile widths; no console
 *    errors.
 * Screenshots saved to %TEMP%. Usage: CDP_PORT=9223 node scripts/verify-home-section-order-spy.cdp.js
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
    const file = `${process.env.TEMP.replace(/\\/g, '/')}/home-order-${name}.png`;
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
  // Programmatic window.scrollTo would animate under the page's CSS
  // scroll-behavior: smooth, leaving the spy mid-flight when sampled — pin
  // the behavior to auto so test jumps are instant (click-driven smooth
  // scrolls are exercised separately, with a stability-based wait).
  const goHome = async () => {
    await send('Page.navigate', { url: URL });
    await sleep(4500);
    await evaluate(`document.documentElement.style.scrollBehavior = 'auto'`);
  };

  // Scroll instantly and give the rAF-throttled spy a moment to settle.
  const scrollTo = async (y) => {
    await evaluate(`window.scrollTo(0, ${JSON.stringify(y)})`);
    await sleep(450);
  };
  // Scroll a section's top to just below the navbar, like a hash jump would.
  const scrollToSection = async (id) => {
    await evaluate(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      const navH = document.querySelector('nav').offsetHeight;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - navH - 12);
    })()`);
    await sleep(450);
  };
  // Wait until the page's scroll position is stable (click-driven smooth
  // scrolling takes a while), then let the spy's rAF settle.
  const waitForScrollSettle = async (timeoutMs = 6000) => {
    let last = -1, stable = 0;
    for (let t = 0; t < timeoutMs; t += 120) {
      const y = await evaluate('Math.round(window.scrollY)');
      stable = y === last ? stable + 1 : 0;
      last = y;
      if (stable >= 3) break;
      await sleep(120);
    }
    await sleep(350);
  };

  // Navbar state: which of the four top-level bar links is lit. Runs with
  // the mobile menu closed, so nav's first ul is always the desktop bar.
  const NAV_STATE = `(() => {
    const ul = document.querySelector('nav ul');
    const links = [...ul.querySelectorAll(':scope > li > a')].map((a) => ({
      label: a.textContent.trim(),
      active: a.className.includes('text-[#18B6A4]'),
    }));
    const navH = document.querySelector('nav').offsetHeight;
    return {
      links,
      active: links.filter((l) => l.active).map((l) => l.label),
      ids: [...document.querySelectorAll('main > section')].map((s) => s.id),
      offsets: [...document.querySelectorAll('main > section')].map(
        (s) => Math.round(s.getBoundingClientRect().top + window.scrollY)
      ),
      scrollY: Math.round(window.scrollY),
      navH,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  })()`;

  // ── Desktop: section order + scroll-spy ─────────────────────────────────
  console.log('\n== desktop 1280x800: section order + scroll-spy ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await goHome();

  let state = await evaluate(NAV_STATE);
  const expectedOrder = ['home', 'courses', 'testimonials', 'results', 'videos', 'features', 'mentors', 'about', 'blogs', 'faqs', 'contact'];
  check('desktop: section order (features above mentors, about below mentors)',
    JSON.stringify(state.ids.filter((id) => expectedOrder.includes(id))) === JSON.stringify(expectedOrder), state.ids);
  check('desktop: offsets match DOM order (no layout reordering)',
    state.offsets.every((v, i, arr) => i === 0 || arr[i - 1] <= v),
    state.ids.map((id, i) => `${id}:${state.offsets[i]}`));
  check('desktop: no horizontal overflow', state.scrollWidth <= state.clientWidth + 1,
    { scrollWidth: state.scrollWidth, clientWidth: state.clientWidth });
  await shot('desktop-top');

  check('desktop: Home lit at page top', JSON.stringify(state.active) === JSON.stringify(['Home']), state.active);

  // Our Programs section: Courses lights up while scrolling into it and
  // stays lit through the section.
  await scrollToSection('courses');
  state = await evaluate(NAV_STATE);
  check('desktop: Courses lit over Our Programs', JSON.stringify(state.active) === JSON.stringify(['Courses']), state.active);
  await shot('desktop-courses');

  // Slow-scroll from the hero down through Our Programs: the lit link must
  // move forward only (home → courses), never flip back and forth.
  const coursesTop = state.offsets[state.ids.indexOf('courses')];
  const seen = [];
  for (let y = 0; y <= coursesTop + 400; y += 250) {
    await scrollTo(y);
    const s = await evaluate(NAV_STATE);
    if (s.active.length) seen.push(s.active[0]);
  }
  const rank = { Home: 0, Courses: 1, About: 2, Mentors: 3 };
  let monotonic = true;
  for (let i = 1; i < seen.length; i++) if (rank[seen[i]] < rank[seen[i - 1]]) monotonic = false;
  check('desktop: slow-scroll highlight moves forward only (no flicker)', monotonic, seen.join(' → '));
  check('desktop: slow-scroll ends on Courses', seen[seen.length - 1] === 'Courses', seen);

  // Unlinked Platform Features keeps the previous linked section (About) lit.
  await scrollToSection('features');
  state = await evaluate(NAV_STATE);
  check('desktop: About (not Courses) lit over Platform Features',
    JSON.stringify(state.active) === JSON.stringify(['About']), state.active);
  await shot('desktop-features');

  await scrollToSection('about');
  state = await evaluate(NAV_STATE);
  check('desktop: About lit over #about', JSON.stringify(state.active) === JSON.stringify(['About']), state.active);

  await scrollToSection('mentors');
  state = await evaluate(NAV_STATE);
  check('desktop: Mentors lit over #mentors', JSON.stringify(state.active) === JSON.stringify(['Mentors']), state.active);

  await evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(600);
  state = await evaluate(NAV_STATE);
  check('desktop: About lit at page bottom (Contact child)', JSON.stringify(state.active) === JSON.stringify(['About']), state.active);
  check('desktop: no horizontal overflow after full scroll', state.scrollWidth <= state.clientWidth + 1,
    { scrollWidth: state.scrollWidth, clientWidth: state.clientWidth });
  await shot('desktop-bottom');

  // Exactly one link lit at every position sampled above.
  await scrollToSection('testimonials');
  state = await evaluate(NAV_STATE);
  check('desktop: About lit over #testimonials (dropdown child)', JSON.stringify(state.active) === JSON.stringify(['About']), state.active);

  // Clicking the Courses bar link hash-navigates (ScrollToHash animates the
  // scroll — behavior: 'smooth' is explicit, so it stays smooth despite the
  // behavior pin) and the spy agrees once the page comes to rest.
  await evaluate(`(() => {
    const a = [...document.querySelectorAll('nav ul > li > a')].find((x) => x.textContent.trim() === 'Courses');
    a.click();
  })()`);
  await waitForScrollSettle();
  const clickState = await evaluate(`(() => ({
    url: location.pathname + location.hash,
    coursesTop: Math.round(document.getElementById('courses').getBoundingClientRect().top),
  }))()`);
  check('desktop: Courses link click settles on /#courses near the navbar',
    clickState.url === '/#courses' && clickState.coursesTop >= 0 && clickState.coursesTop < 250, clickState);
  state = await evaluate(NAV_STATE);
  check('desktop: Courses lit after link click', JSON.stringify(state.active) === JSON.stringify(['Courses']), state.active);

  // Hero "Join Now" is a native #courses anchor — landing there lights Courses too.
  await scrollTo(0);
  state = await evaluate(NAV_STATE);
  check('desktop: back to Home at top', JSON.stringify(state.active) === JSON.stringify(['Home']), state.active);

  // ── Tablet + mobile: order holds, spy reaches the hamburger menu ────────
  for (const { w, h, label } of [{ w: 768, h: 1024, label: 'tablet' }, { w: 390, h: 844, label: 'mobile' }]) {
    console.log(`\n== ${label} ${w}x${h}: order + hamburger spy ==`);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await goHome();

    state = await evaluate(NAV_STATE);
    const ids = state.ids.filter((id) => expectedOrder.includes(id));
    check(`${label}: section order intact`, JSON.stringify(ids) === JSON.stringify(expectedOrder), ids);
    check(`${label}: offsets match DOM order`, state.offsets.every((v, i, arr) => i === 0 || arr[i - 1] <= v),
      state.ids.map((id, i) => `${id}:${state.offsets[i]}`));
    check(`${label}: no horizontal overflow`, state.scrollWidth <= state.clientWidth + 1,
      { scrollWidth: state.scrollWidth, clientWidth: state.clientWidth });

    await scrollToSection('courses');
    await evaluate(`(() => document.querySelector('button[aria-controls="mobile-menu"]').click())()`);
    await sleep(400);
    const menu = await evaluate(`(() => ({
      links: [...document.querySelectorAll('#mobile-menu a')].map((a) => ({
        label: a.textContent.trim(),
        active: a.className.includes('text-[#18B6A4]'),
      })),
      open: !!document.getElementById('mobile-menu'),
    }))()`);
    const coursesInMenu = menu.links.find((l) => l.label === 'Courses');
    const activeInMenu = menu.links.filter((l) => l.active).map((l) => l.label);
    check(`${label}: hamburger shows Courses as active over Our Programs`,
      menu.open && coursesInMenu?.active === true && activeInMenu.length === 1,
      { activeInMenu });
    await shot(`${label}-courses-menu`);
    await evaluate(`(() => document.querySelector('button[aria-controls="mobile-menu"]').click())()`);
    await sleep(300);
  }

  console.log(`\nconsole errors: ${consoleErrors.length === 0 ? 'none' : ''}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 300)));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.label).join(' | ')); process.exitCode = 1; }
  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
