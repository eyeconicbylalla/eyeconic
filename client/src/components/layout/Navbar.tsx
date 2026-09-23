import React, { useState, useEffect, useRef } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import LoginModal from '../auth/LoginModal';
import SignupModal from '../auth/SignupModal';
import StudentLoginModal from '../auth/StudentLoginModal';
import { useAppAuth } from '../../context/AppAuthContext';
import logo from '../../assets/Logo.png'; // <-- Add your logo file here

const sectionLinks = [
  { label: 'Courses', to: '/#courses' },
  { label: 'About', to: '/#about' },
  { label: 'Mentors', to: '/#mentors' },
  { label: 'Testimonials', to: '/#testimonials' },
  { label: 'Blogs', to: '/blogs' },
  { label: 'Contact', to: '/#contact' },
];

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [studentLoginOpen, setStudentLoginOpen] = useState(false);
  const location = useLocation();
  const { user: appUser, logout: appLogout } = useAppAuth();
  const isStudentArea = location.pathname === '/dashboard' || location.pathname.startsWith('/tests');
  const isAppAuthed = Boolean(appUser);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // This navbar is a fixed overlay, so the app shell reserves space for it via
  // the --nav-h custom property (see App.tsx + index.css). Publishing the real
  // measured height keeps that reservation exact at every breakpoint and
  // whenever the navbar's own sizing changes. The mobile menu is absolutely
  // positioned (overlays content), so opening it never changes this value.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const publishHeight = () => {
      document.documentElement.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
    };

    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(nav);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--nav-h');
    };
  }, []);

  const handleStudentLogout = async () => {
    await appLogout();
    window.location.href = '/';
  };

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/' && !location.hash;
    if (to.startsWith('/#')) {
      return location.pathname === '/' && location.hash === to.slice(1);
    }
    return location.pathname.startsWith(to);
  };

  return (
    <nav ref={navRef} className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled
        ? 'bg-[#0A0F14]/90 backdrop-blur-xl border-b border-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.3)]'
        : 'bg-[#0A0F14]/70 backdrop-blur-md border-b border-transparent'
    }`}>
      {/* py-3 lives on this bar row (not the nav) so the nav's height — and
          therefore --nav-h — is exactly the bar, unaffected by the dropdown. */}
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2 text-2xl font-bold text-[#18B6A4] hover:text-[#1CC8B5] transition-colors">
          <img src={logo} alt="Eyeconic Logo" className="h-8 w-8 object-contain" />
          <span>EyeConic</span>
        </Link>
        <div className="hidden md:flex items-center space-x-8">
          <ul className="flex space-x-8">
            <li>
              <Link
                to="/"
                className={`font-medium transition-colors ${
                  isActive('/') ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
                }`}
              >
                Home
              </Link>
            </li>
            {/* Show all options on public pages, student nav inside the student area */}
            {isStudentArea && isAppAuthed ? (
              <>
                <li>
                  <Link
                    to="/dashboard"
                    className={`font-medium transition-colors ${
                      isActive('/dashboard') ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
                    }`}
                  >
                    Dashboard
                  </Link>
                </li>
              </>
            ) : (
              <>
                {sectionLinks.map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className={`font-medium transition-colors ${
                        isActive(item.to) ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </>
            )}
          </ul>
          {/* Auth buttons */}
          {isAppAuthed ? (
            <>
              {!isStudentArea && (
                <Link to="/dashboard" className="btn btn-outline">My Dashboard</Link>
              )}
              <button
                onClick={handleStudentLogout}
                className="btn btn-outline ml-2"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => setStudentLoginOpen(true)}
              className="btn btn-outline"
            >
              Student Login
            </button>
          )}
          <a
            href="https://forms.gle/CAa6xLNsjsdhJt5M7"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            Book a Call
          </a>
        </div>
        <button
          className="md:hidden text-[#CBD5E1] hover:text-white transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu — out of flow (absolute) so it overlays page content as
          before and so the nav's measured height (--nav-h) never changes when
          the menu opens. */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-[#0A0F14]/98 backdrop-blur-2xl border-t border-white/[0.06] z-50">
          <div className="container mx-auto px-4 py-6">
            <ul className="space-y-4">
              <li>
                <Link
                  to="/"
                  onClick={() => setIsMenuOpen(false)}
                  className={`font-medium transition-colors block ${
                    isActive('/') ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
                  }`}
                >
                  Home
                </Link>
              </li>
              {isStudentArea && isAppAuthed ? (
                <>
                  <li>
                    <Link
                      to="/dashboard"
                      onClick={() => setIsMenuOpen(false)}
                      className={`font-medium transition-colors block ${
                        isActive('/dashboard') ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
                      }`}
                    >
                      Dashboard
                    </Link>
                  </li>
                </>
              ) : (
                <>
                  {sectionLinks.map((item) => (
                    <li key={item.label}>
                      <Link
                        to={item.to}
                        onClick={() => setIsMenuOpen(false)}
                        className={`font-medium transition-colors block ${
                          isActive(item.to) ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </>
              )}
            </ul>
            <div className="mt-6 space-y-4 flex flex-col">
              {isAppAuthed ? (
                <>
                  {!isStudentArea && (
                    <Link to="/dashboard" onClick={() => setIsMenuOpen(false)} className="btn btn-outline w-full text-center">
                      My Dashboard
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      handleStudentLogout();
                    }}
                    className="btn btn-outline w-full text-center"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setStudentLoginOpen(true);
                  }}
                  className="btn btn-outline w-full"
                >
                  Student Login
                </button>
              )}
              <a
                href="https://forms.gle/CAa6xLNsjsdhJt5M7"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMenuOpen(false)}
                className="btn btn-primary w-full text-center"
              >
                Book a Call
              </a>
            </div>
          </div>
        </div>
      )}

      <StudentLoginModal
        isOpen={studentLoginOpen}
        onClose={() => setStudentLoginOpen(false)}
        onSuccess={() => window.location.assign('/dashboard')}
        onSwitchToLegacy={() => {
          setStudentLoginOpen(false);
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
      <SignupModal
        isOpen={signupOpen}
        onClose={() => setSignupOpen(false)}
        onSignupSuccess={() => window.location.reload()}
        onSwitchToLogin={() => {
          setSignupOpen(false);
          setLoginOpen(true);
        }}
      />
    </nav>
  );
};

export default Navbar;