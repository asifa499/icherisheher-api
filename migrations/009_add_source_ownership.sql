-- 009_add_source_ownership.sql
-- Adds `source` = 'seed' | 'admin' to every content table, recording who owns
-- a row: the boot seeder only ever updates rows where source = 'seed', and any
-- write through the admin API sets source = 'admin', so admin edits survive
-- redeploys.
--
-- routes, events, news and places already had a `source` column holding a
-- content provenance tag ("figma" | "draft" | "placeholder"). That column is
-- renamed to `origin` first (once — guarded so re-running is a no-op), so the
-- provenance values are kept and the name is free for the ownership flag.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['routes', 'events', 'news', 'places'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'origin'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN source TO origin', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['museums', 'routes', 'events', 'news', 'places', 'passes'] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT %L',
      t, 'seed'
    );
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_source_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (source IN (%L, %L))',
        t, t || '_source_check', 'seed', 'admin'
      );
    END IF;
  END LOOP;
END $$;
