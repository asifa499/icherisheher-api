-- 005_create_news.sql
-- İçərişəhər API — news (reviews, news items and announcements) table.
-- Mirrors the museums/routes/events schema: trilingual JSONB fields use keys
-- az, en, ru — e.g. title = {"az": "...", "en": "...", "ru": "..."}
-- Matches the frontend's data/news.json shape (icherisheher-home).

CREATE TABLE IF NOT EXISTS news (
  id             SERIAL PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  type           TEXT NOT NULL DEFAULT 'news',    -- review | news | announcement
  title          JSONB NOT NULL,                  -- {az, en, ru}
  excerpt        JSONB NOT NULL DEFAULT '{}',     -- {az, en, ru}
  image          TEXT,                            -- plain string, not localized
  image_position TEXT,                            -- CSS object-position, e.g. "26% center"
  published_date DATE,                            -- calendar date, no time zone
  source         TEXT,                            -- provenance tag, e.g. "figma" | "placeholder"
  is_published   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT news_type_check CHECK (type IN ('review', 'news', 'announcement'))
);

CREATE INDEX IF NOT EXISTS idx_news_published_date
  ON news (is_published, published_date DESC);

CREATE INDEX IF NOT EXISTS idx_news_type
  ON news (type);

-- set_updated_at() is created by 001_create_museums.sql, which always runs first.
DROP TRIGGER IF EXISTS trg_news_updated_at ON news;
CREATE TRIGGER trg_news_updated_at
  BEFORE UPDATE ON news
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
