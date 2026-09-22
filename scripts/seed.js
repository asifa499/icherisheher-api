// Imports data/museums.json into the museums table (upsert by slug).
// Usage: npm run seed
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const DATA_FILE = path.join(__dirname, '..', 'data', 'museums.json');

function validate(item, i) {
  if (!item.slug || typeof item.slug !== 'string') {
    throw new Error(`Item ${i}: missing or invalid "slug"`);
  }
  if (!item.name || typeof item.name !== 'object') {
    throw new Error(`Item ${i} (${item.slug}): "name" must be a trilingual object {az, en, ru}`);
  }
}

async function seed() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const museums = JSON.parse(raw);

  if (!Array.isArray(museums)) {
    throw new Error('data/museums.json must be a JSON array of museum objects');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < museums.length; i++) {
      const m = museums[i];
      validate(m, i);

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

    await client.query('COMMIT');
    console.log(`Seed complete: ${museums.length} museums upserted.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
