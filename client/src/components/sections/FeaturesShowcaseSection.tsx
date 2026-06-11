import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Feature data ──────────────────────────────────────────────────────────────
// Each feature maps to one of the real screenshots in assets/Website Features
const imageModules = import.meta.glob(
  '../../assets/Website Features/*.{png,jpg,jpeg,webp}',
  { eager: true }
) as Record<string, { default: string }>;

// Build a lookup: filename (no ext) → imported URL
const imageByName: Record<string, string> = {};
Object.entries(imageModules).forEach(([path, mod]) => {
  const name = (path.split('/').pop() ?? '').replace(/\.(png|jpe?g|webp)$/i, '');
  imageByName[name] = mod.default;
});

interface Feature {
  key: string;           // matches filename (no ext) from imageByName
  label: string;         // short eyebrow / step label
  title: string;
  description: string;
  tag: string;
}

const features: Feature[] = [
  {
    key: 'GT Analysis',
    label: 'Performance Analytics',
    title: 'Grand Test Analysis',
    description:
      'After every Grand Test, get a surgical breakdown of your performance — subject-wise accuracy, time spent per question, rank vs peers and trending weak zones. Know exactly where marks are leaking and fix them fast.',
    tag: 'Analytics',
  },
  {
    key: 'GT Data Review',
    label: 'Deep-Dive Review',
    title: 'GT Data Review',
    description:
      'Go beyond the score. Every question you attempted is reviewed in context — what you got wrong, why, and what the correct reasoning is. Build understanding, not just memory.',
    tag: 'Review',
  },
  {
    key: 'High-Yield-Topics',
    label: 'Focus Engine',
    title: 'High-Yield Topics',
    description:
      'Our algorithm scans your performance history and surfaces the topics with the highest exam weightage that you haven\'t mastered yet. Study smarter, not harder.',
    tag: 'Strategy',
  },
  {
    key: 'Weakzone Heatmap',
    label: 'Visual Diagnostics',
    title: 'Weakzone Heatmap',
    description:
      'See your entire subject map at a glance. A colour-coded heatmap shows you exactly which chapters are cold (need attention) and which are hot (already strong) — updated after every test.',
    tag: 'Diagnostics',
  },
  {
    key: 'Accountability',
    label: 'Daily Discipline',
    title: 'Accountability Tracker',
    description:
      'Consistency beats intensity. Your daily accountability sheet tracks study hours, mock attempts and revision cycles — so you and your mentor can both see exactly where your prep stands.',
    tag: 'Tracking',
  },
  {
    key: 'Daily To-Do List',
    label: 'Task Management',
    title: 'Daily To-Do List',
    description:
      'Each morning you get a mentor-curated to-do list tailored to your goals and exam date. Check things off as you go and carry forward incomplete tasks automatically.',
    tag: 'Planning',
  },
  {
    key: 'Normal-Daily-Tasks (R1&R2)',
    label: 'Revision Cycles',
    title: 'Revision Rounds (R1 & R2)',
    description:
      'Spaced repetition built into your workflow. Every topic passes through two systematic revision rounds so you\'re not re-learning — you\'re reinforcing.',
    tag: 'Revision',
  },
  {
    key: 'INICET Mock Tests',
    label: 'Mock Exams',
    title: 'INICET Mock Tests',
    description:
      'Full-length INICET-pattern mocks with real-time scoring, rank predictions, and instant answer explanations. Simulate exam conditions so the real thing feels familiar.',
    tag: 'Mocks',
  },
  {
    key: 'Major and Minor Subject Analysis',
    label: 'Subject Mapping',
    title: 'Major & Minor Subject Analysis',
    description:
      'Balance your prep across major and minor subjects intelligently. Visual breakdowns show allocation gaps so no subject sneaks up on you come exam day.',
    tag: 'Balance',
  },
  {
    key: 'MyNotebook Tracker',
    label: 'Knowledge Base',
    title: 'MyNotebook Tracker',
    description:
      'Everything you note down — pearls, mnemonics, high-yield pointers — lives here and is searchable. Your personal knowledge base grows with every session.',
    tag: 'Notes',
  },
  {
    key: 'Psych Sessions',
    label: 'Mental Edge',
    title: 'Psych Sessions',
    description:
      'Exam performance is 50% mental. Structured psych sessions with Dr. Lalla help you manage anxiety, build exam temperament and show up at your sharpest on the big day.',
    tag: 'Wellness',
  },
  {
    key: 'Custom Modules and Quiz Tracker',
    label: 'Personalised Quizzes',
    title: 'Custom Modules & Quiz Tracker',
    description:
      'Create targeted quiz modules for any chapter or subject combination. The tracker logs your quiz history so you see improvement trends over time.',
    tag: 'Quizzes',
  },
  {
    key: 'You vs Your Competition',
    label: 'Competitive Edge',
    title: 'You vs Your Competition',
    description:
      'Benchmark yourself against the entire cohort. See where you stand subject-by-subject and how the gap to the top rankers is closing (or needs more push).',
    tag: 'Benchmarking',
  },
];

const FeaturesShowcaseSection: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollHeight, setScrollHeight] = useState('1100vh');
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute responsive scroll height based on screen width
  useEffect(() => {
    const updateHeight = () => {
      const isSmall = window.innerWidth < 1024;
      setScrollHeight(`${features.length * (isSmall ? 65 : 85)}vh`);
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Handle scroll logic to pin container and switch features (works on both mobile and desktop)
  useEffect(() => {
    const handleScroll = () => {
      const element = containerRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const top = rect.top;
      const height = rect.height;
      const viewportHeight = window.innerHeight;

      // Scrollable distance inside the spacer container
      const scrollableRange = height - viewportHeight;
      if (scrollableRange <= 0) return;

      // Progress ranges from 0 to 1
      const progress = -top / scrollableRange;
      const clampedProgress = Math.max(0, Math.min(0.999, progress));

      const index = Math.floor(clampedProgress * features.length);
      setActiveIndex(index);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Click dot or navigate to dynamic scroll index
  const scrollToFeature = (index: number) => {
    const element = containerRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const absoluteTop = window.scrollY + rect.top;
    const viewportHeight = window.innerHeight;
    const scrollableRange = rect.height - viewportHeight;
    const progress = index / features.length;

    window.scrollTo({
      top: absoluteTop + progress * scrollableRange,
      behavior: 'smooth',
    });
  };

  return (
    <section
      id="features"
      className="relative"
      style={{
        background: '#080C11',
        overflowX: 'clip',
      }}
    >
      {/* Ambient top glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: '400px',
          background:
            'radial-gradient(ellipse 55% 55% at 50% -5%, rgba(24,182,164,0.07) 0%, transparent 80%)',
        }}
      />

      {/* Title / Header section (rendered normally above layout) */}
      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-8 lg:pb-16 text-center z-10">
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
            Platform Features
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.07 }}
          className="text-[2.1rem] md:text-[2.65rem] font-bold text-white leading-tight tracking-tight"
        >
          Every tool you need to{' '}
          <span
            style={{
              backgroundImage: 'linear-gradient(135deg, #18B6A4 0%, #4DD7C8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            crack NEET PG
          </span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.14 }}
          className="mt-4 text-[15px] md:text-[16px] leading-relaxed max-w-2xl mx-auto"
          style={{ color: '#6B7E93' }}
        >
          A complete, mentor-driven platform purpose-built for NEET PG and INICET — from
          daily tasks to deep analytics, all in one place.
        </motion.p>
      </div>

      {/* Sticky Scroll Layout for both mobile and desktop */}
      <div ref={containerRef} className="relative" style={{ height: scrollHeight }}>
        <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-8 xl:gap-16 items-center">
              {/* Left side: descriptions & indicators */}
              <div className="w-full lg:col-span-5 flex flex-col justify-center text-center lg:text-left items-center lg:items-start">
                {/* Eyebrow */}
                <p
                  className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.14em] mb-2 lg:mb-3"
                  style={{ color: '#3A4A5A' }}
                >
                  What's inside
                </p>

                {/* Static headline */}
                <h2 className="text-[1.5rem] md:text-[1.8rem] lg:text-[2.3rem] font-bold leading-[1.1] tracking-tight text-white mb-4 lg:mb-8">
                  Built for one goal.
                  <br />
                  <span
                    style={{
                      backgroundImage: 'linear-gradient(135deg, #18B6A4 0%, #4DD7C8 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    Your AIR.
                  </span>
                </h2>

                {/* Crossfading Feature Specifics */}
                <div className="min-h-[140px] lg:min-h-[170px] relative w-full flex flex-col items-center lg:items-start">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={features[activeIndex].key}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="flex flex-col items-center lg:items-start text-center lg:text-left"
                    >
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-semibold tracking-widest uppercase mb-3"
                        style={{
                          background: 'rgba(24,182,164,0.10)',
                          border: '1px solid rgba(24,182,164,0.22)',
                          color: '#18B6A4',
                          letterSpacing: '0.12em',
                        }}
                      >
                        {features[activeIndex].tag}
                      </span>

                      <h3 className="text-lg lg:text-2xl font-bold text-white mb-2 lg:mb-3">
                        {features[activeIndex].title}
                      </h3>

                      <p className="text-[13px] lg:text-[15px] leading-relaxed text-[#7A8FA6] max-w-sm lg:max-w-md">
                        {features[activeIndex].description}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Progress Indicator bar */}
                <div className="flex items-center gap-3 mt-4 lg:mt-8 w-full max-w-[240px] lg:max-w-xs">
                  <span className="text-[10px] lg:text-xs font-semibold tabular-nums text-[#18B6A4]">
                    {String(activeIndex + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 h-px bg-white/10">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${((activeIndex + 1) / features.length) * 100}%`,
                        background: 'linear-gradient(90deg, #18B6A4, #4DD7C8)',
                      }}
                    />
                  </div>
                  <span className="text-[10px] lg:text-xs font-semibold tabular-nums text-[#3A4A5A]">
                    {String(features.length).padStart(2, '0')}
                  </span>
                </div>

                {/* Horizontal Dot Navigation */}
                <div className="flex flex-wrap gap-1.5 lg:gap-2 mt-4 lg:mt-6 w-full max-w-xs lg:max-w-md justify-center lg:justify-start">
                  {features.map((f, i) => (
                    <button
                      key={f.key}
                      aria-label={`Jump to ${f.title}`}
                      onClick={() => scrollToFeature(i)}
                      style={{
                        width: i === activeIndex ? '16px' : '6px',
                        height: '6px',
                        borderRadius: '999px',
                        background:
                          i === activeIndex
                            ? 'linear-gradient(90deg,#18B6A4,#4DD7C8)'
                            : 'rgba(255,255,255,0.12)',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'width 0.35s cubic-bezier(0.22,1,0.36,1), background 0.35s ease',
                        padding: 0,
                      }}
                      className="hover:bg-white/30"
                    />
                  ))}
                </div>
              </div>

              {/* Right side: Laptop browser mock with active screenshot */}
              <div className="w-full lg:col-span-7 flex justify-center items-center">
                <div
                  className="w-full max-w-lg lg:max-w-none relative shadow-[0_16px_40px_rgba(0,0,0,0.5)] lg:shadow-[0_24px_70px_rgba(0,0,0,0.6)] border border-[#18222E] rounded-xl lg:rounded-2xl bg-[#0B1118] overflow-hidden flex flex-col"
                  style={{ aspectRatio: '16/10' }}
                >
                  {/* Header bar of browser mockup */}
                  <div
                    className="flex items-center justify-between px-4 lg:px-5 py-2.5 lg:py-3.5 border-b border-white/5 bg-[#0B1118] select-none"
                  >
                    <div className="flex items-center gap-1.5 lg:gap-2.5">
                      <div className="flex gap-1 lg:gap-1.5">
                        <div className="w-2 lg:w-2.5 h-2 lg:h-2.5 rounded-full bg-[#ff5f57]" />
                        <div className="w-2 lg:w-2.5 h-2 lg:h-2.5 rounded-full bg-[#febc2e]" />
                        <div className="w-2 lg:w-2.5 h-2 lg:h-2.5 rounded-full bg-[#28c840]" />
                      </div>
                      <span className="text-[10px] lg:text-xs font-medium text-[#3A4A5A] ml-1 lg:ml-2">
                        {features[activeIndex].label}
                      </span>
                    </div>
                    <span
                      className="text-[9px] lg:text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 lg:py-1 rounded-full bg-white/5 text-[#3A4A5A]"
                    >
                      {features[activeIndex].tag}
                    </span>
                  </div>

                  {/* Screenshot image container */}
                  <div className="relative w-full flex-1 overflow-hidden">
                    <AnimatePresence initial={false}>
                      <motion.img
                        key={features[activeIndex].key}
                        src={imageByName[features[activeIndex].key]}
                        alt={features[activeIndex].title}
                        initial={{ opacity: 0, scale: 1.015 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.985 }}
                        transition={{ duration: 0.35, ease: 'easeInOut' }}
                        className="absolute inset-0 w-full h-full object-cover object-top"
                      />
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesShowcaseSection;
