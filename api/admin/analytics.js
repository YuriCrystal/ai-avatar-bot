'use strict';

const { authorizeSite } = require('../../lib/site-auth');
const { json, methodNotAllowed } = require('../../lib/http');
const { getAnalytics } = require('../../lib/analytics-store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const auth = await authorizeSite(req, req.query && req.query.site, 'read');
  if (!auth.ok) return json(res, auth.status, { error:auth.error });
  try {
    return json(res, 200, await getAnalytics(auth.siteId, req.query && req.query.days));
  } catch (error) {
    console.error('[admin analytics]', error && error.message || error);
    return json(res, error.status || 500, { error:error.status ? error.message : '暫時無法讀取分析資料。' });
  }
};
