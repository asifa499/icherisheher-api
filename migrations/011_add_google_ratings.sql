-- 011_add_google_ratings.sql
-- Google ratings, fetched server-side (see googleRatings.js and
-- scripts/refresh-ratings.js). The static seed `rating` column is kept: the
-- public API serves the Google rating when google_rating is set and falls back
-- to `rating` otherwise.

ALTER TABLE museums ADD COLUMN IF NOT EXISTS google_place_id           TEXT;
ALTER TABLE museums ADD COLUMN IF NOT EXISTS google_rating             NUMERIC(2, 1);
ALTER TABLE museums ADD COLUMN IF NOT EXISTS google_rating_count       INTEGER;
ALTER TABLE museums ADD COLUMN IF NOT EXISTS google_rating_updated_at  TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'museums_google_rating_check') THEN
    ALTER TABLE museums ADD CONSTRAINT museums_google_rating_check
      CHECK (google_rating IS NULL OR (google_rating >= 0 AND google_rating <= 5));
  END IF;
END $$;
