'use strict';

const { authorizeSite } = require('../../lib/site-auth');
const { json, readJson, methodNotAllowed } = require('../../lib/http');
const { fetchSource } = require('../../lib/safe-url');

const attempts = new Map();
function allowed(userId) {
  const now = Date.now();
  let item = attempts.get(userId);
  if (!item || now > item.reset) item = { count:0, reset:now + 60000 };
  item.count++;
  attempts.set(userId, item);
  if (attempts.size > 500) for (const [key, value] of attempts) if (now > value.reset) attempts.delete(key);
  return item.count <= 10;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = await readJson(req, 16 * 1024);
    const auth = await authorizeSite(req, body.siteId, 'write');
    if (!auth.ok) return json(res, auth.status, { error:auth.error });
    if (!allowed(auth.userId)) return json(res, 429, { error:'網址匯入太頻繁，請一分鐘後再試。' });
    return json(res, 200, await fetchSource(body.url));
  } catch (error) {
    console.warn('[source import]', error && error.message || error);
    return json(res, error.status || 500, { error:error.status ? error.message : '網址匯入失敗。' });
  }
};
