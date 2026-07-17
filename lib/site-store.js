'use strict';

const crypto = require('node:crypto');

let sqlClient;
let schemaPromise;

function fail(message, status) {
  return Object.assign(new Error(message), { status:status || 400 });
}

async function getSql() {
  if (!process.env.DATABASE_URL) throw fail('網站資料庫尚未設定。', 503);
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
      CREATE TABLE IF NOT EXISTS tenant_sites (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        primary_origin TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS site_members (
        site_id TEXT NOT NULL REFERENCES tenant_sites(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
        added_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (site_id, user_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS site_members_user_idx ON site_members (user_id, site_id)`;
    await sql`ALTER TABLE tenant_sites ADD COLUMN IF NOT EXISTS public_key_hash TEXT NOT NULL DEFAULT ''`;
    await sql`ALTER TABLE tenant_sites ADD COLUMN IF NOT EXISTS public_key_hint TEXT NOT NULL DEFAULT ''`;
  })().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}

function strictSiteId(value) {
  const siteId = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(siteId)) throw fail('網站代號格式無效。');
  return siteId;
}

function cleanName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 100) throw fail('網站名稱為必填，最多 100 個字。');
  return name;
}

function cleanOrigin(value) {
  value = String(value || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    const local = /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('origin only');
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('https required');
    return url.origin;
  } catch (error) { throw fail('主要網域必須是 HTTPS origin，例如 https://example.com。'); }
}

function validRole(value) {
  value = String(value || '').toLowerCase();
  if (!/^(owner|editor|viewer)$/.test(value)) throw fail('成員角色無效。');
  return value;
}

function cleanUserId(value) {
  value = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) throw fail('Clerk User ID 格式無效。');
  return value;
}

function newPublicKey() {
  return 'avk_' + crypto.randomBytes(24).toString('base64url');
}

function keyHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function publicKeysRequired() {
  return String(process.env.REQUIRE_SITE_KEY || '').toLowerCase() === 'true';
}

async function ensureDefaultSite(userId) {
  await ensureSchema();
  const sql = await getSql();
  await sql.query(
    `INSERT INTO tenant_sites (id, name, primary_origin, created_by) VALUES ('default', '預設網站', '', $1)
     ON CONFLICT (id) DO NOTHING`,
    [userId]
  );
  await sql.query(
    `INSERT INTO site_members (site_id, user_id, role, added_by) VALUES ('default', $1, 'owner', $1)
     ON CONFLICT (site_id, user_id) DO NOTHING`,
    [userId]
  );
}

async function listSites(userId, globalAdmin) {
  await ensureSchema();
  if (globalAdmin) await ensureDefaultSite(userId);
  const sql = await getSql();
  if (globalAdmin) {
    return sql.query(
      `SELECT id, name, primary_origin, status, public_key_hint, 'owner'::text AS role, created_at, updated_at
       FROM tenant_sites ORDER BY status, name, id`
    );
  }
  return sql.query(
    `SELECT s.id, s.name, s.primary_origin, s.status, s.public_key_hint, m.role, s.created_at, s.updated_at
     FROM site_members m JOIN tenant_sites s ON s.id = m.site_id
     WHERE m.user_id = $1 AND s.status = 'active' ORDER BY s.name, s.id`,
    [userId]
  );
}

async function getSiteAccess(siteId, userId, globalAdmin) {
  siteId = strictSiteId(siteId);
  await ensureSchema();
  const sql = await getSql();
  if (globalAdmin) {
    const rows = await sql.query('SELECT id, name, primary_origin, status, public_key_hint FROM tenant_sites WHERE id = $1 LIMIT 1', [siteId]);
    if (!rows[0]) throw fail('找不到這個網站。', 404);
    return { site:rows[0], role:'owner', globalAdmin:true };
  }
  const rows = await sql.query(
    `SELECT s.id, s.name, s.primary_origin, s.status, s.public_key_hint, m.role
     FROM site_members m JOIN tenant_sites s ON s.id = m.site_id
     WHERE s.id = $1 AND m.user_id = $2 AND s.status = 'active' LIMIT 1`,
    [siteId, userId]
  );
  if (!rows[0]) throw fail('你沒有這個網站的存取權。', 403);
  return { site:{ id:rows[0].id, name:rows[0].name, primary_origin:rows[0].primary_origin, status:rows[0].status, public_key_hint:rows[0].public_key_hint }, role:rows[0].role, globalAdmin:false };
}

async function createSite({ siteId, name, primaryOrigin, userId }) {
  siteId = strictSiteId(siteId); name = cleanName(name); primaryOrigin = cleanOrigin(primaryOrigin);
  await ensureSchema();
  const sql = await getSql();
  const siteKey = newPublicKey();
  try {
    const rows = await sql.query(
      `WITH inserted AS (
         INSERT INTO tenant_sites (id, name, primary_origin, public_key_hash, public_key_hint, created_by) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, primary_origin, status, public_key_hint, created_at, updated_at
       ), member AS (
         INSERT INTO site_members (site_id, user_id, role, added_by) SELECT id, $6, 'owner', $6 FROM inserted
       ) SELECT *, 'owner'::text AS role FROM inserted`,
      [siteId, name, primaryOrigin, keyHash(siteKey), siteKey.slice(-6), userId]
    );
    return Object.assign(rows[0], { siteKey });
  } catch (error) {
    if (String(error && error.code) === '23505') throw fail('這個網站代號已經存在。', 409);
    throw error;
  }
}

async function rotatePublicKey(siteId) {
  siteId = strictSiteId(siteId); await ensureSchema();
  const siteKey = newPublicKey(); const sql = await getSql();
  const rows = await sql.query(
    'UPDATE tenant_sites SET public_key_hash = $1, public_key_hint = $2, updated_at = NOW() WHERE id = $3 RETURNING id, public_key_hint',
    [keyHash(siteKey), siteKey.slice(-6), siteId]
  );
  if (!rows[0]) throw fail('找不到這個網站。', 404);
  return { siteId, siteKey, hint:rows[0].public_key_hint };
}

async function verifyPublicKey(rawSiteId, candidate) {
  const siteId = strictSiteId(rawSiteId); await ensureSchema();
  const sql = await getSql();
  const rows = await sql.query('SELECT public_key_hash FROM tenant_sites WHERE id = $1 AND status = \'active\' LIMIT 1', [siteId]);
  if (!rows[0]) {
    if (siteId === 'default' && !publicKeysRequired()) return { siteId, protected:false, legacy:true };
    if (siteId === 'default') throw fail('正式環境要求網站公開寫入識別碼，請先在後台建立預設網站並產生識別碼。', 503);
    throw fail('找不到這個網站。', 404);
  }
  const expected = String(rows[0].public_key_hash || '');
  if (!expected) {
    if (!publicKeysRequired()) return { siteId, protected:false, legacy:true };
    throw fail('這個網站尚未設定公開寫入識別碼。', 503);
  }
  candidate = String(candidate || '');
  if (!/^avk_[A-Za-z0-9_-]{20,80}$/.test(candidate)) throw fail('網站公開寫入識別碼無效。', 403);
  const actual = keyHash(candidate);
  const matches = actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  if (!matches) throw fail('網站公開寫入識別碼無效。', 403);
  return { siteId, protected:true, legacy:false };
}

async function checkDatabase() {
  const sql = await getSql();
  const rows = await sql`SELECT 1::int AS ok`;
  if (!rows[0] || rows[0].ok !== 1) return false;
  if (publicKeysRequired()) {
    const unprotected = await sql`SELECT COUNT(*)::int AS count FROM tenant_sites WHERE status = 'active' AND public_key_hash = ''`;
    if (Number(unprotected[0] && unprotected[0].count) > 0) return false;
  }
  return true;
}

async function updateSite({ siteId, name, primaryOrigin }) {
  siteId = strictSiteId(siteId); name = cleanName(name); primaryOrigin = cleanOrigin(primaryOrigin);
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql.query(
    'UPDATE tenant_sites SET name = $1, primary_origin = $2, updated_at = NOW() WHERE id = $3 RETURNING id, name, primary_origin, status, created_at, updated_at',
    [name, primaryOrigin, siteId]
  );
  if (!rows[0]) throw fail('找不到這個網站。', 404);
  return rows[0];
}

async function listMembers(siteId) {
  siteId = strictSiteId(siteId); await ensureSchema();
  const sql = await getSql();
  return sql.query('SELECT user_id, role, added_by, created_at, updated_at FROM site_members WHERE site_id = $1 ORDER BY CASE role WHEN \'owner\' THEN 0 WHEN \'editor\' THEN 1 ELSE 2 END, created_at', [siteId]);
}

async function setMember({ siteId, memberUserId, role, userId }) {
  siteId = strictSiteId(siteId); memberUserId = cleanUserId(memberUserId); role = validRole(role);
  await ensureSchema(); const sql = await getSql();
  const query =
    `INSERT INTO site_members (site_id, user_id, role, added_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (site_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, added_by = EXCLUDED.added_by, updated_at = NOW()
       WHERE site_members.role <> 'owner'
          OR EXCLUDED.role = 'owner'
          OR EXISTS (
            SELECT 1 FROM site_members AS other
            WHERE other.site_id = site_members.site_id AND other.role = 'owner' AND other.user_id <> site_members.user_id
          )
     RETURNING user_id, role, added_by, created_at, updated_at`;
  let rows;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await sql.transaction((tx) => [tx.query(query, [siteId, memberUserId, role, userId])], { isolationLevel:'Serializable' });
      rows = result[0]; break;
    } catch (error) {
      if (String(error && error.code) !== '40001' || attempt === 2) throw error;
    }
  }
  if (!rows[0]) throw fail('網站至少必須保留一位 owner。', 409);
  return rows[0];
}

async function removeMember({ siteId, memberUserId }) {
  siteId = strictSiteId(siteId); memberUserId = cleanUserId(memberUserId);
  await ensureSchema(); const sql = await getSql();
  const query =
    `DELETE FROM site_members AS target
     WHERE target.site_id = $1 AND target.user_id = $2
       AND (
         target.role <> 'owner'
         OR EXISTS (
           SELECT 1 FROM site_members AS other
           WHERE other.site_id = target.site_id AND other.role = 'owner' AND other.user_id <> target.user_id
         )
       )
     RETURNING target.user_id`;
  let rows;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await sql.transaction((tx) => [tx.query(query, [siteId, memberUserId])], { isolationLevel:'Serializable' });
      rows = result[0]; break;
    } catch (error) {
      if (String(error && error.code) !== '40001' || attempt === 2) throw error;
    }
  }
  if (!rows[0]) {
    const target = await sql.query('SELECT role FROM site_members WHERE site_id = $1 AND user_id = $2 LIMIT 1', [siteId, memberUserId]);
    if (!target[0]) throw fail('找不到這位網站成員。', 404);
    throw fail('網站至少必須保留一位 owner。', 409);
  }
  return { userId:memberUserId };
}

module.exports = { strictSiteId, validRole, newPublicKey, keyHash, publicKeysRequired, ensureDefaultSite, listSites, getSiteAccess, createSite, updateSite, rotatePublicKey, verifyPublicKey, checkDatabase, listMembers, setMember, removeMember };
