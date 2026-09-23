# icherisheher-api

İçərişəhər Digital Experience Ecosystem — public REST API.
Node.js + Express + PostgreSQL (Railway). Serves trilingual (az / en / ru) museum and route content to the frontend at `https://asifa499.github.io/icherisheher-home/`.

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
npm run migrate   # creates the museums + routes tables (migrations/*.sql in order)
npm run seed      # imports data/museums.json + data/routes.json (upsert by slug)
npm start         # starts the server
```

> **Note:** `data/museums.json` and `data/routes.json` are synced from the
> `icherisheher-home` frontend repo. The boot-time auto-setup re-runs the seed
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
