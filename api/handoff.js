'use strict';

const { json, readJson, methodNotAllowed } = require('../lib/http');
const { createCase, visitorCase, addVisitorMessage } = require('../lib/support-store');
const { verifyPublicKey } = require('../lib/site-store');

const attempts = new Map();
function allowed(key, limit) {
  const now = Date.now();
  let item = attempts.get(key);
  if (!item && attempts.size >= 2000) return false;
  if (!item || now > item.reset) item = { count:0, reset:now + 60000 };
  item.count++;
  attempts.set(key, item);
  return item.count <= limit;
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return json(res, 403, { error:'不接受跨網站客服請求。' });
  try {
    if (req.method === 'GET') {
      const access = await verifyPublicKey(req.query && req.query.site, req.headers['x-avatar-site-key']);
      return json(res, 200, await visitorCase(access.siteId, req.query && req.query.caseId, bearer(req)));
    }
    const body = await readJson(req, 24 * 1024);
    const access = await verifyPublicKey(body.siteId || req.query && req.query.site, req.headers['x-avatar-site-key']);
    const address = String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 80);
    if (!allowed('address:' + address, 30)) return json(res, 429, { error:'客服請求太頻繁，請稍後再試。' });
    if (body.action === 'message') {
      if (!allowed('case:' + String(body.caseId || ''), 30)) return json(res, 429, { error:'訊息傳送太頻繁。' });
      return json(res, 200, await addVisitorMessage({ siteId:access.siteId, caseId:body.caseId, accessToken:bearer(req), body:body.body }));
    }
    if (body.action && body.action !== 'create') return json(res, 400, { error:'不支援的客服操作。' });
    if (!allowed('create:' + String(body.sessionId || ''), 3)) return json(res, 429, { error:'建立客服案件太頻繁，請稍後再試。' });
    return json(res, 201, await createCase(Object.assign({}, body, { siteId:access.siteId })));
  } catch (error) {
    console.warn('[handoff]', error && error.message || error);
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    return json(res, status, { error:status < 500 ? (error.message || '要求格式無效。') : '真人客服暫時無法使用。' });
  }
};
