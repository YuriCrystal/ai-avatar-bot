CREATE TABLE IF NOT EXISTS avatar_config_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id TEXT NOT NULL,
  config JSONB NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  was_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(config) = 'object')
);

CREATE INDEX IF NOT EXISTS avatar_config_versions_site_created_idx
  ON avatar_config_versions (site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS avatar_config_settings (
  site_id TEXT PRIMARY KEY,
  published_version_id BIGINT REFERENCES avatar_config_versions(id),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
