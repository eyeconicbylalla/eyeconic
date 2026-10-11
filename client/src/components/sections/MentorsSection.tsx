import React, { useCallback, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import mentor1 from '../../assets/1.webp';
import mentor2 from '../../assets/2.webp';
import mentor3 from '../../assets/3.webp';
import mentor4 from '../../assets/4.webp';
import mentor5 from '../../assets/5.webp';
import mentor6 from '../../assets/6.webp';
import mentor7 from '../../assets/7.webp';

const mentors = [
  { id: 'jwalant', name: 'Dr. Jwalant Chag', image: mentor1 },
  { id: 'lalla', name: 'Dr. Gourav Lalla', image: mentor2 },
  { id: 'vanshika', name: 'Dr. Vanshika Arora', image: mentor3 },
  { id: 'michelle', name: 'Dr. Michelle', image: mentor4 },
  { id: 'ravina', name: 'Dr. Ravina Tilwani', image: mentor5 },
  { id: 'vishwas', name: 'Dr. Vishwas Arora', image: mentor6 },
  { id: 'sarthak', name: 'Dr. Sarthak Rathi', image: mentor7 },
];

// A swipe only counts when the horizontal drag clears this threshold and
// clearly dominates the vertical one (vertical motion stays native scroll).
const SWIPE_THRESHOLD_PX = 40;
const SWIPE_DOMINANCE = 1.5;

const MentorsSection: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const count = mentors.length;

  const trackRef = useRef<HTMLDivElement>(null);
  const inView = useInView(trackRef, { once: true, amount: 0.25 });
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const goTo = useCallback(
    (index: number) => {
      setActiveIndex(((index % count) + count) % count);
    },
    [count]
  );

  const goPrev = () => goTo(activeIndex - 1);
  const goNext = () => goTo(activeIndex + 1);

  // Arrow/Home/End anywhere inside the region (events bubble up from cards
  // and buttons). Modifiers are left to the browser — Alt+ArrowLeft is Back.
  const onRegionKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    let target: number | null = null;
    if (e.key === 'ArrowRight') target = activeIndex + 1;
    else if (e.key === 'ArrowLeft') target = activeIndex - 1;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = count - 1;
    if (target === null) return;
    e.preventDefault();
    goTo(target);
    cardRefs.current[((target % count) + count) % count]?.focus();
  };

  // Touch swipe: fires at most once per gesture; the click a swipe produces
  // is swallowed in the capture phase so it can't also select a card.
  const onPointerDown = (e: React.PointerEvent) => {
    suppressClick.current = false;
    if (e.pointerType === 'mouse') return;
    swipeStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = swipeStart.current;
    if (!start || suppressClick.current) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_DOMINANCE) {
      suppressClick.current = true;
      if (dx > 0) goPrev();
      else goNext();
    }
  };
  const onPointerEnd = () => {
    swipeStart.current = null;
  };
  const onTrackClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  };

  return (
    <section id="mentors" className="relative overflow-x-clip bg-[#101720] py-20">
      {/* Ambient top glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: '400px',
          background:
            'radial-gradient(ellipse 55% 55% at 50% -5%, rgba(24,182,164,0.07) 0%, transparent 80%)',
        }}
      />

      <div className="container relative z-10 mx-auto px-4">
        <div className="mb-12 text-center md:mb-14">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-5 flex justify-center"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
              style={{
                background: 'rgba(24,182,164,0.1)',
                border: '1px solid rgba(24,182,164,0.22)',
                color: '#18B6A4',
                letterSpacing: '0.13em',
              }}
            >
              Our Mentors
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.07 }}
            className="mb-4 text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl"
          >
            Meet the{' '}
            <span
              style={{
                backgroundImage: 'linear-gradient(135deg, #18B6A4 0%, #4DD7C8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Mentors
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.14 }}
            className="mx-auto max-w-3xl text-[15px] leading-relaxed md:text-[16px]"
            style={{ color: '#6B7E93' }}
          >
            Behind every successful NEET PG aspirant is a team of dedicated mentors.
            Meet the experts who will guide you through your journey.
          </motion.p>
        </div>

        <div
          className="mentor-carousel"
          role="region"
          aria-label="Mentor profiles carousel"
          onKeyDown={onRegionKeyDown}
        >
          <button
            type="button"
            className="mentor-carousel__nav"
            onClick={goPrev}
            aria-label="Previous mentor"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>

          <div
            className="mentor-carousel__track"
            ref={trackRef}
            data-inview={inView ? 'true' : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onClickCapture={onTrackClickCapture}
          >
            {mentors.map((mentor, index) => {
              const isActive = index === activeIndex;
              return (
                <div
                  key={mentor.id}
                  ref={(el) => {
                    cardRefs.current[index] = el;
                  }}
                  className="mentor-carousel__card"
                  data-active={isActive}
                  role="button"
                  tabIndex={isActive ? -1 : 0}
                  aria-label={isActive ? `${mentor.name}, selected` : `View ${mentor.name}`}
                  aria-pressed={isActive}
                  onClick={() => !isActive && goTo(index)}
                  onKeyDown={(e) => {
                    if (!isActive && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      goTo(index);
                    }
                  }}
                >
                  <img
                    src={mentor.image}
                    alt={mentor.name}
                    draggable={false}
                    width={1080}
                    height={1350}
                    decoding="async"
                    loading={index < 2 ? 'eager' : 'lazy'}
                    onLoad={(e) => e.currentTarget.classList.add('loaded')}
                  />
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="mentor-carousel__nav"
            onClick={goNext}
            aria-label="Next mentor"
          >
            <ChevronRight className="h-6 w-6" aria-hidden />
          </button>
        </div>

        {/* Desktop: segmented progress bars */}
        <div
          className="mt-5 hidden justify-center gap-2 md:flex"
          role="tablist"
          aria-label="Select mentor"
        >
          {mentors.map((mentor, index) => (
            <button
              key={mentor.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={mentor.name}
              onClick={() => goTo(index)}
              className={`mentor-carousel__bar${
                index === activeIndex ? ' mentor-carousel__bar--active' : ''
              }`}
            />
          ))}
        </div>

        {/* Mobile: dot tabs */}
        <div className="mt-5 flex justify-center gap-2 md:hidden" role="tablist" aria-label="Select mentor">
          {mentors.map((mentor, index) => (
            <button
              key={mentor.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={mentor.name}
              onClick={() => goTo(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === activeIndex ? 'w-6 bg-[#18B6A4]' : 'w-2 bg-[#263445] hover:bg-[#1CC8B5]'
              }`}
            />
          ))}
        </div>

        <p className="sr-only" aria-live="polite">
          {`${mentors[activeIndex].name}. ${activeIndex + 1} of ${count}.`}
        </p>
      </div>
    </section>
  );
};

export default MentorsSection;
