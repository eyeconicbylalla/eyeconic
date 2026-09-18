/**
 * Website → App deep links (custom scheme `mentorship://`).
 *
 * The Expo app registers these hosts (app.json intentFilters) and routes
 * them in app/_layout.tsx. A custom scheme needs no domain verification;
 * when the app is not installed the browser simply stays on this page,
 * which already shows the same content — the link is an enhancement, never
 * a dependency.
 */

export const APP_SCHEME = 'mentorship';

export type AppDestination =
  | { screen: 'dashboard' }
  | { screen: 'tests' }
  | { screen: 'quiz'; quizId: string };

export function buildAppUrl(destination: AppDestination): string {
  switch (destination.screen) {
    case 'dashboard':
      return `${APP_SCHEME}://dashboard`;
    case 'tests':
      return `${APP_SCHEME}://quizzes`;
    case 'quiz':
      return `${APP_SCHEME}://quizzes/${destination.quizId}`;
    default:
      return `${APP_SCHEME}://dashboard`;
  }
}

/**
 * Try to open the app. Custom schemes give no reliable success signal, so we
 * fire-and-forget and hint the user if the page is still visible shortly
 * after (app-not-installed case). Returns whether we opened something.
 */
export function openInApp(destination: AppDestination, onFallback?: () => void): void {
  const url = buildAppUrl(destination);
  const fallbackTimer = window.setTimeout(() => {
    // Still here and visible? The app almost certainly didn't open.
    if (!document.hidden) {
      onFallback?.();
    }
  }, 1500);

  const cleanup = () => window.clearTimeout(fallbackTimer);

  window.addEventListener('pagehide', cleanup, { once: true });
  window.addEventListener('blur', cleanup, { once: true });

  window.location.href = url;
}

/** True when the current environment can plausibly open a custom scheme. */
export function canOpenAppLinks(): boolean {
  if (typeof window === 'undefined') return false;
  const isAndroid = /android/i.test(window.navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  return isAndroid || isIOS;
}
