-- 001_create_museums.sql
-- İçərişəhər API — museums table
-- Trilingual JSONB fields use keys: az, en, ru
--   e.g. name = {"az": "...", "en": "...", "ru": "..."}

CREATE TABLE IF NOT EXISTS museums (
  id                SERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  name              JSONB NOT NULL,                -- {az, en, ru}
  short_description JSONB NOT NULL DEFAULT '{}',   -- {az, en, ru}
  address           JSONB NOT NULL DEFAULT '{}',   -- {az, en, ru}
  is_published      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_museums_published_sort
  ON museums (is_published, sort_order);

-- Keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_museums_updated_at ON museums;
CREATE TRIGGER trg_museums_updated_at
  BEFORE UPDATE ON museums
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
