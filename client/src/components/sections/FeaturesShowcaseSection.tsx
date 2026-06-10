import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn } from 'lucide-react';

// Eagerly load every image inside assets/Website Features
const imageModules = import.meta.glob(
  '../../assets/Website Features/*.{png,jpg,jpeg,webp}',
  { eager: true }
) as Record<string, { default: string }>;

interface FeatureImage {
  src: string;
  title: string;
}

const featureImages: FeatureImage[] = Object.entries(imageModules)
  .map(([path, mod]) => {
    const fileName = path.split('/').pop() ?? '';
    const title = fileName.replace(/\.(png|jpe?g|webp)$/i, '');
    return { src: mod.default, title };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

// Row-span pattern per card (controls height in the CSS grid)
// Each grid row = 72px. rowSpan * 72px = card height.
// We use colSpan=2 sparingly to create Framer's wide-card accents.
const CARD_SPANS: { row: number; col: number }[] = [
  { row: 3, col: 1 }, // Accountability            — medium tall
  { row: 2, col: 1 }, // Custom Modules            — short
  { row: 4, col: 1 }, // Daily To-Do               — tall
  { row: 3, col: 2 }, // GT Analysis               — wide + medium tall  ★
  { row: 3, col: 1 }, // GT Data Review            — medium tall
  { row: 2, col: 1 }, // High-Yield-Topics         — short
  { row: 4, col: 1 }, // INICET Mock Tests         — tall
  { row: 3, col: 1 }, // Major and Minor           — medium tall
  { row: 2, col: 1 }, // MyNotebook Tracker        — short
  { row: 4, col: 2 }, // Normal-Daily-Tasks        — wide + tall          ★
  { row: 3, col: 1 }, // Psych Sessions            — medium tall
  { row: 2, col: 1 }, // Weakzone Heatmap          — short
  { row: 4, col: 1 }, // You vs Your Competition   — tall
];

// ── Lightbox ──────────────────────────────────────────────────────────────────
const Lightbox: React.FC<{
  image: FeatureImage | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}> = ({ image, onClose, onPrev, onNext }) => {
  useEffect(() => {
    if (!image) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [image, onClose, onPrev, onNext]);

  return (
    <AnimatePresence>
      {image && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(4,7,12,0.94)', backdropFilter: 'blur(20px)' }}
          onClick={onClose}
        >
          {/* Close button */}
          <button
            aria-label="Close"
            onClick={onClose}
            className="absolute top-5 right-5 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#fff')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)')}
          >
            <X size={14} />
            Close
          </button>

          {/* Prev */}
          <button
            aria-label="Previous"
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-11 h-11 rounded-full text-2xl transition-colors"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#fff')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)')}
          >
            ‹
          </button>

          {/* Next */}
          <button
            aria-label="Next"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-11 h-11 rounded-full text-2xl transition-colors"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#fff')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)')}
          >
            ›
          </button>

          <motion.div
            key={image.src}
            initial={{ scale: 0.94, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="relative max-w-5xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={image.src}
              alt={image.title}
              className="w-full max-h-[80vh] object-contain rounded-2xl"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
                background: '#0B1018',
              }}
            />
            <p className="mt-4 text-center text-white/60 text-sm font-medium tracking-wide">
              {image.title}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Gallery Card ──────────────────────────────────────────────────────────────
const GalleryCard: React.FC<{
  img: FeatureImage;
  index: number;
  rowSpan: number;
  colSpan: number;
  onClick: () => void;
}> = ({ img, index, rowSpan, colSpan, onClick }) => {
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{
        duration: 0.5,
        delay: (index % 6) * 0.055,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{
        gridRow: `span ${rowSpan}`,
        gridColumn: `span ${colSpan}`,
      }}
    >
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={`View ${img.title}`}
        className="relative block w-full h-full focus:outline-none overflow-hidden"
        style={{
          borderRadius: '12px',
          border: `1px solid ${hovered ? 'rgba(24,182,164,0.28)' : 'rgba(255,255,255,0.07)'}`,
          background: '#0B1018',
          boxShadow: hovered
            ? '0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(24,182,164,0.12)'
            : '0 2px 6px rgba(0,0,0,0.5)',
          transform: hovered ? 'translateY(-3px) scale(1.008)' : 'translateY(0) scale(1)',
          transition: 'border-color 280ms ease, box-shadow 280ms ease, transform 280ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Shimmer placeholder */}
        {!loaded && (
          <div
            className="absolute inset-0"
            style={{
              borderRadius: '11px',
              background: 'linear-gradient(90deg, #0B1018 25%, #131C28 50%, #0B1018 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.6s infinite',
            }}
          />
        )}

        <img
          src={img.src}
          alt={img.title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '11px',
            opacity: loaded ? 1 : 0,
            transform: hovered ? 'scale(1.04)' : 'scale(1)',
            transition: 'opacity 350ms ease, transform 480ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />

        {/* Hover overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '11px',
            background:
              'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 45%, transparent 100%)',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 280ms ease',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            padding: '12px',
          }}
        >
          {/* Zoom icon top-right */}
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ZoomIn size={13} color="#fff" />
          </div>

          {/* Title bottom-left */}
          <span
            style={{
              alignSelf: 'flex-start',
              color: '#fff',
              fontSize: '11.5px',
              fontWeight: 600,
              letterSpacing: '0.01em',
              lineHeight: 1.35,
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              maxWidth: '90%',
            }}
          >
            {img.title}
          </span>
        </div>
      </button>
    </motion.div>
  );
};

// ── Main Section ──────────────────────────────────────────────────────────────
const FeaturesShowcaseSection: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handlePrev = () => {
    if (selectedIndex === null) return;
    setSelectedIndex((selectedIndex - 1 + featureImages.length) % featureImages.length);
  };

  const handleNext = () => {
    if (selectedIndex === null) return;
    setSelectedIndex((selectedIndex + 1) % featureImages.length);
  };

  return (
    <section
      id="features"
      className="relative overflow-hidden"
      style={{ background: '#080C11', paddingTop: '96px', paddingBottom: '96px' }}
    >
      {/* Top radial glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: '340px',
          background:
            'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(24,182,164,0.07) 0%, transparent 80%)',
        }}
      />

      <Lightbox
        image={selectedIndex !== null ? featureImages[selectedIndex] : null}
        onClose={() => setSelectedIndex(null)}
        onPrev={handlePrev}
        onNext={handleNext}
      />

      <div className="relative container mx-auto px-4 sm:px-6">
        {/* ── Heading ── */}
        <div className="max-w-xl mx-auto text-center mb-14">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center mb-5"
          >
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase"
              style={{
                background: 'rgba(24,182,164,0.1)',
                border: '1px solid rgba(24,182,164,0.22)',
                color: '#18B6A4',
                letterSpacing: '0.13em',
              }}
            >
              Platform Preview
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.07 }}
            className="text-[2.15rem] md:text-[2.6rem] font-bold text-white leading-tight tracking-tight"
          >
            Everything you need,{' '}
            <span
              style={{
                backgroundImage: 'linear-gradient(135deg, #18B6A4 0%, #4DD7C8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              built in
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.14 }}
            className="mt-4 text-[#6B7E93] text-base md:text-[17px] leading-relaxed"
          >
            A closer look at everything inside Eyeconic Mentorship — dashboards, analytics,
            trackers and tools built to keep your NEET&nbsp;PG prep on target.
          </motion.p>
        </div>

        {/* ── Framer-style dense grid ── */}
        {/* 
          Key technique: CSS Grid with auto-rows of fixed height (72px).
          Each card gets row-span (height) + col-span (width) from CARD_SPANS.
          This produces the Framer gallery's organic, packed, non-uniform layout.
          Gap is just 5px to keep cards visually tight like Framer.
        */}
        <div
          className="features-framer-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridAutoRows: '72px',
            gap: '5px',
          }}
        >
          {featureImages.map((img, index) => {
            const spans = CARD_SPANS[index] ?? { row: 3, col: 1 };
            return (
              <GalleryCard
                key={img.src}
                img={img}
                index={index}
                rowSpan={spans.row}
                colSpan={spans.col}
                onClick={() => setSelectedIndex(index)}
              />
            );
          })}
        </div>

        {/* Hint */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mt-9 text-center text-xs font-medium"
          style={{ color: '#3A4A5A', letterSpacing: '0.03em' }}
        >
          Click any card to explore in full detail →
        </motion.p>
      </div>
    </section>
  );
};

export default FeaturesShowcaseSection;
