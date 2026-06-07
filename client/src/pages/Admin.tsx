import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import * as XLSX from 'xlsx';
import BlogCmsPanel from '../components/admin/BlogCmsPanel';

interface Student {
  _id: string;
  name: string;
  email: string;
  phone: string;
  calledStatus?: string;
  buyStatus?: string;
  batchInterest?: string;
  adminNotes?: string;
  gtScore?: {
    current?: number;
    predicted?: number;
    time?: string;
  };
}

const ADMIN_EMAIL = 'admin@eyeconic1.com';
const ADMIN_PASSWORD = 'admin@eyeconic$';

const calledOptions = ['Not Called', 'Called'];
const buyOptions = ['Have to Pay', 'Will Buy', 'Paid'];
const batchOptions = ['Arjuna', 'Nurture 3.1', 'Foundation 2.1', ''];

const Admin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'students' | 'blogs'>('students');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/admin`, { email, password });
      setStudents(res.data.students);
      setTotal(res.data.total);
      setAuthenticated(true);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.msg || 'Invalid admin credentials');
      } else {
        setError('Invalid admin credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (id: string, field: keyof Student, value: string) => {
    setStudents(students =>
      students.map(s => (s._id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleSave = async (student: Student) => {
    setSavingId(student._id);
    try {
      const payload: {
        email: string;
        password: string;
        calledStatus: string | undefined;
        buyStatus: string | undefined;
        batchInterest: string | undefined;
        adminNotes: string | undefined;
        resetGt?: boolean;
      } = {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        calledStatus: student.calledStatus,
        buyStatus: student.buyStatus,
        batchInterest: student.batchInterest,
        adminNotes: student.adminNotes,
      };
      if (!student.gtScore) payload.resetGt = true;
      const res = await axios.patch(
        `${API_BASE_URL}/auth/admin/student/${student._id}`,
        payload
      );
      setStudents(students =>
        students.map(s => (s._id === student._id ? { ...s, ...res.data } : s))
      );
    } catch (_err) {
      alert('Failed to save changes');
    } finally {
      setSavingId(null);
    }
  };

  const handleResetGt = async (studentId: string) => {
    setSavingId(studentId);
    try {
      await axios.patch(
        `${API_BASE_URL}/auth/admin/student/${studentId}`,
        {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          resetGt: true
        }
      );
      setStudents(students =>
        students.map(s => (s._id === studentId ? { ...s, gtScore: undefined } : s))
      );
    } catch (_err) {
      alert('Failed to reset GT score');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to delete this account? This action cannot be undone.')) return;
    setDeletingId(studentId);
    try {
      await axios.delete(`${API_BASE_URL}/auth/admin/student/${studentId}`, {
        data: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD
        }
      });
      setStudents(students => students.filter(s => s._id !== studentId));
      setTotal(t => (t !== null ? t - 1 : t));
    } catch (_err) {
      alert('Failed to delete account');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportExcel = () => {
    const exportData = students.map(s => ({
      Name: s.name,
      Email: s.email,
      Phone: s.phone,
      'Called Status': s.calledStatus,
      'Buy Status': s.buyStatus,
      'Batch Interest': s.batchInterest,
      'Admin Notes': s.adminNotes,
      'GT Current': s.gtScore?.current ?? '',
      'GT Predicted': s.gtScore?.predicted ?? '',
      'GT Time': s.gtScore?.time ?? ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, 'students.xlsx');
  };

  return (
    <section className="py-10 md:py-20 min-h-screen bg-[#0A0F14]">
      <div className="container mx-auto px-2 sm:px-4">
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-6 md:mb-8 text-[#F8FAFC]">Admin Panel</h2>
        {!authenticated ? (
          <form onSubmit={handleLogin} className="max-w-sm mx-auto bg-[#18222E] p-6 md:p-8 rounded-xl shadow-card-dark border border-white/[0.06] space-y-4">
            <input
              type="email"
              className="w-full border border-[#263445] bg-[#151E29] rounded-lg px-4 py-2 text-white placeholder-[#94A3B8] focus:border-[#18B6A4] focus:ring-1 focus:ring-[#18B6A4] outline-none transition"
              placeholder="Admin Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="w-full border border-[#263445] bg-[#151E29] rounded-lg px-4 py-2 text-white placeholder-[#94A3B8] focus:border-[#18B6A4] focus:ring-1 focus:ring-[#18B6A4] outline-none transition"
              placeholder="Admin Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            {error && <div className="dark-banner-error text-center text-sm">{error}</div>}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-[#18B6A4] to-[#1CC8B5] text-[#0A0F14] font-semibold rounded-lg py-2 hover:shadow-[0_0_15px_rgba(24,182,164,0.3)] transition duration-200"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login as Admin'}
            </button>
          </form>
        ) : (
          <div className="bg-[#18222E] p-4 md:p-8 rounded-xl shadow-card-dark border border-white/[0.06]">
            <div className="mb-6 flex flex-wrap gap-3">
              <button
                className={`rounded-lg px-4 py-2 font-semibold transition-colors ${
                  activeTab === 'students'
                    ? 'bg-[#18B6A4] text-[#0A0F14]'
                    : 'bg-[#1E2A38] text-[#94A3B8] hover:bg-[#263445] hover:text-white'
                }`}
                onClick={() => setActiveTab('students')}
              >
                Students
              </button>
              <button
                className={`rounded-lg px-4 py-2 font-semibold transition-colors ${
                  activeTab === 'blogs'
                    ? 'bg-[#18B6A4] text-[#0A0F14]'
                    : 'bg-[#1E2A38] text-[#94A3B8] hover:bg-[#263445] hover:text-white'
                }`}
                onClick={() => setActiveTab('blogs')}
              >
                Blogs
              </button>
            </div>

            {activeTab === 'students' ? (
              <>
                <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between">
                  <h3 className="mb-2 text-xl font-bold text-[#F8FAFC] md:mb-0 md:text-2xl">
                    Total Students: {total}
                  </h3>
                  <button
                    className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-emerald-600 shadow"
                    onClick={handleExportExcel}
                  >
                    Export to Excel
                  </button>
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="min-w-[900px] w-full border border-white/[0.06] text-xs md:text-sm">
                    <thead>
                      <tr className="bg-[#0A0F14] text-[#CBD5E1]">
                        <th className="px-4 py-2 border border-white/[0.06]">Name</th>
                        <th className="px-4 py-2 border border-white/[0.06]">Email</th>
                        <th className="px-4 py-2 border border-white/[0.06]">Phone</th>
                        <th className="px-4 py-2 border border-white/[0.06]">Called</th>
                        <th className="px-4 py-2 border border-white/[0.06]">Buy/Pay</th>
                        <th className="px-4 py-2 border border-white/[0.06]">Batch Interested</th>
                        <th className="px-4 py-2 border border-white/[0.06]">Notes</th>
                        <th className="px-4 py-2 border border-white/[0.06]">GT Predictor</th>
                        <th className="px-4 py-2 border border-white/[0.06]"></th>
                        <th className="px-4 py-2 border border-white/[0.06]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s._id} className="hover:bg-[#1E2A38]/50 text-[#CBD5E1]">
                          <td className="px-4 py-2 border border-white/[0.06]">{s.name}</td>
                          <td className="px-4 py-2 border border-white/[0.06]">{s.email}</td>
                          <td className="px-4 py-2 border border-white/[0.06]">{s.phone}</td>
                          <td className="px-4 py-2 border border-white/[0.06]">
                            <select
                              className="border border-[#263445] bg-[#151E29] rounded px-2 py-1 text-white focus:border-[#18B6A4] focus:outline-none"
                              value={s.calledStatus || 'Not Called'}
                              onChange={e => handleFieldChange(s._id, 'calledStatus', e.target.value)}
                            >
                              {calledOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 border border-white/[0.06]">
                            <select
                              className="border border-[#263445] bg-[#151E29] rounded px-2 py-1 text-white focus:border-[#18B6A4] focus:outline-none"
                              value={s.buyStatus || 'Have to Pay'}
                              onChange={e => handleFieldChange(s._id, 'buyStatus', e.target.value)}
                            >
                              {buyOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 border border-white/[0.06]">
                            <select
                              className="border border-[#263445] bg-[#151E29] rounded px-2 py-1 text-white focus:border-[#18B6A4] focus:outline-none"
                              value={s.batchInterest || ''}
                              onChange={e => handleFieldChange(s._id, 'batchInterest', e.target.value)}
                            >
                              <option value="">Select</option>
                              {batchOptions.filter(opt => opt).map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 border border-white/[0.06]">
                            <input
                              type="text"
                              className="w-40 border border-[#263445] bg-[#151E29] rounded px-2 py-1 text-white focus:border-[#18B6A4] focus:outline-none"
                              value={s.adminNotes || ''}
                              onChange={e => handleFieldChange(s._id, 'adminNotes', e.target.value)}
                            />
                          </td>
                          <td className="px-4 py-2 border border-white/[0.06] text-xs text-[#94A3B8]">
                            {s.gtScore?.current !== undefined ? (
                              <div className="space-y-0.5">
                                <div><b>Current:</b> {s.gtScore.current}</div>
                                <div><b>Predicted:</b> {s.gtScore.predicted}</div>
                                <div><b>Time:</b> {s.gtScore.time}</div>
                              </div>
                            ) : (
                              <span className="text-[#64748B]">-</span>
                            )}
                          </td>
                          <td className="px-2 py-2 border border-white/[0.06] md:px-4">
                            <div className="flex gap-2">
                              <button
                                className="btn btn-primary px-3 py-1 rounded-lg text-xs font-semibold"
                                onClick={() => handleSave(s)}
                                disabled={savingId === s._id}
                              >
                                {savingId === s._id ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                className="btn btn-outline px-3 py-1 rounded-lg text-xs font-semibold"
                                onClick={() => handleResetGt(s._id)}
                                disabled={savingId === s._id}
                                title="Reset GT Predictor"
                              >
                                Reset GT
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-2 border border-white/[0.06] md:px-4">
                            <button
                              className="bg-red-950/60 text-red-300 border border-red-500/30 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-red-900/40 hover:text-red-200 transition-colors"
                              onClick={() => handleDelete(s._id)}
                              disabled={deletingId === s._id}
                              title="Delete Account"
                            >
                              {deletingId === s._id ? 'Deleting...' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <BlogCmsPanel />
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default Admin;
