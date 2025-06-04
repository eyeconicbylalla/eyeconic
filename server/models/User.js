const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  enrolledCourses: [{ type: String }],
  progress: {
    type: Map,
    of: Number, // e.g. { 'arjuna': 60, 'nurture': 30 }
    default: {},
  },
  resources: [{ type: String }], // URLs or file names
  notifications: [{
    message: String,
    date: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }
  }],
  analytics: {
    scores: [{ date: Date, score: Number }],
    feedback: String,
  },
  calledStatus: { type: String, enum: ['Not Called', 'Called'], default: 'Not Called' },
  buyStatus: { type: String, enum: ['Have to Pay', 'Will Buy', 'Paid'], default: 'Have to Pay' },
  batchInterest: { type: String, enum: ['Arjuna', 'Nurture 3.1', 'Foundation 2.1', ''], default: '' },
  adminNotes: { type: String, default: '' },
  gtScore: {
    current: { type: Number },
    time: { type: String },
    predicted: { type: Number }
  },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
