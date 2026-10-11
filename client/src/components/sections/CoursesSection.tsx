import React from 'react';
import { motion, MotionConfig } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import img36 from '../../assets/36.webp';
import img37 from '../../assets/37.webp';
import img38 from '../../assets/38.webp';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSccHeq1gUBguz8MYr4JGFzYFlsZeHCOsEq2BQ6g1chlvmkIuQ/viewform';

const newCourses = [
  {
    id: 'batch-36',
    batch: '36',
    title: 'Mentorship Program - 36',
    image: img36
  },
  {
    id: 'batch-37',
    batch: '37',
    title: 'Mentorship Program - 37',
    image: img37
  },
  {
    id: 'batch-38',
    batch: '38',
    title: 'Mentorship Program - 38',
    image: img38
  }
];

const CoursesSection: React.FC = () => {
  // Spotlight vars for the cursor-follow glow — bound only on fine-pointer
  // devices and rAF-throttled so pointermove stays cheap.
  const finePointer = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
    []
  );
  const rafId = React.useRef(0);
  React.useEffect(() => () => cancelAnimationFrame(rafId.current), []);

  const onCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!finePointer) return;
    // Capture the element + coords synchronously: React nulls
    // syntheticEvent.currentTarget once the handler returns.
    const el = e.currentTarget;
    const { clientX, clientY } = e;
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${clientX - rect.left}px`);
      el.style.setProperty('--my', `${clientY - rect.top}px`);
    });
  };

  return (
    <section id="courses" aria-labelledby="courses-title" className="relative overflow-x-clip bg-[#101720] py-20">
      {/* Ambient top glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: '400px',
          background:
            'radial-gradient(ellipse 55% 55% at 50% -5%, rgba(24,182,164,0.07) 0%, transparent 80%)'
        }}
      />

      {/* reducedMotion scoped to this section only: when the OS preference is
          reduce, framer skips the y transform (elements render in place) and
          keeps the opacity fade. */}
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
                  letterSpacing: '0.13em'
                }}
              >
                NEET PG Mentorship
              </span>
            </motion.div>

            <motion.h2
              id="courses-title"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.07 }}
              className="mb-4 text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl"
            >
              Our{' '}
              <span
                style={{
                  backgroundImage: 'linear-gradient(135deg, #18B6A4 0%, #4DD7C8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                Programs
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
              Three mentorship batches, one goal — your NEET PG rank. Pick your
              batch and prepare with structured guidance and mentor-led preparation.
            </motion.p>
          </div>

          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
            {newCourses.map((course, index) => (
              /* Entrance lives on this wrapper so framer's inline transform
                 never fights the CSS :hover transform on the card itself. */
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.5, delay: index * 0.08, ease: EASE }}
                className="mx-auto w-full max-w-sm md:max-w-none"
              >
                <div
                  className="course-card relative h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#18222E] shadow-card-dark"
                  onPointerMove={onCardPointerMove}
                >
                  {/* Screen-reader-only heading keeps per-card structure
                      without adding visible text (posters carry the design). */}
                  <h3 className="sr-only">{course.title}</h3>
                  <div className="flex h-full flex-col justify-between p-5">
                    <div className="course-card__poster mb-6 aspect-[3/4] w-full overflow-hidden rounded-xl border border-white/[0.04] bg-[#0F172A]">
                      <img
                        src={course.image}
                        alt={`${course.title} poster with batch details`}
                        width={720}
                        height={960}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onLoad={(e) => e.currentTarget.classList.add('loaded')}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <a
                      href={FORM_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Join Mentorship Program ${course.batch} (opens in a new tab)`}
                      className="course-card__cta btn btn-primary mt-auto w-full py-3 text-center font-semibold text-white"
                    >
                      Join Now <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </MotionConfig>
    </section>
  );
};

export default CoursesSection;
