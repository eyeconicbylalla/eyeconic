import React, { useEffect, useRef, useState } from 'react';
import { completionDeadlineMs, DEFAULT_TUNING } from '../../lib/rankPredictorIntro';

interface RankPredictorIntroProps {
  videoUrl: string;
  /** Called exactly once when the transition is over — playback finished or a
   *  fallback fired. The parent navigates to /predictor in response. */
  onComplete: () => void;
}

/** Grace before the standby cue may appear (see showStandby) — warm starts
 *  never show it, so the moment feels like an app transition, not a player. */
const STANDBY_DELAY_MS = 700;

/**
 * Full-screen entry flourish for the Rank & Branch Predictor, played on the
 * Student Dashboard's explicit click (never on route changes).
 *
 * The clip plays once, muted, inline and full-bleed (object-cover) over an
 * opaque #0A0F14 base — the same tone as the page background and the clip's
 * own edges, so the takeover reads as one continuous fullscreen motion with
 * no letterboxed "video rectangle" on any aspect ratio. Navigation
 * happens on the real `ended` event; every failure path (decode error,
 * autoplay rejection, slow buffering, mid-playback stall) resolves to the
 * same onComplete, so the student always lands on /predictor and is never
 * trapped behind a stuck overlay.
 */
const RankPredictorIntro: React.FC<RankPredictorIntroProps> = ({ videoUrl, onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shown, setShown] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Stand-in cue appears only if playback is unusually slow to start — a
  // warm start shows nothing between the dashboard and the animation, so
  // nothing about the moment reads as "media loading".
  const [showStandby, setShowStandby] = useState(false);

  // Enter with a quick fade from the page background so the takeover doesn't
  // pop; the clip's opening frames share the same tone, so it reads as one
  // continuous motion rather than a hard cut.
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setShown(true));
    const standbyTimer = window.setTimeout(() => setShowStandby(true), STANDBY_DELAY_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(standbyTimer);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let finished = false;
    let readyTimer: number | undefined;
    let capTimer: number | undefined;

    const clearReadyTimer = () => {
      if (readyTimer !== undefined) {
        window.clearTimeout(readyTimer);
        readyTimer = undefined;
      }
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      clearReadyTimer();
      if (capTimer !== undefined) window.clearTimeout(capTimer);
      onComplete();
    };

    // Fallback 1 — the clip must become playable quickly; on a network too
    // slow for that, give up on the flourish and just navigate.
    readyTimer = window.setTimeout(finish, DEFAULT_TUNING.readyTimeoutMs);

    const onEnded = () => finish();
    const onError = () => finish();
    const onCanPlay = () => clearReadyTimer();
    const onPlaying = () => {
      clearReadyTimer();
      setPlaying(true);
      // Fallback 2 — absolute deadline from the clip's real duration so a
      // mid-playback stall can never wedge the overlay open.
      if (capTimer === undefined) {
        capTimer = window.setTimeout(finish, completionDeadlineMs(video.duration));
      }
    };

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    // Playback is initiated from the click's user-activation chain; muted +
    // playsInline keep it within every mobile browser's autoplay policy.
    const playback = video.play();
    if (playback) playback.catch(() => finish());

    // Freeze the page behind the overlay so wheel/touch input can't scroll
    // the dashboard underneath during the takeover. Both <html> and <body>:
    // on classic-scrollbar platforms only <html> owns the scrollbar, and a
    // surviving gutter next to the overlay would break the full-bleed look.
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      // Unmount is either the completed navigation (finish already ran) or
      // the student leaving mid-transition — never navigate after that.
      finished = true;
      clearReadyTimer();
      if (capTimer !== undefined) window.clearTimeout(capTimer);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      video.pause();
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [videoUrl, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[60] bg-[#0A0F14] overflow-hidden transition-opacity duration-300 ease-out ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
      role="status"
      aria-label="Opening the Rank Predictor"
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* Full-bleed cover, not contain: the clip's own edges are a uniform
          dark tone, so scaling them past the viewport removes any trace of a
          letterboxed "video rectangle" — the motion simply owns the screen. */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        aria-hidden="true"
      />
      {/* Stand-in while the first frames buffer (delayed — see STANDBY_DELAY_MS);
          fades out the moment playback begins. */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
          playing || !showStandby ? 'opacity-0' : 'opacity-100'
        }`}
        aria-hidden="true"
      >
        <div className="w-10 h-10 rounded-full border-2 border-[#18B6A4]/60 border-t-transparent animate-spin" />
      </div>
    </div>
  );
};

export default RankPredictorIntro;
