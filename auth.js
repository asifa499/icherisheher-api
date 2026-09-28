const crypto = require('crypto');

// Guards admin-only endpoints: the X-Admin-Key header must equal
// ADMIN_API_KEY (503 if the env var is unset, 401 if missing/wrong).
// Constant-time comparison; neither value is ever logged or echoed back.
function requireAdminKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'admin API disabled' });
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

module.exports = { requireAdminKey };
