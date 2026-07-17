'use strict';

const crypto = require('node:crypto');
const { validSiteId } = require('./knowledge-store');

let sqlClient;
let schemaPromise;

function fail(message, status) {
  return Object.assign(new Error(message), { status:status || 400 });
}

async function getSql() {
  if (!process.env.DATABASE_URL) throw fail('名單資料庫尚未設定。', 503);
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
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS leads_site_status_created_idx ON leads (site_id, status, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS leads_site_contact_idx ON leads (site_id, LOWER(contact))`;
  })().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanContact(value) {
  const contact = cleanText(value, 160);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const phone = /^(?:\+?\d[\s().-]*){8,18}$/.test(contact);
  if (!email && !phone) throw fail('聯絡方式必須是有效的電子郵件或電話。');
  return email ? contact.toLowerCase() : contact;
}

function cleanSourcePage(value) {
  value = cleanText(value, 1200);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return '';
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.href.slice(0, 1200);
  } catch (error) { return ''; }
}

function validateLead(input) {
  input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (input.consent !== true) throw fail('必須先同意依隱私權政策使用聯絡資料。');
  const name = cleanText(input.name, 100);
  const request = cleanText(input.request, 1200);
  if (!name) throw fail('請提供姓名或稱呼。');
  if (!request) throw fail('請簡述想詢問或預約的內容。');
  return {
    siteId:validSiteId(input.siteId), name, contact:cleanContact(input.contact),
    company:cleanText(input.company, 160), request,
    sourcePage:cleanSourcePage(input.sourcePage), sourceTitle:cleanText(input.sourceTitle, 200)
  };
}

function validLeadId(value) {
  const id = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw fail('名單編號無效。');
  return id;
}

async function createLead(input) {
  const lead = validateLead(input);
  await ensureSchema();
  const sql = await getSql();
  const id = crypto.randomUUID();
  await sql.query(
    `INSERT INTO leads (id, site_id, name, contact, company, request, source_page, source_title, consented_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [id, lead.siteId, lead.name, lead.contact, lead.company, lead.request, lead.sourcePage, lead.sourceTitle]
  );
  if (Math.random() < 0.02) {
    const retentionDays = Math.max(30, Math.min(Number(process.env.LEADS_RETENTION_DAYS) || 365, 1825));
    await sql.query("DELETE FROM leads WHERE created_at < NOW() - ($1::text || ' days')::interval", [retentionDays]);
  }
  return { leadId:id, status:'new' };
}

function validStatus(value, fallback) {
  value = String(value || fallback || 'all').toLowerCase();
  if (!/^(all|new|contacted|qualified|closed)$/.test(value)) throw fail('名單狀態無效。');
  return value;
}

async function listLeads(siteId, status, search) {
  siteId = validSiteId(siteId);
  status = validStatus(status, 'all');
  search = cleanText(search, 120).toLowerCase();
  await ensureSchema();
  const sql = await getSql();
  return sql.query(
    `SELECT id::text, name, contact, company, request, source_page, source_title, consented_at,
            status, admin_note, assigned_to, created_at, updated_at, closed_at
     FROM leads
     WHERE site_id = $1 AND ($2 = 'all' OR status = $2)
       AND ($3 = '' OR LOWER(name) LIKE '%' || $3 || '%' OR LOWER(contact) LIKE '%' || $3 || '%'
         OR LOWER(company) LIKE '%' || $3 || '%' OR LOWER(request) LIKE '%' || $3 || '%')
     ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'qualified' THEN 1 WHEN 'contacted' THEN 2 ELSE 3 END,
              created_at DESC LIMIT 200`,
    [siteId, status, search]
  );
}

async function updateLead({ siteId, leadId, status, note, userId }) {
  siteId = validSiteId(siteId); leadId = validLeadId(leadId); status = validStatus(status, 'new');
  if (status === 'all') throw fail('不能把名單設為全部狀態。');
  note = cleanText(note, 2000);
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql.query(
    `UPDATE leads SET status = $1, admin_note = $2, assigned_to = $3, updated_at = NOW(),
       closed_at = CASE WHEN $1 = 'closed' THEN COALESCE(closed_at, NOW()) ELSE NULL END
     WHERE site_id = $4 AND id = $5::uuid
     RETURNING id::text, name, contact, company, request, source_page, source_title, consented_at,
       status, admin_note, assigned_to, created_at, updated_at, closed_at`,
    [status, note, userId, siteId, leadId]
  );
  if (!rows[0]) throw fail('找不到這筆潛在客戶資料。', 404);
  return rows[0];
}

async function deleteLead(siteId, leadId) {
  siteId = validSiteId(siteId); leadId = validLeadId(leadId);
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql.query('DELETE FROM leads WHERE site_id = $1 AND id = $2::uuid RETURNING id::text', [siteId, leadId]);
  if (!rows[0]) throw fail('找不到這筆潛在客戶資料。', 404);
  return { id:rows[0].id };
}

module.exports = { validateLead, createLead, listLeads, updateLead, deleteLead, validLeadId, validStatus };
