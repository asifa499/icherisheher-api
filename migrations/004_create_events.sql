-- 004_create_events.sql
-- İçərişəhər API — events (what's on in the Old City) table.
-- Mirrors the museums/routes schema: trilingual JSONB fields use keys az, en, ru
--   e.g. title = {"az": "...", "en": "...", "ru": "..."}
-- Matches the frontend's data/events.json shape (icherisheher-home).

CREATE TABLE IF NOT EXISTS events (
  id           SERIAL PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  title        JSONB NOT NULL,                  -- {az, en, ru}
  description  JSONB NOT NULL DEFAULT '{}',     -- {az, en, ru}
  category     JSONB NOT NULL DEFAULT '{}',     -- {az, en, ru}  e.g. "Cultural"
  venue        JSONB NOT NULL DEFAULT '{}',     -- {az, en, ru}  e.g. "Maiden Tower"
  start_date   DATE,                            -- calendar date, no time zone
  end_date     DATE,                            -- calendar date, no time zone
  time         TEXT,                            -- plain "HH:MM" string, not localized
  image        TEXT,                            -- plain string, not localized
  ticket_url   TEXT,                            -- plain string, not localized
  source       TEXT,                            -- provenance tag, e.g. "figma" | "draft"
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_published_start
  ON events (is_published, start_date);

-- set_updated_at() is created by 001_create_museums.sql, which always runs first.
DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
