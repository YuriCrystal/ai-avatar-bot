'use strict';

const { authorizeSite } = require('../../lib/site-auth');
const { json, readJson, methodNotAllowed } = require('../../lib/http');
const { listCases, adminCase, updateCase } = require('../../lib/support-store');
const { recordAudit } = require('../../lib/audit-store');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  try {
    if (req.method === 'GET') {
      const auth = await authorizeSite(req, req.query && req.query.site, 'read');
      if (!auth.ok) return json(res, auth.status, { error:auth.error });
      if (req.query && req.query.caseId) return json(res, 200, await adminCase(auth.siteId, req.query.caseId));
      return json(res, 200, { cases:await listCases(auth.siteId, req.query && req.query.status) });
    }
    const body = await readJson(req, 8 * 1024);
    const auth = await authorizeSite(req, body.siteId, 'write');
    if (!auth.ok) return json(res, auth.status, { error:auth.error });
    const state = await updateCase({ siteId:auth.siteId, caseId:body.caseId, action:body.action, body:body.body, userId:auth.userId });
    await recordAudit({ siteId:auth.siteId, userId:auth.userId, action:'support.' + String(body.action || ''), targetType:'support_case', targetId:body.caseId, metadata:{ status:state.case && state.case.status || '' } });
    return json(res, 200, state);
  } catch (error) {
    console.error('[admin support]', error && error.message || error);
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    return json(res, status, { error:status < 500 ? (error.message || '要求格式無效。') : '客服工作台暫時無法使用。' });
  }
};
