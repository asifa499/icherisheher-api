// Server-side Google Places API (New) client. The frontend never calls Google.
// The API key is read from GOOGLE_PLACES_KEY, sent only as a request header,
// and never logged or returned.

const PLACES_BASE = 'https://places.googleapis.com/v1';

// Only these two fields are requested (keeps the call in the cheapest SKU).
const RATING_FIELD_MASK = 'rating,userRatingCount';

function getKey(apiKey) {
  const key = apiKey ?? process.env.GOOGLE_PLACES_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_KEY is not set');
  return key;
}

// Returns { rating, count } for a place id, or throws. Callers decide how to
// handle failure; refreshRatings() below keeps the stored value on error.
async function fetchRating(placeId, { fetchImpl = fetch, apiKey } = {}) {
  const key = getKey(apiKey);
  const res = await fetchImpl(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': RATING_FIELD_MASK,
    },
  });
  if (!res.ok) {
    // Status only — the response body and request headers are not logged.
    throw new Error(`Places API responded ${res.status}`);
  }
  const body = await res.json();
  if (typeof body.rating !== 'number') {
    throw new Error('Places API returned no rating');
  }
  const rating = Math.round(body.rating * 10) / 10;
  if (rating < 0 || rating > 5) throw new Error(`Rating out of range: ${rating}`);
  return {
    rating,
    count: Number.isInteger(body.userRatingCount) ? body.userRatingCount : null,
  };
}

// Text Search (New): returns the top candidate { name, address, placeId } or null.
async function searchPlace(query, { fetchImpl = fetch, apiKey } = {}) {
  const key = getKey(apiKey);
  const res = await fetchImpl(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
  });
  if (!res.ok) throw new Error(`Places API responded ${res.status}`);
  const body = await res.json();
  const p = body.places && body.places[0];
  if (!p) return null;
  return {
    name: p.displayName && p.displayName.text,
    address: p.formattedAddress,
    placeId: p.id,
  };
}

// Refreshes every museum that has a google_place_id. A failure for one place
// is logged and skipped — existing stored values are never overwritten with
// null. With dryRun, nothing is written. Returns { updated, failed, skipped }.
async function refreshRatings(pool, { fetchImpl, dryRun = false, log = console } = {}) {
  const { rows } = await pool.query(
    `SELECT id, slug, google_place_id
       FROM museums
      WHERE google_place_id IS NOT NULL
      ORDER BY id`
  );

  const result = { updated: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    try {
      const { rating, count } = await fetchRating(row.google_place_id, { fetchImpl });
      if (dryRun) {
        log.log(`[dry-run] ${row.slug}: ${rating} (${count} ratings)`);
        result.skipped++;
        continue;
      }
      await pool.query(
        `UPDATE museums
            SET google_rating = $1,
                google_rating_count = $2,
                google_rating_updated_at = NOW()
          WHERE id = $3`,
        [rating, count, row.id]
      );
      log.log(`${row.slug}: ${rating} (${count} ratings)`);
      result.updated++;
    } catch (err) {
      log.error(`${row.slug}: rating refresh failed — ${err.message}`);
      result.failed++;
    }
  }
  return result;
}

// Canned Google-shaped responses for --mock runs and tests. No network.
function mockFetch(url, opts = {}) {
  const ok = (body) =>
    Promise.resolve({ ok: true, status: 200, json: async () => body });
  if (String(url).endsWith(':searchText')) {
    return ok({
      places: [
        {
          id: 'MOCK_PLACE_ID',
          displayName: { text: 'Mock Museum' },
          formattedAddress: 'Mock St 1, Baku',
        },
      ],
    });
  }
  return ok({ rating: 4.56, userRatingCount: 1234 });
}

// Google rating when we have one, otherwise the static seed rating.
// google_rating is selected as float8 so it is a JS number, like `rating`.
function ratingFields(row) {
  if (row.google_rating !== null && row.google_rating !== undefined) {
    return {
      rating: row.google_rating,
      rating_count: row.google_rating_count ?? null,
      rating_source: 'google',
    };
  }
  return { rating: row.rating, rating_count: null, rating_source: 'seed' };
}

module.exports = { ratingFields, fetchRating, searchPlace, refreshRatings, mockFetch, RATING_FIELD_MASK };
