require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. See README.md → Environment variables.');
  process.exit(1);
}

// Railway internal networking (postgres.railway.internal) and local Postgres
// don't use SSL; Railway public proxy URLs do.
const needsSsl =
  !connectionString.includes('railway.internal') &&
  !connectionString.includes('localhost') &&
  !connectionString.includes('127.0.0.1');

const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
