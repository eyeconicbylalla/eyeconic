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
    <section id="home" className="pt-28 pb-20 bg-gradient-to-b from-teal-900 to-teal-500 text-white relative overflow-hidden">
      {/* Subtle radial glow overlay */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-teal-400/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="container mx-auto px-4 relative z-10">
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
            <p className="text-lg md:text-xl mb-8 text-teal-50 max-w-lg">
              Our comprehensive approach addresses all aspects of academic excellence, providing
              you with the tools and guidance needed to succeed.
            </p>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <a href="#courses" className="btn bg-[#0A0F14]/40 backdrop-blur-md border border-white/10 text-white hover:bg-[#0A0F14]/60 hover:border-white/30 transition-all duration-300 scroll-smooth">
                Join Now
              </a>
              <a href="#about" className="btn bg-transparent border border-white/30 hover:bg-white/10 text-white transition-all duration-300 flex items-center scroll-smooth">
                Know More <ArrowRight size={16} className="ml-2" />
              </a>
            </div>
            <div className="mt-6 flex items-center">
              <div className="bg-[#101720]/80 backdrop-blur-md py-2 px-4 rounded-xl shadow-lg border border-white/10 flex items-center">
                <div className="bg-[#18B6A4] h-2.5 w-2.5 rounded-full mr-2 accent-glow"></div>
                <span className="text-[#4DD7C8] font-bold text-sm">98% Success Rate</span>
              </div>
            </div>
            <div className="mt-8 flex items-center">
              <img 
                src="https://images.pexels.com/photos/3184405/pexels-photo-3184405.jpeg?auto=compress&cs=tinysrgb&h=60" 
                alt="Students" 
                className="h-8 w-auto rounded-full border-2 border-teal-900"
              />
              <img 
                src="https://images.pexels.com/photos/3184302/pexels-photo-3184302.jpeg?auto=compress&cs=tinysrgb&h=60" 
                alt="Students" 
                className="h-8 w-auto rounded-full border-2 border-teal-900 -ml-2"
              />
              <img 
                src="https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&h=60" 
                alt="Students" 
                className="h-8 w-auto rounded-full border-2 border-teal-900 -ml-2"
              />
              <span className="ml-3 text-sm text-teal-100">Join <span className="font-bold text-white">2,500+</span> successful students</span>
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
                <div className="bg-[#101720]/92 backdrop-blur-xl rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] border border-white/[0.08] p-8 text-center max-w-md mx-auto">
                  <h3 className="text-2xl font-bold text-teal-200 mb-3">Unlock Free NEET PG Tools!</h3>
                  <p className="text-[#CBD5E1] mb-4 text-sm">
                    <span className="font-semibold">Sign up to access:</span>
                  </p>
                  <ul className="space-y-2.5 text-[#94A3B8] text-sm mt-2 mb-6 text-left">
                    <li className="flex items-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#18B6A4] mr-2"></span>
                      Free GT Score Predictor
                    </li>
                    <li className="flex items-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#18B6A4] mr-2"></span>
                      Exclusive NEET PG Resources
                    </li>
                    <li className="flex items-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#18B6A4] mr-2"></span>
                      Personalized Dashboard
                    </li>
                  </ul>
                  <button
                    className="btn btn-primary w-full text-center font-bold"
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