'use strict';

const crypto = require('node:crypto');
const { validSiteId } = require('./knowledge-store');

let sqlClient;
let schemaPromise;

function databaseError() {
  return Object.assign(new Error('客服資料庫尚未設定。'), { code:'DATABASE_NOT_CONFIGURED', status:503 });
}

async function getSql() {
  if (!process.env.DATABASE_URL) throw databaseError();
  if (!sqlClient) {
    const { neon } = await import('@neondatabase/serverless');
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const sql = await getSql();
    await sql`
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
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS support_cases_site_status_updated_idx ON support_cases (site_id, status, updated_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS support_messages (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
        sender TEXT NOT NULL CHECK (sender IN ('visitor', 'bot', 'agent', 'note', 'system')),
        body TEXT NOT NULL,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS support_messages_case_created_idx ON support_messages (case_id, created_at, id)`;
  })().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

function validSession(value) {
  const session = String(value || '').toLowerCase();
  if (!/^[a-f0-9-]{20,64}$/.test(session)) throw Object.assign(new Error('工作階段識別碼無效。'), { status:400 });
  return session;
}

function validCaseId(value) {
  const id = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw Object.assign(new Error('客服案件編號無效。'), { status:400 });
  return id;
}

async function createCase(input) {
  input = input && typeof input === 'object' ? input : {};
  const siteId = validSiteId(input.siteId);
  const sessionId = validSession(input.sessionId);
  const subject = cleanText(input.subject || '需要真人客服協助', 240);
  const history = Array.isArray(input.history) ? input.history.slice(-12).map((item) => ({
    sender: item && item.role === 'assistant' ? 'bot' : 'visitor',
    body: cleanText(item && item.text, 1200)
  })).filter((item) => item.body) : [];
  const id = crypto.randomUUID();
  const accessToken = crypto.randomBytes(32).toString('base64url');
  await ensureSchema();
  const sql = await getSql();
  await sql.query(
    'INSERT INTO support_cases (id, site_id, access_token_hash, visitor_session, subject) VALUES ($1::uuid, $2, $3, $4, $5)',
    [id, siteId, tokenHash(accessToken), sessionId, subject]
  );
  const messageIds = [];
  for (const item of history) {
    const rows = await sql.query('INSERT INTO support_messages (case_id, sender, body) VALUES ($1::uuid, $2, $3) RETURNING id::text', [id, item.sender, item.body]);
    messageIds.push(rows[0].id);
  }
  const systemRows = await sql.query('INSERT INTO support_messages (case_id, sender, body) VALUES ($1::uuid, $2, $3) RETURNING id::text', [id, 'system', '已建立真人客服案件，等待專人接手。']);
  messageIds.push(systemRows[0].id);
  if (Math.random() < 0.02) {
    const retentionDays = Math.max(30, Math.min(Number(process.env.SUPPORT_RETENTION_DAYS) || 365, 1825));
    await sql.query("DELETE FROM support_cases WHERE status = 'resolved' AND resolved_at < NOW() - ($1::text || ' days')::interval", [retentionDays]);
  }
  return { caseId:id, accessToken, status:'open', subject, messageIds };
}

async function visitorCase(siteId, caseId, accessToken) {
  siteId = validSiteId(siteId); caseId = validCaseId(caseId);
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(String(accessToken || ''))) throw Object.assign(new Error('客服存取憑證無效。'), { status:401 });
  await ensureSchema();
  const sql = await getSql();
  const cases = await sql.query(
    'SELECT id::text, subject, status, created_at, updated_at, resolved_at FROM support_cases WHERE site_id = $1 AND id = $2::uuid AND access_token_hash = $3 LIMIT 1',
    [siteId, caseId, tokenHash(accessToken)]
  );
  if (!cases[0]) throw Object.assign(new Error('找不到客服案件或憑證已失效。'), { status:404 });
  const messages = await sql.query(
    "SELECT * FROM (SELECT id::text, sender, body, created_at FROM support_messages WHERE case_id = $1::uuid AND sender IN ('visitor','bot','agent','system') ORDER BY created_at DESC, id DESC LIMIT 200) recent ORDER BY created_at, id::bigint",
    [caseId]
  );
  return { case:cases[0], messages };
}

async function addVisitorMessage({ siteId, caseId, accessToken, body }) {
  siteId = validSiteId(siteId);
  const state = await visitorCase(siteId, caseId, accessToken);
  if (state.case.status === 'resolved') throw Object.assign(new Error('這個客服案件已結案。'), { status:409 });
  body = cleanText(body, 1200);
  if (!body) throw Object.assign(new Error('訊息不能是空白。'), { status:400 });
  const sql = await getSql();
  await sql.query('INSERT INTO support_messages (case_id, sender, body) VALUES ($1::uuid, $2, $3)', [state.case.id, 'visitor', body]);
  await sql.query('UPDATE support_cases SET updated_at = NOW() WHERE id = $1::uuid', [state.case.id]);
  return visitorCase(siteId, state.case.id, accessToken);
}

async function listCases(siteId, status) {
  siteId = validSiteId(siteId);
  status = /^(open|assigned|resolved)$/.test(status) ? status : 'active';
  await ensureSchema();
  const sql = await getSql();
  return sql.query(
    `SELECT c.id::text, c.subject, c.status, c.assigned_to, c.created_at, c.updated_at,
            COUNT(m.id)::int AS message_count,
            MAX(m.created_at) FILTER (WHERE m.sender = 'visitor') AS last_visitor_at
     FROM support_cases c LEFT JOIN support_messages m ON m.case_id = c.id
     WHERE c.site_id = $1 AND ($2 = 'active' AND c.status <> 'resolved' OR c.status = $2)
     GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 100`,
    [siteId, status]
  );
}

async function adminCase(siteId, caseId) {
  siteId = validSiteId(siteId); caseId = validCaseId(caseId);
  await ensureSchema();
  const sql = await getSql();
  const cases = await sql.query(
    'SELECT id::text, site_id, subject, status, assigned_to, created_at, updated_at, resolved_at FROM support_cases WHERE site_id = $1 AND id = $2::uuid LIMIT 1',
    [siteId, caseId]
  );
  if (!cases[0]) throw Object.assign(new Error('找不到客服案件。'), { status:404 });
  const messages = await sql.query(
    'SELECT * FROM (SELECT id::text, sender, body, created_by, created_at FROM support_messages WHERE case_id = $1::uuid ORDER BY created_at DESC, id DESC LIMIT 300) recent ORDER BY created_at, id::bigint',
    [caseId]
  );
  return { case:cases[0], messages };
}

async function updateCase({ siteId, caseId, action, body, userId }) {
  const state = await adminCase(siteId, caseId);
  const sql = await getSql();
  if (action === 'assign') {
    await sql.query("UPDATE support_cases SET status = 'assigned', assigned_to = $1, resolved_at = NULL, updated_at = NOW() WHERE id = $2::uuid", [userId, state.case.id]);
  } else if (action === 'reply' || action === 'note') {
    body = cleanText(body, 2000);
    if (!body) throw Object.assign(new Error('訊息不能是空白。'), { status:400 });
    if (action === 'reply' && state.case.status === 'resolved') throw Object.assign(new Error('請先重新開啟案件再回覆。'), { status:409 });
    await sql.query('INSERT INTO support_messages (case_id, sender, body, created_by) VALUES ($1::uuid, $2, $3, $4)', [state.case.id, action === 'note' ? 'note' : 'agent', body, userId]);
    await sql.query("UPDATE support_cases SET status = CASE WHEN status = 'open' THEN 'assigned' ELSE status END, assigned_to = CASE WHEN assigned_to = '' THEN $1 ELSE assigned_to END, updated_at = NOW() WHERE id = $2::uuid", [userId, state.case.id]);
  } else if (action === 'resolve') {
    await sql.query("UPDATE support_cases SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1::uuid", [state.case.id]);
  } else if (action === 'reopen') {
    await sql.query("UPDATE support_cases SET status = 'assigned', assigned_to = $1, resolved_at = NULL, updated_at = NOW() WHERE id = $2::uuid", [userId, state.case.id]);
  } else {
    throw Object.assign(new Error('不支援的客服操作。'), { status:400 });
  }
  return adminCase(siteId, state.case.id);
}

module.exports = { createCase, visitorCase, addVisitorMessage, listCases, adminCase, updateCase, validCaseId, validSession };
