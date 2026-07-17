'use strict';

const { json, methodNotAllowed } = require('../lib/http');
const { checkDatabase } = require('../lib/site-store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const database = await checkDatabase();
    return json(res, database ? 200 : 503, { status:database ? 'ok' : 'degraded' }, 'no-store');
  } catch (error) {
    console.warn('[health]', error && error.message || error);
    return json(res, 503, { status:'degraded' }, 'no-store');
  }
};
