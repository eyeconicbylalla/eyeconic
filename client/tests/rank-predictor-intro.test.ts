import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TUNING,
  INTRO_CLIP_ASPECT,
  INTRO_SAFE_MARGINS,
  completionDeadlineMs,
  decideTransitionStart,
  getConnectionHint,
  introSafeFitSize,
  isPlainActivation,
  prefersReducedMotion,
  shouldPrefetchIntro,
  warmIntroVideo,
} from '../src/lib/rankPredictorIntro.ts';

const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

test('isPlainActivation accepts only unmodified primary clicks', () => {
  assert.equal(isPlainActivation(plain), true);
  // keyboard-synthesized clicks also report button 0 and no modifiers
  assert.equal(isPlainActivation({ ...plain, button: 0 }), true);
  // middle (1) and right (2) buttons must keep native anchor behaviour
  assert.equal(isPlainActivation({ ...plain, button: 1 }), false);
  assert.equal(isPlainActivation({ ...plain, button: 2 }), false);
  // every modifier opens/downloads in a new context — never animate those
  for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
    assert.equal(isPlainActivation({ ...plain, [modifier]: true }), false, modifier);
  }
});

test('decideTransitionStart: duplicate clicks are ignored, reduced motion navigates now', () => {
  assert.equal(decideTransitionStart({ active: false, reducedMotion: false }), 'start');
  assert.equal(decideTransitionStart({ active: false, reducedMotion: true }), 'navigate-now');
  assert.equal(decideTransitionStart({ active: true, reducedMotion: false }), 'ignore');
  // an in-flight transition wins over reduced motion too — no double navigation
  assert.equal(decideTransitionStart({ active: true, reducedMotion: true }), 'ignore');
});

test('completionDeadlineMs is derived from the clip duration plus a small grace', () => {
  const tuning = { ...DEFAULT_TUNING, completionGraceMs: 1500, unknownDurationCapMs: 8000 };
  assert.equal(completionDeadlineMs(6.9, tuning), 6900 + 1500);
  assert.equal(completionDeadlineMs(0.2, tuning), 200 + 1500);
  // fractional milliseconds round up so `ended` can never lose a race with the cap
  assert.equal(completionDeadlineMs(6.9001, tuning), 6901 + 1500);
  // metadata never arrived / not playable values
  for (const bad of [null, undefined, NaN, Infinity, 0, -3]) {
    assert.equal(completionDeadlineMs(bad as number | null | undefined, tuning), 8000, String(bad));
  }
  // the defaults themselves stay sane
  assert.ok(DEFAULT_TUNING.readyTimeoutMs > 0 && DEFAULT_TUNING.completionGraceMs > 0);
  assert.ok(DEFAULT_TUNING.unknownDurationCapMs > DEFAULT_TUNING.readyTimeoutMs);
});

test('shouldPrefetchIntro defers to reduced motion, saveData and 2g-class networks', () => {
  assert.equal(shouldPrefetchIntro({ reducedMotion: false }), true);
  assert.equal(shouldPrefetchIntro({ reducedMotion: false, connection: undefined }), true);
  assert.equal(shouldPrefetchIntro({ reducedMotion: true }), false);
  assert.equal(shouldPrefetchIntro({ reducedMotion: true, connection: { effectiveType: '4g' } }), false);
  assert.equal(shouldPrefetchIntro({ reducedMotion: false, connection: { saveData: true } }), false);
  assert.equal(shouldPrefetchIntro({ reducedMotion: false, connection: { saveData: true, effectiveType: '4g' } }), false);
  assert.equal(shouldPrefetchIntro({ reducedMotion: false, connection: { effectiveType: 'slow-2g' } }), false);
  assert.equal(shouldPrefetchIntro({ reducedMotion: false, connection: { effectiveType: '2g' } }), false);
  assert.equal(shouldPrefetchIntro({ reducedMotion: false, connection: { effectiveType: '3g' } }), true);
  assert.equal(shouldPrefetchIntro({ reducedMotion: false, connection: { effectiveType: '4g' } }), true);
  // missing effectiveType is treated as capable, not as slow
  assert.equal(shouldPrefetchIntro({ reducedMotion: false, connection: { saveData: false } }), true);
});

test('prefersReducedMotion is null-safe and reads live query state', () => {
  assert.equal(prefersReducedMotion(null), false);
  assert.equal(prefersReducedMotion(undefined), false);
  assert.equal(prefersReducedMotion({ matches: false }), false);
  assert.equal(prefersReducedMotion({ matches: true }), true);
});

test('getConnectionHint surfaces the connection hint when present', () => {
  assert.deepEqual(getConnectionHint({ connection: { effectiveType: '3g' } }), { effectiveType: '3g' });
  assert.equal(getConnectionHint({}), undefined);
  assert.equal(getConnectionHint(undefined), undefined); // Node navigator has no connection
});

test('warmIntroVideo buffers the clip exactly once per page load', () => {
  const created: Array<{ muted: boolean; preload: string; src: string; loads: number }> = [];
  const fakeDocument = {
    createElement: () => {
      const element = {
        muted: false,
        preload: '',
        src: '',
        loads: 0,
        load() {
          this.loads += 1;
        },
      };
      created.push(element);
      return element;
    },
  } as unknown as Document;
  const globals = globalThis as { document?: Document };
  const hadDocument = 'document' in globals;
  globals.document = fakeDocument;
  try {
    warmIntroVideo('/assets/rank-predictor-intro.mp4');
    warmIntroVideo('/assets/rank-predictor-intro.mp4'); // second call must be a no-op
    warmIntroVideo('/some-other-url.mp4'); // so must any later call

    assert.equal(created.length, 1, 'only one element may be created');
    assert.equal(created[0].loads, 1, 'load() runs once');
    assert.equal(created[0].muted, true);
    assert.equal(created[0].preload, 'auto');
    assert.equal(created[0].src, '/assets/rank-predictor-intro.mp4');
  } finally {
    if (hadDocument) delete globals.document;
  }
});

// introSafeFitSize mirrors the presentation CSS (RankPredictorIntro.css) —
// these tests pin the "cover as much as the safe area allows" contract that
// keeps the clip's corner text visible on every viewport shape.
const REPRESENTATIVE_VIEWPORTS: Array<[number, number]> = [
  [1920, 1080], // desktop fullscreen, exact 16:9
  [1920, 950],  // desktop with browser chrome (~2:1)
  [1366, 768],  // laptop
  [1366, 621],  // small laptop with chrome
  [1024, 768],  // tablet landscape (4:3)
  [844, 390],   // phone landscape
  [390, 844],   // phone portrait
  [360, 800],   // narrow phone portrait
  [2560, 1080], // ultrawide-ish
  [1536, 864],  // 125% zoom on 1920×1080
];

test('introSafeFitSize never shrinks below contain and always keeps the clip aspect', () => {
  for (const [vw, vh] of REPRESENTATIVE_VIEWPORTS) {
    const { width, height } = introSafeFitSize(vw, vh);
    const containWidth = Math.min(vw, vh * INTRO_CLIP_ASPECT);
    assert.ok(
      width >= containWidth - 1e-6,
      `${vw}x${vh}: width ${width} is below contain size ${containWidth}`,
    );
    assert.ok(
      Math.abs(width / height - INTRO_CLIP_ASPECT) < 1e-9,
      `${vw}x${vh}: aspect drift ${width / height}`,
    );
  }
});

test('introSafeFitSize never crops past the measured safe margins', () => {
  const horizontalBudget = INTRO_SAFE_MARGINS.left + INTRO_SAFE_MARGINS.right;
  const verticalBudget = INTRO_SAFE_MARGINS.top + INTRO_SAFE_MARGINS.bottom;
  for (const [vw, vh] of REPRESENTATIVE_VIEWPORTS) {
    const { width, height } = introSafeFitSize(vw, vh);
    // total crop per axis (letterbox is negative crop)
    const cropX = width - vw;
    const cropY = height - vh;
    assert.ok(
      cropX <= horizontalBudget * width + 1,
      `${vw}x${vh}: side crop ${cropX} exceeds safe budget ${horizontalBudget * width}`,
    );
    assert.ok(
      cropY <= verticalBudget * height + 1,
      `${vw}x${vh}: top/bottom crop ${cropY} exceeds safe budget ${verticalBudget * height}`,
    );
  }
});

test('introSafeFitSize goes full-bleed on near-16:9 aspects and letterboxes only on extremes', () => {
  // aspects close enough to 16:9 for the safe margins to bridge: fully covered
  for (const [vw, vh] of [[1920, 1080], [1920, 1000], [1600, 900], [1440, 780], [1366, 720]] as Array<[number, number]>) {
    const { width, height } = introSafeFitSize(vw, vh);
    assert.ok(width >= vw - 1e-6 && height >= vh - 1e-6, `${vw}x${vh}: expected full cover`);
  }
  // phone portrait: the safe box spans the width exactly; the height's
  // letterbox is filled by the blurred twin in the component
  const portrait = introSafeFitSize(390, 844);
  assert.ok(portrait.width >= 390 && portrait.width * (1 - INTRO_SAFE_MARGINS.left - INTRO_SAFE_MARGINS.right) <= 390 + 1e-6);
  assert.ok(portrait.height < 844);
});

test('INTRO_SAFE_MARGINS stay clear of the clip\'s measured text clearances', () => {
  // measured from the clip's frames (px on 1920×1080): nearest text sits
  // 88/95/72/82px from the left/right/top/bottom edges
  assert.ok(INTRO_SAFE_MARGINS.left * 1920 <= 88 - 15);
  assert.ok(INTRO_SAFE_MARGINS.right * 1920 <= 95 - 15);
  assert.ok(INTRO_SAFE_MARGINS.top * 1080 <= 72 - 10);
  assert.ok(INTRO_SAFE_MARGINS.bottom * 1080 <= 82 - 10);
  // margins are fractions of their own axis and leave a usable safe box
  assert.ok(INTRO_SAFE_MARGINS.left + INTRO_SAFE_MARGINS.right < 0.1);
  assert.ok(INTRO_SAFE_MARGINS.top + INTRO_SAFE_MARGINS.bottom < 0.15);
});
