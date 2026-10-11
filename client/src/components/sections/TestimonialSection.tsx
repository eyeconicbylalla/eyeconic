import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

interface Testimonial {
  id: number;
  content: string;
  name: string;
  position: string;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    content: "Eyeconic gave my preparation a structure I could follow. Spaced revisions, Sunday GTs, and a schedule that adjusted to my needs were the most valuable parts. Looking back at my journey from AIR 65,000 to 704, I’m deeply grateful for the support.",
    name: "Jankuta Soumya",
    position: "AIR 65,000 → AIR 704"
  },
  {
    id: 2,
    content: "There were days when I doubted whether I could achieve a good rank. Dr Gourav and Team Eyeconic kept encouraging me, following up, and pushing me to improve. From AIR 83,835 to 2,421, this journey gave me something beyond a rank—the belief that I was capable.",
    name: "Mohammed Ismail Kachi",
    position: "AIR 83,835 → AIR 2,421"
  },
  {
    id: 3,
    content: "Whenever preparation felt overwhelming, I had someone to share my worries with. Eyeconic helped me follow a proper schedule and encouraged me to keep improving every day. Going from AIR 1,00,000 to 2,947 makes this journey incredibly special to me.",
    name: "Nabiha Rehan",
    position: "AIR 1,00,000 → AIR 2,947"
  },
  {
    id: 4,
    content: "From AIR 1,49,443 to 5,667—this improvement means so much to me. Eyeconic’s timetable, regular accountability, and high-yield image and video flashcards towards the end were especially helpful. My accountability mentor kept pushing me, and I’m grateful for that support.",
    name: "Kirti Sharma",
    position: "AIR 1,49,443 → AIR 5,667"
  },
  {
    id: 5,
    content: "Eyeconic helped me turn daily MCQ practice into a habit. The regular custom-module check-ins kept bringing my attention back to question solving. Moving from AIR 52,900 to 7,830, I’m genuinely thankful for the role the team played in my preparation.",
    name: "Sourav Biswal",
    position: "AIR 52,900 → AIR 7,830"
  },
  {
    id: 6,
    content: "From AIR 91,740 to 10,875, I’m grateful for the constant support throughout my preparation. Dr Gourav’s guidance, daily accountability, and encouragement were the most valuable parts of Eyeconic for me.",
    name: "Hiya Kalita",
    position: "AIR 91,740 → AIR 10,875"
  },
  {
    id: 7,
    content: "Daily targets, weekly calls, and regular encouragement gave me support throughout my preparation. I’m grateful to Eyeconic for being part of my journey from AIR 85,585 to 11,139. It was a wonderful experience.",
    name: "Akhila Reddy",
    position: "AIR 85,585 → AIR 11,139"
  },
  {
    id: 8,
    content: "Low days were easier to get through because someone kept checking in and encouraging me. Weekly GTs and follow-ups on my GT reviews helped me the most. I’m thankful to Eyeconic for supporting my journey from AIR 60,000 to 13,997.",
    name: "Priyanka S Biradar",
    position: "AIR 60,000 → AIR 13,997"
  },
  {
    id: 9,
    content: "Motivation and accountability made the biggest difference for me. Eyeconic gave me guidance and encouragement throughout my preparation. Moving from AIR 40,000 to 18,791 is an improvement I’m thankful to have achieved.",
    name: "Dr Rishika Dharmadhikari",
    position: "AIR 40,000 → AIR 18,791"
  },
  {
    id: 10,
    content: "The biggest relief was knowing what I had to study the next day. Eyeconic’s timetable brought structure to my preparation, and daily accountability helped me follow it. That clarity was what I valued most.",
    name: "Aditya Jaisal",
    position: ""
  },
  {
    id: 11,
    content: "What stayed with me was the support I received in different situations throughout my preparation. Eyeconic’s daily accountability and willingness to help meant a lot. A heartfelt thank you to the team.",
    name: "Dhiraj Dhananjay Chavan",
    position: ""
  },
  {
    id: 12,
    content: "Eyeconic’s daily schedule and planning gave my preparation a clear direction. I’m grateful for the guidance and motivation throughout the journey. Having that support meant a lot to me.",
    name: "Aditya Upadhyay",
    position: ""
  },
  {
    id: 13,
    content: "My GT scores were low, but Eyeconic kept encouraging me through the final two months. The early-morning accountability messages helped me stay consistent. Most importantly, I received guidance on analysing GTs and learning from my mistakes.",
    name: "Yugandhara Shirke",
    position: ""
  },
  {
    id: 14,
    content: "For students who feel they cannot compete with others, encouragement can mean so much. Eyeconic’s My Notebook strategy, motivation, and check-ins were especially helpful to me. I’m grateful for the support throughout my preparation.",
    name: "Shilpa Manik Salunke",
    position: ""
  },
  {
    id: 15,
    content: "After a ten-year break, finding the confidence to study and attempt NEET PG again was a big step. As a working woman, consistency was difficult. Eyeconic helped me return to studying and gave me the confidence to attempt the exam.",
    name: "B Sithi Nazia",
    position: ""
  },
  {
    id: 16,
    content: "I joined Eyeconic with only three months of preparation left. My first GT after joining was 166 marks, and I scored 358 in NEET PG 2026. The consistency and accountability the team helped me maintain made those three months especially meaningful.",
    name: "Aishwarya Konduru",
    position: "First GT: 166 marks | NEET PG 2026: 358 marks"
  },
  {
    id: 17,
    content: "After my result, I was shattered and genuinely afraid of MCQ exams. Over three months, my correct answers improved from 48 to 82. Eyeconic helped me revise alongside my preparation, understand concepts better, and slowly rebuild the belief I had lost in myself.",
    name: "Chaitanya Bhand",
    position: "Reported correct answers: 48 → 82 in three months"
  },
  {
    id: 18,
    content: "I found Eyeconic when I felt directionless in my preparation. The planner felt doable, and that helped me keep going. Friday quizzes, daily encouragement, and consistent support gave me a way forward.",
    name: "Anchal Bhusal",
    position: ""
  },
  {
    id: 19,
    content: "Eyeconic felt like a friend throughout my preparation. The support never felt overpowering, and I always felt I had a helping hand. The strategies and daily accountability were what I appreciated most.",
    name: "Dhwani Makadia",
    position: ""
  },
  {
    id: 20,
    content: "I joined Eyeconic when I had lost hope in myself. The daily check-ins, reassurance, and patience meant more than I can explain. Thank you for giving me hope when I was struggling to find it on my own.",
    name: "Rujuta",
    position: ""
  },
  {
    id: 21,
    content: "I wish I had found Eyeconic sooner. Sometimes, you need someone to ask, ‘Are you okay? How is preparation going?’ I felt that support here. The schedule, daily check-ins, and weekly tests were genuinely valuable.",
    name: "Veluri Deepa Lolitha",
    position: ""
  },
  {
    id: 22,
    content: "Solving 50 questions every day became a game changer in my preparation. What I valued just as much was the response when I performed badly—I received encouragement rather than judgment. That made Eyeconic’s support meaningful to me.",
    name: "Siddhant Dwivedi",
    position: ""
  },
  {
    id: 23,
    content: "After internship, I thought three to four months wouldn’t be enough and was already thinking about the next attempt. Eyeconic changed my perspective, helped me build a base, and supported me in solving almost all PYQs. Preparing alone away from home became more manageable with a structured plan and Dr Gourav’s guidance.",
    name: "Bhagwati Charan",
    position: ""
  },
  {
    id: 24,
    content: "The stress of figuring everything out myself was exhausting. Eyeconic’s customised schedules helped me focus on weaker subjects, while daily targets and frequent check-ins kept me on track. The support made a stressful journey much more manageable.",
    name: "Shailja Gangani",
    position: ""
  },
  {
    id: 25,
    content: "Preparation can feel incredibly lonely, especially when doubts start creeping in. Eyeconic became a companion through that journey. The daily check-ins and support helped me stay grounded, and I’m grateful for everyone who stood by me.",
    name: "Mahima Gandhi",
    position: ""
  }
];

// Auto-advance pauses on hover/focus/hidden tab and stops permanently after
// the user's first manual interaction (arrow/segment click, swipe, keyboard).
const AUTO_ADVANCE_MS = 10_000;

// A swipe only counts when the horizontal drag clears this threshold and
// clearly dominates the vertical one (vertical motion stays native scroll).
const SWIPE_THRESHOLD_PX = 40;
const SWIPE_DOMINANCE = 1.5;

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// "Jankuta Soumya" → "JS", "Rujuta" → "R", "Dr Rishika Dharmadhikari" → "DD"
const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

// "First GT: 166 marks | NEET PG 2026: 358 marks" → two pills; "" → []
const getPositionPills = (position: string): string[] =>
  position.split('|').map((part) => part.trim()).filter(Boolean);

const slideVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 48 : -48 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -48 : 48 }),
};

const TestimonialSection: React.FC = () => {
  const count = testimonials.length;
  const [[activeIndex, direction], setSlide] = useState<[number, number]>([0, 1]);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hiddenPaused, setHiddenPaused] = useState(false);
  const [userLocked, setUserLocked] = useState(false);
  const paused = hoverPaused || focusPaused || hiddenPaused;

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  // Index and direction update atomically so the exit animation always
  // matches the move that caused it. Same-index updates bail out.
  const goTo = useCallback(
    (target: number, dir?: number) => {
      setSlide((slide) => {
        const next = ((target % count) + count) % count;
        if (next === slide[0]) return slide;
        return [next, dir ?? (next > slide[0] ? 1 : -1)];
      });
    },
    [count]
  );

  const goNext = useCallback(() => goTo(activeIndex + 1, 1), [goTo, activeIndex]);
  const goPrev = useCallback(() => goTo(activeIndex - 1, -1), [goTo, activeIndex]);
  const stopAuto = useCallback(() => setUserLocked(true), []);

  // One timer: a fresh 10s per slide while rotating; cleared while paused
  // (effect early-returns, cleanup drops the pending timeout) and never
  // restarts once the user has interacted manually.
  useEffect(() => {
    if (userLocked || paused) return;
    const id = window.setTimeout(() => goTo(activeIndex + 1, 1), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [activeIndex, paused, userLocked, goTo]);

  useEffect(() => {
    const onVisibility = () => setHiddenPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Content-fit card: track the slide stack's natural height so the frame can
  // animate to it — the ResizeObserver catches crossfade pairs (height =
  // max of the two slides), the post-transition settle, viewport resizes and
  // font swaps alike. See .testimonial-carousel__frame in index.css.
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setFrameHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Arrow/Home/End anywhere inside the region (events bubble up from the
  // buttons). Modifiers are left to the browser — Alt+ArrowLeft is Back.
  const onRegionKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    let target: number | null = null;
    if (e.key === 'ArrowRight') target = activeIndex + 1;
    else if (e.key === 'ArrowLeft') target = activeIndex - 1;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = count - 1;
    if (target === null) return;
    e.preventDefault();
    stopAuto();
    goTo(target);
    // Focus follows only when the keystroke came from the tablist (roving
    // tabindex); elsewhere the slide is plain text and the polite live
    // region announces the change instead.
    if ((e.target as HTMLElement).closest?.('[role="tablist"]')) {
      tabRefs.current[((target % count) + count) % count]?.focus();
    }
  };

  // Touch swipe: fires at most once per gesture; the click a swipe produces
  // is swallowed in the capture phase so it can't also trigger a control.
  const onSurfacePointerDown = (e: React.PointerEvent) => {
    suppressClick.current = false;
    if (e.pointerType === 'mouse') return;
    swipeStart.current = { x: e.clientX, y: e.clientY };
  };
  const onSurfacePointerMove = (e: React.PointerEvent) => {
    const start = swipeStart.current;
    if (!start || suppressClick.current) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_DOMINANCE) {
      suppressClick.current = true;
      stopAuto();
      if (dx > 0) goPrev();
      else goNext();
    }
  };
  const onSurfacePointerEnd = () => {
    swipeStart.current = null;
  };
  const onSurfaceClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  };

  const active = testimonials[activeIndex];
  const pills = getPositionPills(active.position);

  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-title"
      className="relative overflow-x-clip bg-[#101720] py-20"
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

      <MotionConfig reducedMotion="user">
        <div className="container relative z-10 mx-auto px-4">
          <div className="mb-12 text-center md:mb-14">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: EASE }}
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
                Success Stories
              </span>
            </motion.div>

            <motion.h2
              id="testimonials-title"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.07 }}
              className="mb-4 text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl"
            >
              What Our{' '}
              <span
                style={{
                  backgroundImage: 'linear-gradient(135deg, #18B6A4 0%, #4DD7C8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Students
              </span>{' '}
              Say
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mx-auto max-w-3xl text-[15px] leading-relaxed md:text-[16px]"
              style={{ color: '#6B7E93' }}
            >
              Read success stories from students who have transformed their academic journey with
              Eyeconic mentorship.
            </motion.p>
          </div>

          <div
            role="region"
            aria-roledescription="carousel"
            aria-label="Student testimonials"
            className="mx-auto max-w-4xl"
            onKeyDown={onRegionKeyDown}
            onFocus={() => setFocusPaused(true)}
            onBlur={() => setFocusPaused(false)}
            onPointerEnter={() => setHoverPaused(true)}
            onPointerLeave={() => setHoverPaused(false)}
          >
            <div
              className="testimonial-carousel__surface relative select-none overflow-hidden rounded-2xl border border-white/[0.06] bg-[#18222E] p-6 shadow-card-dark sm:p-8 md:p-10"
              onPointerDown={onSurfacePointerDown}
              onPointerMove={onSurfacePointerMove}
              onPointerUp={onSurfacePointerEnd}
              onPointerCancel={onSurfacePointerEnd}
              onClickCapture={onSurfaceClickCapture}
            >
              <Quote
                className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 text-[#18B6A4]/10"
                aria-hidden="true"
              />

              {/* Entering and exiting slides share grid cell 1/1, so the stack
                  height is the max of the two — no mid-crossfade jump — and
                  the frame animates to the stack's natural height (see
                  .testimonial-carousel__slide / __frame in index.css). */}
              <div
                className="testimonial-carousel__frame"
                style={frameHeight !== null ? { height: frameHeight } : undefined}
              >
                <div className="grid" id="testimonial-slide" ref={stackRef}>
                  <AnimatePresence initial={false} custom={direction}>
                    <motion.figure
                      key={activeIndex}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.45, ease: EASE }}
                      className="testimonial-carousel__slide relative z-10"
                      aria-roledescription="slide"
                      aria-label={`${active.name}, student testimonial`}
                    >
                      <blockquote className="mb-6">
                        <p className="text-[15px] leading-relaxed text-[#CBD5E1] sm:text-base md:text-lg">
                          {active.content}
                        </p>
                      </blockquote>
                      <figcaption className="flex items-start gap-4">
                        <div
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                          style={{
                            background: 'rgba(24,182,164,0.12)',
                            border: '1px solid rgba(24,182,164,0.3)',
                            color: '#4DD7C8',
                          }}
                        >
                          {getInitials(active.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-white">{active.name}</div>
                          {pills.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {pills.map((pill) => (
                                <span key={pill} className="testimonial-carousel__badge">
                                  {pill}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </figcaption>
                    </motion.figure>
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4 md:mt-8">
              <button
                type="button"
                className="testimonial-carousel__nav"
                aria-label="Previous testimonial"
                onClick={() => {
                  stopAuto();
                  goPrev();
                }}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              {/* Desktop: one segment per testimonial — the only tablist */}
              <div
                className="hidden min-w-0 flex-1 md:flex md:gap-1"
                role="tablist"
                aria-label="Select testimonial"
              >
                {testimonials.map((testimonial, index) => (
                  <button
                    key={testimonial.id}
                    type="button"
                    role="tab"
                    ref={(el) => {
                      tabRefs.current[index] = el;
                    }}
                    tabIndex={index === activeIndex ? 0 : -1}
                    aria-selected={index === activeIndex}
                    aria-label={testimonial.name}
                    aria-controls="testimonial-slide"
                    onClick={() => {
                      stopAuto();
                      goTo(index);
                    }}
                    className={`testimonial-carousel__segment${
                      index === activeIndex ? ' testimonial-carousel__segment--active' : ''
                    }`}
                  />
                ))}
              </div>

              {/* Mobile: position counter (the live region already reads it) */}
              <div className="flex-1 text-center md:hidden" aria-hidden="true">
                <span className="text-sm font-medium tabular-nums text-[#94A3B8]">
                  {activeIndex + 1} / {count}
                </span>
              </div>

              <button
                type="button"
                className="testimonial-carousel__nav"
                aria-label="Next testimonial"
                onClick={() => {
                  stopAuto();
                  goNext();
                }}
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Mobile: thin position bar (index of 25, not a countdown) */}
            <div
              className="mt-3 h-1 overflow-hidden rounded-full bg-[#1E2A38] md:hidden"
              aria-hidden="true"
            >
              <div
                className="testimonial-carousel__progress h-full rounded-full bg-[#18B6A4]"
                style={{ width: `${((activeIndex + 1) / count) * 100}%` }}
              />
            </div>

            <p className="sr-only" aria-live="polite">
              {`${active.name}. ${activeIndex + 1} of ${count}.`}
            </p>
          </div>
        </div>
      </MotionConfig>
    </section>
  );
};

export default TestimonialSection;
