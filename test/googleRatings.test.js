// Run with: npm test  (no network, no database)
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fetchRating, searchPlace, refreshRatings, ratingFields, mockFetch, RATING_FIELD_MASK,
} = require('../googleRatings');

const silent = { log() {}, error() {} };
const jsonRes = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('fetchRating requests only rating,userRatingCount and sends the key as a header', async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return jsonRes({ rating: 4.46, userRatingCount: 10 }); };
  const out = await fetchRating('abc', { fetchImpl, apiKey: 'K' });
  assert.deepEqual(out, { rating: 4.5, count: 10 });
  assert.equal(seen.opts.headers['X-Goog-FieldMask'], 'rating,userRatingCount');
  assert.equal(RATING_FIELD_MASK, 'rating,userRatingCount');
  assert.equal(seen.opts.headers['X-Goog-Api-Key'], 'K');
  assert.ok(!seen.url.includes('K'), 'key must not be in the URL');
});

test('fetchRating errors do not leak the key', async () => {
  const fetchImpl = async () => jsonRes({}, 403);
  await assert.rejects(fetchRating('abc', { fetchImpl, apiKey: 'SECRET' }), (e) => !e.message.includes('SECRET'));
});

test('searchPlace returns the top candidate', async () => {
  const hit = await searchPlace('x Baku', { fetchImpl: mockFetch, apiKey: 'K' });
  assert.equal(hit.placeId, 'MOCK_PLACE_ID');
});

function fakePool(rows) {
  const writes = [];
  return {
    writes,
    query: async (sql, params) => {
      if (/^\s*SELECT/i.test(sql)) return { rows };
      writes.push(params);
      return { rows: [] };
    },
  };
}

test('refreshRatings writes ratings and keeps going after a failure', async () => {
  const pool = fakePool([
    { id: 1, slug: 'a', google_place_id: 'good' },
    { id: 2, slug: 'b', google_place_id: 'bad' },
    { id: 3, slug: 'c', google_place_id: 'good' },
  ]);
  const fetchImpl = async (url) => (url.includes('bad') ? jsonRes({}, 500) : jsonRes({ rating: 4.2, userRatingCount: 5 }));
  process.env.GOOGLE_PLACES_KEY = 'K';
  const r = await refreshRatings(pool, { fetchImpl, log: silent });
  assert.deepEqual(r, { updated: 2, failed: 1, skipped: 0 });
  assert.deepEqual(pool.writes.map((w) => w[2]), [1, 3]); // id 2 never overwritten
});

test('refreshRatings dry run writes nothing', async () => {
  const pool = fakePool([{ id: 1, slug: 'a', google_place_id: 'p' }]);
  process.env.GOOGLE_PLACES_KEY = 'K';
  const r = await refreshRatings(pool, { fetchImpl: mockFetch, dryRun: true, log: silent });
  assert.equal(pool.writes.length, 0);
  assert.equal(r.skipped, 1);
});

test('ratingFields prefers Google and falls back to seed', () => {
  assert.deepEqual(ratingFields({ rating: 4.9, google_rating: 4.4, google_rating_count: 99 }),
    { rating: 4.4, rating_count: 99, rating_source: 'google' });
  assert.deepEqual(ratingFields({ rating: 4.9, google_rating: null, google_rating_count: null }),
    { rating: 4.9, rating_count: null, rating_source: 'seed' });
});
