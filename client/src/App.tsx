import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Blogs from './pages/Blogs';
import BlogPost from './pages/BlogPost';
import Disclaimer from './pages/Disclaimer';
import PrivacyPolicy from './pages/PrivacyPolicy';
import RefundPolicy from './pages/RefundPolicy';
import TermsAndConditions from './pages/TermsAndConditions';
import NotFound from './pages/NotFound';
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
    <Router>
      <ScrollToHash />
      <div className="bg-[#0A0F14] min-h-screen text-[#F8FAFC] flex flex-col relative">
        <Navbar />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
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
          href="https://wa.me/918233454535?text=Hey!%20I%20would%20like%20to%20know%20more%20about%20the%20mentorship%20program!"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 transition-transform duration-300 hover:scale-110 block w-14 h-14"
        >
          <img src={waIcon} alt="WhatsApp" className="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
        </a>
      </div>
    </Router>
  );
}

export default App;