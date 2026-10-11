import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import LoginModal from '../auth/LoginModal';
import SignupModal from '../auth/SignupModal';
import StudentLoginModal from '../auth/StudentLoginModal';
import { useAppAuth } from '../../context/AppAuthContext';
import logo from '../../assets/Logo.png'; // <-- Add your logo file here

type NavChildLink = { label: string; to: string };
type NavLink = NavChildLink & { children?: NavChildLink[] };

// About groups its related sections (Testimonials / Blogs / Contact) into a
// dropdown on desktop and an expandable row in the mobile menu.
const sectionLinks: NavLink[] = [
  { label: 'Courses', to: '/#courses' },
  {
    label: 'About',
    to: '/#about',
    children: [
      { label: 'Testimonials', to: '/#testimonials' },
      { label: 'Blogs', to: '/blogs' },
      { label: 'Contact', to: '/#contact' },
    ],
  },
  { label: 'Mentors', to: '/#mentors' },
];

// Grace period before the About dropdown closes on mouse-leave, so diagonal
// cursor paths from the trigger into the panel never flicker it shut.
const ABOUT_CLOSE_DELAY_MS = 120;

// Scroll-spy targets: the home-page sections the navbar links point at
// (Home → #home, Courses → #courses, Mentors → #mentors, and the About
// group's #about / #testimonials / #contact), in page order. While the
// landing page scrolls, the link whose section sits under the navbar lights
// up; sections without a link (features/results/videos/blogs/faqs) simply
// keep the previous link lit until the next spied section arrives.
const SPY_SECTION_IDS = ['home', 'courses', 'testimonials', 'mentors', 'about', 'contact'];

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  // id of the home-page section currently under the navbar (scroll-spy);
  // null everywhere except '/', where it drives the section-link highlight.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [signupOpen, setSignupOpen] = useState(false);
  const [studentLoginOpen, setStudentLoginOpen] = useState(false);
  // About dropdown (desktop) + About accordion (mobile menu).
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mobileAboutOpen, setMobileAboutOpen] = useState(false);
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
  const aboutItemRef = useRef<HTMLLIElement>(null);
  const aboutTriggerRef = useRef<HTMLAnchorElement>(null);
  const aboutPanelRef = useRef<HTMLDivElement>(null);
  const aboutCloseTimer = useRef<number | null>(null);
  // On touch devices a tap fires a synthetic mouseenter BEFORE the click, so
  // "already open" cannot tell a tap-reveal from a hover-emulation — this ref
  // remembers which one revealed the panel. Only a second tap navigates.
  const aboutOpenedByTap = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
      // A dropdown left open while the page scrolls away from under the
      // cursor would float detached from its trigger — close it.
      setAboutOpen(false);
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Hover state is shared by mouse and keyboard users, so the close timer
  // must never outlive the component.
  useEffect(() => {
    return () => {
      if (aboutCloseTimer.current) window.clearTimeout(aboutCloseTimer.current);
    };
  }, []);

  const openAbout = () => {
    if (aboutCloseTimer.current) {
      window.clearTimeout(aboutCloseTimer.current);
      aboutCloseTimer.current = null;
    }
    setAboutOpen(true);
  };

  const closeAbout = () => {
    if (aboutCloseTimer.current) {
      window.clearTimeout(aboutCloseTimer.current);
      aboutCloseTimer.current = null;
    }
    setAboutOpen(false);
  };

  const scheduleAboutClose = () => {
    if (aboutCloseTimer.current) window.clearTimeout(aboutCloseTimer.current);
    aboutCloseTimer.current = window.setTimeout(() => {
      aboutCloseTimer.current = null;
      setAboutOpen(false);
    }, ABOUT_CLOSE_DELAY_MS);
  };

  // Touch devices (hover: none) have no hover to reveal the panel with, so
  // the first tap expands the dropdown instead of navigating; a second tap
  // (or tapping any submenu item) navigates as usual.
  const handleAboutTriggerClick = (event: React.MouseEvent) => {
    if (window.matchMedia('(hover: none)').matches && !aboutOpenedByTap.current) {
      event.preventDefault();
      aboutOpenedByTap.current = true;
      openAbout();
    }
  };

  const handleAboutTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAbout();
      // The panel mounts on open, so focus its first link one frame later.
      requestAnimationFrame(() => {
        aboutPanelRef.current?.querySelector<HTMLElement>('a')?.focus();
      });
    }
  };

  const handleAboutItemKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && aboutOpen) {
      // Focus first, then close: focusing the trigger fires the group's
      // focus-open handler, so the close must be the last state write.
      aboutTriggerRef.current?.focus();
      closeAbout();
    }
  };

  const handleAboutBlur = (event: React.FocusEvent) => {
    // Focus leaving the whole group (trigger + panel) closes it; moving
    // between items inside keeps it open.
    if (!aboutItemRef.current?.contains(event.relatedTarget as Node)) {
      setAboutOpen(false);
    }
  };

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

  // Scroll-spy for the landing page: the link whose section the navbar
  // currently sits over stays lit while the visitor scrolls (and, unlike a
  // bare hash check, lights up on plain scrolling without any navigation).
  // A section becomes active once its top edge crosses a line a quarter of
  // the viewport below the navbar — the moment its heading arrives in view —
  // and stays lit until the next spied section takes over, so the highlight
  // moves in one direction per scroll gesture and never flickers. On every
  // other route the spy is detached and the URL-based highlight below
  // applies unchanged.
  useEffect(() => {
    if (location.pathname !== '/') {
      setActiveSection(null);
      return;
    }

    let frame = 0;

    const computeActiveSection = () => {
      frame = 0;
      const navHeight = navRef.current?.offsetHeight ?? 0;
      const line = navHeight + window.innerHeight * 0.25;

      const sections = SPY_SECTION_IDS.reduce<{ id: string; top: number }[]>((acc, id) => {
        const el = document.getElementById(id);
        if (el) acc.push({ id, top: el.getBoundingClientRect().top });
        return acc;
      }, []);
      if (sections.length === 0) return;

      // Page order = ascending top; the active section is the furthest one
      // down that has still crossed the line.
      sections.sort((a, b) => a.top - b.top);
      let active = sections[0].id;
      // The page cannot scroll past the footer, so a short last section may
      // never cross the line — pin it once the bottom is reached.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        active = sections[sections.length - 1].id;
      } else {
        for (const section of sections) {
          if (section.top <= line) active = section.id;
        }
      }

      setActiveSection((prev) => (prev === active ? prev : active));
    };

    const requestCompute = () => {
      if (!frame) frame = requestAnimationFrame(computeActiveSection);
    };

    computeActiveSection();
    window.addEventListener('scroll', requestCompute, { passive: true });
    window.addEventListener('resize', requestCompute);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestCompute);
      window.removeEventListener('resize', requestCompute);
    };
  }, [location.pathname]);

  // Any navigation (link taps already close the menu; this also covers
  // browser back/forward and programmatic navigation) must not leave a
  // stale open menu behind.
  useEffect(() => {
    setIsMenuOpen(false);
    setAboutOpen(false);
  }, [location]);

  // While the About dropdown is open, tapping anywhere outside its group
  // (trigger + panel) closes it — the touch counterpart of mouse-leave.
  useEffect(() => {
    if (!aboutOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!aboutItemRef.current?.contains(event.target as Node)) {
        setAboutOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [aboutOpen]);

  // A closed dropdown forgets how it was opened.
  useEffect(() => {
    if (!aboutOpen) aboutOpenedByTap.current = false;
  }, [aboutOpen]);

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

  // The mobile menu always starts fresh: closing it (link, scrim, Escape,
  // crossing lg) also collapses the About accordion.
  useEffect(() => {
    if (!isMenuOpen) setMobileAboutOpen(false);
  }, [isMenuOpen]);

  const handleStudentLogout = async () => {
    await appLogout();
    window.location.href = '/';
  };

  const isActive = (to: string) => {
    // On the landing page the scroll-spy owns the highlight (it agrees with
    // the hash right after a section link is clicked, and keeps following
    // the visitor afterwards). Route links such as /blogs are never "the
    // current section" while spying the home page.
    if (activeSection !== null) {
      if (to === '/') return activeSection === 'home';
      // '/#courses'.slice(2) === 'courses' — the bare section id the spy stores.
      if (to.startsWith('/#')) return activeSection === to.slice(2);
      return false;
    }
    if (to === '/') return location.pathname === '/' && !location.hash;
    if (to.startsWith('/#')) {
      return location.pathname === '/' && location.hash === to.slice(1);
    }
    return location.pathname.startsWith(to);
  };

  // The horizontal nav only fits comfortably from lg (1024px) up: logo +
  // Home/Courses/About/Mentors (About folding Testimonials/Blogs/Contact into
  // its dropdown) + two action buttons. Below that (tablets included) the
  // hamburger menu takes over, so the bar can never wrap, squeeze or collide
  // at any supported width.
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
          {/* self-stretch: the ul fills the bar row's content height so every
              li (and therefore the About dropdown's top-full anchor) reaches
              the bottom edge of that content box — the dropdown then floats
              just below the bar instead of starting mid-bar. */}
          <ul className="flex self-stretch gap-4 xl:gap-6 whitespace-nowrap">
            <li className="flex items-center">
              <Link to="/" className={linkClass('/')}>
                Home
              </Link>
            </li>
            {/* Show all options on public pages, student nav inside the student area */}
            {isStudentArea && isAppAuthed ? (
              <>
                <li className="flex items-center">
                  <Link to="/dashboard" className={linkClass('/dashboard')}>
                    Dashboard
                  </Link>
                </li>
                <li className="flex items-center">
                  <Link to="/daily-pyq" className={linkClass('/daily-pyq')}>
                    Daily PYQ
                  </Link>
                </li>
              </>
            ) : (
              <>
                {sectionLinks.map((item) =>
                  item.children ? (
                    <li
                      key={item.label}
                      ref={aboutItemRef}
                      className="relative flex items-center"
                      onMouseEnter={openAbout}
                      onMouseLeave={scheduleAboutClose}
                      onFocus={openAbout}
                      onBlur={handleAboutBlur}
                      onKeyDown={handleAboutItemKeyDown}
                    >
                      <Link
                        ref={aboutTriggerRef}
                        to={item.to}
                        aria-haspopup="true"
                        aria-expanded={aboutOpen}
                        aria-controls="about-dropdown"
                        onClick={handleAboutTriggerClick}
                        onKeyDown={handleAboutTriggerKeyDown}
                        className={`font-medium text-sm whitespace-nowrap inline-flex items-center gap-1 transition-colors ${
                          isActive(item.to) || item.children.some((child) => isActive(child.to))
                            ? 'text-[#18B6A4]'
                            : 'text-[#CBD5E1] hover:text-white'
                        }`}
                      >
                        {item.label}
                        <ChevronDown
                          size={14}
                          aria-hidden="true"
                          className={`shrink-0 mt-px transition-transform duration-200 ${aboutOpen ? 'rotate-180' : ''}`}
                        />
                      </Link>
                      {aboutOpen && (
                        /* The pt-5 wrapper bridges the gap between the bar and
                           the visible panel; being part of the li's hover box
                           (padding, not margin) the cursor can travel from the
                           trigger into the panel without leaving the group. */
                        <div
                          id="about-dropdown"
                          ref={aboutPanelRef}
                          className="absolute left-0 top-full pt-5"
                        >
                          <ul className="py-1.5 px-1.5 rounded-xl bg-[#0A0F14]/95 backdrop-blur-xl border border-white/[0.08] shadow-large-dark animate-menu-in">
                            {item.children.map((child) => (
                              <li key={child.label}>
                                <Link
                                  to={child.to}
                                  onClick={() => setAboutOpen(false)}
                                  className={`block px-3.5 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                                    isActive(child.to)
                                      ? 'text-[#18B6A4]'
                                      : 'text-[#CBD5E1] hover:text-white hover:bg-white/[0.06]'
                                  }`}
                                >
                                  {child.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  ) : (
                    <li key={item.label} className="flex items-center">
                      <Link to={item.to} className={linkClass(item.to)}>
                        {item.label}
                      </Link>
                    </li>
                  )
                )}
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
                    {sectionLinks.map((item) =>
                      item.children ? (
                        /* About: the label still navigates to /#about; the
                           chevron toggles the submenu (tap-first UX on
                           touch). The grid-rows 0fr→1fr trick animates the
                           submenu to its natural content height. */
                        <li key={item.label}>
                          <div className="flex items-center">
                            <Link
                              to={item.to}
                              onClick={() => setIsMenuOpen(false)}
                              className={`flex-1 font-medium transition-colors block py-2.5 ${
                                isActive(item.to) ? 'text-[#18B6A4]' : 'text-[#CBD5E1] hover:text-white'
                              }`}
                            >
                              {item.label}
                            </Link>
                            <button
                              type="button"
                              onClick={() => setMobileAboutOpen((open) => !open)}
                              aria-expanded={mobileAboutOpen}
                              aria-controls="mobile-about-submenu"
                              aria-label={
                                mobileAboutOpen ? 'Collapse About submenu' : 'Expand About submenu'
                              }
                              className="p-2 -m-2 ml-2 rounded-md text-[#CBD5E1] hover:text-white transition-colors"
                            >
                              <ChevronDown
                                size={20}
                                aria-hidden="true"
                                className={`transition-transform duration-200 ${
                                  mobileAboutOpen ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>
                          <div
                            id="mobile-about-submenu"
                            className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                              mobileAboutOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                            }`}
                          >
                            {/* Spacing sits on the first li (inside the
                                overflow-hidden item) — a margin on the ul
                                itself would floor the collapsed 0fr track
                                and leak a 4px sliver of the guide border. */}
                            <ul className="min-h-0 overflow-hidden ml-1 pl-4 border-l border-white/[0.08]">
                              {item.children.map((child, index) => (
                                <li key={child.label} className={index === 0 ? 'mt-1' : undefined}>
                                  <Link
                                    to={child.to}
                                    onClick={() => setIsMenuOpen(false)}
                                    className={`block py-2.5 font-medium text-sm transition-colors ${
                                      isActive(child.to)
                                        ? 'text-[#18B6A4]'
                                        : 'text-[#CBD5E1] hover:text-white'
                                    }`}
                                  >
                                    {child.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </li>
                      ) : (
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
                      )
                    )}
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
        onSwitchToSignup={() => {
          setStudentLoginOpen(false);
          setSignupOpen(true);
        }}
      />
      <LoginModal
        key={`navbar-login-${loginEmail}`}
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => window.location.assign('/dashboard')}
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
