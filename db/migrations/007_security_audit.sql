ALTER TABLE tenant_sites
  ADD COLUMN IF NOT EXISTS public_key_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE tenant_sites
  ADD COLUMN IF NOT EXISTS public_key_hint TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS admin_audit_log_site_created_idx
  ON admin_audit_log (site_id, created_at DESC);
