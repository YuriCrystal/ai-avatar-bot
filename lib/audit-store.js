'use strict';

const { strictSiteId } = require('./site-store');

let sqlClient;
let schemaPromise;

async function getSql() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('稽核資料庫尚未設定。'), { status:503 });
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
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS admin_audit_log_site_created_idx ON admin_audit_log (site_id, created_at DESC)`;
  })().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}

function safeToken(value, max) {
  return String(value || '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, max || 80);
}

function safeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output = {};
  Object.keys(input).slice(0, 12).forEach((key) => {
    const safeKey = safeToken(key, 40);
    if (!safeKey || /(body|content|text|contact|email|phone|name|request|note|key|token|secret)/i.test(safeKey)) return;
    const value = input[key];
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) output[safeKey] = value;
    else if (typeof value === 'string') output[safeKey] = value.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 100);
  });
  return output;
}

async function recordAudit({ siteId, userId, action, targetType, targetId, metadata }) {
  siteId = strictSiteId(siteId); userId = safeToken(userId, 128); action = safeToken(action, 80);
  targetType = safeToken(targetType, 60); targetId = safeToken(targetId, 128);
  if (!userId || !action || !targetType) throw Object.assign(new Error('audit fields missing'), { status:500 });
  const values = [siteId, userId, action, targetType, targetId, JSON.stringify(safeMetadata(metadata))];
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await ensureSchema(); const sql = await getSql();
      await sql.query(
        'INSERT INTO admin_audit_log (site_id, user_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
        values
      );
      if (Math.random() < 0.01) {
        try {
          const days = Math.max(30, Math.min(Number(process.env.AUDIT_RETENTION_DAYS) || 365, 2555));
          await sql.query("DELETE FROM admin_audit_log WHERE created_at < NOW() - ($1::text || ' days')::interval", [days]);
        } catch (cleanupError) { console.warn('[audit cleanup]', cleanupError && cleanupError.message || cleanupError); }
      }
      return { recorded:true };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  console.error('[audit critical]', JSON.stringify({ siteId, userId, action, targetType, targetId, error:String(lastError && lastError.message || lastError) }));
  throw Object.assign(new Error('管理操作已完成，但稽核紀錄寫入失敗；請立即檢查資料庫與伺服器告警。'), { status:503, cause:lastError });
}

async function listAudit(siteId, limit) {
  siteId = strictSiteId(siteId); limit = Math.max(10, Math.min(Number(limit) || 50, 100));
  await ensureSchema(); const sql = await getSql();
  return sql.query(
    `SELECT id::text, user_id, action, target_type, target_id, metadata, created_at
     FROM admin_audit_log WHERE site_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [siteId, limit]
  );
}

module.exports = { safeMetadata, recordAudit, listAudit };
