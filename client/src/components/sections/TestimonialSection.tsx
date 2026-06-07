import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

interface Testimonial {
  id: number;
  content: string;
  name: string;
  position: string;
  color: string;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    content: "Eyeconic gave me the structure I was craving. Dr. Lalla's strategy + Kritika Ma'am's check-ins literally changed the game for me. I went from 100 corrects to 165 in 3 months. If you're serious about your seat, this is the place.",
    name: "Aayushi Jain",
    position: "NEET PG 2024 Dropper",
    color: "bg-blue-100"
  },
  {
    id: 2,
    content: "I never thought I'd be able to study during internship, but Eyeconic made it possible. The weekly plans, the no-nonsense feedback, the emotional support—it felt like someone had my back the whole way.",
    name: "Sankalp Bansal",
    position: "Final Year Intern, NEET PG Aspirant",
    color: "bg-blue-100"
  },
  {
    id: 3,
    content: "I joined early with Foundation 2.1 and thank god I did. Concepts became clear without any pressure. It wasn't just about notes—it was about understanding how to think like a topper. Eyeconic is my safety net AND my launchpad.",
    name: "Sneha Reddy",
    position: "Foundation 2.1 Student (3rd year MBBS)",
    color: "bg-purple-100"
  },
  {
    id: 4,
    content: "In the last 90 days, Eyeconic made me believe again. The daily pushes, GT reviews, even the way Dr. Lalla talks in his voice notes—it felt like mentorship on steroids. If you want to turn your panic into power, this is where it happens.",
    name: "Rajveer Singh",
    position: "Arjuna Batch (Final Phase)",
    color: "bg-orange-100"
  },
  {
    id: 5,
    content: "I joined when I was completely confused about what to do. Within a week, I had a plan. Within a month, I had confidence. And today, I have consistency. This mentorship is not generic—it's personal. And that's rare.",
    name: "Khushi Mehra",
    position: "Nurture 3.1 Student",
    color: "bg-red-100"
  }
];

const TestimonialSection: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // Auto-slide every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev: number) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const nextTestimonial = () => {
    setActiveIndex((prev: number) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setActiveIndex((prev: number) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  return (
    <section id="testimonials" className="py-20 bg-[#101720]">
      <div className="container mx-auto px-4">
        <motion.div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-3xl md:text-4xl font-bold text-white mb-4"
          >
            What Our Students Say
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg text-[#CBD5E1] max-w-3xl mx-auto"
          >
            Read success stories from students who have transformed their academic journey with
            Eyeconic mentorship.
          </motion.p>
        </motion.div>
        
        <div className="mt-12 max-w-4xl mx-auto">
          <div className="relative rounded-2xl p-8 bg-[#18222E] border border-white/[0.06] shadow-card-dark overflow-hidden min-h-[220px] flex items-center">
            <Quote className="absolute text-[#18B6A4]/10 w-24 h-24 -top-6 -left-6 pointer-events-none" />
            
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5 }}
              className="relative z-10 w-full"
            >
              <p className="text-lg text-[#CBD5E1] mb-6 italic leading-relaxed">"{testimonials[activeIndex].content}"</p>
              
              <div className="flex items-center">
                <div>
                  <h4 className="font-bold text-white">{testimonials[activeIndex].name}</h4>
                  <p className="text-[#94A3B8] text-sm mt-0.5">{testimonials[activeIndex].position}</p>
                </div>
              </div>
            </motion.div>
          </div>
          
          <div className="flex justify-center items-center mt-8 space-x-6">
            <button 
              onClick={prevTestimonial}
              className="p-2 rounded-full border border-white/[0.08] bg-[#18222E] text-[#CBD5E1] hover:bg-[#1E2A38] hover:text-[#18B6A4] hover:border-[rgba(24,182,164,0.35)] transition-all duration-200"
              aria-label="Previous testimonial"
            >
              <ChevronLeft size={20} />
            </button>
            
            <div className="flex space-x-2.5">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveIndex(index)}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    index === activeIndex ? 'bg-[#18B6A4] w-5' : 'bg-[#1E2A38]'
                  }`}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>
            
            <button 
              onClick={nextTestimonial}
              className="p-2 rounded-full border border-white/[0.08] bg-[#18222E] text-[#CBD5E1] hover:bg-[#1E2A38] hover:text-[#18B6A4] hover:border-[rgba(24,182,164,0.35)] transition-all duration-200"
              aria-label="Next testimonial"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialSection;