# icherisheher-api

İçərişəhər Digital Experience Ecosystem — public REST API.
Node.js + Express + PostgreSQL (Railway). Serves trilingual (az / en / ru) museum, route, event, news, place and City Pass content to the frontend at `https://asifa499.github.io/icherisheher-home/`.

## Stack

- Node.js ≥ 18, Express 4
- PostgreSQL via `pg` (Pool), Railway-hosted
- Trilingual content stored as JSONB: `{"az": "...", "en": "...", "ru": "..."}`

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string. On Railway, use the reference `${{Postgres.DATABASE_URL}}` from the Postgres service. SSL is applied automatically for public URLs and skipped for `railway.internal` / localhost. |
| `PORT` | — | Server port. Railway injects it automatically; defaults to `3000` locally. |

Local development: copy `.env.example` → `.env` and fill in `DATABASE_URL`.

## Setup

```bash
npm install
npm run migrate   # creates the museums + routes + events + news + places + passes tables (migrations/*.sql in order)
npm run seed      # imports data/museums.json + data/routes.json + data/events.json + data/news.json + data/places.json + data/passes.json (upsert by slug)
npm start         # starts the server
```

> **Note:** `data/museums.json`, `data/routes.json`, `data/events.json`,
> `data/news.json`, `data/places.json` and `data/passes.json` are synced from
> the `icherisheher-home` frontend repo (`data/passes.json` there uses
> slightly different field names — `tagline` → `description`, `duration_label`
> → `duration`, each feature's `text` → `label` — everything else copies
> straight across).
> `data/places.json` has no upstream counterpart yet — the frontend's
> "See What's Nearby" section is still unbuilt — so it currently holds
> placeholder entries written against this schema; replace it wholesale once
> the frontend file exists. The boot-time auto-setup re-runs the seed
> on every start — it upserts by `slug`, so refreshing these files and
> redeploying is always safe (existing rows get updated, new slugs get
> inserted, nothing is duplicated).

## Endpoints

### `GET /api/health`
Liveness + DB check. Returns `{ status, db, timestamp }`. `503` if DB is unreachable.

### `GET /api/museums?lang=az|en|ru`
Published museums only (`is_published = TRUE`), ordered by `sort_order`.

- With `?lang=` — trilingual fields are flattened to that language (fallback: `az`).
- Without `?lang=` — full trilingual objects are returned.

```json
{
  "count": 4,
  "lang": "en",
  "data": [
    {
      "id": 1,
      "slug": "underground-hammam",
      "name": "Underground Hammam",
      "short_description": "...",
      "image": "assets/img/museum-hammam.jpg",
      "working_hours": "09:00 – 18:00",
      "rating": 4.9,
      "ticket_price": "From 10 AZN per person",
      "address": "50, Boyuk Gala Street",
      "ticket_url": "#",
      "sort_order": 1
    }
  ]
}
```

`image`, `working_hours`, `rating`, `ticket_price` and `ticket_url` are plain
values (not trilingual) — only `name`, `short_description` and `address` are
localized per `{az, en, ru}`. `rating` is a number.

### `GET /api/museums/:slug?lang=az|en|ru`
Single published museum by slug. `404` if missing or unpublished.

### `GET /api/routes?lang=az|en|ru`
Published ready-made routes only (`is_published = TRUE`), ordered by `sort_order`.
Same contract as `/api/museums` — with `?lang=` the trilingual fields are
flattened to that language (fallback: `az`), including the fields inside each
stop; without `?lang=` the full trilingual objects are returned.

```json
{
  "count": 3,
  "lang": "en",
  "data": [
    {
      "id": 1,
      "slug": "first-time-1-day",
      "title": "First time · 1 day",
      "duration": "4–5 hours",
      "distance": "2.1 km loop",
      "tags": ["first-time", "classic", "walking"],
      "stops": [
        {
          "name": "Qoşa Qala Gates",
          "description": "Start at the twin gates — the historic way in",
          "image": null,
          "sort_order": 1
        }
      ],
      "image": "assets/img/route-classic-walk.jpg",
      "pass_url": "#",
      "source": "figma",
      "sort_order": 1
    }
  ]
}
```

`image`, `pass_url` and `source` are plain values (not trilingual) — only
`title`, `duration`, `distance` and each stop's `name` / `description` are
localized per `{az, en, ru}`. `tags` is a plain string array.

### `GET /api/routes/:slug?lang=az|en|ru`
Single published route by slug. `404` if missing or unpublished.

### `GET /api/events?lang=az|en|ru`
Published events only (`is_published = TRUE`), ordered by `start_date` (soonest
first; events with no date sort last). Same contract as `/api/museums` — with
`?lang=` the trilingual fields are flattened to that language (fallback: `az`);
without `?lang=` the full trilingual objects are returned.

```json
{
  "count": 5,
  "lang": "en",
  "data": [
    {
      "id": 4,
      "slug": "mugham-concert-night",
      "title": "Mugham concert night",
      "description": "An open-air mugham concert at the foot of the Maiden Tower.",
      "category": "Music",
      "venue": "Maiden Tower",
      "start_date": "2026-05-28",
      "end_date": "2026-05-28",
      "time": "19:00",
      "image": null,
      "ticket_url": "#",
      "source": "figma",
      "sort_order": 4
    }
  ]
}
```

`start_date`, `end_date`, `time`, `image`, `ticket_url` and `source` are plain
values (not trilingual) — only `title`, `description`, `category` and `venue`
are localized per `{az, en, ru}`. The two dates are stored as `DATE` columns
and always serialized as plain `YYYY-MM-DD` strings (never timestamps), so they
match the frontend's `data/events.json` exactly.

### `GET /api/events/:slug?lang=az|en|ru`
Single published event by slug. `404` if missing or unpublished.

### `GET /api/news?lang=az|en|ru&type=review|news|announcement`
Published news only (`is_published = TRUE`), newest first (`published_date`
descending; undated items last). Same contract as `/api/museums` — with
`?lang=` the trilingual fields are flattened to that language (fallback:
`az`); without `?lang=` the full trilingual objects are returned.

The optional `?type=` filter narrows the list to one kind: `review`, `news` or
`announcement`. An unsupported value returns `400`.

```json
{
  "count": 3,
  "lang": "en",
  "type": "announcement",
  "data": [
    {
      "id": 10,
      "slug": "winter-opening-hours",
      "type": "announcement",
      "title": "Winter opening hours come into effect",
      "excerpt": "From 1 November the museums receive visitors from 10:00 to 17:00.",
      "image": "assets/img/resource-craftsmen.jpg",
      "image_position": null,
      "published_date": "2026-09-20",
      "source": "placeholder",
      "sort_order": 1
    }
  ]
}
```

`type`, `image`, `image_position`, `published_date` and `source` are plain
values (not trilingual) — only `title` and `excerpt` are localized per
`{az, en, ru}`. `published_date` is stored as a `DATE` column and always
serialized as a plain `YYYY-MM-DD` string (never a timestamp), so it matches
the frontend's `data/news.json` exactly. `sort_order` is scoped per `type`, so
it only orders items that share a date within the same kind.

### `GET /api/news/:slug?lang=az|en|ru`
Single published news item by slug. `404` if missing or unpublished.

### `GET /api/places?lang=az|en|ru&category=<key>`
Published places only (`is_published = TRUE`), ordered by `sort_order`. These
are the map pins behind the frontend's "See What's Nearby" section. Same
contract as the other collections — with `?lang=` the trilingual fields are
flattened to that language (fallback: `az`); without `?lang=` the full
trilingual objects are returned.

The optional `?category=` filter narrows the list to one map chip — the seed
data uses `landmark`, `museum`, `cafe`, `shop` and `hotel`. Unlike `/api/news`'s
`?type=`, the category is free-form (no CHECK constraint), so an unknown value
returns an empty list rather than a `400`.

```json
{
  "count": 1,
  "lang": "en",
  "category": "landmark",
  "data": [
    {
      "id": 1,
      "slug": "maiden-tower",
      "category": "landmark",
      "name": "Maiden Tower",
      "description": "The symbol of the Old City — a UNESCO-listed eight-storey tower.",
      "address": "1 Maiden Tower Street, Icherisheher",
      "image": "assets/img/place-maiden-tower.jpg",
      "open_hours": "10:00 – 18:00",
      "status": "open",
      "lat": 40.366389,
      "lng": 49.837222,
      "source": "placeholder",
      "sort_order": 1
    }
  ]
}
```

`category`, `image`, `open_hours`, `status`, `lat`, `lng` and `source` are
plain values (not trilingual) — only `name`, `description` and `address` are
localized per `{az, en, ru}`. `lat`/`lng` are stored as `NUMERIC(9, 6)` but
cast to `float8` on the way out, so they arrive as JSON numbers a map can use
directly (node-pg would otherwise serialize `NUMERIC` as a string).

### `GET /api/places/:slug?lang=az|en|ru`
Single published place by slug. `404` if missing or unpublished.

### `GET /api/passes?lang=az|en|ru`
Published City Pass tiers only (`is_published = TRUE`), ordered by
`sort_order`. Same contract as the other collections — with `?lang=` the
trilingual fields (including each feature's `label`) are flattened to that
language (fallback: `az`); without `?lang=` the full trilingual objects are
returned.

```json
{
  "count": 3,
  "lang": "en",
  "data": [
    {
      "id": 2,
      "slug": "explorer-pass",
      "name": "Explorer Pass",
      "description": "The right balance for a weekend visit",
      "features": [
        { "label": "Entry to all 9 museums", "included": true },
        { "label": "AR Time Machine experience", "included": false }
      ],
      "price": 42,
      "currency": "AZN",
      "duration": "24h",
      "is_featured": true,
      "buy_url": "#",
      "sort_order": 2
    }
  ]
}
```

`price`, `currency`, `duration`, `is_featured`, `buy_url` and each feature's
`included` are plain values (not trilingual) — only `name`, `description` and
each feature's `label` are localized per `{az, en, ru}`. `features` is a JSONB
array and its order is the display order (no separate per-feature sort key).
`price` is stored as `NUMERIC(10, 2)` but cast to `float8` on the way out, so
it arrives as a JSON number (node-pg would otherwise serialize `NUMERIC` as a
string).

### `GET /api/passes/:slug?lang=az|en|ru`
Single published pass by slug. `404` if missing or unpublished.

## CORS

Allowlist only:
- `https://asifa499.github.io`
- `http(s)://localhost:*` and `http(s)://127.0.0.1:*` (development)

Requests without an `Origin` header (curl, health checks) are allowed.

## Database schema

`migrations/001_create_museums.sql` + `002_add_museum_details.sql`:

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `slug` | TEXT UNIQUE | URL identifier |
| `name` | JSONB | `{az, en, ru}` |
| `short_description` | JSONB | `{az, en, ru}` |
| `address` | JSONB | `{az, en, ru}` |
| `image` | TEXT | plain string, not localized |
| `working_hours` | TEXT | plain string, not localized |
| `rating` | REAL | numeric, e.g. `4.9` |
| `ticket_price` | TEXT | plain string, not localized |
| `ticket_url` | TEXT | plain string, not localized |
| `is_published` | BOOLEAN | default `TRUE` |
| `sort_order` | INTEGER | default `0` |
| `created_at` | TIMESTAMPTZ | default `NOW()` |
| `updated_at` | TIMESTAMPTZ | auto-updated by trigger |

`migrations/003_create_routes.sql`:

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `slug` | TEXT UNIQUE | URL identifier |
| `title` | JSONB | `{az, en, ru}` |
| `duration` | JSONB | `{az, en, ru}` |
| `distance` | JSONB | `{az, en, ru}` |
| `tags` | JSONB | string array, default `[]` |
| `stops` | JSONB | array of `{name: {az,en,ru}, description: {az,en,ru}, image, sort_order}` |
| `image` | TEXT | plain string, not localized |
| `pass_url` | TEXT | plain string, not localized |
| `source` | TEXT | provenance tag, e.g. `figma` / `draft` |
| `is_published` | BOOLEAN | default `TRUE` |
| `sort_order` | INTEGER | default `0` |
| `created_at` | TIMESTAMPTZ | default `NOW()` |
| `updated_at` | TIMESTAMPTZ | auto-updated by trigger |

`migrations/004_create_events.sql`:

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `slug` | TEXT UNIQUE | URL identifier |
| `title` | JSONB | `{az, en, ru}` |
| `description` | JSONB | `{az, en, ru}` |
| `category` | JSONB | `{az, en, ru}`, e.g. `Cultural` / `Music` |
| `venue` | JSONB | `{az, en, ru}` |
| `start_date` | DATE | calendar date, served as `YYYY-MM-DD` |
| `end_date` | DATE | calendar date, served as `YYYY-MM-DD` |
| `time` | TEXT | plain `"HH:MM"` string, not localized |
| `image` | TEXT | plain string, not localized |
| `ticket_url` | TEXT | plain string, not localized |
| `source` | TEXT | provenance tag, e.g. `figma` / `draft` |
| `is_published` | BOOLEAN | default `TRUE` |
| `sort_order` | INTEGER | default `0` |
| `created_at` | TIMESTAMPTZ | default `NOW()` |
| `updated_at` | TIMESTAMPTZ | auto-updated by trigger |

`migrations/005_create_news.sql`:

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `slug` | TEXT UNIQUE | URL identifier |
| `type` | TEXT | `review` / `news` / `announcement` (CHECK constraint), default `news` |
| `title` | JSONB | `{az, en, ru}` |
| `excerpt` | JSONB | `{az, en, ru}` |
| `image` | TEXT | plain string, not localized |
| `image_position` | TEXT | CSS `object-position`, e.g. `26% center` |
| `published_date` | DATE | calendar date, served as `YYYY-MM-DD` |
| `source` | TEXT | provenance tag, e.g. `figma` / `placeholder` |
| `is_published` | BOOLEAN | default `TRUE` |
| `sort_order` | INTEGER | default `0` |
| `created_at` | TIMESTAMPTZ | default `NOW()` |
| `updated_at` | TIMESTAMPTZ | auto-updated by trigger |

`migrations/006_create_places.sql`:

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `slug` | TEXT UNIQUE | URL identifier |
| `category` | TEXT | free-form chip key, e.g. `landmark` / `museum` / `cafe` / `shop` / `hotel`; default `other` |
| `name` | JSONB | `{az, en, ru}` |
| `description` | JSONB | `{az, en, ru}` |
| `address` | JSONB | `{az, en, ru}` |
| `image` | TEXT | plain string, not localized |
| `open_hours` | TEXT | plain string, e.g. `10:00 – 18:00` |
| `status` | TEXT | `open` / `closed` / `temporarily_closed` |
| `lat` | NUMERIC(9,6) | latitude, served as a JSON number (cast to `float8`) |
| `lng` | NUMERIC(9,6) | longitude, served as a JSON number (cast to `float8`) |
| `source` | TEXT | provenance tag, e.g. `figma` / `placeholder` |
| `is_published` | BOOLEAN | default `TRUE` |
| `sort_order` | INTEGER | default `0` |
| `created_at` | TIMESTAMPTZ | default `NOW()` |
| `updated_at` | TIMESTAMPTZ | auto-updated by trigger |

`migrations/007_create_passes.sql`:

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `slug` | TEXT UNIQUE | URL identifier |
| `name` | JSONB | `{az, en, ru}` |
| `description` | JSONB | `{az, en, ru}`, subtitle/tagline |
| `features` | JSONB | array of `{label: {az,en,ru}, included: boolean}`; array order is display order |
| `price` | NUMERIC(10,2) | served as a JSON number (cast to `float8`) |
| `currency` | TEXT | plain string, e.g. `AZN` |
| `duration` | TEXT | plain string, e.g. `24h` |
| `is_featured` | BOOLEAN | default `FALSE` |
| `buy_url` | TEXT | plain string, not localized |
| `is_published` | BOOLEAN | default `TRUE` |
| `sort_order` | INTEGER | default `0` |
| `created_at` | TIMESTAMPTZ | default `NOW()` |
| `updated_at` | TIMESTAMPTZ | auto-updated by trigger |

## Deploy to Railway

1. Create a new Railway service from `asifa499/icherisheher-api` (GitHub).
2. Add a PostgreSQL database to the project (or reuse the existing one from `icherisheher-pm` — a separate DB is recommended).
3. On the API service, set `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.
4. Railway runs `npm install` and `npm start` automatically.
5. One-time, from the service shell (or locally against the public DB URL):
   ```bash
   npm run migrate && npm run seed
   ```
6. Verify: `https://<service-domain>/api/health`
