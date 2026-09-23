-- 002_add_museum_details.sql
-- Adds frontend display fields to museums: image, working_hours, rating,
-- ticket_price, ticket_url. Plain strings (not trilingual) — only
-- name/short_description/address are localized per {az, en, ru}.
-- rating is REAL (not NUMERIC) so node-pg returns it as a JS number,
-- since the frontend calls rating.toFixed(1) directly on the API response.

ALTER TABLE museums
  ADD COLUMN IF NOT EXISTS image         TEXT,
  ADD COLUMN IF NOT EXISTS working_hours TEXT,
  ADD COLUMN IF NOT EXISTS rating        REAL,
  ADD COLUMN IF NOT EXISTS ticket_price  TEXT,
  ADD COLUMN IF NOT EXISTS ticket_url    TEXT;
