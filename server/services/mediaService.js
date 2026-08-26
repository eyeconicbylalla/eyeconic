const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const MediaAsset = require('../models/MediaAsset');
const Blog = require('../models/Blog');
const {
  DEV_DATA_URL_MAX_BYTES,
  isAllowedExternalImageUrl,
  validateDataUrlImage,
  validateImageFile,
} = require('./mediaValidation');

const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'bm-blog';

let cloudinaryConfigured = false;

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    cloudinaryConfigured = false;
    return false;
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  cloudinaryConfigured = true;
  return true;
}

configureCloudinary();

function isCloudinaryConfigured() {
  return cloudinaryConfigured;
}

function getUploadConfig() {
  if (!isCloudinaryConfigured()) {
    return { ok: false, status: 503, message: 'Image storage is not configured on the server.' };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = {
    folder: CLOUDINARY_FOLDER,
    timestamp,
  };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);

  return {
    ok: true,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    folder: CLOUDINARY_FOLDER,
    timestamp,
    signature,
  };
}

function verifyCloudinaryAsset({ url, publicId }) {
  if (!isCloudinaryConfigured()) {
    return { ok: false, status: 503, message: 'Image storage is not configured on the server.' };
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const normalizedUrl = String(url || '').trim();
  const normalizedPublicId = String(publicId || '').trim();

  if (!normalizedUrl || !normalizedPublicId) {
    return { ok: false, status: 400, message: 'Cloudinary upload details are incomplete.' };
  }

  const allowedHost = `res.cloudinary.com/${cloudName}/`;
  if (!normalizedUrl.includes(allowedHost)) {
    return { ok: false, status: 400, message: 'Uploaded image URL is not from the configured storage provider.' };
  }

  return { ok: true, url: normalizedUrl, publicId: normalizedPublicId };
}

async function uploadBufferToCloudinary(buffer, { fileName = 'upload.jpg', mime = 'image/jpeg' } = {}) {
  if (!isCloudinaryConfigured()) {
    return { ok: false, status: 503, message: 'Image storage is not configured on the server.' };
  }

  const extension = fileName.includes('.') ? fileName.split('.').pop() : mime.split('/')[1] || 'jpg';
  const publicId = `${CLOUDINARY_FOLDER}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;

  return new Promise((resolve) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: CLOUDINARY_FOLDER,
        resource_type: 'image',
        overwrite: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error) {
          console.error('[media] Cloudinary upload failed', { message: error.message, http_code: error.http_code });
          return resolve({ ok: false, status: 502, message: 'Unable to store image. Please try again.' });
        }
        return resolve({
          ok: true,
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width || 0,
          height: result.height || 0,
          sizeKb: Math.max(1, Math.round((result.bytes || buffer.length) / 1024)),
          format: result.format,
        });
      },
    );
    stream.end(buffer);
  });
}

function buildContentHtmlNeedles(media, url) {
  const needles = [];
  if (url) needles.push(url);

  const publicId = String(media?.cloudinaryPublicId || '').trim();
  if (publicId && publicId !== url) {
    needles.push(publicId);
  }

  return [...new Set(needles)];
}

function buildContentHtmlUsageClauses(needles) {
  return needles.map((needle) => ({
    $expr: {
      $gt: [{ $indexOfBytes: [{ $ifNull: ['$contentHtml', ''] }, needle] }, -1],
    },
  }));
}

async function findMediaAssetUsage(media) {
  const url = String(media?.url || '').trim();
  if (!url) return [];

  const contentNeedles = buildContentHtmlNeedles(media, url);
  const blogs = await Blog.find({
    $or: [
      { 'featuredImage.url': url },
      { 'gallery.url': url },
      { 'seo.openGraph.image': url },
      { 'seo.twitterCard.image': url },
      ...buildContentHtmlUsageClauses(contentNeedles),
    ],
  })
    .select('title slug status')
    .sort({ updatedAt: -1 })
    .limit(25)
    .lean();

  return blogs.map((blog) => ({
    id: blog._id,
    title: blog.title,
    slug: blog.slug,
    status: blog.status,
  }));
}

async function deleteCloudinaryAsset(publicId) {
  if (!publicId || !isCloudinaryConfigured()) {
    return { ok: true, skipped: true };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    if (result?.result !== 'ok' && result?.result !== 'not found') {
      console.error('[media] Cloudinary delete unexpected result', { publicId, result: result?.result });
      return { ok: false, message: 'Unable to remove image from cloud storage.' };
    }
    return { ok: true };
  } catch (error) {
    console.error('[media] Cloudinary delete failed', { publicId, message: error.message });
    return { ok: false, message: 'Unable to remove image from cloud storage.' };
  }
}

function buildAssetPayload(body, defaults = {}) {
  return {
    title: (body.title || body.displayName || body.fileName || defaults.title || 'Media asset').trim(),
    displayName: (body.displayName || body.title || body.fileName || defaults.displayName || '').trim(),
    altText: (body.altText || '').trim(),
    caption: (body.caption || '').trim(),
    fileName: (body.fileName || defaults.fileName || '').trim(),
    type: (body.type || body.kind || defaults.type || 'image').trim(),
    kind: (body.kind || body.type || defaults.kind || 'image').trim(),
    tags: Array.isArray(body.tags) ? body.tags.map((t) => `${t}`.trim().toLowerCase()).filter(Boolean) : [],
    width: Number(body.width || defaults.width || 0),
    height: Number(body.height || defaults.height || 0),
    sizeKb: Number(body.sizeKb || defaults.sizeKb || 0),
    isOptimized: Boolean(body.isOptimized || defaults.isOptimized),
    uploadedBy: defaults.uploadedBy || 'admin@eyeconic1.com',
  };
}

async function createMediaAssetRecord(payload) {
  const media = await MediaAsset.create(payload);
  return media;
}

async function registerCloudinaryAsset(body, uploadedBy) {
  const verified = verifyCloudinaryAsset({
    url: body.url,
    publicId: body.publicId || body.cloudinaryPublicId,
  });
  if (!verified.ok) return verified;

  const payload = buildAssetPayload(body, {
    uploadedBy,
    fileName: body.fileName,
    width: body.width,
    height: body.height,
    sizeKb: body.sizeKb,
    isOptimized: true,
  });

  payload.url = verified.url;
  payload.cloudinaryPublicId = verified.publicId;
  payload.storageProvider = 'cloudinary';

  const media = await createMediaAssetRecord(payload);
  return { ok: true, media };
}

async function registerExternalUrlAsset(body, uploadedBy) {
  const url = String(body.url || '').trim();
  if (!isAllowedExternalImageUrl(url)) {
    return { ok: false, status: 400, message: 'A valid HTTPS image URL is required.' };
  }

  const payload = buildAssetPayload(body, { uploadedBy, fileName: body.fileName || url.split('/').pop() || 'image' });
  payload.url = url;
  payload.storageProvider = 'external';

  const media = await createMediaAssetRecord(payload);
  return { ok: true, media };
}

async function registerDevDataUrlAsset(body, uploadedBy) {
  const dataUrl = String(body.url || body.dataUrl || '').trim();
  const validated = validateDataUrlImage(dataUrl, { maxBytes: DEV_DATA_URL_MAX_BYTES });
  if (!validated.ok) return validated;

  const payload = buildAssetPayload(body, {
    uploadedBy,
    fileName: body.fileName,
    sizeKb: validated.sizeKb,
  });
  payload.url = dataUrl;
  payload.storageProvider = 'inline';

  const media = await createMediaAssetRecord(payload);
  return { ok: true, media };
}

async function uploadImageFile(file, body, uploadedBy) {
  const validated = validateImageFile(file);
  if (!validated.ok) return validated;

  if (isCloudinaryConfigured()) {
    const uploaded = await uploadBufferToCloudinary(validated.buffer, {
      fileName: validated.fileName,
      mime: validated.mime,
    });
    if (!uploaded.ok) return uploaded;

    return registerCloudinaryAsset(
      {
        ...body,
        url: uploaded.url,
        publicId: uploaded.publicId,
        fileName: validated.fileName,
        width: uploaded.width,
        height: uploaded.height,
        sizeKb: uploaded.sizeKb,
        kind: 'image',
        type: 'image',
      },
      uploadedBy,
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    const dataUrl = `data:${validated.mime};base64,${validated.buffer.toString('base64')}`;
    return registerDevDataUrlAsset(
      {
        ...body,
        dataUrl,
        url: dataUrl,
        fileName: validated.fileName,
        sizeKb: validated.sizeKb,
        kind: 'image',
        type: 'image',
      },
      uploadedBy,
    );
  }

  return { ok: false, status: 503, message: 'Image storage is not configured on the server.' };
}

async function createMediaFromRequest({ body, file, uploadedBy }) {
  if (file) {
    return uploadImageFile(file, body, uploadedBy);
  }

  if (body.publicId || body.cloudinaryPublicId) {
    return registerCloudinaryAsset(body, uploadedBy);
  }

  const url = String(body.url || body.dataUrl || '').trim();
  if (!url) {
    return { ok: false, status: 400, message: 'Media url or upload payload is required.' };
  }

  if (url.startsWith('data:')) {
    if (process.env.NODE_ENV === 'production' && isCloudinaryConfigured()) {
      return { ok: false, status: 400, message: 'Direct image uploads must use the Upload button in production.' };
    }
    return registerDevDataUrlAsset(body, uploadedBy);
  }

  return registerExternalUrlAsset(body, uploadedBy);
}

async function deleteMediaAsset(media, { force = false } = {}) {
  if (!media?._id) {
    return { ok: false, status: 404, message: 'Media asset not found.' };
  }

  const usage = await findMediaAssetUsage(media);
  if (usage.length && !force) {
    return {
      ok: false,
      status: 409,
      message: 'This asset is still referenced by one or more blog posts.',
      usage,
      canForceDelete: true,
    };
  }

  if (media.cloudinaryPublicId) {
    const cloudinaryResult = await deleteCloudinaryAsset(media.cloudinaryPublicId);
    if (!cloudinaryResult.ok) {
      return {
        ok: false,
        status: 502,
        message: cloudinaryResult.message || 'Unable to remove image from cloud storage.',
      };
    }
  }

  await MediaAsset.findByIdAndDelete(media._id);
  return { ok: true, usage };
}

module.exports = {
  CLOUDINARY_FOLDER,
  configureCloudinary,
  createMediaFromRequest,
  deleteMediaAsset,
  findMediaAssetUsage,
  getUploadConfig,
  isCloudinaryConfigured,
  registerCloudinaryAsset,
  uploadBufferToCloudinary,
};
