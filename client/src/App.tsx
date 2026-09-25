import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import DailyPyq from './pages/DailyPyq';
import DailyPyqHistory from './pages/DailyPyqHistory';
import MiniCctHistory from './pages/MiniCctHistory';
import Tests from './pages/Tests';
import TestDetail from './pages/TestDetail';
import TestAttempt from './pages/TestAttempt';
import TestResults from './pages/TestResults';
import AppLink from './pages/AppLink';
import Blogs from './pages/Blogs';
import BlogPost from './pages/BlogPost';
import Disclaimer from './pages/Disclaimer';
import PrivacyPolicy from './pages/PrivacyPolicy';
import RefundPolicy from './pages/RefundPolicy';
import TermsAndConditions from './pages/TermsAndConditions';
import NotFound from './pages/NotFound';
import RequireAuth from './components/app/RequireAuth';
import { AppAuthProvider } from './context/AppAuthContext';
import waIcon from './assets/WA Icon.png';

// P4 route-level code splitting: the predictor surfaces are self-contained
// and heavy (table + animations + outcome capture) — they ship only when
// their routes are visited, keeping the initial bundle lean.
const Predictor = lazy(() => import('./pages/Predictor'));
const PredictorHistory = lazy(() => import('./pages/PredictorHistory'));
const SignInGate = lazy(() => import('./pages/predictor/SignInGate'));
// Platform Choice Recommender (Feature 06) — self-contained student surface.
const PlatformChoice = lazy(() => import('./pages/PlatformChoice'));
// The admin console pulls in xlsx + a rich-text editor — visitors never need
// it on first paint, so it ships only when /admin is opened.
const Admin = lazy(() => import('./pages/Admin'));

const RouteFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Loading">
    <div className="w-8 h-8 rounded-full border-2 border-[#18B6A4] border-t-transparent animate-spin" />
  </div>
);

function ScrollToHash() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const element = document.getElementById(location.hash.slice(1));
    if (!element) {
      return;
    }

    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.hash, location.pathname]);

  return null;
}

function App() {
  return (
    <AppAuthProvider>
      <Router>
        <ScrollToHash />
        <div className="bg-[#0A0F14] min-h-screen text-[#F8FAFC] flex flex-col relative">
          <Navbar />
          {/* The navbar is a fixed overlay; this single reservation guarantees
              every route's content starts below it (--nav-h is published by the
              Navbar from its measured height — see index.css for fallbacks). */}
          <main className="flex-grow pt-[var(--nav-h)]">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/app-link" element={<AppLink />} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route
                path="/platform-choice"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <RequireAuth><PlatformChoice /></RequireAuth>
                  </Suspense>
                }
              />
              <Route path="/daily-pyq" element={<RequireAuth><DailyPyq /></RequireAuth>} />
              <Route path="/daily-pyq/history" element={<RequireAuth><DailyPyqHistory /></RequireAuth>} />
              <Route path="/mini-cct/history" element={<RequireAuth><MiniCctHistory /></RequireAuth>} />
              <Route path="/tests" element={<RequireAuth><Tests /></RequireAuth>} />
              <Route path="/tests/:quizId" element={<RequireAuth><TestDetail /></RequireAuth>} />
              <Route path="/tests/:quizId/attempt" element={<RequireAuth><TestAttempt /></RequireAuth>} />
              <Route path="/tests/:quizId/results/:attemptId" element={<RequireAuth><TestResults /></RequireAuth>} />
              <Route
                path="/predictor"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <RequireAuth intercept={<SignInGate />}>
                      <Predictor />
                    </RequireAuth>
                  </Suspense>
                }
              />
              <Route
                path="/predictor/history"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <RequireAuth intercept={<SignInGate />}>
                      <PredictorHistory />
                    </RequireAuth>
                  </Suspense>
                }
              />
              <Route
                path="/predictor/history/:id"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <RequireAuth intercept={<SignInGate />}>
                      <PredictorHistory />
                    </RequireAuth>
                  </Suspense>
                }
              />
              {/* Legacy GT predictor retired at Phase 8 (spec §1/§18): exactly
                  one predictor is ever live — old links land on the new one. */}
              <Route path="/gt-predictor" element={<Navigate to="/predictor" replace />} />
              <Route
                path="/admin"
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <Admin />
                  </Suspense>
                }
              />
              {/* Free Login User Dashboard (Feature 08) moved into the Admin
                  Portal as its "Free Users" tab — old links land there. */}
              <Route path="/mentor-dashboard" element={<Navigate to="/admin?tab=free-users" replace />} />
              <Route path="/blogs" element={<Blogs />} />
              <Route path="/blogs/search" element={<Blogs />} />
              <Route path="/blogs/category/:categorySlug" element={<Blogs />} />
              <Route path="/blogs/tag/:tagSlug" element={<Blogs />} />
              <Route path="/blogs/author/:authorId" element={<Blogs />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
              <Route path="/disclaimer" element={<Disclaimer />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
          {/* z-40 (below the navbar's mobile-menu scrim and modal backdrops)
              keeps the floating button from painting over an open menu. */}
          <a
            href="https://wa.me/919116303037?text=Hey!%20I%20would%20like%20to%20know%20more%20about%20the%20mentorship%20program!"
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-40 transition-transform duration-300 hover:scale-110 block w-14 h-14"
          >
            <img src={waIcon} alt="WhatsApp" className="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
          </a>
        </div>
      </Router>
    </AppAuthProvider>
  );
}

export default App;
