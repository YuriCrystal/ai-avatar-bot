'use strict';

const { requireSignedIn, adminIds } = require('../../lib/auth');
const { authorizeSite } = require('../../lib/site-auth');
const { json, readJson, methodNotAllowed } = require('../../lib/http');
const { listSites, createSite, updateSite, rotatePublicKey, listMembers, setMember, removeMember, strictSiteId } = require('../../lib/site-store');
const { recordAudit } = require('../../lib/audit-store');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  const auth = await requireSignedIn(req);
  if (!auth.ok) return json(res, auth.status, { error:auth.error });
  const globalAdmin = adminIds().has(auth.userId);
  try {
    if (req.method === 'GET') {
      const query = req.query || {};
      if (query.site) {
        const access = await authorizeSite(req, strictSiteId(query.site), 'owner');
        if (!access.ok) return json(res, access.status, { error:access.error });
        return json(res, 200, { site:access.site, role:access.role, globalAdmin:access.globalAdmin, members:await listMembers(access.siteId) });
      }
      return json(res, 200, { globalAdmin, userId:auth.userId, sites:await listSites(auth.userId, globalAdmin) });
    }

    const body = await readJson(req, 32 * 1024);
    if (body.action === 'create') {
      if (!globalAdmin) return json(res, 403, { error:'只有全域管理者可以建立新網站。' });
      const site = await createSite({ siteId:body.siteId, name:body.name, primaryOrigin:body.primaryOrigin, userId:auth.userId });
      await recordAudit({ siteId:site.id, userId:auth.userId, action:'site.create', targetType:'site', targetId:site.id });
      return json(res, 201, { ok:true, site });
    }
    const access = await authorizeSite(req, body.siteId, 'owner');
    if (!access.ok) return json(res, access.status, { error:access.error });
    if (body.action === 'update') {
      const site = await updateSite({ siteId:access.siteId, name:body.name, primaryOrigin:body.primaryOrigin });
      await recordAudit({ siteId:access.siteId, userId:auth.userId, action:'site.update', targetType:'site', targetId:access.siteId });
      return json(res, 200, { ok:true, site });
    }
    if (body.action === 'rotate_key') {
      const key = await rotatePublicKey(access.siteId);
      await recordAudit({ siteId:access.siteId, userId:auth.userId, action:'site.rotate_public_key', targetType:'site', targetId:access.siteId });
      return json(res, 200, { ok:true, key });
    }
    if (body.action === 'set_member') {
      const member = await setMember({ siteId:access.siteId, memberUserId:body.userId, role:body.role, userId:auth.userId });
      await recordAudit({ siteId:access.siteId, userId:auth.userId, action:'member.set_role', targetType:'site_member', targetId:body.userId, metadata:{ role:member.role } });
      return json(res, 200, { ok:true, member });
    }
    if (body.action === 'remove_member') {
      const removed = await removeMember({ siteId:access.siteId, memberUserId:body.userId });
      await recordAudit({ siteId:access.siteId, userId:auth.userId, action:'member.remove', targetType:'site_member', targetId:body.userId });
      return json(res, 200, { ok:true, removed });
    }
    return json(res, 400, { error:'不支援的網站管理操作。' });
  } catch (error) {
    console.error('[admin sites]', error && error.message || error);
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    return json(res, status, { error:status < 500 ? (error.message || '要求格式無效。') : '網站與成員管理暫時無法使用。' });
  }
};
