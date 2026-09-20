/**
 * Phase 1 read-only GT data audit (Rank & Branch Predictor).
 * Counts ONLY — no documents are read into memory for output, nothing is written.
 * Run from the app backend directory so dotenv picks up backend/.env:
 *   cd C:\Projects\eyeconic-app\backend && node <eyeconic-main>\scripts\audit_gt_counts.js
 * NEVER prints connection strings or user data.
 */
const path = require('path');
const backendModules = (name) => require(path.join(process.cwd(), 'node_modules', name));
backendModules('dotenv').config({ path: path.join(process.cwd(), '.env') });
const mongoose = backendModules('mongoose');

const Quiz = mongoose.model('Quiz',
  new mongoose.Schema({}, { collection: 'quizzes', strict: false }));
const QuizAttempt = mongoose.model('QuizAttempt',
  new mongoose.Schema({}, { collection: 'quizattempts', strict: false }));
const User = mongoose.model('User',
  new mongoose.Schema({}, { collection: 'users', strict: false }));
const GuestAttempt = mongoose.model('GuestAttempt',
  new mongoose.Schema({}, { collection: 'guestattempts', strict: false }));

function pct(n, d) { return d ? (100 * n / d).toFixed(1) + '%' : 'n/a'; }
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 20000, dbName: process.env.MONGODB_DB,
  });

  const studentCount = await User.countDocuments({ role: 'student' });
  const quizzesByType = await Quiz.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: '$testType', n: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } } } },
  ]);
  const grandIds = (await Quiz.distinct('_id', { testType: 'grand', isDeleted: { $ne: true } })).map(String);

  // completed attempts on grand quizzes
  const perQuiz = await QuizAttempt.aggregate([
    { $match: { quiz: { $in: grandIds.map(id => new mongoose.Types.ObjectId(id)) }, status: { $in: ['completed', 'auto_submitted'] } } },
    { $group: { _id: '$quiz', attempts: { $sum: 1 }, students: { $addToSet: '$student' } } },
    { $project: { attempts: 1, distinctStudents: { $size: '$students' } } },
  ]);
  const perStudent = await QuizAttempt.aggregate([
    { $match: { quiz: { $in: grandIds.map(id => new mongoose.Types.ObjectId(id)) }, status: { $in: ['completed', 'auto_submitted'] } } },
    { $group: { _id: '$student', n: { $sum: 1 } } },
  ]);
  const guestGrand = await GuestAttempt.countDocuments({
    quiz: { $in: grandIds.map(id => new mongoose.Types.ObjectId(id)) },
  });

  const totalGrandAttempts = perQuiz.reduce((a, q) => a + q.attempts, 0);
  const sizes = perQuiz.map(q => q.attempts);
  const studs = perStudent.map(s => s.n);
  console.log('=== GT DATA AUDIT (read-only counts) ===');
  console.log(`students (role=student): ${studentCount}`);
  console.log('quizzes by type:', JSON.stringify(quizzesByType.map(q => ({ type: q._id, total: q.n, active: q.active }))));
  console.log(`grand quizzes: ${grandIds.length}`);
  console.log(`grand completed attempts: ${totalGrandAttempts} | distinct students: ${perStudent.length}`);
  console.log(`attempts/student: min ${Math.min(...studs, 0)} · median ${median(studs)} · max ${studs.length ? Math.max(...studs) : 0}`);
  for (const t of [1, 3, 5]) {
    console.log(`students with >=${t} grand attempts: ${studs.filter(n => n >= t).length} (${pct(studs.filter(n => n >= t).length, perStudent.length)})`);
  }
  console.log(`cohort size per grand quiz: min ${Math.min(...sizes, 0)} · median ${median(sizes)} · max ${sizes.length ? Math.max(...sizes) : 0}`);
  for (const t of [30, 50, 100]) {
    console.log(`grand quizzes with >=${t} attempts (Tier-2 threshold candidates): ${sizes.filter(n => n >= t).length} of ${perQuiz.length}`);
  }
  console.log(`guest attempts on grand quizzes (incl. in-progress): ${guestGrand}`);
  await mongoose.disconnect();
})().catch(e => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
