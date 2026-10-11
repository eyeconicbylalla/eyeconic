/**
 * "Our Programs" (CoursesSection) polish verification — CDP approach shared
 * with verify-mentors-polish.cdp.js. Covers the 2026-10-11 polish pass:
 *  - Header: eyebrow pill + gradient "Programs" + muted paragraph, section
 *    aria-labelledby, section still 2nd on the page (scroll-spy anchor intact).
 *  - Cards: 3 poster cards, WebP images at ≤720px with width/height/lazy/
 *    decoding attrs, .loaded shimmer removal, aspect 3/4 CLS-free box, CTA
 *    uses the .btn-primary gradient (flat override gone), distinct per-batch
 *    aria-labels, sr-only per-card headings.
 *  - Hover (real mouse): poster scale 1.03, card translateY(-4px); all
 *    :hover rules statically gated by min-width 768px + hover:hover.
 *  - Keyboard: real Tab keypresses reach each card link with the global
 *    2px teal focus-visible ring.
 *  - Anchor: navbar Courses click settles /#courses below the navbar.
 *  - Mobile 390x844: single column, max-w-sm cap, ratio 3/4, no overflow.
 *  - Reduced motion: no card transform (fade-only reveal), transitions
 *    collapsed, spotlight rule statically requires no-preference.
 *  - Payload: three .webp posters, no .png; zero console errors.
 * Screenshots saved to %TEMP%. Usage: CDP_PORT=9224 node scripts/verify-programs-polish.cdp.js
 */
const fs = require('fs');

const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`;
const URL = process.env.VERIFY_URL || 'http://localhost:5173/';
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSccHeq1gUBguz8MYr4JGFzYFlsZeHCOsEq2BQ6g1chlvmkIuQ/viewform';
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
    const file = `${process.env.TEMP.replace(/\\/g, '/')}/programs-polish-${name}.png`;
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    console.log(`  screenshot: ${file}`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // Raise the resource-timing buffer so the late-loading lazy posters are
  // still visible in the payload check (dev serves every module as a request).
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'performance.setResourceTimingBufferSize(2000);',
  });

  const results = [];
  const check = (label, ok, detail) => {
    results.push({ label, ok });
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` → ${JSON.stringify(detail)}`}`);
  };
  const goHome = async () => {
    await send('Page.navigate', { url: URL });
    await sleep(4500);
    await evaluate(`document.documentElement.style.scrollBehavior = 'auto'`);
  };
  const scrollToSection = async () => {
    await evaluate(`(() => {
      const el = document.getElementById('courses');
      const navH = document.querySelector('nav').offsetHeight;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - navH - 12);
    })()`);
    await sleep(450);
  };
  const pressTab = () =>
    send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 })
      .then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 }));

  // ── Desktop 1280x800 ────────────────────────────────────────────────────
  console.log('\n== desktop 1280x800: header, cards, images, hover, keyboard ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await goHome();

  let state = await evaluate(`(() => ({
    ids: [...document.querySelectorAll('main > section')].map((s) => s.id),
    labelledBy: document.getElementById('courses')?.getAttribute('aria-labelledby'),
    titleExists: !!document.getElementById('courses-title'),
    eyebrow: [...document.querySelectorAll('#courses span')].some((s) => s.textContent.trim() === 'NEET PG Mentorship'),
    gradientWord: (() => {
      const span = [...document.querySelectorAll('#courses h2 span')][0];
      return span
        ? getComputedStyle(span).webkitTextFillColor === 'rgba(0, 0, 0, 0)' || getComputedStyle(span).color === 'rgba(0, 0, 0, 0)'
        : false;
    })(),
    mutedColor: (() => {
      const p = document.querySelector('#courses h2')?.parentElement?.querySelector('p');
      return p ? getComputedStyle(p).color : null;
    })(),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))()`);
  check('desktop: #courses is the 2nd section (anchor position intact)', state.ids[1] === 'courses', state.ids);
  check('desktop: section aria-labelledby + #courses-title present',
    state.labelledBy === 'courses-title' && state.titleExists, state);
  check('desktop: eyebrow pill "NEET PG Mentorship" present', state.eyebrow);
  check('desktop: gradient word in heading', state.gradientWord);
  check('desktop: muted paragraph color #6B7E93', state.mutedColor === 'rgb(107, 126, 147)', state.mutedColor);
  check('desktop: no horizontal overflow', state.scrollWidth <= state.clientWidth + 1,
    { scrollWidth: state.scrollWidth, clientWidth: state.clientWidth });

  await scrollToSection();
  await sleep(1200);

  state = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.course-card')];
    const imgs = [...document.querySelectorAll('.course-card__poster img')];
    const ctas = [...document.querySelectorAll('.course-card__cta')];
    return {
      cardCount: cards.length,
      srHeadings: [...document.querySelectorAll('.course-card h3')].map((h) => ({
        srOnly: h.className.includes('sr-only'),
        w: getComputedStyle(h).width,
      })),
      imgs: imgs.map((i) => ({
        src: (i.currentSrc || i.src).split('/').pop().split('?')[0],
        naturalW: i.naturalWidth,
        naturalH: i.naturalHeight,
        ratio: i.naturalWidth && i.naturalHeight ? +(i.naturalWidth / i.naturalHeight).toFixed(3) : 0,
        width: i.getAttribute('width'),
        height: i.getAttribute('height'),
        loading: i.getAttribute('loading'),
        decoding: i.getAttribute('decoding'),
        loaded: i.complete && i.classList.contains('loaded'),
      })),
      posterAspect: (() => {
        const p = document.querySelector('.course-card__poster');
        return p ? getComputedStyle(p).aspectRatio : null;
      })(),
      ctaHrefs: ctas.map((a) => a.getAttribute('href')),
      ctaTarget: ctas.map((a) => a.getAttribute('target')),
      ctaRel: ctas.map((a) => a.getAttribute('rel')),
      ctaLabels: ctas.map((a) => a.getAttribute('aria-label')),
      ctaBg: ctas[0] ? getComputedStyle(ctas[0]).backgroundImage : null,
      ctaHasBtnPrimary: ctas.every((a) => a.className.includes('btn-primary')),
    };
  })()`);
  check('desktop: exactly 3 cards', state.cardCount === 3, state.cardCount);
  check('desktop: 3 sr-only card headings (invisible structure)',
    state.srHeadings.length === 3 && state.srHeadings.every((h) => h.srOnly && h.w === '1px'), state.srHeadings);
  check('desktop: images served as WebP at ≤720px, ratio 3/4',
    state.imgs.length === 3 && state.imgs.every((i) =>
      i.src.endsWith('.webp') && i.naturalW <= 720 && Math.abs(i.ratio - 0.75) <= 0.01), state.imgs);
  check('desktop: intrinsic width/height + lazy + async decoding attrs',
    state.imgs.every((i) => i.width === '720' && i.height === '960' && i.loading === 'lazy' && i.decoding === 'async'), state.imgs);
  check('desktop: images loaded and shimmer removed (.loaded)',
    state.imgs.every((i) => i.loaded), state.imgs);
  check('desktop: poster wrapper aspect-ratio 3/4 (CLS-free box)', state.posterAspect === '3 / 4', state.posterAspect);
  check('desktop: CTAs point at the same Google Form in a new tab',
    state.ctaHrefs.every((h) => h === FORM_URL) &&
    state.ctaTarget.every((t) => t === '_blank') && state.ctaRel.every((r) => /noopener/.test(r) && /noreferrer/.test(r)), state.ctaHrefs);
  check('desktop: distinct per-batch aria-labels',
    new Set(state.ctaLabels).size === 3 && ['36', '37', '38'].every((n) => state.ctaLabels.some((l) => l.includes(n))), state.ctaLabels);
  check('desktop: CTA uses .btn-primary gradient (flat override gone)',
    state.ctaHasBtnPrimary && /^linear-gradient/.test(state.ctaBg || ''), state.ctaBg);

  // CLS proxy: poster box height must not shift once metadata/layout settles.
  const h1 = await evaluate(`document.querySelector('.course-card__poster').getBoundingClientRect().height`);
  await sleep(1200);
  const h2 = await evaluate(`document.querySelector('.course-card__poster').getBoundingClientRect().height`);
  check('desktop: poster box height stable across 1200ms (no CLS)', Math.abs(h1 - h2) <= 1, { h1, h2 });
  await shot('desktop-section');

  // Hover on the first card (real Input-domain hover).
  const hoverPt = await evaluate(`(() => {
    const r = document.querySelectorAll('.course-card')[0].getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverPt.x, y: hoverPt.y, button: 'none' });
  await sleep(500);
  const hover = await evaluate(`(() => {
    const card = document.querySelectorAll('.course-card')[0];
    const img = card.querySelector('.course-card__poster img');
    const cta = card.querySelector('.course-card__cta');
    const ctaSvg = cta.querySelector('svg');
    const m = (el) => { const t = getComputedStyle(el).transform; return t === 'none' ? null : new DOMMatrix(t); };
    const cardM = m(card);
    const imgM = m(img);
    const svgM = m(ctaSvg);
    return {
      cardY: cardM ? cardM.f : 0,
      imgScale: imgM ? imgM.a : 1,
      svgX: svgM ? svgM.e : 0,
      spotlightVar: card.style.getPropertyValue('--mx') !== '' || card.style.getPropertyValue('--my') !== '',
      ctaShadow: getComputedStyle(cta).boxShadow,
    };
  })()`);
  check('desktop: hover lifts the card (translateY(-4px))', Math.abs(hover.cardY + 4) <= 0.5, hover);
  check('desktop: hover zooms the poster (scale 1.03)', Math.abs(hover.imgScale - 1.03) <= 0.005, hover);
  check('desktop: hover slides the CTA arrow (+3px)', Math.abs(hover.svgX - 3) <= 0.5, hover);
  check('desktop: spotlight vars track the pointer', hover.spotlightVar, hover);
  check('desktop: hover brightens the CTA (glow shadow)', /24, 182, 164/.test(hover.ctaShadow), hover.ctaShadow);
  await shot('desktop-hover');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0, button: 'none' });

  // Touch-safety, asserted statically (hover:none emulation is ignored by
  // this headless Edge build): every .course-card:hover rule must live inside
  // a media requiring min-width 768px AND hover:hover.
  const gate = await evaluate(`(() => {
    const hit = [];
    // NB: with native CSS nesting every CSSStyleRule has a truthy (empty)
    // cssRules list — check selectorText first or no rule is ever seen.
    const walk = (rules, media) => {
      for (const r of rules) {
        if (r.selectorText && r.selectorText.includes('.course-card:hover')) {
          hit.push({ selector: r.selectorText, media: media || null });
        }
        if (r.cssRules && r.cssRules.length) {
          walk(r.cssRules, media || (r.media ? r.media.mediaText : null));
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules, null); } catch (e) { /* cross-origin sheet */ }
    }
    return hit;
  })()`);
  check('desktop: every :hover rule gated by min-width 768px + hover:hover (no sticky hover on touch)',
    gate.length >= 4 && gate.every((g) => /min-width:\s*768px/.test(g.media) && /hover:\s*hover/.test(g.media)), gate);

  // Keyboard: real Tab keypresses must reach each card link with the global
  // focus-visible ring (programmatic .focus() does not trigger :focus-visible
  // reliably in Chromium).
  await evaluate(`document.body.focus()`);
  const seenLinks = new Set();
  let ringOk = true;
  let ringDetail = null;
  for (let i = 0; i < 45 && seenLinks.size < 3; i++) {
    await pressTab();
    await sleep(60);
    const focusState = await evaluate(`(() => {
      const el = document.activeElement;
      if (!el || !el.closest || !el.closest('#courses') || el.tagName !== 'A') return null;
      const cs = getComputedStyle(el);
      return {
        label: el.getAttribute('aria-label'),
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        outlineColor: cs.outlineColor,
      };
    })()`);
    if (focusState) {
      seenLinks.add(focusState.label);
      if (focusState.outlineStyle !== 'solid' || focusState.outlineWidth !== '2px') {
        ringOk = false;
        ringDetail = focusState;
      }
    }
  }
  check('desktop: Tab reaches all 3 card links', seenLinks.size === 3, [...seenLinks]);
  check('desktop: focused links show the 2px teal focus-visible ring',
    ringOk && (!ringDetail || ringDetail.outlineColor === 'rgb(24, 182, 164)'), ringDetail);

  // Navbar Courses click settles /#courses below the navbar.
  await evaluate(`(() => {
    const link = [...document.querySelectorAll('nav a')].find((a) => a.textContent.trim() === 'Courses');
    link.click();
  })()`);
  await sleep(1600);
  const anchor = await evaluate(`(() => ({
    hash: location.hash,
    top: Math.round(document.getElementById('courses').getBoundingClientRect().top),
  }))()`);
  check('desktop: navbar Courses click settles /#courses near the navbar',
    anchor.hash === '#courses' && anchor.top >= 0 && anchor.top < 250, anchor);

  // ── Mobile 390x844 ──────────────────────────────────────────────────────
  console.log('\n== mobile 390x844: single column, width cap, no overflow ==');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }] });
  await goHome();
  await scrollToSection();
  await sleep(1200);
  const mobile = await evaluate(`(() => {
    const grid = document.querySelector('#courses .grid');
    const cards = [...document.querySelectorAll('.course-card')];
    const imgs = [...document.querySelectorAll('.course-card__poster img')];
    return {
      cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      cardW: cards.map((c) => c.offsetWidth),
      ratio: +(imgs[0].offsetWidth / imgs[0].offsetHeight).toFixed(3),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  })()`);
  check('mobile: single column', mobile.cols === 1, mobile.cols);
  check('mobile: cards capped at max-w-sm (≤ 386px)', mobile.cardW.every((w) => w <= 386), mobile.cardW);
  check('mobile: poster ratio 3/4', Math.abs(mobile.ratio - 0.75) <= 0.02, mobile.ratio);
  check('mobile: no horizontal overflow', mobile.scrollWidth <= mobile.clientWidth + 1, mobile);
  await shot('mobile-section');

  // ── Reduced motion ──────────────────────────────────────────────────────
  console.log('\n== reduced motion (desktop 1280x800) ==');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await goHome();
  await scrollToSection();
  await sleep(300);
  const rmEarly = await evaluate(`(() => {
    const card = document.querySelector('.course-card');
    return { transform: getComputedStyle(card).transform };
  })()`);
  check('reduced: card entrance has no transform (fade-only reveal)', rmEarly.transform === 'none', rmEarly);
  await sleep(900);
  const rm = await evaluate(`(() => {
    const card = document.querySelector('.course-card');
    const img = card.querySelector('.course-card__poster img');
    const cta = card.querySelector('.course-card__cta');
    return {
      opacity: getComputedStyle(card.parentElement).opacity,
      cardTransition: getComputedStyle(card).transitionDuration,
      imgTransition: getComputedStyle(img).transitionDuration,
      ctaTransition: getComputedStyle(cta).transitionDuration,
    };
  })()`);
  check('reduced: card settles to full opacity', rm.opacity === '1', rm);
  check('reduced: transitions collapsed (≤ 0.011s)',
    parseFloat(rm.cardTransition) <= 0.011 && parseFloat(rm.imgTransition) <= 0.011 && parseFloat(rm.ctaTransition) <= 0.011, rm);
  await shot('reduced-desktop');

  // Spotlight must statically require prefers-reduced-motion: no-preference.
  const spotGate = await evaluate(`(() => {
    const hit = [];
    const walk = (rules, media) => {
      for (const r of rules) {
        if (r.selectorText && r.selectorText.includes('.course-card:hover::before')) {
          hit.push(media || null);
        }
        if (r.cssRules && r.cssRules.length) {
          walk(r.cssRules, media || (r.media ? r.media.mediaText : null));
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules, null); } catch (e) { /* cross-origin sheet */ }
    }
    return hit;
  })()`);
  check('reduced: spotlight gated by prefers-reduced-motion: no-preference',
    spotGate.length === 1 && /prefers-reduced-motion:\s*no-preference/.test(spotGate[0]), spotGate);

  await send('Emulation.setEmulatedMedia', { features: [] });

  // ── Payload + console ───────────────────────────────────────────────────
  const payload = await evaluate(`(() => {
    const rows = performance.getEntriesByType('resource')
      .filter((r) => /assets\\/3[678]\\.[a-z]+/.test(r.name))
      .map((r) => ({ name: r.name.split('/').pop().split('?')[0] }));
    return { names: [...new Set(rows.map((r) => r.name))].sort() };
  })()`);
  const webpAll = ['36.webp', '37.webp', '38.webp'].every((n) => payload.names.includes(n));
  const noPng = !payload.names.some((name) => /^3[678]\.png$/.test(name));
  console.log(`  poster assets: ${payload.names.join(', ')}`);
  check('payload: all 3 posters served as WebP, no PNG', webpAll && noPng, payload.names);

  console.log(`\nconsole errors: ${consoleErrors.length === 0 ? 'none' : ''}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 300)));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.label).join(' | ')); process.exitCode = 1; }
  ws.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
