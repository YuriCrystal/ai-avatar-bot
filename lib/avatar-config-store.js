'use strict';

const { validSiteId } = require('./knowledge-store');

const DEFAULT_MODEL_2D = 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display@31317b37d5e22955a44d5b11f37f421e94a11269/test/assets/haru/haru_greeter_t03.model3.json';
const DEFAULT_CONFIG = Object.freeze({
  name: 'AI 虛擬人助理', mode: 'assistant', locale: 'zh-TW', engine: '2d', fit: 'half',
  model2d: DEFAULT_MODEL_2D, model3d: '', voice: '',
  welcome: '嗨！有什麼想了解的都可以問我。',
  greeting: '你好～我是網站的 AI 虛擬人助理，有什麼需要幫忙的嗎？',
  fallback: '這題我目前還沒有可靠答案，可以換個方式問我，或請我轉接真人客服。',
  suggestions: ['怎麼使用？', '有哪些功能？', '可以轉真人客服嗎？'],
  brandColor: '#5b54e8', width: 340, height: 480
});

let sqlClient;
let schemaPromise;

function fail(message, status) {
  return Object.assign(new Error(message), { status: status || 400 });
}

async function getSql() {
  if (!process.env.DATABASE_URL) throw fail('資料庫尚未設定。', 503);
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
      CREATE TABLE IF NOT EXISTS avatar_config_versions (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        site_id TEXT NOT NULL,
        config JSONB NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        was_published BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (jsonb_typeof(config) = 'object')
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS avatar_config_versions_site_created_idx ON avatar_config_versions (site_id, created_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS avatar_config_settings (
        site_id TEXT PRIMARY KEY,
        published_version_id BIGINT REFERENCES avatar_config_versions(id),
        updated_by TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  })().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}

function cleanString(value, name, max, required) {
  if (value == null) value = '';
  if (typeof value !== 'string') throw fail(name + ' 必須是文字。');
  value = value.trim();
  if (required && !value) throw fail(name + ' 為必填。');
  if (value.length > max) throw fail(name + ' 最多 ' + max + ' 個字。');
  return value;
}

function safeAssetUrl(value, name) {
  value = cleanString(value, name, 1500, false);
  if (!value) return '';
  if (/^https:\/\//i.test(value)) return value;
  if (/^(\/|\.\/|\.\.\/)[^\s]*$/.test(value) && !/^\/\//.test(value)) return value;
  throw fail(name + ' 只接受 HTTPS 或站內相對路徑。');
}

function option(value, name, allowed, fallback) {
  value = String(value || fallback);
  if (!allowed.includes(value)) throw fail(name + ' 選項無效。');
  return value;
}

function boundedInt(value, name, min, max, fallback) {
  const number = Number(value == null || value === '' ? fallback : value);
  if (!Number.isInteger(number) || number < min || number > max) throw fail(name + ' 必須介於 ' + min + ' 到 ' + max + '。');
  return number;
}

function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('角色設定必須是物件。');
  const suggestions = input.suggestions == null ? [] : input.suggestions;
  if (!Array.isArray(suggestions) || suggestions.length > 8) throw fail('提示問題最多 8 筆。');
  const model2d = safeAssetUrl(input.model2d, '2D 模型網址');
  const model3d = safeAssetUrl(input.model3d, '3D 模型網址');
  const engine = option(input.engine, '預設引擎', ['2d', '3d'], DEFAULT_CONFIG.engine);
  if (engine === '2d' && !model2d) throw fail('使用 2D 引擎時必須填寫 2D 模型網址。');
  if (engine === '3d' && !model3d) throw fail('使用 3D 引擎時必須填寫 3D 模型網址。');
  const brandColor = cleanString(input.brandColor || DEFAULT_CONFIG.brandColor, '品牌色', 7, true).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(brandColor)) throw fail('品牌色必須是六位 HEX 色碼。');
  const voice = cleanString(input.voice, '聲線', 80, false);
  if (voice && !/^[\w.-]+$/i.test(voice)) throw fail('聲線名稱只能使用英數、底線、連字號或句點。');
  return {
    name: cleanString(input.name, '角色名稱', 80, true),
    mode: option(input.mode, '角色模式', ['assistant', 'companion'], DEFAULT_CONFIG.mode),
    locale: option(input.locale, '語言', ['zh-TW', 'en-US', 'ja-JP', 'ko-KR'], DEFAULT_CONFIG.locale),
    engine, fit: option(input.fit, '顯示範圍', ['half', 'full'], DEFAULT_CONFIG.fit),
    model2d, model3d, voice,
    welcome: cleanString(input.welcome, '歡迎詞', 500, true),
    greeting: cleanString(input.greeting, '點擊問候', 500, true),
    fallback: cleanString(input.fallback, '未命中回覆', 800, true),
    suggestions: suggestions.map((item, index) => cleanString(item, '提示問題 ' + (index + 1), 100, true)),
    brandColor,
    width: boundedInt(input.width, '寬度', 280, 480, DEFAULT_CONFIG.width),
    height: boundedInt(input.height, '高度', 380, 720, DEFAULT_CONFIG.height)
  };
}

async function getAdminState(siteId) {
  siteId = validSiteId(siteId);
  await ensureSchema();
  const sql = await getSql();
  const currentRows = await sql`
    SELECT id::text AS id, config, note, was_published, created_by, created_at
    FROM avatar_config_versions WHERE site_id = ${siteId}
    ORDER BY created_at DESC, id DESC LIMIT 1
  `;
  const publishedRows = await sql`
    SELECT v.id::text AS id, v.config, v.note, v.created_by, v.created_at
    FROM avatar_config_settings s JOIN avatar_config_versions v ON v.id = s.published_version_id
    WHERE s.site_id = ${siteId}
  `;
  const versions = await sql`
    SELECT v.id::text AS id, v.note, v.was_published, v.created_by, v.created_at,
           (s.published_version_id = v.id) AS published
    FROM avatar_config_versions v
    LEFT JOIN avatar_config_settings s ON s.site_id = v.site_id
    WHERE v.site_id = ${siteId}
    ORDER BY v.created_at DESC, v.id DESC LIMIT 50
  `;
  return { siteId, defaults: DEFAULT_CONFIG, current: currentRows[0] || null, published: publishedRows[0] || null, versions };
}

async function saveVersion({ siteId, config, note, userId, publish }) {
  siteId = validSiteId(siteId);
  config = validateConfig(config);
  note = cleanString(note, '版本備註', 240, false);
  await ensureSchema();
  const sql = await getSql();
  let rows;
  if (publish) {
    rows = await sql.query(
      `WITH inserted AS (
         INSERT INTO avatar_config_versions (site_id, config, note, was_published, created_by)
         VALUES ($1, $2::jsonb, $3, TRUE, $4) RETURNING id, created_at
       ), settings AS (
         INSERT INTO avatar_config_settings (site_id, published_version_id, updated_by)
         SELECT $1, id, $4 FROM inserted
         ON CONFLICT (site_id) DO UPDATE SET published_version_id = EXCLUDED.published_version_id,
           updated_by = EXCLUDED.updated_by, updated_at = NOW()
       ) SELECT id::text AS id, created_at FROM inserted`,
      [siteId, JSON.stringify(config), note, userId]
    );
  } else {
    rows = await sql.query(
      'INSERT INTO avatar_config_versions (site_id, config, note, was_published, created_by) VALUES ($1, $2::jsonb, $3, FALSE, $4) RETURNING id::text AS id, created_at',
      [siteId, JSON.stringify(config), note, userId]
    );
  }
  return { id: rows[0].id, createdAt: rows[0].created_at, published: !!publish };
}

async function restoreVersion({ siteId, versionId, userId }) {
  siteId = validSiteId(siteId);
  versionId = String(versionId || '');
  if (!/^\d+$/.test(versionId)) throw fail('設定版本無效。');
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql.query('SELECT config FROM avatar_config_versions WHERE site_id = $1 AND id = $2::bigint LIMIT 1', [siteId, versionId]);
  if (!rows[0]) throw fail('找不到這個設定版本。', 404);
  return saveVersion({ siteId, config: rows[0].config, note: '還原自設定版本 #' + versionId, userId, publish: true });
}

async function getPublished(siteId) {
  siteId = validSiteId(siteId);
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql`
    SELECT v.config, v.id::text AS version_id, v.created_at
    FROM avatar_config_settings s JOIN avatar_config_versions v ON v.id = s.published_version_id
    WHERE s.site_id = ${siteId}
  `;
  return rows[0] || null;
}

module.exports = { DEFAULT_CONFIG, validateConfig, getAdminState, saveVersion, restoreVersion, getPublished };
