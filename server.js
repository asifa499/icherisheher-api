require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPPORTED_LANGS = ['az', 'en', 'ru'];
const DEFAULT_LANG = 'az';

// --- CORS allowlist: GitHub Pages frontend + local development ---
const ALLOWED_ORIGINS = ['https://asifa499.github.io'];
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, health checks) with no Origin header
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin) || LOCALHOST_RE.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
  })
);

app.use(express.json());

// --- Helpers ---
function pickLang(jsonb, lang) {
  if (!jsonb || typeof jsonb !== 'object') return null;
  return jsonb[lang] ?? jsonb[DEFAULT_LANG] ?? null;
}

function localizeMuseum(row, lang) {
  return {
    id: row.id,
    slug: row.slug,
    name: pickLang(row.name, lang),
    short_description: pickLang(row.short_description, lang),
    address: pickLang(row.address, lang),
    sort_order: row.sort_order,
  };
}

function fullMuseum(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    short_description: row.short_description,
    address: row.address,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- Routes ---
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    res
      .status(503)
      .json({ status: 'degraded', db: 'down', timestamp: new Date().toISOString() });
  }
});

// GET /api/museums?lang=az|en|ru
// Published only, ordered by sort_order. With ?lang= the trilingual JSONB
// fields are flattened to that language (fallback: az). Without ?lang= the
// full trilingual objects are returned.
app.get('/api/museums', async (req, res) => {
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, short_description, address, sort_order, created_at, updated_at
         FROM museums
        WHERE is_published = TRUE
        ORDER BY sort_order ASC, id ASC`
    );

    const data = lang ? rows.map((r) => localizeMuseum(r, lang)) : rows.map(fullMuseum);
    res.json({ count: data.length, lang: lang || null, data });
  } catch (err) {
    console.error('GET /api/museums failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/museums/:slug?lang=az|en|ru
app.get('/api/museums/:slug', async (req, res) => {
  const { slug } = req.params;
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, short_description, address, sort_order, created_at, updated_at
         FROM museums
        WHERE slug = $1 AND is_published = TRUE
        LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Museum not found' });
    }

    res.json(lang ? localizeMuseum(rows[0], lang) : fullMuseum(rows[0]));
  } catch (err) {
    console.error(`GET /api/museums/${slug} failed:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// CORS rejections and other errors → JSON, not HTML
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`icherisheher-api listening on port ${PORT}`);
});
