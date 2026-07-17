'use strict';

const { json, methodNotAllowed } = require('../lib/http');
const { validSiteId } = require('../lib/knowledge-store');
const { getPublished } = require('../lib/avatar-config-store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const published = await getPublished(validSiteId(req.query && req.query.site));
    if (!published) return json(res, 404, { error: '尚未發布角色設定。' }, 'public, max-age=0, s-maxage=30');
    res.setHeader('ETag', '"avatar-config-' + published.version_id + '"');
    return json(res, 200, published.config, 'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
  } catch (error) {
    console.error('[public avatar config]', error && error.message || error);
    return json(res, error.status || 500, { error: error.status ? error.message : '角色設定暫時無法讀取。' });
  }
};
