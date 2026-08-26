const mongoose = require('mongoose');

const MediaAssetSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    displayName: { type: String, default: '', trim: true },
    url: { type: String, required: true, trim: true },
    cloudinaryPublicId: { type: String, default: '', trim: true, index: true },
    storageProvider: { type: String, default: 'inline', trim: true },
    altText: { type: String, default: '', trim: true },
    caption: { type: String, default: '', trim: true },
    fileName: { type: String, default: '', trim: true },
    type: { type: String, default: 'image', trim: true },
    kind: { type: String, default: 'image', trim: true, index: true },
    tags: [{ type: String, trim: true }],
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    sizeKb: { type: Number, default: 0 },
    isOptimized: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
    uploadedBy: { type: String, default: 'admin@eyeconic1.com', trim: true },
  },
  { timestamps: true }
);

MediaAssetSchema.index({ title: 'text', displayName: 'text', fileName: 'text', altText: 'text' });

module.exports = mongoose.model('MediaAsset', MediaAssetSchema);