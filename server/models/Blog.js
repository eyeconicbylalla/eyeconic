const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    youtubeUrl: { type: String, default: '', trim: true },
    thumbnailUrl: { type: String, default: '', trim: true },
    createdBy: { type: String, default: 'admin@eyeconic1.com' },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Blog', BlogSchema);