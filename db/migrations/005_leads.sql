CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY,
  site_id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  request TEXT NOT NULL,
  source_page TEXT NOT NULL DEFAULT '',
  source_title TEXT NOT NULL DEFAULT '',
  consented_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  admin_note TEXT NOT NULL DEFAULT '',
  assigned_to TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS leads_site_status_created_idx
  ON leads (site_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS leads_site_contact_idx
  ON leads (site_id, LOWER(contact));
