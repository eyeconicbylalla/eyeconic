import React from 'react';
import { motion } from 'framer-motion';
import air69 from '../../assets/AIR 69.png';
import air4044 from '../../assets/AIR 4044.png';
import air4963 from '../../assets/AIR 4963.png';
import air8295 from '../../assets/AIR 8295.png';
import air9418 from '../../assets/AIR 9418.png';
import air9610 from '../../assets/AIR 9610.png';
import air10514 from '../../assets/AIR 10514.png';
import air11000 from '../../assets/AIR 11000.png';
import air12205 from '../../assets/AIR 12205.png';
import air13722 from '../../assets/AIR 13722.png';
import air14379 from '../../assets/AIR 14379.png';
import air15746 from '../../assets/AIR 15746.png';
import air18474 from '../../assets/AIR 18474.png';
import air20540 from '../../assets/AIR 20540.png';

const resultCards = [
  { id: 'air-69', rank: 69, image: air69 },
  { id: 'air-4044', rank: 4044, image: air4044 },
  { id: 'air-4963', rank: 4963, image: air4963 },
  { id: 'air-8295', rank: 8295, image: air8295 },
  { id: 'air-9418', rank: 9418, image: air9418 },
  { id: 'air-9610', rank: 9610, image: air9610 },
  { id: 'air-10514', rank: 10514, image: air10514 },
  { id: 'air-11000', rank: 11000, image: air11000 },
  { id: 'air-12205', rank: 12205, image: air12205 },
  { id: 'air-13722', rank: 13722, image: air13722 },
  { id: 'air-14379', rank: 14379, image: air14379 },
  { id: 'air-15746', rank: 15746, image: air15746 },
  { id: 'air-18474', rank: 18474, image: air18474 },
  { id: 'air-20540', rank: 20540, image: air20540 },
];

const marqueeItems = [...resultCards, ...resultCards];

const ResultsCarouselSection: React.FC = () => {
  return (
    <section id="results" className="results-carousel-section py-16 md:py-20">
      <div className="container mx-auto px-4">
        <motion.div
          className="section-title mb-10 md:mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="mb-4 text-3xl font-bold text-blue-900 md:text-4xl">
            Our NEET PG 2025 Transformations
          </h2>
          <p className="text-base text-slate-600 md:text-lg">
            They came at their lowest... they went out victorious! 🔥
          </p>
        </motion.div>
      </div>

      <div className="results-marquee" aria-label="NEET PG 2025 student results carousel">
        <div className="results-marquee__track">
          {marqueeItems.map((card, index) => (
            <article
              key={`${card.id}-${index}`}
              className="results-marquee__card"
              aria-hidden={index >= resultCards.length}
            >
              <img
                src={card.image}
                alt={`NEET PG 2025 — AIR ${card.rank.toLocaleString('en-IN')}`}
                loading="lazy"
                draggable={false}
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ResultsCarouselSection;
