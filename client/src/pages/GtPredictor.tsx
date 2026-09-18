import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { useNavigate } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from 'chart.js';
import { CHART_DARK_DEFAULTS, CHART_DARK_BAR_COLORS } from '../config/chartConfig';
import LoginModal from '../components/auth/LoginModal';
import SignupModal from '../components/auth/SignupModal';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

/**
 * LEGACY visitor dashboard (GT Score Predictor) — unchanged behaviour, moved
 * from /dashboard so the integrated student dashboard can live there.
 * Uses the website's original localStorage-token auth (marketing leads).
 */

interface UserData {
  email: string;
  gtScore?: { current: number; time: string; predicted: number };
}

const GT_TIME_OPTIONS = ['1 Month', '3 Months', '6 Months', '9 Months', '1 Year'];

const GT_SCORE_TABLE: Record<string, { C: number; B: number; A: number }> = {
  '1 Month': { C: 0.15, B: 0.30, A: 0.50 },
  '3 Months': { C: 0.25, B: 0.45, A: 0.60 },
  '6 Months': { C: 0.35, B: 0.75, A: 0.90 },
  '9 Months': { C: 0.55, B: 0.95, A: 1.20 },
  '1 Year': { C: 0.70, B: 1.25, A: 1.50 },
};

function predictGTScore(current: number, time: string) {
  const band: 'C' | 'B' | 'A' = current > 110 ? 'C' : current > 80 ? 'B' : 'A';
  const row = GT_SCORE_TABLE[time];
  if (!row) return current;
  let predicted = Math.round(current + current * row[band]);
  if (predicted > 180) predicted = 180;
  return predicted;
}

const GtPredictor: React.FC = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gtCurrent, setGtCurrent] = useState(0);
  const [gtTime, setGtTime] = useState('1 Month');
  const [gtPredicted, setGtPredicted] = useState(0);
  const [gtSaved, setGtSaved] = useState(false);
  const [showGtResult, setShowGtResult] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    axios.get<UserData>(`${API_BASE_URL}/auth/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        setUser(res.data);
        setGtCurrent(res.data.gtScore?.current || 0);
        setGtTime(res.data.gtScore?.time || '1 Month');
        setGtPredicted(res.data.gtScore?.predicted || 0);
        setShowGtResult(!!res.data.gtScore);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load your visitor dashboard.');
        setLoading(false);
      });
  }, [navigate]);

  const saveGtScore = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoginOpen(true);
      return;
    }
    try {
      await axios.post(`${API_BASE_URL}/auth/gt-score`, {
        current: gtCurrent,
        time: gtTime,
        predicted: predictGTScore(gtCurrent, gtTime),
      }, { headers: { Authorization: `Bearer ${token}` } });
      setGtPredicted(predictGTScore(gtCurrent, gtTime));
      setGtSaved(true);
      setShowGtResult(true);
      setTimeout(() => setGtSaved(false), 2000);
    } catch {
      setGtSaved(false);
    }
  };

  if (loading) {
    return <div className="min-h-[60vh] bg-[#0A0F14] flex items-center justify-center text-[#94A3B8] py-20">Loading…</div>;
  }

  return (
    <section className="py-10 md:py-16 bg-[#0A0F14] min-h-screen">
      <div className="container mx-auto px-2 sm:px-4 max-w-4xl">
        <h2 className="text-2xl md:text-3xl font-bold text-[#F8FAFC] mb-2 text-center">GT Score Predictor</h2>
        <p className="text-center text-[#94A3B8] text-sm mb-8">
          Mentorship student? <a href="/dashboard" className="text-[#18B6A4] hover:underline">Sign in to the student dashboard</a> for your real test data.
        </p>

        {error && <div className="dark-banner-error text-center text-sm mb-6">{error}</div>}

        {!localStorage.getItem('token') && (
          <div className="bg-[#18222E] border border-white/[0.06] rounded-2xl p-6 text-center mb-8">
            <p className="text-[#CBD5E1] text-sm mb-4">Create a free visitor account to save your prediction.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setLoginOpen(true)} className="btn btn-outline text-sm">Visitor Login</button>
              <button onClick={() => setSignupOpen(true)} className="btn btn-primary text-sm">Visitor Sign Up</button>
            </div>
          </div>
        )}

        <div className="bg-[#18222E] rounded-2xl shadow-card-dark p-6 md:p-8 border border-white/[0.06]">
          <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:items-end">
            <div className="flex-1">
              <label className="block font-semibold mb-1 text-[#CBD5E1]">Current Number of Corrects (max 200)</label>
              <input
                type="number"
                min={0}
                max={200}
                value={gtCurrent}
                onChange={(e) => setGtCurrent(Math.max(0, Math.min(200, Number(e.target.value))))}
                className="border border-[#263445] bg-[#151E29] rounded px-3 py-2 w-full text-white focus:border-[#18B6A4] focus:ring-1 focus:ring-[#18B6A4] outline-none transition"
                disabled={!!user?.gtScore && showGtResult}
              />
            </div>
            <div className="flex-1">
              <label className="block font-semibold mb-1 text-[#CBD5E1]">Time with Eyeconic</label>
              <select
                value={gtTime}
                onChange={(e) => setGtTime(e.target.value)}
                className="border border-[#263445] bg-[#151E29] rounded px-3 py-2 w-full text-white focus:border-[#18B6A4] focus:ring-1 focus:ring-[#18B6A4] outline-none transition"
                disabled={!!user?.gtScore && showGtResult}
              >
                {GT_TIME_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <button
                className="btn btn-primary w-full"
                onClick={saveGtScore}
                disabled={!!user?.gtScore && showGtResult}
              >
                Predict Score
              </button>
              {gtSaved && <span className="ml-3 text-emerald-400">Saved!</span>}
            </div>
          </div>

          {showGtResult && (
            <div className="mt-6 flex flex-col lg:flex-row gap-6 md:gap-8 items-center">
              <div className="w-full lg:w-1/2 mb-6 lg:mb-0">
                <div className="font-semibold text-[#94A3B8] mb-1">Predicted Corrects (Max 200)</div>
                <div className="text-3xl font-bold text-[#4DD7C8]">{gtPredicted}</div>
                <div className="mt-4">
                  <a
                    href="https://forms.gle/CAa6xLNsjsdhJt5M7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-semibold px-4 py-2 rounded-lg shadow-md hover:from-teal-500 hover:to-cyan-500 transition-all text-base"
                    style={{ borderLeft: '5px solid #18B6A4' }}
                  >
                    🚀 Want to boost your GT score even more? <span className="underline decoration-white/50">Book a free call now!</span>
                  </a>
                </div>
              </div>
              <div className="w-full lg:w-1/2">
                <Bar
                  data={{
                    labels: ['Without Eyeconic', 'With Eyeconic'],
                    datasets: [{
                      label: 'GT Score',
                      data: [gtCurrent, gtPredicted],
                      backgroundColor: [CHART_DARK_BAR_COLORS.without, CHART_DARK_BAR_COLORS.withEyeconic],
                    }],
                  }}
                  options={{
                    responsive: true,
                    plugins: { ...CHART_DARK_DEFAULTS.plugins, legend: { display: false } },
                    scales: {
                      x: CHART_DARK_DEFAULTS.scales.x,
                      y: { ...CHART_DARK_DEFAULTS.scales.y, min: 0, max: 200 },
                    },
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoginSuccess={() => window.location.reload()}
        onSwitchToSignup={() => { setLoginOpen(false); setSignupOpen(true); }}
      />
      <SignupModal
        isOpen={signupOpen}
        onClose={() => setSignupOpen(false)}
        onSignupSuccess={() => window.location.reload()}
        onSwitchToLogin={() => { setSignupOpen(false); setLoginOpen(true); }}
      />
    </section>
  );
};

export default GtPredictor;
