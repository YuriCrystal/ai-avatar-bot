'use strict';

const { json, readJson, methodNotAllowed } = require('../lib/http');
const { recordEvent } = require('../lib/analytics-store');
const { verifyPublicKey } = require('../lib/site-store');

const attempts = new Map();
function allowed(key, limit) {
  const now = Date.now();
  let item = attempts.get(key);
  if (!item && attempts.size >= 2000) return false;
  if (!item || now > item.reset) item = { count:0, reset:now + 60000 };
  item.count++;
  attempts.set(key, item);
  if (attempts.size > 2000) for (const [key, value] of attempts) if (now > value.reset) attempts.delete(key);
  return item.count <= limit;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return json(res, 403, { error:'不接受跨網站分析請求。' });
  try {
    const body = await readJson(req, 8 * 1024);
    await verifyPublicKey(body.siteId, req.headers['x-avatar-site-key']);
    const sessionId = String(body.sessionId || '');
    if (!/^[a-f0-9-]{20,64}$/i.test(sessionId)) return json(res, 400, { error:'工作階段識別碼無效。' });
    const clientAddress = String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 80);
    if (!allowed('session:' + sessionId, 60) || !allowed('address:' + clientAddress, 300)) return json(res, 429, { error:'分析事件太頻繁。' });
    await recordEvent(body);
    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  } catch (error) {
    console.warn('[analytics event]', error && error.message || error);
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    return json(res, status, { error:status < 500 ? (error.message || '要求格式無效。') : '暫時無法記錄分析事件。' });
  }
};
