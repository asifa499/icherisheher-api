// Refreshes stored Google ratings for museums with a google_place_id.
// Meant for a daily Railway Cron service (start command:
// `node scripts/refresh-ratings.js`). Exits when done.
//   --dry-run  fetch and print, write nothing
//   --mock     use canned Google responses (no network, no API key needed)
const pool = require('../db');
const { refreshRatings, mockFetch } = require('../googleRatings');

const dryRun = process.argv.includes('--dry-run');
const mock = process.argv.includes('--mock');

async function main() {
  if (mock) process.env.GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY || 'mock';
  const result = await refreshRatings(pool, {
    dryRun,
    fetchImpl: mock ? mockFetch : undefined,
  });
  console.log(`Done: ${result.updated} updated, ${result.failed} failed, ${result.skipped} skipped.`);
}

main()
  .catch((err) => {
    console.error('Rating refresh failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
