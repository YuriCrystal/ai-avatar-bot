'use strict';

const { json, methodNotAllowed } = require('../lib/http');
const { getPublished, validSiteId } = require('../lib/knowledge-store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const published = await getPublished(validSiteId(req.query && req.query.site));
    if (!published) return json(res, 404, { error: '尚未發布知識庫。' }, 'public, max-age=0, s-maxage=30');
    res.setHeader('ETag', '"kb-' + published.version_id + '"');
    return json(res, 200, published.entries, 'public, max-age=0, s-maxage=30, stale-while-revalidate=120');
  } catch (error) {
    console.error('[public knowledge]', error && error.message || error);
    return json(res, error.status || 500, { error: error.status ? error.message : '知識庫暫時無法使用。' });
  }
};
