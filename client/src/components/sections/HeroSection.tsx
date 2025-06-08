import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import SignupModal from '../auth/SignupModal';
import LoginModal from '../auth/LoginModal';

const HeroSection: React.FC = () => {
  // Check if user is logged in
  const isLoggedIn = Boolean(localStorage.getItem('token'));
  const [signupOpen, setSignupOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <section id="home" className="pt-28 pb-20 bg-gradient-to-b from-teal-900 to-teal-500 text-white">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center">
          <motion.div 
            className="w-full md:w-1/2 mb-10 md:mb-0"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-white text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
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
            <div className="mt-4 flex items-center">
              <div className="bg-white p-4 rounded-lg shadow-lg border border-teal-200 flex items-center">
                <div className="bg-green-500 h-3 w-3 rounded-full mr-2"></div>
                <span className="text-teal-600 font-bold">98% Success Rate</span>
              </div>
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
            <div className="relative flex flex-col items-center justify-center h-full min-h-[300px]">
              {!isLoggedIn && (
                <div className="bg-white bg-opacity-90 rounded-xl shadow-lg border border-teal-200 p-6 text-center max-w-md mx-auto">
                  <h3 className="text-xl font-bold text-teal-700 mb-2">Unlock Free NEET PG Tools!</h3>
                  <p className="text-teal-800 mb-2">
                    <span className="font-semibold">Sign up to access:</span>
                  </p>
                  <ul className="list-disc list-inside text-teal-700 mt-2 mb-4 text-left">
                    <li>Free GT Score Predictor</li>
                    <li>Exclusive NEET PG Resources</li>
                    <li>Personalized Dashboard</li>
                  </ul>
                  <button
                    className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-2 rounded-lg shadow transition-colors"
                    type="button"
                    onClick={() => setSignupOpen(true)}
                  >
                    Sign Up Now
                  </button>
                </div>
              )}
              <SignupModal
                isOpen={signupOpen}
                onClose={() => setSignupOpen(false)}
                onSignupSuccess={() => window.location.reload()}
                onSwitchToLogin={() => {
                  setSignupOpen(false);
                  setLoginOpen(true);
                }}
              />
              <LoginModal
                isOpen={loginOpen}
                onClose={() => setLoginOpen(false)}
                onLoginSuccess={() => window.location.reload()}
                onSwitchToSignup={() => {
                  setLoginOpen(false);
                  setSignupOpen(true);
                }}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;