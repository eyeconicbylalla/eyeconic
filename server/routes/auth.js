const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

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
    const users = await User.find({}, 'name email phone calledStatus buyStatus batchInterest adminNotes').sort({ createdAt: -1 });
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
  const { email, password, calledStatus, buyStatus, batchInterest, adminNotes } = req.body;
  // Hardcoded admin credentials
  if (
    email !== 'admin@eyeconic1.com' ||
    password !== 'admin@eyeconic$'
  ) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        ...(calledStatus !== undefined && { calledStatus }),
        ...(buyStatus !== undefined && { buyStatus }),
        ...(batchInterest !== undefined && { batchInterest }),
        ...(adminNotes !== undefined && { adminNotes }),
      },
      { new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;
