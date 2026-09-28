const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_WIDTH = 2000;
const WEBP_QUALITY = 82;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// sharp's detected format — checked against the actual bytes, not just the
// client-supplied Content-Type.
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'];
// Stored files are always <32 hex chars>.webp — anything else is rejected
// before touching the filesystem, which also rules out path traversal.
const STORED_FILE_RE = /^[a-f0-9]{32}\.webp$/;

// Files are kept in memory (≤ 10 MB) so sharp can re-encode them before
// anything is written to disk; the original upload is never stored.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(new UnsupportedTypeError());
    }
    callback(null, true);
  },
});

class UnsupportedTypeError extends Error {
  constructor() {
    super('Unsupported file type. Allowed: jpg, png, webp.');
  }
}

// Constant-time comparison of the X-Admin-Key header against ADMIN_API_KEY.
// Neither value is ever logged or included in a response.
function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'uploads disabled' });
  }

  const provided = req.get('X-Admin-Key');
  if (!provided) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Hash both sides so timingSafeEqual always gets equal-length buffers and
  // the comparison doesn't leak the key's length.
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// Absolute base URL for returned links. PUBLIC_BASE_URL wins; otherwise
// Railway's injected public domain; otherwise the request's own host
// (requires `trust proxy` so the protocol is https behind Railway's proxy).
function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return `${req.protocol}://${req.get('host')}`;
}

function handleMultipart(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof UnsupportedTypeError) {
      return res.status(415).json({ error: err.message });
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 10 MB.' });
      }
      return res.status(400).json({ error: `Invalid upload: ${err.message}` });
    }
    next(err);
  });
}

const router = express.Router();

// POST /api/upload — multipart/form-data, field "file", X-Admin-Key header.
// Re-encodes to WebP (max 2000px wide, quality 82) and returns { url }.
router.post('/api/upload', requireAdminKey, handleMultipart, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Missing file. Send multipart/form-data with field "file".' });
  }

  let output;
  try {
    const image = sharp(req.file.buffer);
    const { format } = await image.metadata();
    if (!ALLOWED_FORMATS.includes(format)) {
      return res.status(415).json({ error: 'Unsupported file type. Allowed: jpg, png, webp.' });
    }

    output = await image
      .rotate() // apply EXIF orientation before metadata is stripped
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (err) {
    return res.status(400).json({ error: 'File is not a valid image.' });
  }

  const filename = `${crypto.randomBytes(16).toString('hex')}.webp`;
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), output, { flag: 'wx' });
  } catch (err) {
    console.error('POST /api/upload failed to write file:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }

  res.status(201).json({ url: `${publicBaseUrl(req)}/uploads/${filename}` });
});

// GET /uploads/:file — serves stored WebP files. Filenames are random and
// never reused, so the content is immutable and can be cached for a year.
router.get('/uploads/:file', (req, res) => {
  const { file } = req.params;
  if (!STORED_FILE_RE.test(file)) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.sendFile(
    file,
    {
      root: path.resolve(UPLOAD_DIR),
      maxAge: '365d',
      immutable: true,
      headers: { 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff' },
    },
    (err) => {
      if (!err || res.headersSent) return;
      if (err.statusCode === 404 || err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Not found' });
      }
      console.error(`GET /uploads/${file} failed:`, err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  );
});

module.exports = { uploadsRouter: router, UPLOAD_DIR };
