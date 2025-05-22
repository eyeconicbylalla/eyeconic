import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import { useNavigate } from 'react-router-dom';

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
}

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      })
      .catch(() => {
        setError('Failed to load dashboard');
        setLoading(false);
      });
  }, [navigate]);

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
    <section className="py-20 bg-teal-50 min-h-screen">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-teal-700 mb-8 text-center">Student Dashboard</h2>
        <div className="grid md:grid-cols-3 gap-8 mb-12">
         
          <div className="bg-white rounded-xl shadow p-6 border border-teal-100">
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
          <div className="bg-white rounded-xl shadow p-6 border border-teal-100">
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
        <div className="bg-white rounded-xl shadow p-6 border border-teal-100 mb-8">
          <h3 className="font-semibold text-teal-800 mb-2">Performance Analytics</h3>
          <div className="mb-2">{userData.analytics.feedback || 'No feedback yet.'}</div>
          <div className="flex flex-wrap gap-4 mt-4">
            {userData.analytics.scores.length === 0 && <div className="text-gray-500">No scores yet.</div>}
            {userData.analytics.scores.map((s, i) => (
              <div key={i} className="bg-teal-100 rounded px-3 py-1 text-sm text-teal-800">
                {new Date(s.date).toLocaleDateString()}: <span className="font-bold">{s.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Dashboard;
