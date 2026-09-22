// Imports data/museums.json into the museums table (upsert by slug).
// Usage: npm run seed
const pool = require('../db');
const { runSeed } = require('../db-setup');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await runSeed(client);
    await client.query('COMMIT');
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
