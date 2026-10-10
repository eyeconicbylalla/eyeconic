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

/** Reads `prefers-reduced-motion` off a matchMedia query (null-safe for
 *  environments without matchMedia). */
export function prefersReducedMotion(query: { matches: boolean } | null | undefined): boolean {
  return query !== null && query !== undefined && query.matches;
}

/** Reads navigator.connection without depending on its non-standard typings. */
export function getConnectionHint(nav?: { connection?: ConnectionHint }): ConnectionHint | undefined {
  const target = nav ?? (typeof navigator === 'undefined' ? undefined : (navigator as { connection?: ConnectionHint }));
  return target?.connection;
}

let introWarmed = false;

/**
 * Starts buffering the intro clip into the browser's media cache — once per
 * page load, off-DOM — so the click-to-play transition can begin without a
 * visible stall. Idempotent and cheap to call from idle/hover/focus paths.
 */
export function warmIntroVideo(url: string): void {
  if (introWarmed) return;
  introWarmed = true;
  if (typeof document === 'undefined') return;
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  video.load();
}
