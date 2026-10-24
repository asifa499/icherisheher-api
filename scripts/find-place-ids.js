// One-time helper: finds Google place ids for museums that have none.
// Usage:
//   node scripts/find-place-ids.js            # print top candidates, write nothing
//   node scripts/find-place-ids.js --write    # save the printed place ids
//   node scripts/find-place-ids.js --mock     # canned responses, no Google calls
// Review the table before using --write: the top Text Search hit is not
// always the right place.
const pool = require('../db');
const { searchPlace, mockFetch } = require('../googleRatings');

const write = process.argv.includes('--write');
const mock = process.argv.includes('--mock');

async function main() {
  if (write && mock) throw new Error('--write cannot be combined with --mock');
  if (mock) process.env.GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY || 'mock';
  const fetchImpl = mock ? mockFetch : undefined;

  const { rows } = await pool.query(
    `SELECT id, slug, name FROM museums WHERE google_place_id IS NULL ORDER BY id`
  );

  const table = [];
  for (const row of rows) {
    const nameEn = row.name && (row.name.en || row.name.az);
    try {
      const hit = await searchPlace(`${nameEn} Baku`, { fetchImpl });
      table.push({
        id: row.id,
        slug: row.slug,
        query: `${nameEn} Baku`,
        found_name: hit ? hit.name : '(no result)',
        address: hit ? hit.address : '',
        place_id: hit ? hit.placeId : '',
      });
    } catch (err) {
      console.error(`${row.slug}: search failed — ${err.message}`);
    }
  }

  console.table(table);

  if (!write) {
    console.log('Dry run — nothing written. Re-run with --write to save these place ids.');
    return;
  }
  let saved = 0;
  for (const t of table) {
    if (!t.place_id) continue;
    await pool.query(
      `UPDATE museums SET google_place_id = $1 WHERE id = $2 AND google_place_id IS NULL`,
      [t.place_id, t.id]
    );
    saved++;
  }
  console.log(`Saved ${saved} place id(s).`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
