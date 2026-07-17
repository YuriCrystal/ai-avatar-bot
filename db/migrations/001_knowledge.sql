CREATE TABLE IF NOT EXISTS knowledge_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id TEXT NOT NULL,
  entries JSONB NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  was_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(entries) = 'array')
);

ALTER TABLE knowledge_versions
  ADD COLUMN IF NOT EXISTS was_published BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS knowledge_versions_site_created_idx
  ON knowledge_versions (site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_settings (
  site_id TEXT PRIMARY KEY,
  published_version_id BIGINT REFERENCES knowledge_versions(id),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
