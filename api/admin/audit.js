'use strict';

const { authorizeSite } = require('../../lib/site-auth');
const { json, methodNotAllowed } = require('../../lib/http');
const { listAudit } = require('../../lib/audit-store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const auth = await authorizeSite(req, req.query && req.query.site, 'owner');
  if (!auth.ok) return json(res, auth.status, { error:auth.error });
  try { return json(res, 200, { events:await listAudit(auth.siteId, req.query && req.query.limit) }); }
  catch (error) {
    console.error('[admin audit]', error && error.message || error);
    return json(res, error.status || 500, { error:error.status ? error.message : '稽核紀錄暫時無法讀取。' });
  }
};
