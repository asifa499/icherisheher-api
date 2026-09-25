-- 007_create_passes.sql
-- İçərişəhər API — passes (City Pass tiers) table.
-- Mirrors the museums/routes/events/news/places schema: trilingual JSONB
-- fields use keys az, en, ru — e.g. name = {"az": "...", "en": "...", "ru": "..."}
-- Matches the frontend's data/passes.json shape (icherisheher-home).

CREATE TABLE IF NOT EXISTS passes (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         JSONB NOT NULL,                  -- {az, en, ru}
  description  JSONB NOT NULL DEFAULT '{}',     -- {az, en, ru} — subtitle/tagline
  -- Array of { label: {az, en, ru}, included: boolean }; array order IS the
  -- display order, so no per-feature sort key is stored.
  features     JSONB NOT NULL DEFAULT '[]',
  price        NUMERIC(10, 2),
  currency     TEXT,
  duration     TEXT,                            -- plain string, e.g. "24h"
  is_featured  BOOLEAN NOT NULL DEFAULT FALSE,
  buy_url      TEXT,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passes_published_sort
  ON passes (is_published, sort_order);

-- set_updated_at() is created by 001_create_museums.sql, which always runs first.
DROP TRIGGER IF EXISTS trg_passes_updated_at ON passes;
CREATE TRIGGER trg_passes_updated_at
  BEFORE UPDATE ON passes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
