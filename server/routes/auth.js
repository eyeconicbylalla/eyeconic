const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Otp = require('../models/Otp');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/adminAuth');
const {
  ADMIN_TOKEN_EXPIRES,
  isAdminConfigured,
  isValidAdminCredentials,
} = require('../config/admin');
const { hitRateLimit, clientIp } = require('../services/rateLimiter');
const {
  isValidEmail,
  isValidObjectId,
  isValidPassword,
  isValidPhone,
  normalizePhone,
} = require('../utils/validation');

const router = express.Router();

// Rate limit policy (windows are fixed; max values are env-tunable where useful).
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const OTP_SEND_MAX_PER_EMAIL = Number(process.env.OTP_SEND_MAX_PER_EMAIL || 3);
const OTP_SEND_MAX_PER_IP_HOURLY = Number(process.env.OTP_SEND_MAX_PER_IP_HOURLY || 10);
const OTP_VERIFY_MAX_ATTEMPTS = 15;
const LOGIN_MAX_PER_IP = Number(process.env.LOGIN_MAX_PER_IP || 10);
const SIGNUP_MAX_PER_IP_HOURLY = Number(process.env.SIGNUP_MAX_PER_IP_HOURLY || 5);
const ADMIN_LOGIN_MAX_PER_IP = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS || 5);

const GT_TIME_VALUES = new Set(['1 Month', '3 Months', '6 Months', '9 Months', '1 Year']);
const CALLED_STATUSES = ['Not Called', 'Called'];
const BUY_STATUSES = ['Have to Pay', 'Will Buy', 'Paid'];
const BATCH_INTERESTS = ['Arjuna', 'Nurture 3.1', 'Foundation 2.1', ''];

router.get('/cronn', async (_req, res) => {
  return res.status(200).json({ msg: 'success cron job' });
});

// Signup
router.post('/signup', async (req, res) => {
  try {
    const limit = await hitRateLimit(`signup:ip:${clientIp(req)}`, {
      windowMs: 60 * 60 * 1000,
      max: SIGNUP_MAX_PER_IP_HOURLY,
    });
    if (!limit.allowed) {
      return res.status(429).json({ msg: 'Too many signups from this network. Please try again later.' });
    }

    const { name, email, phone, password } = req.body || {};
    const cleanedName = String(name || '').trim();
    const cleanedEmail = String(email || '').trim().toLowerCase();
    const cleanedPhone = normalizePhone(phone);
    const cleanedPassword = String(password || '');

    if (!cleanedName || cleanedName.length < 2 || cleanedName.length > 80) {
      return res.status(400).json({ msg: 'Name must be 2-80 characters' });
    }
    if (!isValidEmail(cleanedEmail)) {
      return res.status(400).json({ msg: 'A valid email is required' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ msg: 'A valid phone number is required' });
    }
    if (!isValidPassword(cleanedPassword)) {
      return res.status(400).json({ msg: 'Password must be 6-72 characters' });
    }

    let user = await User.findOne({ email: cleanedEmail });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    user = new User({
      name: cleanedName,
      email: cleanedEmail,
      phone: cleanedPhone,
      password: await bcrypt.hash(cleanedPassword, salt),
    });
    await user.save();

    const token = jwt.sign({ user: { id: user.id } }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({ msg: 'User already exists' });
    }
    console.error('[auth] Signup failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const limit = await hitRateLimit(`login:ip:${clientIp(req)}`, {
      windowMs: 15 * 60 * 1000,
      max: LOGIN_MAX_PER_IP,
    });
    if (!limit.allowed) {
      return res.status(429).json({ msg: 'Too many login attempts. Please try again later.' });
    }

    const { email, password } = req.body || {};
    const cleanedEmail = String(email || '').trim().toLowerCase();
    if (!isValidEmail(cleanedEmail) || typeof password !== 'string' || !password) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const user = await User.findOne({ email: cleanedEmail }).select('+password');
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const token = jwt.sign({ user: { id: user.id } }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  } catch (err) {
    console.error('[auth] Login failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Save GT Score Predictor (protected)
router.post('/gt-score', auth, async (req, res) => {
  try {
    const { current, time, predicted } = req.body || {};

    const toBoundedScore = (value) => {
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(num) && num >= 0 && num <= 200 ? Math.round(num) : NaN;
    };

    const boundedCurrent = toBoundedScore(current);
    const boundedPredicted = toBoundedScore(predicted);
    if (Number.isNaN(boundedCurrent)) {
      return res.status(400).json({ msg: 'Current score must be a number between 0 and 200' });
    }
    if (Number.isNaN(boundedPredicted)) {
      return res.status(400).json({ msg: 'Predicted score must be a number between 0 and 200' });
    }
    if (!GT_TIME_VALUES.has(time)) {
      return res.status(400).json({ msg: 'Invalid time selection' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { gtScore: { current: boundedCurrent, time, predicted: boundedPredicted } },
      { new: true }
    );
    if (!user) return res.status(404).json({ msg: 'User not found' });
    return res.json({ gtScore: user.gtScore });
  } catch (err) {
    console.error('[auth] GT score save failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Get student dashboard (protected). Password is excluded by the schema.
router.get('/dashboard', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    return res.json(user);
  } catch (err) {
    console.error('[auth] Dashboard failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Admin login: exchanges env-configured credentials for a short-lived
// admin JWT. Every other admin endpoint only accepts this token.
router.post('/admin/login', async (req, res) => {
  try {
    if (!isAdminConfigured()) {
      return res.status(503).json({ msg: 'Admin access is not configured on the server.' });
    }

    const limit = await hitRateLimit(`admin-login:ip:${clientIp(req)}`, {
      windowMs: 15 * 60 * 1000,
      max: ADMIN_LOGIN_MAX_PER_IP,
    });
    if (!limit.allowed) {
      return res.status(429).json({ msg: 'Too many login attempts. Please try again later.' });
    }

    const { email, password } = req.body || {};
    if (!isValidAdminCredentials(email, password)) {
      return res.status(401).json({ msg: 'Unauthorized' });
    }

    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: ADMIN_TOKEN_EXPIRES });
    return res.json({ token });
  } catch (err) {
    console.error('[admin] Login failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Admin student list (admin token required)
router.post('/admin', requireAdmin, async (_req, res) => {
  try {
    const users = await User.find(
      {},
      'name email phone calledStatus buyStatus batchInterest adminNotes gtScore'
    ).sort({ createdAt: -1 });
    return res.json({ total: users.length, students: users });
  } catch (err) {
    console.error('[admin] List students failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Admin update student info (PATCH /api/auth/admin/student/:id)
router.patch('/admin/student/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ msg: 'Invalid student id' });

    const { calledStatus, buyStatus, batchInterest, adminNotes, resetGt } = req.body || {};
    if (calledStatus !== undefined && !CALLED_STATUSES.includes(calledStatus)) {
      return res.status(400).json({ msg: 'Invalid calledStatus' });
    }
    if (buyStatus !== undefined && !BUY_STATUSES.includes(buyStatus)) {
      return res.status(400).json({ msg: 'Invalid buyStatus' });
    }
    if (batchInterest !== undefined && !BATCH_INTERESTS.includes(batchInterest)) {
      return res.status(400).json({ msg: 'Invalid batchInterest' });
    }
    if (adminNotes !== undefined && (typeof adminNotes !== 'string' || adminNotes.length > 2000)) {
      return res.status(400).json({ msg: 'Invalid adminNotes' });
    }

    const update = {
      ...(calledStatus !== undefined && { calledStatus }),
      ...(buyStatus !== undefined && { buyStatus }),
      ...(batchInterest !== undefined && { batchInterest }),
      ...(adminNotes !== undefined && { adminNotes }),
    };

    const user = await User.findByIdAndUpdate(id, update, { new: true });
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (resetGt) {
      // Unset gtScore field in DB (removes the field completely)
      await User.updateOne({ _id: id }, { $unset: { gtScore: '' } });
      user.gtScore = undefined;
    }
    return res.json(user);
  } catch (err) {
    console.error('[admin] Update student failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Admin delete student (DELETE /api/auth/admin/student/:id)
router.delete('/admin/student/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ msg: 'Invalid student id' });

    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    return res.json({ msg: 'User deleted' });
  } catch (err) {
    console.error('[admin] Delete student failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Server error' });
  }
});

// Send Email OTP — persisted in MongoDB (hashed), rate limited per email and IP.
router.post('/send-email-otp', async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ msg: 'A valid email is required' });

    const perEmail = await hitRateLimit(`otp-send:email:${email}`, {
      windowMs: 10 * 60 * 1000,
      max: OTP_SEND_MAX_PER_EMAIL,
    });
    if (!perEmail.allowed) {
      return res.status(429).json({ msg: 'Too many OTP requests. Please try again in a few minutes.' });
    }

    const perIp = await hitRateLimit(`otp-send:ip:${clientIp(req)}`, {
      windowMs: 60 * 60 * 1000,
      max: OTP_SEND_MAX_PER_IP_HOURLY,
    });
    if (!perIp.allowed) {
      return res.status(429).json({ msg: 'Too many OTP requests from this network. Please try again later.' });
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
      return res.status(503).json({ msg: 'Email delivery is not configured on the server.' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
      { identifier: email },
      { $set: { otpHash, expiresAt, attemptCount: 0, consumedAt: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Eyeconic Email OTP Verification',
      text: `Your OTP for Eyeconic signup is: ${otp}\nIt expires in ${OTP_TTL_MINUTES} minutes.`,
    });

    return res.json({ msg: 'OTP sent to email' });
  } catch (err) {
    console.error('[otp] Send failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Failed to send OTP' });
  }
});

// Verify Email OTP — single-use, expiring, attempt-capped, rate limited.
router.post('/verify-email-otp', async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const otp = String((req.body || {}).otp || '').trim();
    if (!isValidEmail(email)) return res.status(400).json({ msg: 'A valid email is required' });
    if (!/^[0-9]{6}$/.test(otp)) return res.status(400).json({ msg: 'Invalid OTP' });

    const limit = await hitRateLimit(`otp-verify:${email}:${clientIp(req)}`, {
      windowMs: 10 * 60 * 1000,
      max: OTP_VERIFY_MAX_ATTEMPTS,
    });
    if (!limit.allowed) {
      return res.status(429).json({ msg: 'Too many verification attempts. Please try again later.' });
    }

    const record = await Otp.findOne({ identifier: email });
    if (!record || record.consumedAt) {
      return res.status(400).json({ msg: 'No OTP sent to this email' });
    }
    if (Date.now() > new Date(record.expiresAt).getTime()) {
      await Otp.deleteOne({ _id: record._id }).catch(() => {});
      return res.status(400).json({ msg: 'OTP expired' });
    }
    if (record.attemptCount >= OTP_MAX_VERIFY_ATTEMPTS) {
      await Otp.deleteOne({ _id: record._id }).catch(() => {});
      return res.status(400).json({ msg: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    const isMatch = await bcrypt.compare(otp, record.otpHash);
    if (!isMatch) {
      await Otp.updateOne({ _id: record._id }, { $inc: { attemptCount: 1 } }).catch(() => {});
      return res.status(400).json({ msg: 'Invalid OTP' });
    }

    // Single-use: consume on success.
    await Otp.deleteOne({ _id: record._id }).catch(() => {});
    return res.json({ msg: 'OTP verified' });
  } catch (err) {
    console.error('[otp] Verify failed', { message: err.message, name: err.name });
    return res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
