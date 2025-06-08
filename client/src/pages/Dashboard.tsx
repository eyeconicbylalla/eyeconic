import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { useNavigate } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { HashLink } from 'react-router-hash-link';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Analytics {
  scores: Array<{ date: string; score: number }>;
  feedback: string;
}

interface UserData {
  email: string;
  enrolledCourses: string[];
  progress: Record<string, number>;
  resources: string[];
  notifications: Array<{
    message: string;
    date: string;
    read: boolean;
  }>;
  analytics: Analytics;
  gtScore?: {
    current: number;
    time: string;
    predicted: number;
  };
}

const GT_TIME_OPTIONS = [
  { label: '1 Month', value: '1 Month' },
  { label: '3 Months', value: '3 Months' },
  { label: '6 Months', value: '6 Months' },
  { label: '9 Months', value: '9 Months' },
  { label: '1 Year', value: '1 Year' }
];

const GT_SCORE_TABLE = [
  { time: '1 Month', gt: { C: 0.15, B: 0.30, A: 0.50 } },
  { time: '3 Months', gt: { C: 0.25, B: 0.45, A: 0.60 } },
  { time: '6 Months', gt: { C: 0.35, B: 0.75, A: 0.90 } },
  { time: '9 Months', gt: { C: 0.55, B: 0.95, A: 1.20 } },
  { time: '1 Year', gt: { C: 0.70, B: 1.25, A: 1.50 } }
];

function predictGTScore(current: number, time: string) {
  let band: 'C' | 'B' | 'A';
  if (current > 110) band = 'C';
  else if (current > 80) band = 'B';
  else band = 'A';
  const row = GT_SCORE_TABLE.find(r => r.time === time);
  if (!row) return current;
  let predicted = Math.round(current + current * row.gt[band]);
  if (predicted > 180) predicted = 180;
  return predicted;
}

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gtCurrent, setGtCurrent] = useState<number>(0);
  const [gtTime, setGtTime] = useState<string>('1 Month');
  const [gtPredicted, setGtPredicted] = useState<number>(0);
  const [gtSaved, setGtSaved] = useState<boolean>(false);
  const [showGtResult, setShowGtResult] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
      return;
    }

    axios.get<UserData>(`${API_BASE_URL}/auth/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        setUser(res.data);
        setLoading(false);
        setGtCurrent(res.data.gtScore?.current || 0);
        setGtTime(res.data.gtScore?.time || '1 Month');
        setGtPredicted(res.data.gtScore?.predicted || 0);
        setShowGtResult(!!res.data.gtScore); // Only show result if gtScore exists
      })
      .catch(() => {
        setError('Failed to load dashboard');
        setLoading(false);
      });
  }, [navigate]);

  const saveGtScore = async () => {
    const token = localStorage.getItem('token');
    try {
      await axios.post(`${API_BASE_URL}/auth/gt-score`, {
        current: gtCurrent,
        time: gtTime,
        predicted: predictGTScore(gtCurrent, gtTime)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGtPredicted(predictGTScore(gtCurrent, gtTime));
      setGtSaved(true);
      setShowGtResult(true);
      setUser(prev => prev ? { ...prev, gtScore: { current: gtCurrent, time: gtTime, predicted: predictGTScore(gtCurrent, gtTime) } } : prev);
      setTimeout(() => setGtSaved(false), 2000);
    } catch {
      setGtSaved(false);
    }
  };

  if (loading) return <div className="text-center py-20">Loading dashboard...</div>;
  if (error) return <div className="text-center text-red-600 py-20">{error}</div>;
  if (!user) return null;

  const userData = {
    enrolledCourses: user.enrolledCourses || [],
    progress: user.progress || {},
    resources: user.resources || [],
    notifications: user.notifications || [],
    analytics: {
      scores: user.analytics?.scores || [],
      feedback: user.analytics?.feedback || ''
    }
  };

  return (
    <section className="py-10 md:py-20 bg-teal-50 min-h-screen">
      <div className="container mx-auto px-2 sm:px-4">
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-teal-700 mb-6 md:mb-8 text-center">Student Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8 mb-8 md:mb-12">
          <div className="bg-white rounded-xl shadow p-4 md:p-6 border border-teal-100">
            <h3 className="font-semibold text-teal-800 mb-2">Notifications</h3>
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {userData.notifications.length === 0 && <li className="text-gray-500">No notifications yet.</li>}
              {userData.notifications.map((n, i) => (
                <li key={i} className={`text-sm ${n.read ? 'text-gray-500' : 'text-teal-700 font-semibold'}`}>
                  {n.message} <span className="text-xs text-gray-400">({new Date(n.date).toLocaleDateString()})</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white rounded-xl shadow p-4 md:p-6 border border-teal-100">
            <h3 className="font-semibold text-teal-800 mb-2">Resources</h3>
            <ul className="space-y-2">
              {userData.resources.length === 0 && <li className="text-gray-500">No resources yet.</li>}
              {userData.resources.map((r, i) => (
                <li key={i}>
                  <a href={r} className="text-teal-700 hover:underline" target="_blank" rel="noopener noreferrer">
                    Download Resource {i + 1}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow p-4 md:p-6 border border-teal-100 mb-8">
          <h3 className="font-semibold text-teal-800 mb-2">Performance Analytics</h3>
          
         
          {/* GT Score Predictor */}
          <div className="mt-10 border-t pt-8">
            <h4 className="text-lg md:text-xl font-bold mb-4 text-teal-700">GT Score Predictor</h4>
            <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:items-end">
              <div className="flex-1">
                <label className="block font-semibold mb-1">Current Number of Corrects (max 200)</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={gtCurrent}
                  onChange={e => setGtCurrent(Math.max(0, Math.min(200, Number(e.target.value))))}
                  className="border rounded px-3 py-2 w-full"
                  disabled={!!user?.gtScore && showGtResult}
                />
              </div>
              <div className="flex-1">
                <label className="block font-semibold mb-1">Time with Eyeconic</label>
                <select
                  value={gtTime}
                  onChange={e => setGtTime(e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                  disabled={!!user?.gtScore && showGtResult}
                >
                  {GT_TIME_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <button
                  className="btn bg-teal-600 text-white px-6 py-2 rounded-lg mt-2 w-full"
                  onClick={saveGtScore}
                  disabled={!!user?.gtScore && showGtResult}
                >
                  Predict Score
                </button>
                {gtSaved && <span className="ml-3 text-green-600">Saved!</span>}
              </div>
            </div>
            {showGtResult && (
              <div className="mt-6 flex flex-col lg:flex-row gap-6 md:gap-8 items-center">
                <div className="w-full lg:w-1/2 mb-6 lg:mb-0">
                  <div className="font-semibold text-gray-700 mb-1">Predicted Corrects (Max 200)</div>
                  <div className="text-3xl font-bold text-teal-700">
                    {gtPredicted}
                  </div>
                  {/* Add call-to-action line */}
                  <div className="mt-4">
                    <a
                      href="https://forms.gle/CAa6xLNsjsdhJt5M7"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block bg-gradient-to-r from-teal-500 to-blue-500 text-white font-semibold px-4 py-2 rounded-lg shadow hover:from-teal-600 hover:to-blue-600 transition-colors text-base"
                      style={{ borderLeft: '5px solid #14b8a6' }}
                    >
                      🚀 Want to boost your GT score even more? <span className="underline">Book a free call now!</span>
                    </a>
                  </div>

                </div>
                <div className="w-full lg:w-1/2">
                  <Bar
                    data={{
                      labels: ['Without Eyeconic', 'With Eyeconic'],
                      datasets: [
                        {
                          label: 'GT Score',
                          data: [
                            gtCurrent,
                            gtPredicted
                          ],
                          backgroundColor: ['#e2e8f0', '#14b8a6']
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { display: false },
                        title: { display: false }
                      },
                      scales: {
                        y: { min: 0, max: 200 }
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        {/* ...existing code... */}
      </div>
    </section>
  );
};

export default Dashboard;
