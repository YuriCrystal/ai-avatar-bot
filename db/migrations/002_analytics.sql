CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('question', 'answer', 'fallback', 'handoff')),
  question TEXT NOT NULL DEFAULT '',
  answer_source TEXT NOT NULL DEFAULT '',
  matched_question TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_site_created_idx
  ON analytics_events (site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_site_type_created_idx
  ON analytics_events (site_id, event_type, created_at DESC);
