'use strict';

let clerkPromise;

function adminIds() {
  return new Set(String(process.env.ADMIN_USER_IDS || '').split(',').map((value) => value.trim()).filter(Boolean));
}

function authorizedParties(req) {
  const configured = String(process.env.ADMIN_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (configured.length) return configured;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers.host || '').trim();
  const inferred = host ? [proto + '://' + host] : [];
  if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) inferred.push('http://' + host);
  return inferred;
}

function bearerToken(req) {
  const authorization = String(req.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

async function requireSignedIn(req) {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: '請先登入管理後台。' };

  const jwtKey = process.env.CLERK_JWT_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!jwtKey && !secretKey) return { ok: false, status: 503, error: '登入服務尚未完成設定。' };

  try {
    if (!clerkPromise) clerkPromise = import('@clerk/backend');
    const { verifyToken } = await clerkPromise;
    const options = { authorizedParties: authorizedParties(req) };
    if (jwtKey) options.jwtKey = jwtKey.replace(/\\n/g, '\n');
    else options.secretKey = secretKey;
    const claims = await verifyToken(token, options);
    if (!claims || !claims.sub) return { ok: false, status: 401, error: '登入憑證無效。' };
    return { ok: true, userId: claims.sub, sessionId: claims.sid || '' };
  } catch (error) {
    console.warn('[admin auth]', error && error.message || error);
    return { ok: false, status: 401, error: '登入已失效，請重新登入。' };
  }
}

async function requireAdmin(req) {
  const auth = await requireSignedIn(req);
  if (!auth.ok) return auth;
  const ids = adminIds();
  if (!ids.size) return { ok:false, status:503, error:'尚未設定全域管理者名單。' };
  if (!ids.has(auth.userId)) return { ok:false, status:403, error:'這個帳號沒有全域管理權限。' };
  return Object.assign(auth, { globalAdmin:true });
}

module.exports = { requireSignedIn, requireAdmin, adminIds };
