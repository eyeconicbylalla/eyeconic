import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const [loginEmail, setLoginEmail] = useState('');
  const [signupOpen, setSignupOpen] = useState(false);
  const [studentLoginOpen, setStudentLoginOpen] = useState(false);
  const location = useLocation();
  const { user: appUser, logout: appLogout } = useAppAuth();
  const isStudentArea =
    location.pathname === '/dashboard' ||
    location.pathname.startsWith('/tests') ||
    location.pathname.startsWith('/daily-pyq');
  const isAppAuthed = Boolean(appUser);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Any navigation (link taps already close the menu; this also covers
  // browser back/forward and programmatic navigation) must not leave a
  // stale open menu behind.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location]);

  // While the mobile menu is open it behaves like a modal sheet over the
  // page: the page behind it must not scroll, Escape closes it (returning
  // focus to the toggle), and crossing into lg — where the hamburger no
  // longer exists — must close it instead of leaving the body locked.
  useEffect(() => {
    if (!isMenuOpen) return;

    const closeMenu = () => setIsMenuOpen(false);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        toggleRef.current?.focus();
      }
    };

    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const handleDesktopChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeMenu();
    };

    document.addEventListener('keydown', handleKeyDown);
    desktopQuery.addEventListener('change', handleDesktopChange);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      desktopQuery.removeEventListener('change', handleDesktopChange);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  // Move focus into the menu when it opens so keyboard and screen-reader
  // users land on the menu itself, not the dimmed page behind it.
  useEffect(() => {
    if (!isMenuOpen) return;
    menuRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [isMenuOpen]);

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

  // The horizontal nav only fits comfortably from lg (1024px) up: logo + up to
  // 7 links + two action buttons need ~950px at text-sm. Below that (tablets
  // included) the hamburger menu takes over, so the bar can never wrap,
  // squeeze or collide at any supported width.
  const linkClass = (to: string) =>
    `font-medium text-sm whitespace-nowrap transition-colors ${
      isActive(to) ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
    }`;

  return (
    <nav ref={navRef} className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled
        ? 'bg-[#0A0F14]/90 backdrop-blur-xl border-b border-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.3)]'
        : 'bg-[#0A0F14]/70 backdrop-blur-md border-b border-transparent'
    }`}>
      {/* py-3 lives on this bar row (not the nav) so the nav's height — and
          therefore --nav-h — is exactly the bar, unaffected by the dropdown. */}
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center space-x-2 text-2xl font-bold text-[#18B6A4] hover:text-[#1CC8B5] transition-colors shrink-0">
          <img src={logo} alt="Eyeconic Logo" className="h-8 w-8 object-contain" />
          <span className="whitespace-nowrap">EyeConic</span>
        </Link>
        <div className="hidden lg:flex items-center gap-5 xl:gap-7 min-w-0">
          <ul className="flex items-center gap-4 xl:gap-6 whitespace-nowrap">
            <li>
              <Link to="/" className={linkClass('/')}>
                Home
              </Link>
            </li>
            {/* Show all options on public pages, student nav inside the student area */}
            {isStudentArea && isAppAuthed ? (
              <>
                <li>
                  <Link to="/dashboard" className={linkClass('/dashboard')}>
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link to="/daily-pyq" className={linkClass('/daily-pyq')}>
                    Daily PYQ
                  </Link>
                </li>
              </>
            ) : (
              <>
                {sectionLinks.map((item) => (
                  <li key={item.label}>
                    <Link to={item.to} className={linkClass(item.to)}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </>
            )}
          </ul>
          {/* Auth buttons */}
          <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
            {isAppAuthed ? (
              <>
                {!isStudentArea && (
                  <Link to="/dashboard" className="btn btn-outline">My Dashboard</Link>
                )}
                <button
                  onClick={handleStudentLogout}
                  className="btn btn-outline"
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
        </div>
        <button
          ref={toggleRef}
          className="lg:hidden p-2 -m-2 text-[#CBD5E1] hover:text-white transition-colors shrink-0"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu — out of flow (absolute) so it overlays page content as
          before and so the nav's measured height (--nav-h) never changes when
          the menu opens. The solid panel + body-level scrim make it read as a
          proper sheet instead of loose links stamped over the hero. */}
      {isMenuOpen && (
        <>
          {/* Scrim. Portaled to document.body because the nav's own
              backdrop-blur forms a containing block for fixed descendants
              (a fixed child of the nav would be sized to the bar instead of
              the viewport), and held at z-40 so the navbar, its toggle and
              the menu panel stay above it while everything else dims.
              Tapping it closes the menu. */}
          {createPortal(
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMenuOpen(false)}
              aria-hidden="true"
            />,
            document.body
          )}
          {/* The panel is capped to the small-viewport height below the bar
              and scrolls internally, so every item stays reachable on short
              and landscape screens. (/95, not /98 — Tailwind's opacity scale
              steps in 5s, so /98 silently compiles to nothing.) */}
          <div
            id="mobile-menu"
            ref={menuRef}
            className="lg:hidden absolute top-full left-0 right-0 bg-[#0A0F14]/95 backdrop-blur-xl border-t border-white/[0.06] shadow-large-dark max-h-[calc(100svh_-_var(--nav-h))] overflow-y-auto overscroll-contain animate-menu-in"
          >
            <div className="container mx-auto px-4 py-6">
              <ul className="space-y-2">
                <li>
                  <Link
                    to="/"
                    onClick={() => setIsMenuOpen(false)}
                    className={`font-medium transition-colors block py-2.5 ${
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
                        className={`font-medium transition-colors block py-2.5 ${
                          isActive('/dashboard') ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
                        }`}
                      >
                        Dashboard
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/daily-pyq"
                        onClick={() => setIsMenuOpen(false)}
                        className={`font-medium transition-colors block py-2.5 ${
                          isActive('/daily-pyq') ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
                        }`}
                      >
                        Daily PYQ
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
                          className={`font-medium transition-colors block py-2.5 ${
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
        </>
      )}

      <StudentLoginModal
        isOpen={studentLoginOpen}
        onClose={() => setStudentLoginOpen(false)}
        onSuccess={() => window.location.assign('/dashboard')}
        onSwitchToVisitor={() => {
          setStudentLoginOpen(false);
          setLoginOpen(true);
        }}
      />
      <LoginModal
        key={`navbar-login-${loginEmail}`}
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => window.location.assign('/predictor')}
        onSwitchToSignup={() => {
          setLoginOpen(false);
          setSignupOpen(true);
        }}
        defaultEmail={loginEmail}
      />
      <SignupModal
        isOpen={signupOpen}
        onClose={() => setSignupOpen(false)}
        onContinueToLogin={(email) => {
          setSignupOpen(false);
          setLoginEmail(email);
          setLoginOpen(true);
        }}
        onSwitchToLogin={() => {
          setSignupOpen(false);
          setLoginOpen(true);
        }}
      />
    </nav>
  );
};

export default Navbar;
