// Run with: npm test  (no network, no database)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unused/unused'; // pool is lazy; no connection is made
const { seedRoutes } = require('../db-setup');
const { RESOURCES } = require('../admin');

const routes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'routes.json'), 'utf8'));
const LANGS = ['az', 'en', 'ru'];
const TABS = ['first-time', 'group', 'private', 'qala'];

test('seed routes carry every tour-card field the Home page reads', () => {
  assert.equal(routes.length, 4);
  for (const r of routes) {
    assert.ok(['restaurant', 'museums', 'walk'].includes(r.type), r.slug);
    assert.ok(['private', 'group', 'walk'].includes(r.mode), r.slug);
    assert.equal(typeof r.working_hours, 'string');
    assert.equal(typeof r.rating, 'number');
    assert.equal(typeof r.book_url, 'string');
    for (const f of ['title', 'short_description', 'address', 'price']) {
      for (const l of LANGS) assert.ok(r[f][l], `${r.slug}.${f}.${l}`);
    }
    assert.ok(r.tags.length > 0 && r.tags.every((t) => TABS.includes(t)), r.slug);
  }
  for (const tab of TABS) assert.ok(routes.some((r) => r.tags.includes(tab)), `tab ${tab} has a card`);
});

test('seedRoutes writes the new columns', async () => {
  const calls = [];
  const client = { query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 0 }; } };
  const log = console.log; console.log = () => {};
  try { await seedRoutes(client); } finally { console.log = log; }
  const insert = calls.find((c) => c.sql.includes('INSERT INTO routes'));
  assert.equal(insert.params.length, 20);
  assert.equal(insert.params[11], routes[0].type);
  assert.equal(insert.params[15], JSON.stringify(routes[0].short_description));
  assert.equal(insert.params[17], JSON.stringify(routes[0].price));
});

test('admin routes resource accepts the new fields', () => {
  const res = RESOURCES.find((r) => r.name === 'routes');
  for (const f of ['type', 'mode', 'working_hours', 'rating', 'short_description', 'address', 'price', 'book_url']) {
    assert.ok(res.fields[f], f);
    assert.ok(res.select.includes(f), `select ${f}`);
  }
});
