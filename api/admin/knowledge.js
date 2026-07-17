'use strict';

const { authorizeSite } = require('../../lib/site-auth');
const { json, readJson, methodNotAllowed } = require('../../lib/http');
const { getAdminState, saveVersion, restoreVersion } = require('../../lib/knowledge-store');
const { recordAudit } = require('../../lib/audit-store');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  try {
    if (req.method === 'GET') {
      const auth = await authorizeSite(req, req.query && req.query.site, 'read');
      if (!auth.ok) return json(res, auth.status, { error:auth.error });
      return json(res, 200, await getAdminState(auth.siteId));
    }

    const body = await readJson(req, 5 * 1024 * 1024);
    const auth = await authorizeSite(req, body.siteId, 'write');
    if (!auth.ok) return json(res, auth.status, { error:auth.error });
    const siteId = auth.siteId;
    let version;
    if (body.action === 'restore') {
      version = await restoreVersion({ siteId, versionId: body.versionId, userId: auth.userId });
    } else if (body.action === 'save') {
      version = await saveVersion({ siteId, entries: body.entries, note: body.note, userId: auth.userId, publish: body.publish === true });
    } else {
      return json(res, 400, { error: '不支援的操作。' });
    }
    await recordAudit({ siteId, userId:auth.userId, action:body.action === 'restore' ? 'knowledge.restore' : (body.publish === true ? 'knowledge.publish' : 'knowledge.draft'), targetType:'knowledge_version', targetId:version.id, metadata:{ entryCount:version.entryCount || 0 } });
    return json(res, 200, { ok: true, version, state: await getAdminState(siteId) });
  } catch (error) {
    console.error('[admin knowledge]', error && error.message || error);
    return json(res, error.status || 500, { error: error.status ? error.message : '後台暫時無法處理這個要求。' });
  }
};
