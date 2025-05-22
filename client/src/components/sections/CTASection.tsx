import React from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';

const CTASection: React.FC = () => {
  return (
    <section id="contact" className="py-20 bg-gradient-to-r from-teal-500 to-teal-600 text-white">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center justify-between">
          <motion.div 
            className="w-full lg:w-2/3 mb-10 lg:mb-0"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready for a Transformation?</h2>
            <p className="text-xl text-teal-50 mb-6">
              Take the first step towards achieving your dream medical seat. 
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
            <div className="bg-white p-8 rounded-lg shadow-lg text-gray-800">
              <h3 className="text-2xl font-bold mb-6 text-center text-navy-900">Book Your Free Session</h3>
              
              <button className="w-full bg-teal-500 hover:bg-teal-600 text-white py-4 rounded-lg mb-6 flex items-center justify-center transition-colors">
                <Calendar className="mr-2" />
                Book a Call
              </button>
              
              <p className="text-sm text-gray-500 text-center">
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