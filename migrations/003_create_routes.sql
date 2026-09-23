-- 003_create_routes.sql
-- İçərişəhər API — routes (ready-made walking routes) table.
-- Mirrors the museums schema: trilingual JSONB fields use keys az, en, ru
--   e.g. title = {"az": "...", "en": "...", "ru": "..."}
-- Matches the frontend's data/routes.json shape (icherisheher-home).

CREATE TABLE IF NOT EXISTS routes (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  title        JSONB NOT NULL,                  -- {az, en, ru}
  duration     JSONB NOT NULL DEFAULT '{}',     -- {az, en, ru}  e.g. "4–5 hours"
  distance     JSONB NOT NULL DEFAULT '{}',     -- {az, en, ru}  e.g. "2.1 km loop"
  tags         JSONB NOT NULL DEFAULT '[]',     -- ["first-time", "walking"]
  -- Ordered list of stops. Each element:
  --   { name: {az,en,ru}, description: {az,en,ru}, image: string|null, sort_order: int }
  stops        JSONB NOT NULL DEFAULT '[]',
  image        TEXT,                            -- plain string, not localized
  pass_url     TEXT,                            -- plain string, not localized
  source       TEXT,                            -- provenance tag, e.g. "figma" | "draft"
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_published_sort
  ON routes (is_published, sort_order);

-- set_updated_at() is created by 001_create_museums.sql, which always runs first.
DROP TRIGGER IF EXISTS trg_routes_updated_at ON routes;
CREATE TRIGGER trg_routes_updated_at
  BEFORE UPDATE ON routes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
