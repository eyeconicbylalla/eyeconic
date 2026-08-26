const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const DEV_DATA_URL_MAX_BYTES = 3 * 1024 * 1024;

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MIME_BY_SIGNATURE = [
  { mime: 'image/jpeg', test: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  { mime: 'image/png', test: (buf) => buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/gif', test: (buf) => buf.length >= 6 && (buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a') },
  {
    mime: 'image/webp',
    test: (buf) =>
      buf.length >= 12 &&
      buf.slice(0, 4).toString('ascii') === 'RIFF' &&
      buf.slice(8, 12).toString('ascii') === 'WEBP',
  },
];

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  const match = MIME_BY_SIGNATURE.find((entry) => entry.test(buffer));
  return match?.mime || null;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUrl || '').trim());
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], 'base64');
    return { mime: match[1].toLowerCase(), buffer };
  } catch (_error) {
    return null;
  }
}

function validateImageBuffer(buffer, { maxBytes = IMAGE_MAX_BYTES } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { ok: false, status: 400, message: 'Uploaded file is empty or unreadable.' };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, status: 400, message: `Image exceeds ${Math.round(maxBytes / (1024 * 1024))}MB limit.` };
  }
  const detectedMime = detectImageMime(buffer);
  if (!detectedMime || !ALLOWED_IMAGE_MIMES.has(detectedMime)) {
    return { ok: false, status: 400, message: 'Unsupported image format. Use JPG, PNG, WebP, or GIF.' };
  }
  return { ok: true, mime: detectedMime, buffer, sizeKb: Math.max(1, Math.round(buffer.length / 1024)) };
}

function validateImageFile(file) {
  if (!file || !file.buffer) {
    return { ok: false, status: 400, message: 'No image file was provided.' };
  }
  const declaredMime = String(file.mimetype || '').toLowerCase();
  const validated = validateImageBuffer(file.buffer);
  if (!validated.ok) return validated;
  if (declaredMime.startsWith('image/') && declaredMime !== validated.mime) {
    console.warn('[media] MIME mismatch', { declaredMime, detectedMime: validated.mime, fileName: file.originalname });
  }
  return {
    ...validated,
    fileName: String(file.originalname || 'upload.jpg').replace(/[^\w.\-() ]+/g, '_').slice(0, 180),
  };
}

function validateDataUrlImage(dataUrl, { maxBytes = DEV_DATA_URL_MAX_BYTES } = {}) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { ok: false, status: 400, message: 'Invalid image upload payload.' };
  }
  const validated = validateImageBuffer(parsed.buffer, { maxBytes });
  if (!validated.ok) return validated;
  if (parsed.mime.startsWith('image/') && parsed.mime !== validated.mime) {
    console.warn('[media] data URL MIME mismatch', { declaredMime: parsed.mime, detectedMime: validated.mime });
  }
  return validated;
}

function isAllowedExternalImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value.startsWith('data:')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

module.exports = {
  ALLOWED_IMAGE_MIMES,
  DEV_DATA_URL_MAX_BYTES,
  IMAGE_MAX_BYTES,
  detectImageMime,
  isAllowedExternalImageUrl,
  validateDataUrlImage,
  validateImageBuffer,
  validateImageFile,
};
