import React from 'react';
import { Facebook, Instagram, Linkedin, Twitter, Phone, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import logo from '../../assets/Logo.png'

const Footer: React.FC = () => {
  return (
    <footer className="bg-teal-900 text-white pt-16 pb-8">
      <div className="container mx-auto px-4 max-w-full overflow-x-hidden">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-12">
          <div>
            <div className="mb-6 flex items-center">
              <img src={logo} alt="Footer Logo" className="h-12 w-auto" />
              <span className="ml-3 text-2xl font-bold text-white">EyeConic</span>
            </div>
            <p className="mb-6 font-semibold">Transform your academic journey with personalized mentorship from Dr. Gourav Lalla, helping you achieve your educational goals.</p>
            <div className="flex space-x-4">
              <a href="#" aria-label="Facebook" className="text-white hover:text-navy-100 transition-colors">
                <Facebook size={20} />
              </a>
              <a href="#" aria-label="Instagram" className="text-white hover:text-navy-100 transition-colors">
                <Instagram size={20} />
              </a>
              <a href="#" aria-label="LinkedIn" className="text-white hover:text-navy-100 transition-colors">
                <Linkedin size={20} />
              </a>
              <a href="#" aria-label="Twitter" className="text-white hover:text-navy-100 transition-colors">
                <Twitter size={20} />
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-6">Quick Links</h4>
            <ul className="space-y-4">
              <li><Link to="/" className="text-gray-300 hover:text-teal-400 transition">Home</Link></li>
              <li><Link to="/about" className="hover:underline">About Dr. Gourav</Link></li>
              <li><Link to="/programs" className="hover:underline">Programs</Link></li>
              <li><Link to="/results" className="hover:underline">Student Results</Link></li>
              <li><Link to="/testimonials" className="hover:underline">Testimonials</Link></li>
              <li><Link to="/contact" className="hover:underline">Contact Us</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-6">Our Programs</h4>
            <ul className="space-y-4">
              <li><a href="#" className="hover:underline">One-on-One Mentorship</a></li>
              <li><a href="#" className="hover:underline">Group Sessions</a></li>
              <li><a href="#" className="hover:underline">Live Webinars</a></li>
              <li><a href="#" className="hover:underline">Mock Tests</a></li>
              <li><a href="#" className="hover:underline">Study Resources</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-6">Contact Us</h4>
            <ul className="space-y-4">
              <li className="flex items-center">
                <Mail size={20} className="mr-2 flex-shrink-0" />
                <span>eyeconiclalla@gmail.com</span>
              </li>
              <li className="flex items-center">
                <Phone size={20} className="mr-2 flex-shrink-0" />
                <span>+91 91163 24253</span>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-6">Legal</h4>
            <ul className="space-y-4">
              <li>
                <Link to="/terms-and-conditions" className="hover:underline">Terms & Conditions</Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="hover:underline">Privacy Policy</Link>
              </li>
              <li>
                <Link to="/refund-policy" className="hover:underline">Refund Policy</Link>
              </li>
              <li>
                <Link to="/disclaimer" className="hover:underline">Disclaimer</Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-teal-400 mt-12 pt-8 text-center text-sm">
          <p>&copy; 2025 Eyeconic Mentorship. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;