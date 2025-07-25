const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const nodemailer = require('nodemailer');

const router = express.Router();

const emailOtps = {}; // In-memory store: { email: { otp, expires } }

router.get('/cronn', async (req, res) => {
  return res.status(200).json({msg: "success cron job"})
})

// Signup
router.post('/signup', async (req, res) => {
  const { name, email, phone, password } = req.body;
  try {
    if (!phone) return res.status(400).json({ msg: 'Phone number is required' });
    if (!name) return res.status(400).json({ msg: 'Name is required' });
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });
    user = new User({ name, email, phone, password });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();
    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });
    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Save GT Score Predictor (protected)
router.post('/gt-score', auth, async (req, res) => {
  const { current, time, predicted } = req.body;
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { gtScore: { current, time, predicted } },
      { new: true }
    );
    res.json({ gtScore: user.gtScore });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Get student dashboard (protected)
router.get('/dashboard', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Admin route (POST /api/auth/admin)
router.post('/admin', async (req, res) => {
  const { email, password } = req.body;
  // Hardcoded admin credentials
  if (
    email !== 'admin@eyeconic1.com' ||
    password !== 'admin@eyeconic$'
  ) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  try {
    const users = await User.find({}, 'name email phone calledStatus buyStatus batchInterest adminNotes gtScore').sort({ createdAt: -1 });
    res.json({
      total: users.length,
      students: users
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Admin update student info (PATCH /api/auth/admin/student/:id)
router.patch('/admin/student/:id', async (req, res) => {
  const { email, password, calledStatus, buyStatus, batchInterest, adminNotes, resetGt } = req.body;
  // Hardcoded admin credentials
  if (
    email !== 'admin@eyeconic1.com' ||
    password !== 'admin@eyeconic$'
  ) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  try {
    const update = {
      ...(calledStatus !== undefined && { calledStatus }),
      ...(buyStatus !== undefined && { buyStatus }),
      ...(batchInterest !== undefined && { batchInterest }),
      ...(adminNotes !== undefined && { adminNotes }),
    };
    if (resetGt) update.gtScore = undefined;
    // If resetGt is true, also unset gtScore in DB (for full removal)
    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    if (resetGt) {
      // Unset gtScore field in DB (removes the field completely)
      await User.updateOne({ _id: req.params.id }, { $unset: { gtScore: "" } });
      user.gtScore = undefined;
    }
    res.json(user);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Admin delete student (DELETE /api/auth/admin/student/:id)
router.delete('/admin/student/:id', async (req, res) => {
  const { email, password } = req.body;
  // Hardcoded admin credentials
  if (
    email !== 'admin@eyeconic1.com' ||
    password !== 'admin@eyeconic$'
  ) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json({ msg: 'User deleted' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Send Email OTP
router.post('/send-email-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ msg: 'Email is required' });

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  emailOtps[email] = { otp, expires: Date.now() + 10 * 60 * 1000 }; // 10 min expiry

  // Configure nodemailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER, // set in .env
      pass: process.env.GMAIL_PASS  // set in .env
    }
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: 'Eyeconic Email OTP Verification',
    text: `Your OTP for Eyeconic signup is: ${otp}`
  };

  try {
    await transporter.verify();
    await transporter.sendMail(mailOptions);
    res.json({ msg: 'OTP sent to email' });
  } catch (err) {
    // Removed console.error for production
    res.status(500).json({ msg: 'Failed to send OTP', error: err.message });
  }
});

// Verify Email OTP
router.post('/verify-email-otp', (req, res) => {
  const { email, otp } = req.body;
  const record = emailOtps[email];
  if (!record) return res.status(400).json({ msg: 'No OTP sent to this email' });
  if (Date.now() > record.expires) {
    delete emailOtps[email];
    return res.status(400).json({ msg: 'OTP expired' });
  }
  if (record.otp !== otp) return res.status(400).json({ msg: 'Invalid OTP' });
  delete emailOtps[email];
  res.json({ msg: 'OTP verified' });
});

module.exports = router;
