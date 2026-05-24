import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import mentor1 from '../../assets/1.png';
import mentor2 from '../../assets/2.png';
import mentor3 from '../../assets/3.png';
import mentor4 from '../../assets/4.png';
import mentor5 from '../../assets/5.png';
import mentor6 from '../../assets/6.png';
import mentor7 from '../../assets/7.png';

const mentors = [
  { id: 'jwalant', name: 'Dr. Jwalant Chag', image: mentor1 },
  { id: 'lalla', name: 'Dr. Gourav Lalla', image: mentor2 },
  { id: 'vanshika', name: 'Dr. Vanshika Arora', image: mentor3 },
  { id: 'michelle', name: 'Dr. Michelle', image: mentor4 },
  { id: 'ravina', name: 'Dr. Ravina Tilwani', image: mentor5 },
  { id: 'vishwas', name: 'Dr. Vishwas Arora', image: mentor6 },
  { id: 'sarthak', name: 'Dr. Sarthak Rathi', image: mentor7 },
];

const MentorsSection: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const count = mentors.length;

  const goTo = useCallback(
    (index: number) => {
      setActiveIndex(((index % count) + count) % count);
    },
    [count]
  );

  const goPrev = () => goTo(activeIndex - 1);
  const goNext = () => goTo(activeIndex + 1);

  return (
    <section id="mentors" className="bg-white py-20">
      <div className="container mx-auto px-4">
        <motion.div
          className="section-title mb-12 md:mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="mb-4 text-3xl font-bold text-blue-900 md:text-4xl">
            Meet the Mentors
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-gray-700">
            Behind every successful NEET PG aspirant is a team of dedicated mentors.
            Meet the experts who will guide you through your journey.
          </p>
        </motion.div>

        <div className="mentor-carousel" role="region" aria-label="Mentor profiles carousel">
          <button
            type="button"
            className="mentor-carousel__nav"
            onClick={goPrev}
            aria-label="Previous mentor"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>

          <div className="mentor-carousel__track">
            {mentors.map((mentor, index) => {
              const isActive = index === activeIndex;
              return (
                <div
                  key={mentor.id}
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
                  <img src={mentor.image} alt={mentor.name} draggable={false} />
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
                index === activeIndex ? 'w-6 bg-teal-500' : 'w-2 bg-gray-300 hover:bg-teal-300'
              }`}
            />
          ))}
        </div>

        <p className="mt-4 text-center text-sm text-gray-500 md:mt-6">
          <span className="md:hidden">{activeIndex + 1} of {count}</span>
          <span className="hidden md:inline">
            {activeIndex + 1} of {count} — use arrows or select a card to explore
          </span>
        </p>
      </div>
    </section>
  );
};

export default MentorsSection;
