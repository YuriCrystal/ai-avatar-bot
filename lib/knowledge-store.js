'use strict';

let sqlClient;
let schemaPromise;

function databaseError() {
  return Object.assign(new Error('永久資料庫尚未設定。'), { code: 'DATABASE_NOT_CONFIGURED', status: 503 });
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
      CREATE TABLE IF NOT EXISTS knowledge_versions (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        site_id TEXT NOT NULL,
        entries JSONB NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        was_published BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (jsonb_typeof(entries) = 'array')
      )
    `;
    await sql`ALTER TABLE knowledge_versions ADD COLUMN IF NOT EXISTS was_published BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_versions_site_created_idx ON knowledge_versions (site_id, created_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS site_settings (
        site_id TEXT PRIMARY KEY,
        published_version_id BIGINT REFERENCES knowledge_versions(id),
        updated_by TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  })().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}

function validSiteId(value) {
  const siteId = String(value || 'default').toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(siteId) ? siteId : 'default';
}

function validateEntries(input) {
  if (!Array.isArray(input)) throw Object.assign(new Error('知識庫最外層必須是陣列。'), { status: 400 });
  if (input.length > 1000) throw Object.assign(new Error('知識庫最多 1000 筆。'), { status: 400 });
  return input.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Object.assign(new Error('第 ' + (index + 1) + ' 筆格式錯誤。'), { status: 400 });
    const q = typeof item.q === 'string' ? item.q.trim() : '';
    const a = typeof item.a === 'string' ? item.a.trim() : '';
    const kw = item.kw == null ? '' : (typeof item.kw === 'string' ? item.kw.trim() : null);
    if (!q || !a) throw Object.assign(new Error('第 ' + (index + 1) + ' 筆必須包含 q 與 a。'), { status: 400 });
    if (kw === null) throw Object.assign(new Error('第 ' + (index + 1) + ' 筆的 kw 必須是字串。'), { status: 400 });
    if (q.length > 300 || kw.length > 1200 || a.length > 4000) throw Object.assign(new Error('第 ' + (index + 1) + ' 筆內容過長。'), { status: 400 });
    const result = { q, kw, a };
    if (item.source && typeof item.source === 'object' && !Array.isArray(item.source)) {
      const type = /^(pdf|url|text|json)$/.test(item.source.type) ? item.source.type : 'text';
      const title = String(item.source.title || '').trim().slice(0, 160);
      const url = String(item.source.url || '').trim().slice(0, 1200);
      if (title) {
        result.source = { type, title };
        if (url) result.source.url = url;
      }
    }
    return result;
  });
}

async function getAdminState(siteId) {
  siteId = validSiteId(siteId);
  await ensureSchema();
  const sql = await getSql();
  const currentRows = await sql`
    SELECT v.id::text AS id, v.entries, v.note, v.created_by, v.created_at
    FROM site_settings s
    JOIN knowledge_versions v ON v.id = s.published_version_id
    WHERE s.site_id = ${siteId}
  `;
  const versions = await sql`
    SELECT v.id::text AS id, v.note, v.was_published, v.created_by, v.created_at,
           jsonb_array_length(v.entries) AS entry_count,
           (s.published_version_id = v.id) AS published
    FROM knowledge_versions v
    LEFT JOIN site_settings s ON s.site_id = v.site_id
    WHERE v.site_id = ${siteId}
    ORDER BY v.created_at DESC, v.id DESC
    LIMIT 50
  `;
  return { siteId, current: currentRows[0] || null, versions };
}

async function saveVersion({ siteId, entries, note, userId, publish }) {
  siteId = validSiteId(siteId);
  entries = validateEntries(entries);
  note = String(note || '').trim().slice(0, 240);
  await ensureSchema();
  const sql = await getSql();
  let rows;
  if (publish) {
    rows = await sql.query(
      `WITH inserted AS (
         INSERT INTO knowledge_versions (site_id, entries, note, was_published, created_by)
         VALUES ($1, $2::jsonb, $3, TRUE, $4)
         RETURNING id, created_at
       ), settings AS (
         INSERT INTO site_settings (site_id, published_version_id, updated_by)
         SELECT $1, id, $4 FROM inserted
         ON CONFLICT (site_id) DO UPDATE
           SET published_version_id = EXCLUDED.published_version_id,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()
       )
       SELECT id::text AS id, created_at FROM inserted`,
      [siteId, JSON.stringify(entries), note, userId]
    );
  } else {
    rows = await sql.query(
      'INSERT INTO knowledge_versions (site_id, entries, note, was_published, created_by) VALUES ($1, $2::jsonb, $3, FALSE, $4) RETURNING id::text AS id, created_at',
      [siteId, JSON.stringify(entries), note, userId]
    );
  }
  const version = rows[0];
  return { id: version.id, createdAt: version.created_at, published: !!publish, entryCount: entries.length };
}

async function restoreVersion({ siteId, versionId, userId }) {
  siteId = validSiteId(siteId);
  versionId = String(versionId || '');
  if (!/^\d+$/.test(versionId)) throw Object.assign(new Error('版本編號無效。'), { status: 400 });
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql.query('SELECT entries FROM knowledge_versions WHERE site_id = $1 AND id = $2::bigint LIMIT 1', [siteId, versionId]);
  if (!rows[0]) throw Object.assign(new Error('找不到指定版本。'), { status: 404 });
  return saveVersion({ siteId, entries: rows[0].entries, note: '復原自版本 #' + versionId, userId, publish: true });
}

async function getPublished(siteId) {
  siteId = validSiteId(siteId);
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql`
    SELECT v.entries, v.id::text AS version_id, v.created_at
    FROM site_settings s
    JOIN knowledge_versions v ON v.id = s.published_version_id
    WHERE s.site_id = ${siteId}
  `;
  return rows[0] || null;
}

module.exports = { validSiteId, validateEntries, getAdminState, saveVersion, restoreVersion, getPublished };
