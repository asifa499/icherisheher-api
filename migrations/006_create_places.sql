-- 006_create_places.sql
-- İçərişəhər API — places ("See What's Nearby" map pins) table.
-- Mirrors the museums/routes/events/news schema: trilingual JSONB fields use
-- keys az, en, ru — e.g. name = {"az": "...", "en": "...", "ru": "..."}
-- Matches the frontend's data/places.json shape (icherisheher-home).

CREATE TABLE IF NOT EXISTS places (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  category     TEXT NOT NULL DEFAULT 'other',   -- free-form chip key: landmark | museum | cafe | shop | hotel | ...
  name         JSONB NOT NULL,                  -- {az, en, ru}
  description  JSONB NOT NULL DEFAULT '{}',     -- {az, en, ru}
  address      JSONB NOT NULL DEFAULT '{}',     -- {az, en, ru}
  image        TEXT,                            -- plain string, not localized
  open_hours   TEXT,                            -- plain string, e.g. "10:00 – 18:00"
  status       TEXT,                            -- open | closed | temporarily_closed
  -- Coordinates are stored as NUMERIC(9, 6) — exact to ~10 cm, no float drift.
  -- node-pg returns NUMERIC as a string, so the API casts both to float8 on
  -- SELECT; the frontend feeds them straight into a map as JS numbers.
  lat          NUMERIC(9, 6),
  lng          NUMERIC(9, 6),
  source       TEXT,                            -- provenance tag, e.g. "figma" | "placeholder"
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_places_published_sort
  ON places (is_published, sort_order);

CREATE INDEX IF NOT EXISTS idx_places_category
  ON places (category);

-- set_updated_at() is created by 001_create_museums.sql, which always runs first.
DROP TRIGGER IF EXISTS trg_places_updated_at ON places;
CREATE TRIGGER trg_places_updated_at
  BEFORE UPDATE ON places
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
