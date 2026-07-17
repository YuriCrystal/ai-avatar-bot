'use strict';

const { authorizeSite } = require('../../lib/site-auth');
const { json, readJson, methodNotAllowed } = require('../../lib/http');
const { listLeads, updateLead, deleteLead } = require('../../lib/lead-store');
const { recordAudit } = require('../../lib/audit-store');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  try {
    if (req.method === 'GET') {
      const query = req.query || {};
      const auth = await authorizeSite(req, query.site, 'read');
      if (!auth.ok) return json(res, auth.status, { error:auth.error });
      return json(res, 200, { leads:await listLeads(auth.siteId, query.status, query.search) });
    }
    const body = await readJson(req, 16 * 1024);
    const auth = await authorizeSite(req, body.siteId, 'write');
    if (!auth.ok) return json(res, auth.status, { error:auth.error });
    if (body.action === 'update') {
      const lead = await updateLead({ siteId:auth.siteId, leadId:body.leadId, status:body.status, note:body.note, userId:auth.userId });
      await recordAudit({ siteId:auth.siteId, userId:auth.userId, action:'lead.update', targetType:'lead', targetId:body.leadId, metadata:{ status:lead.status } });
      return json(res, 200, { ok:true, lead });
    }
    if (body.action === 'delete') {
      const deleted = await deleteLead(auth.siteId, body.leadId);
      await recordAudit({ siteId:auth.siteId, userId:auth.userId, action:'lead.delete', targetType:'lead', targetId:body.leadId });
      return json(res, 200, { ok:true, deleted });
    }
    return json(res, 400, { error:'不支援的名單操作。' });
  } catch (error) {
    console.error('[admin leads]', error && error.message || error);
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    return json(res, status, { error:status < 500 ? (error.message || '要求格式無效。') : '潛在客戶名單暫時無法使用。' });
  }
};
