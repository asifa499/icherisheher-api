# icherisheher-api

İçərişəhər Digital Experience Ecosystem — public REST API.
Node.js + Express + PostgreSQL (Railway). Serves trilingual (az / en / ru) museum content to the frontend at `https://asifa499.github.io/icherisheher-home/`.

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
npm run migrate   # creates the museums table (migrations/*.sql in order)
npm run seed      # imports data/museums.json (upsert by slug)
npm start         # starts the server
```

> **Note:** `data/museums.json` is synced from the `icherisheher-home` frontend
> repo. The boot-time auto-setup re-runs the seed on every start — it upserts
> by `slug`, so refreshing this file and redeploying is always safe (existing
> rows get updated, new slugs get inserted, nothing is duplicated).

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
