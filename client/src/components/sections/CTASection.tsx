import React from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';

const CTASection: React.FC = () => {
  return (
    <section id="contact" className="py-20 bg-gradient-to-r from-teal-900 to-teal-500 text-white">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center justify-between">
          <motion.div 
            className="w-full lg:w-2/3 mb-10 lg:mb-0"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">Ready for a Transformation?</h2>
            <p className="text-xl text-white mb-6">
              Take the first step towards achieving your dream medical seat. <br/>
              Book a free consultation with our mentors to discuss your preparation journey.
            </p>
            <ul className="mb-8 space-y-2">
              <li className="flex items-center">
                <div className="h-2 w-2 rounded-full bg-white mr-2"></div>
                <span>Understand your current preparation level</span>
              </li>
              <li className="flex items-center">
                <div className="h-2 w-2 rounded-full bg-white mr-2"></div>
                <span>Get personalized advice for your specific situation</span>
              </li>
              <li className="flex items-center">
                <div className="h-2 w-2 rounded-full bg-white mr-2"></div>
                <span>Learn how our mentorship can accelerate your progress</span>
              </li>
            </ul>
          </motion.div>
          
          <motion.div 
            className="w-full lg:w-1/3"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="bg-[#101720]/92 backdrop-blur-xl p-8 rounded-2xl border border-white/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.45)] text-white">
              <h3 className="text-2xl font-bold mb-6 text-center text-white">Book Your Free Session</h3>
              
              <a
                href="https://forms.gle/CAa6xLNsjsdhJt5M7"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full block"
              >
                <button className="btn btn-primary w-full py-4 text-base font-bold rounded-xl flex items-center justify-center">
                  <Calendar className="mr-2" size={18} />
                  Book a Call
                </button>
              </a>
              
              <p className="text-sm text-white text-center mt-6">
                No obligation, just a friendly conversation to help you succeed.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;