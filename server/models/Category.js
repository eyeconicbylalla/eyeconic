const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, trim: true, unique: true, index: true },
    description: { type: String, default: '', trim: true },
    parentSlug: { type: String, default: '', trim: true },
    seoTitle: { type: String, default: '', trim: true },
    metaDescription: { type: String, default: '', trim: true },
    postCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', CategorySchema);