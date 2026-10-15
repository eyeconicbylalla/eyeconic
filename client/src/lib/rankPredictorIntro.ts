/**
 * Rank Predictor entry-transition policy — pure decisions with no DOM access
 * at import time, so client/tests/rank-predictor-intro.test.ts can run them
 * under plain `node --test` with zero test dependencies.
 *
 * The split keeps the failure-prone parts of the flourish (duplicate clicks,
 * reduced motion, slow networks, mid-playback stalls) as small checkable
 * rules, while components/app/RankPredictorIntro.tsx owns rendering and
 * media events, and Dashboard.tsx owns the trigger.
 */

/** Timing policy for one transition playback. */
export interface TransitionTuning {
  /** Grace period for the clip to become playable before giving up on the
   *  flourish and navigating anyway — a stalling network must never trap the
   *  student behind a stuck overlay. */
  readyTimeoutMs: number;
  /** Slack added on top of the clip's real duration: `ended` must fire within
   *  it or we navigate regardless (covers mid-playback stalls). */
  completionGraceMs: number;
  /** Absolute cap for the deadline when duration metadata is missing/non-finite. */
  unknownDurationCapMs: number;
}

export const DEFAULT_TUNING: TransitionTuning = {
  readyTimeoutMs: 2500,
  completionGraceMs: 1500,
  unknownDurationCapMs: 8000,
};

/** Intrinsic aspect ratio of the intro clip (1920×1080). */
export const INTRO_CLIP_ASPECT = 16 / 9;

/** Intrinsic aspect ratio of the mobile portrait intro clip (1080×1920). */
export const INTRO_MOBILE_CLIP_ASPECT = 9 / 16;

/**
 * Composition safe area of the intro clip — how far presentation may crop
 * into the 1920×1080 frame from each edge before it reaches readable
 * text/branding. Measured from the clip's own frames (2026-10-10): the
 * nearest text sits 88px/95px from the left/right edges (4.6%/4.9% of
 * width) and 72px/82px from the top/bottom edges (6.7%/7.6% of height);
 * the decorative corner brackets come closer (≈48–65px) and may crop.
 * Each margin keeps a ≈20px buffer below the nearest text.
 */
export const INTRO_SAFE_MARGINS = {
  left: 0.035,
  right: 0.035,
  top: 0.055,
  bottom: 0.065,
} as const;

/**
 * Same measurement for the mobile portrait clip (2026-10-15): nearest
 * readable text sits 52px/53px from the left/right edges (≈4.8%/4.9% of
 * width) and 101px/98px from the top/bottom edges (≈5.3%/5.1% of height).
 * Decorative elements — a horizontal streak reaching the left edge, a
 * large background wordmark that drifts through the frame mid-animation
 * (clipped by the clip's own composition at t≈2.2s/6.2s), dim light beams
 * along the top — come closer and may crop, exactly like the landscape
 * clip's brackets/glow. Margins are symmetric, so the portrait clip stays
 * plain-centred (no shift needed).
 */
export const INTRO_MOBILE_SAFE_MARGINS = {
  left: 0.032,
  right: 0.032,
  top: 0.041,
  bottom: 0.041,
} as const;

export interface IntroSafeMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Media query selecting the portrait clip: below the md breakpoint the
 * site's own styling already treats as mobile (Tailwind's md = 768px; see
 * the `@media (max-width: 767px)` block in index.css). Width-only on
 * purpose: a landscape phone (e.g. 844×390) is wider than 768px and keeps
 * the landscape clip, which presents correctly there — the portrait clip
 * would letterbox badly on a wide viewport.
 */
export const INTRO_MOBILE_QUERY = '(max-width: 767px)';

/** Which of the two intro clips a click will play. */
export type IntroOrientation = 'landscape' | 'portrait';

export interface IntroClips {
  landscape: string;
  portrait: string;
}

export interface IntroClip {
  url: string;
  orientation: IntroOrientation;
}

/**
 * The clip a Rank Predictor click should play for the current viewport.
 * One mapping used by both the prefetch warm-up and the click itself, so
 * the warmed clip and the played clip can never disagree.
 */
export function pickIntroClip(clips: IntroClips, mobile: boolean): IntroClip {
  return mobile
    ? { url: clips.portrait, orientation: 'portrait' }
    : { url: clips.landscape, orientation: 'landscape' };
}

/** True when a matchMedia query exists and currently matches — the shared
 *  null-safe read behind the semantic predicates below (null-safe for
 *  environments without matchMedia). */
function queryMatches(query: { matches: boolean } | null | undefined): boolean {
  return query !== null && query !== undefined && query.matches;
}

/** Reads the mobile-clip media query. */
export function isMobileIntroViewport(query: { matches: boolean } | null | undefined): boolean {
  return queryMatches(query);
}

/**
 * Displayed size of the intro clip for a given overlay size — the exact
 * formula the component's CSS evaluates in the browser (see
 * RankPredictorIntro.css): "cover as much as the safe area allows".
 *
 * The result is never smaller than plain contain (letterbox only when the
 * viewport's aspect is too far from 16:9 for even the safe margins to
 * bridge — the blurred twin fills those bands) and never crops past
 * INTRO_SAFE_MARGINS. CSS owns runtime sizing so resizes/orientation
 * changes re-resolve without JS; this mirror exists to pin that contract
 * under `node --test`.
 */
export function introSafeFitSize(
  viewportWidth: number,
  viewportHeight: number,
  opts: { clipAspect?: number; margins?: Partial<IntroSafeMargins> } = {},
): { width: number; height: number } {
  const aspect = opts.clipAspect ?? INTRO_CLIP_ASPECT;
  const margins: IntroSafeMargins = { ...INTRO_SAFE_MARGINS, ...opts.margins };
  const safeWidthFraction = 1 - margins.left - margins.right;
  const safeHeightFraction = 1 - margins.top - margins.bottom;
  const coverWidth = Math.max(viewportWidth, viewportHeight * aspect);
  const safeCapWidth = Math.min(
    viewportWidth / safeWidthFraction,
    (viewportHeight * aspect) / safeHeightFraction,
  );
  const width = Math.min(coverWidth, safeCapWidth);
  return { width, height: width / aspect };
}

/**
 * The MouseEvent fields that decide whether an anchor's onClick is a plain
 * activation (unmodified left click / Enter / Space). Everything else —
 * middle click, ⌘/Ctrl-click (new tab), Shift-click (new window),
 * Alt-click (download) — must fall through to the browser's native link
 * behaviour so the dashboard button keeps working like a real link.
 */
export interface ActivationSignal {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function isPlainActivation(signal: ActivationSignal): boolean {
  return (
    signal.button === 0 &&
    !signal.metaKey &&
    !signal.ctrlKey &&
    !signal.shiftKey &&
    !signal.altKey
  );
}

/** What a Rank Predictor click should do: play the intro ('start'), skip the
 *  flourish for reduced-motion students ('navigate-now'), or swallow the
 *  click entirely while a transition is already running ('ignore'). */
export type TransitionDecision = 'start' | 'navigate-now' | 'ignore';

export function decideTransitionStart(opts: { active: boolean; reducedMotion: boolean }): TransitionDecision {
  if (opts.active) return 'ignore';
  if (opts.reducedMotion) return 'navigate-now';
  return 'start';
}

/**
 * Absolute deadline (ms from the moment playback starts) after which the
 * overlay navigates even if `ended` never fired. Derived from the clip's
 * actual duration so normal playback is never cut short.
 */
export function completionDeadlineMs(
  durationSeconds: number | null | undefined,
  tuning: TransitionTuning = DEFAULT_TUNING,
): number {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return tuning.unknownDurationCapMs;
  }
  return Math.ceil(durationSeconds * 1000) + tuning.completionGraceMs;
}

/** Subset of (non-standard) NetworkInformation the prefetch policy reads. */
export interface ConnectionHint {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Whether the intro clip may be buffered speculatively. Reduced-motion
 * students never see it; metered (saveData) and 2g-class connections skip
 * the background download and simply stream on click.
 */
export function shouldPrefetchIntro(opts: { reducedMotion: boolean; connection?: ConnectionHint }): boolean {
  if (opts.reducedMotion) return false;
  const connection = opts.connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  const type = connection.effectiveType ?? '4g';
  return type !== 'slow-2g' && type !== '2g';
}

/** Reads `prefers-reduced-motion` off a matchMedia query. */
export function prefersReducedMotion(query: { matches: boolean } | null | undefined): boolean {
  return queryMatches(query);
}

/** Reads navigator.connection without depending on its non-standard typings. */
export function getConnectionHint(nav?: { connection?: ConnectionHint }): ConnectionHint | undefined {
  const target = nav ?? (typeof navigator === 'undefined' ? undefined : (navigator as { connection?: ConnectionHint }));
  return target?.connection;
}

const introWarmedUrls = new Set<string>();

/**
 * Starts buffering an intro clip into the browser's media cache — once per
 * clip per page load, off-DOM — so the click-to-play transition can begin
 * without a visible stall. Single-flight is per URL: after a resize/rotate
 * across the mobile breakpoint the now-relevant clip deserves its own warm
 * load, while repeat calls for the same clip stay free. Idempotent and
 * cheap to call from idle/hover/focus paths.
 */
export function warmIntroVideo(url: string): void {
  if (introWarmedUrls.has(url)) return;
  introWarmedUrls.add(url);
  if (typeof document === 'undefined') return;
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  video.load();
}
