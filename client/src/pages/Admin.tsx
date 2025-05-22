import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

interface Student {
  _id: string;
  name: string;
  email: string;
  phone: string;
  calledStatus?: string;
  buyStatus?: string;
  batchInterest?: string;
  adminNotes?: string;
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
      const res = await axios.patch(
        `${API_BASE_URL}/auth/admin/student/${student._id}`,
        {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          calledStatus: student.calledStatus,
          buyStatus: student.buyStatus,
          batchInterest: student.batchInterest,
          adminNotes: student.adminNotes,
        }
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

  return (
    <section className="py-20 min-h-screen bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-8 text-teal-700">Admin Panel</h2>
        {!authenticated ? (
          <form onSubmit={handleLogin} className="max-w-sm mx-auto bg-white p-8 rounded-xl shadow space-y-4">
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
          <div className="bg-white p-8 rounded-xl shadow">
            <h3 className="text-2xl font-bold mb-4 text-teal-700">
              Total Students: {total}
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full border border-teal-100">
                <thead>
                  <tr className="bg-teal-100">
                    <th className="px-4 py-2 border">Name</th>
                    <th className="px-4 py-2 border">Email</th>
                    <th className="px-4 py-2 border">Phone</th>
                    <th className="px-4 py-2 border">Called</th>
                    <th className="px-4 py-2 border">Buy/Pay</th>
                    <th className="px-4 py-2 border">Batch Interested</th>
                    <th className="px-4 py-2 border">Notes</th>
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
                      <td className="px-4 py-2 border">
                        <button
                          className="btn btn-primary px-3 py-1"
                          onClick={() => handleSave(s)}
                          disabled={savingId === s._id}
                        >
                          {savingId === s._id ? 'Saving...' : 'Save'}
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
