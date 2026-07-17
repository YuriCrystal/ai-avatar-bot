'use strict';

const { authorizeSite } = require('../../lib/site-auth');
const { json, readJson, methodNotAllowed } = require('../../lib/http');
const { getAdminState, saveVersion, restoreVersion } = require('../../lib/avatar-config-store');
const { recordAudit } = require('../../lib/audit-store');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  try {
    if (req.method === 'GET') {
      const auth = await authorizeSite(req, req.query && req.query.site, 'read');
      if (!auth.ok) return json(res, auth.status, { error:auth.error });
      return json(res, 200, await getAdminState(auth.siteId));
    }
    const body = await readJson(req, 256 * 1024);
    const auth = await authorizeSite(req, body.siteId, 'write');
    if (!auth.ok) return json(res, auth.status, { error:auth.error });
    const siteId = auth.siteId;
    let version;
    if (body.action === 'restore') version = await restoreVersion({ siteId, versionId: body.versionId, userId: auth.userId });
    else if (body.action === 'save') version = await saveVersion({ siteId, config: body.config, note: body.note, userId: auth.userId, publish: body.publish === true });
    else return json(res, 400, { error: '不支援的設定操作。' });
    await recordAudit({ siteId, userId:auth.userId, action:body.action === 'restore' ? 'avatar.restore' : (body.publish === true ? 'avatar.publish' : 'avatar.draft'), targetType:'avatar_config_version', targetId:version.id });
    return json(res, 200, { ok: true, version, state: await getAdminState(siteId) });
  } catch (error) {
    console.error('[admin avatar config]', error && error.message || error);
    return json(res, error.status || 500, { error: error.status ? error.message : '角色設定操作失敗。' });
  }
};
