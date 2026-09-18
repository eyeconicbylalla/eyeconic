import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Tests from './pages/Tests';
import TestDetail from './pages/TestDetail';
import TestAttempt from './pages/TestAttempt';
import TestResults from './pages/TestResults';
import AppLink from './pages/AppLink';
import GtPredictor from './pages/GtPredictor';
import Admin from './pages/Admin';
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
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/app-link" element={<AppLink />} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/tests" element={<RequireAuth><Tests /></RequireAuth>} />
              <Route path="/tests/:quizId" element={<RequireAuth><TestDetail /></RequireAuth>} />
              <Route path="/tests/:quizId/attempt" element={<RequireAuth><TestAttempt /></RequireAuth>} />
              <Route path="/tests/:quizId/results/:attemptId" element={<RequireAuth><TestResults /></RequireAuth>} />
              <Route path="/gt-predictor" element={<GtPredictor />} />
              <Route path="/admin" element={<Admin />} />
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
          <a
            href="https://wa.me/919116303037?text=Hey!%20I%20would%20like%20to%20know%20more%20about%20the%20mentorship%20program!"
            target="_blank"
            rel="noopener noreferrer"
            className="fixed bottom-6 right-6 z-50 transition-transform duration-300 hover:scale-110 block w-14 h-14"
          >
            <img src={waIcon} alt="WhatsApp" className="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
          </a>
        </div>
      </Router>
    </AppAuthProvider>
  );
}

export default App;
