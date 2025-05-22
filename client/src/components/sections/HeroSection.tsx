import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const HeroSection: React.FC = () => {
  return (
    <section id="home" className="pt-28 pb-20 bg-teal-500 text-white">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center">
          <motion.div 
            className="w-full md:w-1/2 mb-10 md:mb-0"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Transform Your Academic Journey with Expert Mentorship
            </h1>
            <p className="text-lg md:text-xl mb-8 text-teal-50">
              Our comprehensive approach addresses all aspects of academic excellence, providing
              you with the tools and guidance needed to succeed.
            </p>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <a href="#courses" className="btn bg-white text-teal-500 hover:bg-teal-50 transition-colors scroll-smooth">
                Join Now
              </a>
              <a href="#about" className="btn bg-transparent border border-white hover:bg-teal-400 transition-colors flex items-center scroll-smooth">
                Know More <ArrowRight size={16} className="ml-2" />
              </a>
            </div>
            <div className="mt-8 flex items-center">
              <img 
                src="https://images.pexels.com/photos/3184405/pexels-photo-3184405.jpeg?auto=compress&cs=tinysrgb&h=60" 
                alt="Students" 
                className="h-8 w-auto rounded-full border-2 border-white"
              />
              <img 
                src="https://images.pexels.com/photos/3184302/pexels-photo-3184302.jpeg?auto=compress&cs=tinysrgb&h=60" 
                alt="Students" 
                className="h-8 w-auto rounded-full border-2 border-white -ml-2"
              />
              <img 
                src="https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&h=60" 
                alt="Students" 
                className="h-8 w-auto rounded-full border-2 border-white -ml-2"
              />
              <span className="ml-2 text-sm">Join <span className="font-bold">2,500+</span> successful students</span>
            </div>
          </motion.div>
          
          <motion.div 
            className="w-full md:w-1/2"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="relative">
              
              <div className="absolute -bottom-5 -left-5 bg-white p-4 rounded-lg shadow-lg border border-teal-200">
                <div className="flex items-center">
                  <div className="bg-green-500 h-3 w-3 rounded-full mr-2"></div>
                  <span className="text-teal-600 font-bold">98% Success Rate</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;