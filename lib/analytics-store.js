'use strict';

const { validSiteId } = require('./knowledge-store');

let sqlClient;
let schemaPromise;

function databaseError() {
  return Object.assign(new Error('分析資料庫尚未設定。'), { code:'DATABASE_NOT_CONFIGURED', status:503 });
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
      CREATE TABLE IF NOT EXISTS analytics_events (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        site_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('question', 'answer', 'fallback', 'handoff')),
        question TEXT NOT NULL DEFAULT '',
        answer_source TEXT NOT NULL DEFAULT '',
        matched_question TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS analytics_events_site_created_idx ON analytics_events (site_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS analytics_events_site_type_created_idx ON analytics_events (site_id, event_type, created_at DESC)`;
  })().catch((error) => { schemaPromise = null; throw error; });
  return schemaPromise;
}

function cleanEvent(input) {
  input = input && typeof input === 'object' ? input : {};
  const siteId = validSiteId(input.siteId);
  const sessionId = String(input.sessionId || '').toLowerCase();
  const eventType = String(input.eventType || '').toLowerCase();
  if (!/^[a-f0-9-]{20,64}$/.test(sessionId)) throw Object.assign(new Error('工作階段識別碼無效。'), { status:400 });
  if (!/^(question|answer|fallback|handoff)$/.test(eventType)) throw Object.assign(new Error('分析事件類型無效。'), { status:400 });
  const question = String(input.question || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(?:\+?\d[\s().-]*){8,19}/g, '[number]')
    .replace(/\s+/g, ' ').trim().slice(0, 300);
  const answerSource = String(input.answerSource || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  const matchedQuestion = String(input.matchedQuestion || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if ((eventType === 'question' || eventType === 'fallback') && !question) throw Object.assign(new Error('分析事件缺少問題內容。'), { status:400 });
  return { siteId, sessionId, eventType, question, answerSource, matchedQuestion };
}

async function recordEvent(input) {
  const event = cleanEvent(input);
  await ensureSchema();
  const sql = await getSql();
  await sql.query(
    'INSERT INTO analytics_events (site_id, session_id, event_type, question, answer_source, matched_question) VALUES ($1, $2, $3, $4, $5, $6)',
    [event.siteId, event.sessionId, event.eventType, event.question, event.answerSource, event.matchedQuestion]
  );
  if (Math.random() < 0.02) {
    const retentionDays = Math.max(7, Math.min(Number(process.env.ANALYTICS_RETENTION_DAYS) || 180, 730));
    await sql.query("DELETE FROM analytics_events WHERE site_id = $1 AND created_at < NOW() - ($2::text || ' days')::interval", [event.siteId, retentionDays]);
  }
  return event;
}

function validDays(value) {
  const days = Number(value || 30);
  return [7, 30, 90].includes(days) ? days : 30;
}

async function getAnalytics(siteId, requestedDays) {
  siteId = validSiteId(siteId);
  const days = validDays(requestedDays);
  const since = new Date(Date.now() - days * 86400000).toISOString();
  await ensureSchema();
  const sql = await getSql();
  const [summaryRows, daily, popular, unanswered, sources] = await Promise.all([
    sql.query(
      `SELECT COUNT(*) FILTER (WHERE event_type = 'question')::int AS questions,
              COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'question')::int AS sessions,
              COUNT(*) FILTER (WHERE event_type = 'fallback')::int AS fallbacks,
              COUNT(*) FILTER (WHERE event_type = 'handoff')::int AS handoffs
       FROM analytics_events WHERE site_id = $1 AND created_at >= $2::timestamptz`,
      [siteId, since]
    ),
    sql.query(
      `SELECT created_at::date::text AS day,
              COUNT(*) FILTER (WHERE event_type = 'question')::int AS questions,
              COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'question')::int AS sessions,
              COUNT(*) FILTER (WHERE event_type = 'fallback')::int AS fallbacks
       FROM analytics_events WHERE site_id = $1 AND created_at >= $2::timestamptz
       GROUP BY created_at::date ORDER BY created_at::date`,
      [siteId, since]
    ),
    sql.query(
      `SELECT MIN(question) AS question, COUNT(*)::int AS count
       FROM analytics_events WHERE site_id = $1 AND event_type = 'question' AND created_at >= $2::timestamptz AND question <> ''
       GROUP BY LOWER(question) ORDER BY count DESC, MAX(created_at) DESC LIMIT 10`,
      [siteId, since]
    ),
    sql.query(
      `SELECT MIN(question) AS question, COUNT(*)::int AS count, MAX(created_at) AS last_seen
       FROM analytics_events WHERE site_id = $1 AND event_type = 'fallback' AND created_at >= $2::timestamptz AND question <> ''
       GROUP BY LOWER(question) ORDER BY count DESC, last_seen DESC LIMIT 20`,
      [siteId, since]
    ),
    sql.query(
      `SELECT answer_source AS source, COUNT(*)::int AS count
       FROM analytics_events WHERE site_id = $1 AND event_type = 'answer' AND created_at >= $2::timestamptz AND answer_source <> ''
       GROUP BY answer_source ORDER BY count DESC`,
      [siteId, since]
    )
  ]);
  const summary = summaryRows[0] || { questions:0, sessions:0, fallbacks:0, handoffs:0 };
  summary.fallbackRate = summary.questions ? Math.round(summary.fallbacks * 1000 / summary.questions) / 10 : 0;
  return { siteId, days, summary, daily, popular, unanswered, sources };
}

module.exports = { cleanEvent, recordEvent, getAnalytics, validDays };
