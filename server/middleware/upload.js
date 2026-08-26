const multer = require('multer');
const { IMAGE_MAX_BYTES } = require('../services/mediaValidation');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMAGE_MAX_BYTES,
    files: 1,
  },
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ msg: 'Image exceeds 15MB limit.' });
    }
    console.error('[media] Multer error', { code: error.code, message: error.message });
    return res.status(400).json({ msg: 'Unable to read uploaded file.' });
  });
}

module.exports = { handleUpload };
