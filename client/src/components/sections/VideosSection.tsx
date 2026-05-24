import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';

const VIDEO_IDS = [
  'SfASmUVGwrY',
  '4EaC7Qhfvio',
  'yiBGw4blgGw',
  '-fXYOYeR-LI',
  '-TRLYEmIWYc',
  'eWWLhr5II8s',
  'ns9tdtDMp1I',
  'YY1a8YUbdDI',
  'VSMcB8vngic',
  'kHTeefkcK98',
];

interface VideoMeta {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
}

function youtubeThumbnail(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

async function fetchVideoMeta(videoId: string): Promise<Omit<VideoMeta, 'id'>> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Metadata fetch failed');
    const data = await res.json();
    return {
      title: data.title as string,
      thumbnail: (data.thumbnail_url as string) || youtubeThumbnail(videoId),
      url,
    };
  } catch {
    return {
      title: 'Watch on Eyeconic',
      thumbnail: youtubeThumbnail(videoId),
      url,
    };
  }
}

const VideosSection: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [videos, setVideos] = useState<VideoMeta[]>(
    VIDEO_IDS.map((id) => ({
      id,
      title: 'Loading…',
      thumbnail: youtubeThumbnail(id),
      url: `https://www.youtube.com/watch?v=${id}`,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const count = videos.length;

  const scrollToIndex = useCallback((index: number) => {
    const next = ((index % count) + count) % count;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const card = viewport.querySelector<HTMLElement>(`[data-video-index="${next}"]`);
    if (card) {
      const scrollOffset = card.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
      viewport.scrollTo({ left: scrollOffset, behavior: 'smooth' });
    }
    setActiveIndex(next);
  }, [count]);

  useEffect(() => {
    if (!playingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playingId]);

  useEffect(() => {
    let cancelled = false;

    async function loadVideos() {
      const results = await Promise.all(
        VIDEO_IDS.map(async (id) => {
          const meta = await fetchVideoMeta(id);
          return { id, ...meta };
        })
      );

      if (!cancelled) {
        setVideos(results);
        setLoading(false);
      }
    }

    loadVideos();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const cards = viewport.querySelectorAll<HTMLElement>('[data-video-card]');
    if (!cards.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]) {
          const idx = Number(visible[0].target.getAttribute('data-video-index'));
          if (!Number.isNaN(idx)) setActiveIndex(idx);
        }
      },
      { root: viewport, threshold: [0.35, 0.5, 0.65] }
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [videos]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const card = viewport.querySelector<HTMLElement>('[data-video-index="0"]');
    if (card) {
      const scrollOffset = card.getBoundingClientRect().left - viewport.getBoundingClientRect().left + viewport.scrollLeft;
      viewport.scrollTo({ left: scrollOffset });
    }
  }, [videos]);

  const goPrev = () => scrollToIndex(activeIndex - 1);
  const goNext = () => scrollToIndex(activeIndex + 1);
  const openVideo = (videoId: string) => setPlayingId(videoId);
  const closeVideo = () => setPlayingId(null);

  return (
    <>
      <section id="videos" className="bg-white py-16 md:py-20">
        <div className="container mx-auto px-4">
          <motion.div
            className="section-title mb-10 md:mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="mb-4 text-3xl font-bold text-blue-900 md:text-4xl">
              Stories from Our Students
            </h2>
            <p className="mx-auto max-w-3xl text-lg text-gray-700">
              Real journeys, real results — hear directly from aspirants who trained with Eyeconic.
            </p>
          </motion.div>
        </div>

        <div className="video-scroll" role="region" aria-label="Student story videos">
          <button
            type="button"
            className="video-scroll__nav video-scroll__nav--prev"
            onClick={goPrev}
            aria-label="Previous video"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>

          <div ref={viewportRef} className="video-scroll__viewport">
            <div className="video-scroll__track">
              {videos.map((video, index) => (
                <article
                  key={video.id}
                  data-video-card
                  data-video-index={index}
                  data-centered={index === activeIndex}
                  className="video-scroll__card"
                  onClick={() => openVideo(video.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openVideo(video.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play: ${video.title}`}
                >
                  <div className="video-scroll__thumb">
                    <img
                      src={video.thumbnail}
                      alt={loading ? '' : video.title}
                      loading="lazy"
                      draggable={false}
                    />
                    <span className="video-scroll__play" aria-hidden>
                      <Play className="h-6 w-6 fill-current" />
                    </span>
                  </div>
                  <div className="video-scroll__meta">
                    <p className="video-scroll__title">{loading ? 'Loading…' : video.title}</p>
                    <span className="video-scroll__label">YouTube</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="video-scroll__nav video-scroll__nav--next"
            onClick={goNext}
            aria-label="Next video"
          >
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
        </div>

        <div className="container mx-auto px-4">
          <div className="mt-6 flex justify-center gap-2" role="tablist" aria-label="Select video">
            {videos.map((video, index) => (
              <button
                key={video.id}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={video.title}
                onClick={() => scrollToIndex(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === activeIndex ? 'w-6 bg-teal-500' : 'w-2 bg-gray-300 hover:bg-teal-300'
                }`}
              />
            ))}
          </div>

          <p className="mt-4 text-center text-sm text-gray-500">
            {activeIndex + 1} of {count} — swipe or use arrows, then tap a card to play
          </p>
        </div>
      </section>

      {playingId && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Video player"
          onClick={closeVideo}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={closeVideo}
              className="absolute -top-12 right-0 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Close video"
            >
              <X className="h-5 w-5" />
            </button>
            <motion.div
              className="overflow-hidden rounded-xl border border-teal-200 bg-black shadow-2xl"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div className="relative aspect-video w-full">
                <iframe
                  src={`https://www.youtube.com/embed/${playingId}?autoplay=1&rel=0`}
                  title="YouTube video player"
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </>
  );
};

export default VideosSection;
