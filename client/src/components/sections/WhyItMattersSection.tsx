import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';
import student from '../../assets/PROGRESS TRACKING.png';

const benefits = [
  {
    title: "Strategic Approach",
    description: "We focus on smart strategy over mindless studying."
  },
  {
    title: "Consistent Support",
    description: "Regular guidance keeps you on track and motivated."
  },
  {
    title: "Mental Clarity",
    description: "Clear thinking leads to better decisions under pressure."
  },
  {
    title: "Personalized Path",
    description: "Your journey is tailored to your unique strengths and needs."
  }
];

const WhyItMattersSection: React.FC = () => {
  return (
    <section id="why-it-matters" className="py-20 bg-[#0A0F14]">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          <motion.div 
            className="w-full lg:w-1/2"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <img 
              src={student}
              alt="Students studying together" 
              className="rounded-2xl border border-white/[0.06] shadow-card-dark w-full object-cover"
            />
          </motion.div>
          
          <motion.div 
            className="w-full lg:w-1/2"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-3xl font-bold mb-6 text-white">Why It Matters</h2>
            <p className="text-[#CBD5E1] mb-8 leading-relaxed">
              Because cracking NEET PG isn't just about hard work — it's about smart strategy, 
              consistent support, and mental clarity. In a field where the difference between selection 
              and waiting another year can come down to a few marks, having the right guidance isn't a 
              luxury; it's a necessity.
            </p>
            
            <div className="space-y-4">
              {benefits.map((benefit, index) => (
                <motion.div 
                  key={index}
                  className="flex items-start"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.3 + (index * 0.1) }}
                >
                  <div className="flex-shrink-0 mt-1">
                    <CheckCircle className="h-6 w-6 text-teal-500" />
                  </div>
                  <div className="ml-4">
                    <h4 className="font-semibold text-white">{benefit.title}</h4>
                    <p className="text-[#94A3B8] text-sm leading-relaxed">{benefit.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default WhyItMattersSection;