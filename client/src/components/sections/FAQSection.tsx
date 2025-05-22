import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

const faqs = [
  {
    question: 'What exactly does Eyeconic offer?',
    answer: 'Structured mentorship, customized study plans, regular tracking, and constant motivation to crack NEET PG confidently.'
  },
  {
    question: 'Are these live classes or recorded lectures?',
    answer: 'Eyeconic isn’t a coaching—it’s a mentorship. You’ll get study plans, strategy sessions, group calls, and personal guidance—not lecture overload.'
  },
  {
    question: 'How is Eyeconic different from platforms like Marrow or PrepLadder?',
    answer: 'Those are content platforms. We help you use that content smartly. Think of us as your GPS while they provide the map.'
  },
  {
    question: 'Can I join Eyeconic during my internship or MBBS?',
    answer: 'Absolutely! We have separate programs for interns (Nurture 3.1), UG students (Foundation 2.1), and focused dropper prep (Arjuna).'
  },
  {
    question: 'Is this a one-time payment or monthly?',
    answer: 'One-time payment with full access to your batch’s benefits throughout the duration.'
  },
  {
    question: 'How will I track my progress?',
    answer: 'Through weekly reports, custom Google Sheets, GT reviews, and direct mentor check-ins.'
  },
  {
    question: 'What if I miss a week or fall behind?',
    answer: 'Your mentor will help you bounce back. You’re never alone here.'
  },
  {
    question: 'How do I join?',
    answer: 'Just go to the “Courses” section, pick your batch, and hit Enroll Now. We’ll take care of the rest.'
  }
];

const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faqs" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-blue-900 mb-4">
            Frequently Asked Questions
          </h2>
        </motion.div>
        <div className="max-w-2xl mx-auto space-y-4">
          {faqs.map((faq, idx) => (
            <div key={idx} className="border border-teal-100 rounded-lg overflow-hidden bg-teal-50">
              <button
                className="w-full flex justify-between items-center px-6 py-4 text-left focus:outline-none"
                onClick={() => toggle(idx)}
                aria-expanded={openIndex === idx}
              >
                <span className="font-semibold text-blue-900 text-lg">{faq.question}</span>
                {openIndex === idx ? (
                  <ChevronUp className="text-teal-600" />
                ) : (
                  <ChevronDown className="text-teal-600" />
                )}
              </button>
              {openIndex === idx && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="px-6 pb-4 text-base text-black"
                >
                  {faq.answer}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
