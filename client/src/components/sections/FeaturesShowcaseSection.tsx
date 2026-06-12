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
  const [activeProgress, setActiveProgress] = useState(0);
  const [translationY, setTranslationY] = useState(0);
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

  // Handle scroll logic to switch features and active states
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
      const subProgress = (clampedProgress * features.length) - index;
      
      const progressMultiplier = clampedProgress * features.length;
      const cappedMultiplier = Math.min(features.length - 1, progressMultiplier);
      const translationPercent = -cappedMultiplier * 100;

      setActiveIndex(index);
      setActiveProgress(subProgress);
      setTranslationY(translationPercent);
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
          <div className="w-full max-w-[94vw] xl:max-w-[1440px] mx-auto pl-4 sm:pl-6 lg:pl-16 pr-4 sm:pr-6 lg:pr-0">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-16 w-full">
              {/* Left side: descriptions & indicators */}
              <div className="w-full lg:w-[35%] flex flex-col justify-center text-center lg:text-left items-center lg:items-start">
                {/* Eyebrow */}
                <p
                  className="text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.14em] mb-2 lg:mb-3"
                  style={{ color: '#3A4A5A' }}
                >
                  What's inside
                </p>

                {/* Static headline */}
                <h2 className="text-[1.5rem] md:text-[1.8rem] lg:text-[2.2rem] font-bold leading-[1.1] tracking-tight text-white mb-6 lg:mb-8">
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

                {/* Desktop features scroll-spy list */}
                <div className="hidden lg:flex flex-col gap-4 w-full mt-2">
                  {features.map((feature, i) => {
                    const isActive = i === activeIndex;
                    return (
                      <div
                        key={feature.key}
                        className="flex gap-4 cursor-pointer group select-none text-left animate-fade-in"
                        onClick={() => scrollToFeature(i)}
                      >
                        {/* Progress line indicator */}
                        <div className="relative w-[3px] bg-white/5 rounded-full overflow-hidden self-stretch min-h-[36px] flex-shrink-0">
                          <div
                            className="absolute top-0 left-0 w-full bg-[#18B6A4] rounded-full transition-all duration-75"
                            style={{
                              height: isActive
                                ? `${activeProgress * 100}%`
                                : i < activeIndex
                                ? '100%'
                                : '0%',
                            }}
                          />
                        </div>

                        {/* Text details */}
                        <div className="flex flex-col flex-1 py-0.5">
                          <h3
                            className={`text-[15px] xl:text-[17px] font-bold tracking-tight transition-colors duration-300 ${
                              isActive ? 'text-white font-extrabold' : 'text-[#4E5D70] group-hover:text-slate-300'
                            }`}
                          >
                            {feature.title}
                          </h3>
                          
                          <AnimatePresence initial={false}>
                            {isActive && (
                              <motion.div
                                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                animate={{ height: 'auto', opacity: 1, marginTop: 6 }}
                                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden"
                              >
                                <p className="text-[13px] xl:text-[14px] leading-relaxed text-[#7A8FA6] max-w-md">
                                  {feature.description}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Mobile / Tablet active feature view */}
                <div className="flex lg:hidden flex-col items-center text-center w-full">
                  {/* Tag */}
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-widest uppercase mb-3"
                    style={{
                      background: 'rgba(24,182,164,0.10)',
                      border: '1px solid rgba(24,182,164,0.22)',
                      color: '#18B6A4',
                      letterSpacing: '0.12em',
                    }}
                  >
                    {features[activeIndex].tag}
                  </span>

                  <h3 className="text-xl font-bold text-white mb-2">
                    {features[activeIndex].title}
                  </h3>

                  <p className="text-[13px] leading-relaxed text-[#7A8FA6] max-w-sm">
                    {features[activeIndex].description}
                  </p>

                  {/* Progress bar and dot navigation for mobile */}
                  <div className="flex items-center gap-3 mt-5 w-full max-w-[200px]">
                    <span className="text-[10px] font-semibold tabular-nums text-[#18B6A4]">
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
                    <span className="text-[10px] font-semibold tabular-nums text-[#3A4A5A]">
                      {String(features.length).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-4 justify-center">
                    {features.map((f, i) => (
                      <button
                        key={f.key}
                        aria-label={`Jump to ${f.title}`}
                        onClick={() => scrollToFeature(i)}
                        style={{
                          width: i === activeIndex ? '12px' : '4px',
                          height: '4px',
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
              </div>

              {/* Right side: Large Framer-style screenshot showcase */}
              <div className="w-full lg:w-[61%] flex justify-end items-center relative group/image">
                {/* Background ambient glow behind the container */}
                <div
                  className="absolute -inset-4 rounded-l-3xl opacity-35 blur-3xl pointer-events-none transition-all duration-700"
                  style={{
                    background: `radial-gradient(circle, rgba(24,182,164,0.14) 0%, transparent 70%)`,
                  }}
                />
                
                {/* Clean image showcase wrapper - no browser buttons, large size, bleeding to edge */}
                <div 
                  className="w-full aspect-[16/10] overflow-hidden rounded-2xl lg:rounded-l-[24px] lg:rounded-r-none shadow-[0_24px_80px_rgba(0,0,0,0.85)] border-y border-l border-white/[0.05] bg-[#080C11] relative"
                >
                  <motion.div
                    className="w-full h-full flex flex-col"
                    animate={{ y: `${translationY}%` }}
                    transition={{ type: "spring", stiffness: 100, damping: 25, mass: 0.2 }}
                  >
                    {features.map((f) => (
                      <div 
                        key={f.key} 
                        className="w-full h-full flex-shrink-0 relative overflow-hidden bg-[#0A0F14]"
                      >
                        <img
                          src={imageByName[f.key]}
                          alt={f.title}
                          className="w-full h-full object-cover object-top select-none"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </motion.div>
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
