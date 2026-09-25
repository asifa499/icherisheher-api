require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { ensureDatabaseSetup } = require('./db-setup');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPPORTED_LANGS = ['az', 'en', 'ru'];
const DEFAULT_LANG = 'az';
const NEWS_TYPES = ['review', 'news', 'announcement'];

// Express auto-generates an ETag for every JSON response and answers matching
// If-None-Match requests with a bare 304 (no body). Browsers were treating
// those 304s as opaque/blocked, so the frontend fell back to local JSON.
// Disabling etag generation means every request gets a full 200 response.
app.set('etag', false);

// --- CORS allowlist: GitHub Pages frontend + local development ---
// This MUST be the first app.use() — it has to run on every request,
// including error responses and 404s, so the Access-Control-Allow-Origin
// header is always present.
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

// Never let browsers/proxies cache API responses or revalidate via
// If-None-Match — museum data should always be fetched fresh.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

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
    image: row.image,
    working_hours: row.working_hours,
    rating: row.rating,
    ticket_price: row.ticket_price,
    address: pickLang(row.address, lang),
    ticket_url: row.ticket_url,
    sort_order: row.sort_order,
  };
}

function fullMuseum(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    short_description: row.short_description,
    image: row.image,
    working_hours: row.working_hours,
    rating: row.rating,
    ticket_price: row.ticket_price,
    address: row.address,
    ticket_url: row.ticket_url,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function localizeStop(stop, lang) {
  return {
    name: pickLang(stop.name, lang),
    description: pickLang(stop.description, lang),
    image: stop.image ?? null,
    sort_order: stop.sort_order,
  };
}

function localizeRoute(row, lang) {
  return {
    id: row.id,
    slug: row.slug,
    title: pickLang(row.title, lang),
    duration: pickLang(row.duration, lang),
    distance: pickLang(row.distance, lang),
    tags: row.tags,
    stops: (row.stops || []).map((s) => localizeStop(s, lang)),
    image: row.image,
    pass_url: row.pass_url,
    source: row.source,
    sort_order: row.sort_order,
  };
}

function fullRoute(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    duration: row.duration,
    distance: row.distance,
    tags: row.tags,
    stops: row.stops,
    image: row.image,
    pass_url: row.pass_url,
    source: row.source,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function localizeEvent(row, lang) {
  return {
    id: row.id,
    slug: row.slug,
    title: pickLang(row.title, lang),
    description: pickLang(row.description, lang),
    category: pickLang(row.category, lang),
    venue: pickLang(row.venue, lang),
    start_date: row.start_date,
    end_date: row.end_date,
    time: row.time,
    image: row.image,
    ticket_url: row.ticket_url,
    source: row.source,
    sort_order: row.sort_order,
  };
}

function fullEvent(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    venue: row.venue,
    start_date: row.start_date,
    end_date: row.end_date,
    time: row.time,
    image: row.image,
    ticket_url: row.ticket_url,
    source: row.source,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function localizeNews(row, lang) {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: pickLang(row.title, lang),
    excerpt: pickLang(row.excerpt, lang),
    image: row.image,
    image_position: row.image_position,
    published_date: row.published_date,
    source: row.source,
    sort_order: row.sort_order,
  };
}

function fullNews(row) {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    excerpt: row.excerpt,
    image: row.image,
    image_position: row.image_position,
    published_date: row.published_date,
    source: row.source,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function localizePlace(row, lang) {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    name: pickLang(row.name, lang),
    description: pickLang(row.description, lang),
    address: pickLang(row.address, lang),
    image: row.image,
    open_hours: row.open_hours,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    source: row.source,
    sort_order: row.sort_order,
  };
}

function fullPlace(row) {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    name: row.name,
    description: row.description,
    address: row.address,
    image: row.image,
    open_hours: row.open_hours,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    source: row.source,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function localizeFeature(feature, lang) {
  return {
    label: pickLang(feature.label, lang),
    included: feature.included === true,
  };
}

function localizePass(row, lang) {
  return {
    id: row.id,
    slug: row.slug,
    name: pickLang(row.name, lang),
    description: pickLang(row.description, lang),
    features: (row.features || []).map((f) => localizeFeature(f, lang)),
    price: row.price,
    currency: row.currency,
    duration: row.duration,
    is_featured: row.is_featured,
    buy_url: row.buy_url,
    sort_order: row.sort_order,
  };
}

function fullPass(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    features: row.features,
    price: row.price,
    currency: row.currency,
    duration: row.duration,
    is_featured: row.is_featured,
    buy_url: row.buy_url,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- Routes ---
app.get('/', (req, res) => {
  res.json({
    name: 'icherisheher-api',
    status: 'ok',
    endpoints: [
      'GET /api/health',
      'GET /api/museums',
      'GET /api/museums/:slug',
      'GET /api/routes',
      'GET /api/routes/:slug',
      'GET /api/events',
      'GET /api/events/:slug',
      'GET /api/news',
      'GET /api/news/:slug',
      'GET /api/places',
      'GET /api/places/:slug',
      'GET /api/passes',
      'GET /api/passes/:slug',
      'GET /api/config',
    ],
  });
});

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
      `SELECT id, slug, name, short_description, address, sort_order,
              image, working_hours, rating, ticket_price, ticket_url,
              created_at, updated_at
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
      `SELECT id, slug, name, short_description, address, sort_order,
              image, working_hours, rating, ticket_price, ticket_url,
              created_at, updated_at
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

// GET /api/routes?lang=az|en|ru
// Published only, ordered by sort_order. Same contract as /api/museums:
// with ?lang= the trilingual JSONB fields (including those inside each stop)
// are flattened to that language (fallback: az); without ?lang= the full
// trilingual objects are returned.
app.get('/api/routes', async (req, res) => {
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, title, duration, distance, tags, stops,
              image, pass_url, source, sort_order,
              created_at, updated_at
         FROM routes
        WHERE is_published = TRUE
        ORDER BY sort_order ASC, id ASC`
    );

    const data = lang ? rows.map((r) => localizeRoute(r, lang)) : rows.map(fullRoute);
    res.json({ count: data.length, lang: lang || null, data });
  } catch (err) {
    console.error('GET /api/routes failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/routes/:slug?lang=az|en|ru
app.get('/api/routes/:slug', async (req, res) => {
  const { slug } = req.params;
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, title, duration, distance, tags, stops,
              image, pass_url, source, sort_order,
              created_at, updated_at
         FROM routes
        WHERE slug = $1 AND is_published = TRUE
        LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Route not found' });
    }

    res.json(lang ? localizeRoute(rows[0], lang) : fullRoute(rows[0]));
  } catch (err) {
    console.error(`GET /api/routes/${slug} failed:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/events?lang=az|en|ru
// Published only, ordered by start_date (soonest first). Same contract as
// /api/museums and /api/routes: with ?lang= the trilingual JSONB fields are
// flattened to that language (fallback: az); without ?lang= the full
// trilingual objects are returned.
app.get('/api/events', async (req, res) => {
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, title, description, category, venue,
              TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
              TO_CHAR(end_date,   'YYYY-MM-DD') AS end_date,
              time, image, ticket_url, source, sort_order,
              created_at, updated_at
         FROM events
        WHERE is_published = TRUE
        ORDER BY start_date ASC NULLS LAST, sort_order ASC, id ASC`
    );

    const data = lang ? rows.map((r) => localizeEvent(r, lang)) : rows.map(fullEvent);
    res.json({ count: data.length, lang: lang || null, data });
  } catch (err) {
    console.error('GET /api/events failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/events/:slug?lang=az|en|ru
app.get('/api/events/:slug', async (req, res) => {
  const { slug } = req.params;
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, title, description, category, venue,
              TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
              TO_CHAR(end_date,   'YYYY-MM-DD') AS end_date,
              time, image, ticket_url, source, sort_order,
              created_at, updated_at
         FROM events
        WHERE slug = $1 AND is_published = TRUE
        LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(lang ? localizeEvent(rows[0], lang) : fullEvent(rows[0]));
  } catch (err) {
    console.error(`GET /api/events/${slug} failed:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/news?lang=az|en|ru&type=review|news|announcement
// Published only, newest first (published_date DESC; undated items last).
// Same contract as the other collections — with ?lang= the trilingual JSONB
// fields are flattened to that language (fallback: az); without ?lang= the
// full trilingual objects are returned. The optional ?type= filter narrows to
// one of the three news kinds.
app.get('/api/news', async (req, res) => {
  const { lang, type } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  if (type && !NEWS_TYPES.includes(type)) {
    return res.status(400).json({
      error: `Unsupported type "${type}". Supported: ${NEWS_TYPES.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, type, title, excerpt, image, image_position,
              TO_CHAR(published_date, 'YYYY-MM-DD') AS published_date,
              source, sort_order, created_at, updated_at
         FROM news
        WHERE is_published = TRUE
          AND ($1::text IS NULL OR type = $1)
        ORDER BY published_date DESC NULLS LAST, sort_order ASC, id ASC`,
      [type || null]
    );

    const data = lang ? rows.map((r) => localizeNews(r, lang)) : rows.map(fullNews);
    res.json({ count: data.length, lang: lang || null, type: type || null, data });
  } catch (err) {
    console.error('GET /api/news failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/news/:slug?lang=az|en|ru
app.get('/api/news/:slug', async (req, res) => {
  const { slug } = req.params;
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, type, title, excerpt, image, image_position,
              TO_CHAR(published_date, 'YYYY-MM-DD') AS published_date,
              source, sort_order, created_at, updated_at
         FROM news
        WHERE slug = $1 AND is_published = TRUE
        LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'News item not found' });
    }

    res.json(lang ? localizeNews(rows[0], lang) : fullNews(rows[0]));
  } catch (err) {
    console.error(`GET /api/news/${slug} failed:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/places?lang=az|en|ru&category=<key>
// Published only, ordered by sort_order. Same contract as the other
// collections — with ?lang= the trilingual JSONB fields are flattened to that
// language (fallback: az); without ?lang= the full trilingual objects are
// returned. The optional ?category= filter narrows the list to one map chip
// (landmark, museum, cafe, shop, hotel, ...); it is free-form, so an unknown
// category simply returns an empty list rather than a 400.
//
// lat/lng are stored as NUMERIC — node-pg would hand those back as strings,
// so both are cast to float8 here and reach the frontend as JS numbers.
app.get('/api/places', async (req, res) => {
  const { lang, category } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, category, name, description, address,
              image, open_hours, status,
              lat::float8 AS lat, lng::float8 AS lng,
              source, sort_order, created_at, updated_at
         FROM places
        WHERE is_published = TRUE
          AND ($1::text IS NULL OR category = $1)
        ORDER BY sort_order ASC, id ASC`,
      [category || null]
    );

    const data = lang ? rows.map((r) => localizePlace(r, lang)) : rows.map(fullPlace);
    res.json({ count: data.length, lang: lang || null, category: category || null, data });
  } catch (err) {
    console.error('GET /api/places failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/places/:slug?lang=az|en|ru
app.get('/api/places/:slug', async (req, res) => {
  const { slug } = req.params;
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, category, name, description, address,
              image, open_hours, status,
              lat::float8 AS lat, lng::float8 AS lng,
              source, sort_order, created_at, updated_at
         FROM places
        WHERE slug = $1 AND is_published = TRUE
        LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Place not found' });
    }

    res.json(lang ? localizePlace(rows[0], lang) : fullPlace(rows[0]));
  } catch (err) {
    console.error(`GET /api/places/${slug} failed:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/passes?lang=az|en|ru
// Published only, ordered by sort_order. Same contract as the other
// collections — with ?lang= the trilingual JSONB fields (including each
// feature's label) are flattened to that language (fallback: az); without
// ?lang= the full trilingual objects are returned.
//
// price is stored as NUMERIC — node-pg would hand that back as a string, so
// it's cast to float8 here and reaches the frontend as a JS number.
app.get('/api/passes', async (req, res) => {
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, description, features,
              price::float8 AS price, currency, duration,
              is_featured, buy_url, sort_order,
              created_at, updated_at
         FROM passes
        WHERE is_published = TRUE
        ORDER BY sort_order ASC, id ASC`
    );

    const data = lang ? rows.map((r) => localizePass(r, lang)) : rows.map(fullPass);
    res.json({ count: data.length, lang: lang || null, data });
  } catch (err) {
    console.error('GET /api/passes failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/passes/:slug?lang=az|en|ru
app.get('/api/passes/:slug', async (req, res) => {
  const { slug } = req.params;
  const { lang } = req.query;

  if (lang && !SUPPORTED_LANGS.includes(lang)) {
    return res.status(400).json({
      error: `Unsupported lang "${lang}". Supported: ${SUPPORTED_LANGS.join(', ')}.`,
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, description, features,
              price::float8 AS price, currency, duration,
              is_featured, buy_url, sort_order,
              created_at, updated_at
         FROM passes
        WHERE slug = $1 AND is_published = TRUE
        LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Pass not found' });
    }

    res.json(lang ? localizePass(rows[0], lang) : fullPass(rows[0]));
  } catch (err) {
    console.error(`GET /api/passes/${slug} failed:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/config
// Returns the enabled/disabled state of every Home page section, keyed by
// section name, so the frontend can hide a section without a redeploy.
app.get('/api/config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, enabled FROM feature_flags');
    const sections = {};
    for (const row of rows) {
      sections[row.key] = row.enabled;
    }
    res.json({ sections });
  } catch (err) {
    console.error('GET /api/config failed:', err);
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

async function start() {
  try {
    await ensureDatabaseSetup(pool);
  } catch (err) {
    console.error('Database auto-setup failed:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`icherisheher-api listening on port ${PORT}`);
  });
}

start();
