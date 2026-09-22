// Shared migration/seed logic used by both the auto-setup-on-boot path
// (server.js) and the manual CLI scripts (scripts/migrate.js, scripts/seed.js).
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SEED_FILE = path.join(__dirname, 'data', 'museums.json');

function validateMuseum(item, i) {
  if (!item.slug || typeof item.slug !== 'string') {
    throw new Error(`Item ${i}: missing or invalid "slug"`);
  }
  if (!item.name || typeof item.name !== 'object') {
    throw new Error(`Item ${i} (${item.slug}): "name" must be a trilingual object {az, en, ru}`);
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
async function runSeed(client) {
  const raw = fs.readFileSync(SEED_FILE, 'utf8');
  const museums = JSON.parse(raw);

  if (!Array.isArray(museums)) {
    throw new Error('data/museums.json must be a JSON array of museum objects');
  }

  for (let i = 0; i < museums.length; i++) {
    const m = museums[i];
    validateMuseum(m, i);

    await client.query(
      `INSERT INTO museums (slug, name, short_description, address, is_published, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         name              = EXCLUDED.name,
         short_description = EXCLUDED.short_description,
         address           = EXCLUDED.address,
         is_published      = EXCLUDED.is_published,
         sort_order        = EXCLUDED.sort_order`,
      [
        m.slug,
        JSON.stringify(m.name),
        JSON.stringify(m.short_description || {}),
        JSON.stringify(m.address || {}),
        m.is_published !== false,
        Number.isInteger(m.sort_order) ? m.sort_order : i + 1,
      ]
    );
    console.log(`✓ ${m.slug}`);
  }

  console.log(`Seed complete: ${museums.length} museums upserted.`);
}

// Idempotent, safe-on-every-boot setup. Migrations only run the first time
// (when the museums table doesn't exist yet); the seed step always runs,
// re-syncing data/museums.json into the table by upserting on slug — existing
// rows get their changed fields updated, new slugs get inserted, and nothing
// is ever duplicated. Everything runs in a single transaction.
async function ensureDatabaseSetup(pool) {
  const client = await pool.connect();
  try {
    const exists = await tableExists(client, 'museums');

    await client.query('BEGIN');
    try {
      if (!exists) {
        console.log('museums table not found — running migration...');
        await runMigrations(client);
      } else {
        console.log('DB already migrated (museums table exists) — re-syncing seed data...');
      }

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

module.exports = { tableExists, runMigrations, runSeed, ensureDatabaseSetup };
