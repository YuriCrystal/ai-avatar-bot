'use strict';

const { json, methodNotAllowed } = require('../../lib/http');
const { adminIds } = require('../../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const publishableKey = String(process.env.CLERK_PUBLISHABLE_KEY || '');
  const configured = !!(publishableKey && (process.env.CLERK_JWT_KEY || process.env.CLERK_SECRET_KEY) && process.env.DATABASE_URL && adminIds().size);
  return json(res, 200, {
    configured,
    publishableKey,
    message: configured ? '' : '需要設定 Clerk、管理者名單與 Neon DATABASE_URL 才能啟用正式後台。'
  });
};
