'use strict';

const crypto = require('node:crypto');
const { json, readJson, methodNotAllowed } = require('../lib/http');
const { createLead } = require('../lib/lead-store');
const { verifyPublicKey } = require('../lib/site-store');

const attempts = new Map();
function allowed(key, limit) {
  const now = Date.now();
  let item = attempts.get(key);
  if (!item && attempts.size >= 2000) return false;
  if (!item || now > item.reset) item = { count:0, reset:now + 60000 };
  item.count++; attempts.set(key, item);
  if (attempts.size > 2000) for (const [storedKey, value] of attempts) if (now > value.reset) attempts.delete(storedKey);
  return item.count <= limit;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return json(res, 403, { error:'不接受跨網站名單請求。' });
  try {
    const body = await readJson(req, 16 * 1024);
    if (body.website) return json(res, 202, { ok:true });
    await verifyPublicKey(body.siteId, req.headers['x-avatar-site-key']);
    const address = String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 80);
    const contactKey = crypto.createHash('sha256').update(String(body.contact || '').toLowerCase()).digest('hex');
    if (!allowed('address:' + address, 12) || !allowed('contact:' + contactKey, 4)) return json(res, 429, { error:'送出次數太頻繁，請稍後再試。' });
    const lead = await createLead(body);
    return json(res, 201, { ok:true, leadId:lead.leadId, message:'資料已安全送出，專人會依你提供的方式聯絡。' });
  } catch (error) {
    console.warn('[leads]', error && error.message || error);
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    return json(res, status, { error:status < 500 ? (error.message || '要求格式無效。') : '聯絡資料暫時無法送出。' });
  }
};
