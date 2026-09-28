// Admin write API: POST / PUT / PATCH / DELETE for every content resource,
// plus PUT /api/config/:key for feature flags. Everything here requires the
// X-Admin-Key header (see auth.js) and every write sets source = 'admin', so
// the boot seeder never overwrites it (see db-setup.js → runSeed).
const express = require('express');
const pool = require('./db');
const { requireAdminKey } = require('./auth');

const LANGS = ['az', 'en', 'ru'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Sent back by GET but never writable — owned by the server.
const READ_ONLY_FIELDS = ['id', 'source', 'created_at', 'updated_at'];

// --- Field types ---
// Each type has check(value) → error message | null, and a default used when
// a field is omitted from POST / PUT. `required` fields have no default.
const t = {
  i18n: (opts = {}) => ({ kind: 'i18n', default: {}, ...opts }),
  text: (opts = {}) => ({ kind: 'text', default: null, ...opts }),
  number: (opts = {}) => ({ kind: 'number', default: null, ...opts }),
  int: (opts = {}) => ({ kind: 'int', default: 0, ...opts }),
  bool: (opts = {}) => ({ kind: 'bool', default: false, ...opts }),
  date: (opts = {}) => ({ kind: 'date', default: null, ...opts }),
  enum: (values, opts = {}) => ({ kind: 'enum', values, ...opts }),
  strings: (opts = {}) => ({ kind: 'strings', default: [], ...opts }),
  list: (item, opts = {}) => ({ kind: 'list', item, default: [], ...opts }),
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isCalendarDate(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Validates one value against its field spec. Pushes human-readable messages
// ("name.en: must be a non-empty string") onto `errors`; returns the value to
// store (nested lists get their item defaults filled in).
function checkValue(spec, value, path, errors) {
  switch (spec.kind) {
    case 'i18n': {
      if (!isPlainObject(value)) {
        errors.push(`${path}: must be a trilingual object {az, en, ru}`);
        return value;
      }
      for (const key of Object.keys(value)) {
        if (!LANGS.includes(key)) {
          errors.push(`${path}.${key}: unknown language (allowed: ${LANGS.join(', ')})`);
        } else if (typeof value[key] !== 'string') {
          errors.push(`${path}.${key}: must be a string`);
        }
      }
      if (spec.required) {
        for (const lang of LANGS) {
          if (typeof value[lang] !== 'string' || value[lang].trim() === '') {
            errors.push(`${path}.${lang}: required, must be a non-empty string`);
          }
        }
      }
      return value;
    }
    case 'text':
      if (value === null && !spec.required && !spec.notNull) return value;
      if (typeof value !== 'string') {
        errors.push(`${path}: must be a string${spec.required || spec.notNull ? '' : ' or null'}`);
      } else if ((spec.required || spec.notNull) && value.trim() === '') {
        errors.push(`${path}: must be a non-empty string`);
      }
      return value;
    case 'number':
      if (value === null && !spec.required) return value;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${path}: must be a number${spec.required ? '' : ' or null'}`);
      } else if (
        (spec.min !== undefined && value < spec.min) ||
        (spec.max !== undefined && value > spec.max)
      ) {
        errors.push(`${path}: must be between ${spec.min} and ${spec.max}`);
      }
      return value;
    case 'int':
      if (!Number.isInteger(value)) errors.push(`${path}: must be an integer`);
      return value;
    case 'bool':
      if (typeof value !== 'boolean') errors.push(`${path}: must be true or false`);
      return value;
    case 'date':
      if (value === null) return value;
      if (!isCalendarDate(value)) errors.push(`${path}: must be a YYYY-MM-DD date or null`);
      return value;
    case 'enum':
      if (!spec.values.includes(value)) {
        errors.push(`${path}: must be one of ${spec.values.join(', ')}`);
      }
      return value;
    case 'strings':
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        errors.push(`${path}: must be an array of strings`);
      }
      return value;
    case 'list':
      if (!Array.isArray(value)) {
        errors.push(`${path}: must be an array`);
        return value;
      }
      return value.map((item, i) => {
        if (!isPlainObject(item)) {
          errors.push(`${path}[${i}]: must be an object`);
          return item;
        }
        return checkObject(spec.item, item, 'full', `${path}[${i}].`, errors, i);
      });
    default:
      throw new Error(`Unknown field kind: ${spec.kind}`);
  }
}

// Validates an object against a field map. mode 'full' (POST / PUT) requires
// every required field and fills defaults for the rest; mode 'partial'
// (PATCH) only checks the fields present. Unknown fields are errors.
function checkObject(fields, body, mode, prefix, errors, index = 0) {
  const out = {};
  for (const key of Object.keys(body)) {
    if (!fields[key]) errors.push(`${prefix}${key}: unknown field`);
  }
  for (const [key, spec] of Object.entries(fields)) {
    if (body[key] === undefined) {
      if (mode === 'partial') continue;
      if (spec.required) {
        errors.push(`${prefix}${key}: required`);
        continue;
      }
      // Nested list items default sort_order to their 1-based position.
      out[key] = spec.positional ? index + 1 : spec.default;
      continue;
    }
    out[key] = checkValue(spec, body[key], `${prefix}${key}`, errors);
  }
  return out;
}

// --- Resources ---
// `fields` are the writable columns (slug is handled separately); `select`
// mirrors the public GET query so write responses have the same shape, plus
// is_published and source.
const STOP_FIELDS = {
  name: t.i18n({ required: true }),
  description: t.i18n(),
  image: t.text(),
  sort_order: t.int({ positional: true }),
};

const FEATURE_FIELDS = {
  label: t.i18n({ required: true }),
  included: t.bool({ required: true }),
};

const COMMON_FIELDS = {
  is_published: t.bool({ default: true }),
  sort_order: t.int(),
};

const RESOURCES = [
  {
    name: 'museums',
    label: 'Museum',
    fields: {
      name: t.i18n({ required: true }),
      short_description: t.i18n(),
      address: t.i18n(),
      image: t.text(),
      working_hours: t.text(),
      rating: t.number({ min: 0, max: 5 }),
      ticket_price: t.text(),
      ticket_url: t.text(),
      ...COMMON_FIELDS,
    },
    select: `id, slug, name, short_description, address, image, working_hours,
             rating, ticket_price, ticket_url, is_published, source, sort_order,
             created_at, updated_at`,
  },
  {
    name: 'routes',
    label: 'Route',
    fields: {
      title: t.i18n({ required: true }),
      duration: t.i18n(),
      distance: t.i18n(),
      tags: t.strings(),
      stops: t.list(STOP_FIELDS),
      image: t.text(),
      pass_url: t.text(),
      origin: t.text(),
      ...COMMON_FIELDS,
    },
    select: `id, slug, title, duration, distance, tags, stops, image, pass_url,
             origin, is_published, source, sort_order, created_at, updated_at`,
  },
  {
    name: 'events',
    label: 'Event',
    fields: {
      title: t.i18n({ required: true }),
      description: t.i18n(),
      category: t.i18n(),
      venue: t.i18n(),
      start_date: t.date(),
      end_date: t.date(),
      time: t.text(),
      image: t.text(),
      ticket_url: t.text(),
      origin: t.text(),
      ...COMMON_FIELDS,
    },
    select: `id, slug, title, description, category, venue,
             TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
             TO_CHAR(end_date,   'YYYY-MM-DD') AS end_date,
             time, image, ticket_url, origin, is_published, source, sort_order,
             created_at, updated_at`,
  },
  {
    name: 'news',
    label: 'News item',
    fields: {
      type: t.enum(['review', 'news', 'announcement'], { default: 'news' }),
      title: t.i18n({ required: true }),
      excerpt: t.i18n(),
      image: t.text(),
      image_position: t.text(),
      published_date: t.date(),
      origin: t.text(),
      ...COMMON_FIELDS,
    },
    select: `id, slug, type, title, excerpt, image, image_position,
             TO_CHAR(published_date, 'YYYY-MM-DD') AS published_date,
             origin, is_published, source, sort_order, created_at, updated_at`,
  },
  {
    name: 'places',
    label: 'Place',
    fields: {
      category: t.text({ notNull: true, default: 'other' }),
      name: t.i18n({ required: true }),
      description: t.i18n(),
      address: t.i18n(),
      image: t.text(),
      open_hours: t.text(),
      status: t.text(),
      lat: t.number({ min: -90, max: 90 }),
      lng: t.number({ min: -180, max: 180 }),
      origin: t.text(),
      ...COMMON_FIELDS,
    },
    select: `id, slug, category, name, description, address, image, open_hours,
             status, lat::float8 AS lat, lng::float8 AS lng, origin,
             is_published, source, sort_order, created_at, updated_at`,
  },
  {
    name: 'passes',
    label: 'Pass',
    fields: {
      name: t.i18n({ required: true }),
      description: t.i18n(),
      features: t.list(FEATURE_FIELDS),
      price: t.number({ min: 0, max: 99999999.99 }),
      currency: t.text(),
      duration: t.text(),
      is_featured: t.bool(),
      buy_url: t.text(),
      ...COMMON_FIELDS,
    },
    select: `id, slug, name, description, features, price::float8 AS price,
             currency, duration, is_featured, buy_url, is_published, source,
             sort_order, created_at, updated_at`,
  },
];

// JSONB columns are sent as JSON text; node-pg would otherwise turn a JS
// array into a Postgres array literal.
function toParam(spec, value) {
  return ['i18n', 'strings', 'list'].includes(spec.kind) ? JSON.stringify(value) : value;
}

// --- Request helpers ---
function badRequest(res, details) {
  return res.status(400).json({ error: 'Validation failed', details });
}

// Parses and validates a write body. Returns the cleaned field values, or
// null after sending a 400.
function readBody(req, res, resource, mode, pathSlug) {
  if (!req.is('application/json')) {
    res.status(400).json({ error: 'Content-Type must be application/json' });
    return null;
  }
  const body = req.body;
  if (!isPlainObject(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' });
    return null;
  }

  const errors = [];
  const { slug, ...rest } = body;
  for (const key of READ_ONLY_FIELDS) {
    if (key in rest) {
      errors.push(`${key}: read-only, set by the server`);
      delete rest[key];
    }
  }

  if (pathSlug === undefined) {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      errors.push('slug: required, lowercase letters, digits and single hyphens (e.g. "maiden-tower")');
    }
  } else if (slug !== undefined && slug !== pathSlug) {
    errors.push('slug: cannot be changed (must match the URL or be omitted)');
  }

  const values = checkObject(resource.fields, rest, mode, '', errors);
  if (mode === 'partial' && errors.length === 0 && Object.keys(values).length === 0) {
    errors.push('body: no fields to update');
  }

  if (errors.length > 0) {
    badRequest(res, errors);
    return null;
  }
  return { slug, values };
}

function dbError(res, err, resource, label) {
  if (err.code === '23505') {
    return res.status(409).json({ error: `${resource.label} with this slug already exists` });
  }
  if (err.code === '23514' || err.code?.startsWith('22')) {
    return res.status(400).json({ error: 'Validation failed', details: [err.message] });
  }
  console.error(`${label} failed:`, err);
  return res.status(500).json({ error: 'Internal server error' });
}

// --- Router ---
const router = express.Router();

for (const resource of RESOURCES) {
  const base = `/api/${resource.name}`;
  const table = resource.name;

  // POST /api/<resource> — create. slug + required fields; omitted optional
  // fields get their defaults.
  router.post(base, requireAdminKey, async (req, res) => {
    const parsed = readBody(req, res, resource, 'full');
    if (!parsed) return;

    const cols = Object.keys(parsed.values);
    const params = [parsed.slug, ...cols.map((c) => toParam(resource.fields[c], parsed.values[c]))];
    try {
      const { rows } = await pool.query(
        `WITH w AS (
           INSERT INTO ${table} (slug, ${cols.join(', ')}, source)
           VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}, 'admin')
           RETURNING *
         )
         SELECT ${resource.select} FROM w`,
        params
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      dbError(res, err, resource, `POST ${base}`);
    }
  });

  // PUT /api/<resource>/:slug — full replace; omitted optional fields are
  // reset to their defaults. PATCH — only the fields sent are changed.
  for (const mode of ['full', 'partial']) {
    const method = mode === 'full' ? 'put' : 'patch';
    router[method](`${base}/:slug`, requireAdminKey, async (req, res) => {
      const { slug } = req.params;
      const parsed = readBody(req, res, resource, mode, slug);
      if (!parsed) return;

      const cols = Object.keys(parsed.values);
      const params = [slug, ...cols.map((c) => toParam(resource.fields[c], parsed.values[c]))];
      try {
        const { rows } = await pool.query(
          `WITH w AS (
             UPDATE ${table}
                SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, source = 'admin'
              WHERE slug = $1
             RETURNING *
           )
           SELECT ${resource.select} FROM w`,
          params
        );
        if (rows.length === 0) {
          return res.status(404).json({ error: `${resource.label} not found` });
        }
        res.json(rows[0]);
      } catch (err) {
        dbError(res, err, resource, `${method.toUpperCase()} ${base}/${slug}`);
      }
    });
  }

  // DELETE /api/<resource>/:slug — soft delete: is_published = FALSE. The row
  // becomes admin-owned, so the seeder won't republish it on the next boot.
  // Restore with PATCH {"is_published": true}.
  router.delete(`${base}/:slug`, requireAdminKey, async (req, res) => {
    const { slug } = req.params;
    try {
      const { rows } = await pool.query(
        `WITH w AS (
           UPDATE ${table} SET is_published = FALSE, source = 'admin'
            WHERE slug = $1
           RETURNING *
         )
         SELECT ${resource.select} FROM w`,
        [slug]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: `${resource.label} not found` });
      }
      res.json(rows[0]);
    } catch (err) {
      dbError(res, err, resource, `DELETE ${base}/${slug}`);
    }
  });
}

// PUT /api/config/:key — body {"enabled": true|false}. Only existing section
// keys can be toggled (the seeder creates one row per Home section).
router.put('/api/config/:key', requireAdminKey, async (req, res) => {
  const { key } = req.params;
  const body = req.body;
  if (!req.is('application/json') || !isPlainObject(body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object: {"enabled": true|false}' });
  }
  const unknown = Object.keys(body).filter((k) => k !== 'enabled');
  const details = unknown.map((k) => `${k}: unknown field`);
  if (typeof body.enabled !== 'boolean') details.unshift('enabled: required, must be true or false');
  if (details.length > 0) return badRequest(res, details);

  try {
    const { rows } = await pool.query(
      `UPDATE feature_flags SET enabled = $2 WHERE key = $1
       RETURNING key, enabled, updated_at`,
      [key, body.enabled]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: `Unknown section "${key}"` });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(`PUT /api/config/${key} failed:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Docs ---
// Human-readable field descriptions for /api/docs, derived from the specs
// above so the docs can't drift from the validation.
function describeField(spec) {
  const kinds = {
    i18n: 'trilingual object {az, en, ru}',
    text: spec.notNull ? 'string' : 'string | null',
    number: 'number | null',
    int: 'integer',
    bool: 'boolean',
    date: '"YYYY-MM-DD" | null',
    enum: spec.values && spec.values.join(' | '),
    strings: 'string[]',
    list: 'array',
  };
  let text = kinds[spec.kind];
  if (spec.min !== undefined) text += ` (${spec.min}–${spec.max})`;
  if (spec.required) {
    text += spec.kind === 'i18n' ? ' — required, all of az/en/ru non-empty' : ' — required';
  } else if (!spec.positional) {
    text += ` — default ${JSON.stringify(spec.default)}`;
  }
  return text;
}

function describeFields(fields) {
  const out = {};
  for (const [key, spec] of Object.entries(fields)) {
    out[key] = spec.kind === 'list' ? [describeFields(spec.item)] : describeField(spec);
  }
  return out;
}

const endpoints = [];
for (const r of RESOURCES) {
  const body = { slug: 'string — required on POST, immutable afterwards', ...describeFields(r.fields) };
  endpoints.push(
    { method: 'POST', path: `/api/${r.name}`, auth: true, summary: `Create a ${r.label.toLowerCase()}. 201 with the row; 409 if the slug exists.`, body },
    { method: 'PUT', path: `/api/${r.name}/:slug`, auth: true, summary: 'Full update — omitted optional fields are reset to their defaults.', body },
    { method: 'PATCH', path: `/api/${r.name}/:slug`, auth: true, summary: 'Partial update — only the fields sent are changed.', body },
    { method: 'DELETE', path: `/api/${r.name}/:slug`, auth: true, summary: 'Soft delete (is_published = false). Undo with PATCH {"is_published": true}.' }
  );
}
endpoints.push({
  method: 'PUT',
  path: '/api/config/:key',
  auth: true,
  summary: 'Toggle a Home section. 404 for an unknown key.',
  body: { enabled: 'boolean — required' },
});

module.exports = { adminRouter: router, adminEndpoints: endpoints, RESOURCES };
