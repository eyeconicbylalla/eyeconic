import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, X } from 'lucide-react';

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
  const [videos, setVideos] = useState<VideoMeta[]>(
    VIDEO_IDS.map((id) => ({
      id,
      title: 'Loading…',
      thumbnail: youtubeThumbnail(id),
      url: `https://www.youtube.com/watch?v=${id}`,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const marqueeVideos = [...videos, ...videos];

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

  const openVideo = (videoId: string) => setPlayingId(videoId);
  const closeVideo = () => setPlayingId(null);

  return (
    <>
      <section id="videos" className="bg-[#0A0F14] py-16 md:py-20">
        <div className="container mx-auto px-4">
          <motion.div
            className="section-title mb-10 md:mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
              Preparing for NEET PG or INICET?
            </h2>
            <p className="mx-auto max-w-3xl text-lg text-[#CBD5E1]">
              Here are some golden videos you absolutely CAN NOT MISS!
            </p>
          </motion.div>
        </div>

        <div className="video-scroll video-marquee" role="region" aria-label="Student story videos">
          <div className="video-scroll__viewport">
            <div className="video-scroll__track">
              {marqueeVideos.map((video, index) => (
                <article
                  key={`${video.id}-${index}`}
                  data-video-card
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
        </div>

      </section>

      {playingId && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
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
              className="overflow-hidden rounded-xl border border-white/[0.08] bg-black shadow-2xl"
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
