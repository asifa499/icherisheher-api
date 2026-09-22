// Runs every .sql file in /migrations in filename order.
// Usage: npm run migrate
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function migrate() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`→ Running ${file} ...`);
    await pool.query(sql);
    console.log(`✓ ${file} done`);
  }

  await pool.end();
  console.log('All migrations applied.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
