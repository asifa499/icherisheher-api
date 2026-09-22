// Runs every .sql file in /migrations in filename order.
// Usage: npm run migrate
const pool = require('../db');
const { runMigrations } = require('../db-setup');

async function migrate() {
  const client = await pool.connect();
  try {
    await runMigrations(client);
  } finally {
    client.release();
    await pool.end();
  }
  console.log('All migrations applied.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
