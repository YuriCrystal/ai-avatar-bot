'use strict';

const { requireSignedIn, adminIds } = require('./auth');
const { getSiteAccess, strictSiteId } = require('./site-store');

function roleAllows(role, capability) {
  return capability === 'read'
    || (capability === 'write' && /^(owner|editor)$/.test(role))
    || (capability === 'owner' && role === 'owner');
}

async function authorizeSite(req, rawSiteId, capability) {
  const auth = await requireSignedIn(req);
  if (!auth.ok) return auth;
  let siteId;
  try { siteId = strictSiteId(rawSiteId); }
  catch (error) { return { ok:false, status:error.status || 400, error:error.message }; }
  const globalAdmin = adminIds().has(auth.userId);
  try {
    const access = await getSiteAccess(siteId, auth.userId, globalAdmin);
    const role = access.role;
    const allowed = roleAllows(role, capability);
    if (!allowed) return { ok:false, status:403, error:'你的網站角色沒有執行這個操作的權限。' };
    return Object.assign(auth, { ok:true, siteId, role, globalAdmin, site:access.site });
  } catch (error) {
    return { ok:false, status:error.status || 500, error:error.status ? error.message : '網站權限檢查失敗。' };
  }
}

module.exports = { authorizeSite, roleAllows };
