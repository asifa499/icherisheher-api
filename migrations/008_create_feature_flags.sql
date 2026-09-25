-- 008_create_feature_flags.sql
-- İçərişəhər API — feature_flags table.
-- One row per Home page section, toggling whether the frontend should
-- render it. Keyed by section name rather than a surrogate id since the
-- key IS the identity clients look up.

CREATE TABLE IF NOT EXISTS feature_flags (
  key        TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- set_updated_at() is created by 001_create_museums.sql, which always runs first.
DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON feature_flags;
CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
