import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';
import * as XLSX from 'xlsx';

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
      setError('Invalid admin credentials');
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
      const payload: any = {
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
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
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
    <section className="py-10 md:py-20 min-h-screen bg-gray-50">
      <div className="container mx-auto px-2 sm:px-4">
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-6 md:mb-8 text-teal-700">Admin Panel</h2>
        {!authenticated ? (
          <form onSubmit={handleLogin} className="max-w-sm mx-auto bg-white p-6 md:p-8 rounded-xl shadow space-y-4">
            <input
              type="email"
              className="w-full border border-teal-200 rounded-lg px-4 py-2"
              placeholder="Admin Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="w-full border border-teal-200 rounded-lg px-4 py-2"
              placeholder="Admin Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            {error && <div className="text-red-600 text-center">{error}</div>}
            <button
              type="submit"
              className="w-full bg-teal-600 text-white font-semibold rounded-lg py-2 hover:bg-teal-700 transition-colors"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login as Admin'}
            </button>
          </form>
        ) : (
          <div className="bg-white p-4 md:p-8 rounded-xl shadow">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <h3 className="text-xl md:text-2xl font-bold mb-2 md:mb-0 text-teal-700">
                Total Students: {total}
              </h3>
              <button
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                onClick={handleExportExcel}
              >
                Export to Excel
              </button>
            </div>
            <div className="w-full overflow-x-auto">
              <table className="min-w-[900px] w-full border border-teal-100 text-xs md:text-sm">
                <thead>
                  <tr className="bg-teal-100">
                    <th className="px-4 py-2 border">Name</th>
                    <th className="px-4 py-2 border">Email</th>
                    <th className="px-4 py-2 border">Phone</th>
                    <th className="px-4 py-2 border">Called</th>
                    <th className="px-4 py-2 border">Buy/Pay</th>
                    <th className="px-4 py-2 border">Batch Interested</th>
                    <th className="px-4 py-2 border">Notes</th>
                    <th className="px-4 py-2 border">GT Predictor</th>
                    <th className="px-4 py-2 border"></th>
                    <th className="px-4 py-2 border"></th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s._id} className="hover:bg-teal-50">
                      <td className="px-4 py-2 border">{s.name}</td>
                      <td className="px-4 py-2 border">{s.email}</td>
                      <td className="px-4 py-2 border">{s.phone}</td>
                      <td className="px-4 py-2 border">
                        <select
                          className="border rounded px-2 py-1"
                          value={s.calledStatus || 'Not Called'}
                          onChange={e => handleFieldChange(s._id, 'calledStatus', e.target.value)}
                        >
                          {calledOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 border">
                        <select
                          className="border rounded px-2 py-1"
                          value={s.buyStatus || 'Have to Pay'}
                          onChange={e => handleFieldChange(s._id, 'buyStatus', e.target.value)}
                        >
                          {buyOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 border">
                        <select
                          className="border rounded px-2 py-1"
                          value={s.batchInterest || ''}
                          onChange={e => handleFieldChange(s._id, 'batchInterest', e.target.value)}
                        >
                          <option value="">Select</option>
                          {batchOptions.filter(opt => opt).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 border">
                        <input
                          type="text"
                          className="border rounded px-2 py-1 w-40"
                          value={s.adminNotes || ''}
                          onChange={e => handleFieldChange(s._id, 'adminNotes', e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2 border text-xs">
                        {s.gtScore?.current !== undefined ? (
                          <div>
                            <div><b>Current:</b> {s.gtScore.current}</div>
                            <div><b>Predicted:</b> {s.gtScore.predicted}</div>
                            <div><b>Time:</b> {s.gtScore.time}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-2 md:px-4 py-2 border">
                        <button
                          className="btn btn-primary px-2 md:px-3 py-1"
                          onClick={() => handleSave(s)}
                          disabled={savingId === s._id}
                        >
                          {savingId === s._id ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          className="btn btn-outline px-2 md:px-3 py-1 ml-2"
                          onClick={() => handleResetGt(s._id)}
                          disabled={savingId === s._id}
                          title="Reset GT Predictor"
                        >
                          Reset GT
                        </button>
                      </td>
                      <td className="px-2 md:px-4 py-2 border">
                        <button
                          className="btn btn-danger px-2 md:px-3 py-1"
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
          </div>
        )}
      </div>
    </section>
  );
};

export default Admin;
