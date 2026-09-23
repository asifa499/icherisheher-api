// Shared migration/seed logic used by both the auto-setup-on-boot path
// (server.js) and the manual CLI scripts (scripts/migrate.js, scripts/seed.js).
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MUSEUMS_SEED_FILE = path.join(__dirname, 'data', 'museums.json');
const ROUTES_SEED_FILE = path.join(__dirname, 'data', 'routes.json');
const EVENTS_SEED_FILE = path.join(__dirname, 'data', 'events.json');
const NEWS_SEED_FILE = path.join(__dirname, 'data', 'news.json');

function validateMuseum(item, i) {
  if (!item.slug || typeof item.slug !== 'string') {
    throw new Error(`Item ${i}: missing or invalid "slug"`);
  }
  if (!item.name || typeof item.name !== 'object') {
    throw new Error(`Item ${i} (${item.slug}): "name" must be a trilingual object {az, en, ru}`);
  }
}

function validateRoute(item, i) {
  if (!item.slug || typeof item.slug !== 'string') {
    throw new Error(`Item ${i}: missing or invalid "slug"`);
  }
  if (!item.title || typeof item.title !== 'object') {
    throw new Error(`Item ${i} (${item.slug}): "title" must be a trilingual object {az, en, ru}`);
  }
  if (item.stops !== undefined && !Array.isArray(item.stops)) {
    throw new Error(`Item ${i} (${item.slug}): "stops" must be an array`);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateEvent(item, i) {
  if (!item.slug || typeof item.slug !== 'string') {
    throw new Error(`Item ${i}: missing or invalid "slug"`);
  }
  if (!item.title || typeof item.title !== 'object') {
    throw new Error(`Item ${i} (${item.slug}): "title" must be a trilingual object {az, en, ru}`);
  }
  for (const key of ['start_date', 'end_date']) {
    const value = item[key];
    if (value !== undefined && value !== null && !DATE_RE.test(value)) {
      throw new Error(`Item ${i} (${item.slug}): "${key}" must be a YYYY-MM-DD string or null`);
    }
  }
}

const NEWS_TYPES = ['review', 'news', 'announcement'];

function validateNews(item, i) {
  if (!item.slug || typeof item.slug !== 'string') {
    throw new Error(`Item ${i}: missing or invalid "slug"`);
  }
  if (!item.title || typeof item.title !== 'object') {
    throw new Error(`Item ${i} (${item.slug}): "title" must be a trilingual object {az, en, ru}`);
  }
  if (item.type !== undefined && !NEWS_TYPES.includes(item.type)) {
    throw new Error(
      `Item ${i} (${item.slug}): "type" must be one of ${NEWS_TYPES.join(', ')}`
    );
  }
  const value = item.published_date;
  if (value !== undefined && value !== null && !DATE_RE.test(value)) {
    throw new Error(
      `Item ${i} (${item.slug}): "published_date" must be a YYYY-MM-DD string or null`
    );
  }
}

async function tableExists(client, tableName) {
  const { rows } = await client.query('SELECT to_regclass($1) AS reg', [`public.${tableName}`]);
  return rows[0].reg !== null;
}

// Runs every .sql file in /migrations, in filename order, against `client`.
async function runMigrations(client) {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`→ Running ${file} ...`);
    await client.query(sql);
    console.log(`✓ ${file} done`);
  }
}

// Upserts data/museums.json into the museums table via `client`.
async function seedMuseums(client) {
  const raw = fs.readFileSync(MUSEUMS_SEED_FILE, 'utf8');
  const museums = JSON.parse(raw);

  if (!Array.isArray(museums)) {
    throw new Error('data/museums.json must be a JSON array of museum objects');
  }

  for (let i = 0; i < museums.length; i++) {
    const m = museums[i];
    validateMuseum(m, i);

    await client.query(
      `INSERT INTO museums (
         slug, name, short_description, address, is_published, sort_order,
         image, working_hours, rating, ticket_price, ticket_url
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (slug) DO UPDATE SET
         name              = EXCLUDED.name,
         short_description = EXCLUDED.short_description,
         address           = EXCLUDED.address,
         is_published      = EXCLUDED.is_published,
         sort_order        = EXCLUDED.sort_order,
         image              = EXCLUDED.image,
         working_hours      = EXCLUDED.working_hours,
         rating             = EXCLUDED.rating,
         ticket_price       = EXCLUDED.ticket_price,
         ticket_url         = EXCLUDED.ticket_url`,
      [
        m.slug,
        JSON.stringify(m.name),
        JSON.stringify(m.short_description || {}),
        JSON.stringify(m.address || {}),
        m.is_published !== false,
        Number.isInteger(m.sort_order) ? m.sort_order : i + 1,
        m.image ?? null,
        m.working_hours ?? null,
        typeof m.rating === 'number' ? m.rating : null,
        m.ticket_price ?? null,
        m.ticket_url ?? null,
      ]
    );
    console.log(`✓ ${m.slug}`);
  }

  // Unpublish (never delete) rows whose slug is no longer in the bundled
  // JSON. A stale row predates fields like rating/image/ticket_price and
  // would otherwise reach the API with those as null, and the frontend
  // calls e.g. `rating.toFixed(1)` with no null guard.
  const slugs = museums.map((m) => m.slug);
  const { rowCount } = await client.query(
    `UPDATE museums SET is_published = FALSE
      WHERE NOT (slug = ANY($1::text[])) AND is_published = TRUE`,
    [slugs]
  );
  if (rowCount > 0) {
    console.log(`Unpublished ${rowCount} stale museum(s) no longer in data/museums.json.`);
  }

  console.log(`Seed complete: ${museums.length} museums upserted.`);
}

// Upserts data/routes.json into the routes table via `client`.
// Same idempotent shape as seedMuseums: upsert by slug, never delete.
async function seedRoutes(client) {
  const raw = fs.readFileSync(ROUTES_SEED_FILE, 'utf8');
  const routes = JSON.parse(raw);

  if (!Array.isArray(routes)) {
    throw new Error('data/routes.json must be a JSON array of route objects');
  }

  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    validateRoute(r, i);

    await client.query(
      `INSERT INTO routes (
         slug, title, duration, distance, tags, stops,
         image, pass_url, source, is_published, sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (slug) DO UPDATE SET
         title        = EXCLUDED.title,
         duration     = EXCLUDED.duration,
         distance     = EXCLUDED.distance,
         tags         = EXCLUDED.tags,
         stops        = EXCLUDED.stops,
         image        = EXCLUDED.image,
         pass_url     = EXCLUDED.pass_url,
         source       = EXCLUDED.source,
         is_published = EXCLUDED.is_published,
         sort_order   = EXCLUDED.sort_order`,
      [
        r.slug,
        JSON.stringify(r.title),
        JSON.stringify(r.duration || {}),
        JSON.stringify(r.distance || {}),
        JSON.stringify(Array.isArray(r.tags) ? r.tags : []),
        JSON.stringify(Array.isArray(r.stops) ? r.stops : []),
        r.image ?? null,
        r.pass_url ?? null,
        r.source ?? null,
        r.is_published !== false,
        Number.isInteger(r.sort_order) ? r.sort_order : i + 1,
      ]
    );
    console.log(`\u2713 ${r.slug}`);
  }

  // Same rule as museums: unpublish (never delete) rows whose slug is no
  // longer in the bundled JSON, so stale rows can't reach the API.
  const slugs = routes.map((r) => r.slug);
  const { rowCount } = await client.query(
    `UPDATE routes SET is_published = FALSE
      WHERE NOT (slug = ANY($1::text[])) AND is_published = TRUE`,
    [slugs]
  );
  if (rowCount > 0) {
    console.log(`Unpublished ${rowCount} stale route(s) no longer in data/routes.json.`);
  }

  console.log(`Seed complete: ${routes.length} routes upserted.`);
}

// Upserts data/events.json into the events table via `client`.
// Same idempotent shape as seedMuseums/seedRoutes: upsert by slug, never delete.
async function seedEvents(client) {
  const raw = fs.readFileSync(EVENTS_SEED_FILE, 'utf8');
  const events = JSON.parse(raw);

  if (!Array.isArray(events)) {
    throw new Error('data/events.json must be a JSON array of event objects');
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    validateEvent(e, i);

    await client.query(
      `INSERT INTO events (
         slug, title, description, category, venue,
         start_date, end_date, time, image, ticket_url, source,
         is_published, sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (slug) DO UPDATE SET
         title        = EXCLUDED.title,
         description  = EXCLUDED.description,
         category     = EXCLUDED.category,
         venue        = EXCLUDED.venue,
         start_date   = EXCLUDED.start_date,
         end_date     = EXCLUDED.end_date,
         time         = EXCLUDED.time,
         image        = EXCLUDED.image,
         ticket_url   = EXCLUDED.ticket_url,
         source       = EXCLUDED.source,
         is_published = EXCLUDED.is_published,
         sort_order   = EXCLUDED.sort_order`,
      [
        e.slug,
        JSON.stringify(e.title),
        JSON.stringify(e.description || {}),
        JSON.stringify(e.category || {}),
        JSON.stringify(e.venue || {}),
        e.start_date ?? null,
        e.end_date ?? null,
        e.time ?? null,
        e.image ?? null,
        e.ticket_url ?? null,
        e.source ?? null,
        e.is_published !== false,
        Number.isInteger(e.sort_order) ? e.sort_order : i + 1,
      ]
    );
    console.log(`\u2713 ${e.slug}`);
  }

  // Same rule as museums/routes: unpublish (never delete) rows whose slug is
  // no longer in the bundled JSON, so stale rows can't reach the API.
  const slugs = events.map((e) => e.slug);
  const { rowCount } = await client.query(
    `UPDATE events SET is_published = FALSE
      WHERE NOT (slug = ANY($1::text[])) AND is_published = TRUE`,
    [slugs]
  );
  if (rowCount > 0) {
    console.log(`Unpublished ${rowCount} stale event(s) no longer in data/events.json.`);
  }

  console.log(`Seed complete: ${events.length} events upserted.`);
}

// Upserts data/news.json into the news table via `client`.
// Same idempotent shape as seedMuseums/seedRoutes/seedEvents: upsert by slug,
// never delete.
async function seedNews(client) {
  const raw = fs.readFileSync(NEWS_SEED_FILE, 'utf8');
  const news = JSON.parse(raw);

  if (!Array.isArray(news)) {
    throw new Error('data/news.json must be a JSON array of news objects');
  }

  for (let i = 0; i < news.length; i++) {
    const n = news[i];
    validateNews(n, i);

    await client.query(
      `INSERT INTO news (
         slug, type, title, excerpt, image, image_position,
         published_date, source, is_published, sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (slug) DO UPDATE SET
         type           = EXCLUDED.type,
         title          = EXCLUDED.title,
         excerpt        = EXCLUDED.excerpt,
         image          = EXCLUDED.image,
         image_position = EXCLUDED.image_position,
         published_date = EXCLUDED.published_date,
         source         = EXCLUDED.source,
         is_published   = EXCLUDED.is_published,
         sort_order     = EXCLUDED.sort_order`,
      [
        n.slug,
        n.type ?? 'news',
        JSON.stringify(n.title),
        JSON.stringify(n.excerpt || {}),
        n.image ?? null,
        n.image_position ?? null,
        n.published_date ?? null,
        n.source ?? null,
        n.is_published !== false,
        Number.isInteger(n.sort_order) ? n.sort_order : i + 1,
      ]
    );
    console.log(`\u2713 ${n.slug}`);
  }

  // Same rule as museums/routes/events: unpublish (never delete) rows whose
  // slug is no longer in the bundled JSON, so stale rows can't reach the API.
  const slugs = news.map((n) => n.slug);
  const { rowCount } = await client.query(
    `UPDATE news SET is_published = FALSE
      WHERE NOT (slug = ANY($1::text[])) AND is_published = TRUE`,
    [slugs]
  );
  if (rowCount > 0) {
    console.log(`Unpublished ${rowCount} stale news item(s) no longer in data/news.json.`);
  }

  console.log(`Seed complete: ${news.length} news items upserted.`);
}

// Syncs every bundled seed file into its table.
async function runSeed(client) {
  await seedMuseums(client);
  await seedRoutes(client);
  await seedEvents(client);
  await seedNews(client);
}

// Idempotent, safe-on-every-boot setup. Migrations always run — every
// migration file is written with IF NOT EXISTS / CREATE OR REPLACE, so
// re-running them against an already-migrated DB is a no-op — which is what
// lets a new migration (e.g. adding a column) reach a database that was
// already set up by an earlier deploy. The seed step always runs too,
// re-syncing data/museums.json, data/routes.json, data/events.json and
// data/news.json into their tables by
// upserting on slug — existing rows get their changed fields updated, new
// slugs get inserted, and nothing is ever duplicated. Everything runs in a
// single transaction.
async function ensureDatabaseSetup(pool) {
  const client = await pool.connect();
  try {
    const exists = await tableExists(client, 'museums');
    console.log(
      exists
        ? 'DB already migrated (museums table exists) — re-applying migrations + re-syncing seed data...'
        : 'museums table not found — running migration...'
    );

    await client.query('BEGIN');
    try {
      await runMigrations(client);
      await runSeed(client);
      await client.query('COMMIT');
      console.log('Auto DB setup complete.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}

module.exports = {
  tableExists,
  runMigrations,
  seedMuseums,
  seedRoutes,
  seedEvents,
  seedNews,
  runSeed,
  ensureDatabaseSetup,
};
