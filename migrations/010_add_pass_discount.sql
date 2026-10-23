-- 010_add_pass_discount.sql
-- Pass promotions. `price` stays the current (possibly discounted) price the
-- site already reads; `old_price` is the crossed-out regular price (NULL when
-- there is no discount) and `discount_ends_at` optionally expires the
-- promotion on its own — the public API reverts to the regular price once it
-- has passed (see server.js → PASS_SELECT).

ALTER TABLE passes ADD COLUMN IF NOT EXISTS old_price NUMERIC(10, 2);
ALTER TABLE passes ADD COLUMN IF NOT EXISTS discount_ends_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passes_old_price_check') THEN
    ALTER TABLE passes ADD CONSTRAINT passes_old_price_check
      CHECK (old_price IS NULL OR price IS NULL OR old_price > price);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passes_discount_ends_at_check') THEN
    ALTER TABLE passes ADD CONSTRAINT passes_discount_ends_at_check
      CHECK (discount_ends_at IS NULL OR old_price IS NOT NULL);
  END IF;
END $$;
