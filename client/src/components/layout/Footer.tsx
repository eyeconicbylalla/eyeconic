import React from 'react';
import { Facebook, Instagram, Linkedin, Twitter, Phone, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import logo from '../../assets/Logo.png'

const Footer: React.FC = () => {
  return (
    <footer className="bg-[#05080D] border-t border-white/[0.06] text-[#CBD5E1] pt-16 pb-8">
      <div className="container mx-auto px-4 max-w-full overflow-x-hidden">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-12">
          <div>
            <div className="mb-6 flex items-center">
              <img src={logo} alt="Footer Logo" className="h-12 w-auto" />
              <span className="ml-3 text-2xl font-bold text-white">EyeConic</span>
            </div>
            <p className="mb-6 text-[#94A3B8] text-sm leading-relaxed">Transform your academic journey with personalized mentorship from India's #1 NEET PG Coach & Mentors, helping you achieve your educational goals.</p>
            <div className="flex space-x-4">
              <a href="#" aria-label="Facebook" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">
                <Facebook size={20} />
              </a>
              <a href="#" aria-label="Instagram" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">
                <Instagram size={20} />
              </a>
              <a href="#" aria-label="LinkedIn" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">
                <Linkedin size={20} />
              </a>
              <a href="#" aria-label="Twitter" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">
                <Twitter size={20} />
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-6">Quick Links</h4>
            <ul className="space-y-4">
              <li><Link to="/" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Home</Link></li>
              <li><Link to="/#about" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">About Dr. Gourav</Link></li>
              <li><Link to="/#courses" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Programs</Link></li>
              <li><Link to="/#results" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Student Results</Link></li>
              <li><Link to="/#testimonials" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Testimonials</Link></li>
              <li><Link to="/#contact" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Contact Us</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-6">Our Programs</h4>
            <ul className="space-y-4">
              <li><a href="#" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">One-on-One Mentorship</a></li>
              <li><a href="#" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Group Sessions</a></li>
              <li><a href="#" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Live Webinars</a></li>
              <li><a href="#" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Mock Tests</a></li>
              <li><a href="#" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Study Resources</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-6">Contact Us</h4>
            <ul className="space-y-4">
              <li className="flex items-center text-[#94A3B8]">
                <Mail size={20} className="mr-2 flex-shrink-0" />
                <span>eyeconiclalla@gmail.com</span>
              </li>
              <li className="flex items-center text-[#94A3B8]">
                <Phone size={20} className="mr-2 flex-shrink-0" />
                <span>+91 91163 24253</span>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-6">Legal</h4>
            <ul className="space-y-4">
              <li>
                <Link to="/terms-and-conditions" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Terms & Conditions</Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Privacy Policy</Link>
              </li>
              <li>
                <Link to="/refund-policy" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Refund Policy</Link>
              </li>
              <li>
                <Link to="/disclaimer" className="text-[#94A3B8] hover:text-[#18B6A4] transition-colors">Disclaimer</Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-white/[0.06] mt-12 pt-8 text-center text-sm text-[#64748B]">
          <p>&copy; 2025 Eyeconic Mentorship. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;