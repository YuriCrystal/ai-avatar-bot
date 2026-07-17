CREATE TABLE IF NOT EXISTS support_cases (
  id UUID PRIMARY KEY,
  site_id TEXT NOT NULL,
  access_token_hash TEXT NOT NULL,
  visitor_session TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'resolved')),
  assigned_to TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS support_cases_site_status_updated_idx
  ON support_cases (site_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('visitor', 'bot', 'agent', 'note', 'system')),
  body TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_messages_case_created_idx
  ON support_messages (case_id, created_at, id);
