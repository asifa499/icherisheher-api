-- 012_extend_routes_tour_cards.sql
-- Adds the fields the Home page "Ready-made routes" tour cards need.
-- type / mode are plain lowercase keys (the frontend maps them to i18n keys
-- and icons); the text shown on the card is localized via {az, en, ru} JSONB.
-- rating is REAL so node-pg returns a JS number (frontend calls toFixed(1)).

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS type              TEXT,                        -- restaurant | museums | walk
  ADD COLUMN IF NOT EXISTS mode              TEXT,                        -- private | group | walk
  ADD COLUMN IF NOT EXISTS working_hours     TEXT,                        -- e.g. "09:00 – 18:00"
  ADD COLUMN IF NOT EXISTS rating            REAL,
  ADD COLUMN IF NOT EXISTS short_description JSONB NOT NULL DEFAULT '{}', -- {az, en, ru}
  ADD COLUMN IF NOT EXISTS address           JSONB NOT NULL DEFAULT '{}', -- {az, en, ru}
  ADD COLUMN IF NOT EXISTS price             JSONB NOT NULL DEFAULT '{}', -- {az, en, ru} e.g. "From 20 AZN per person"
  ADD COLUMN IF NOT EXISTS book_url          TEXT,
  ADD COLUMN IF NOT EXISTS title_width       INTEGER;                     -- card title max-width in px (design detail)
