'use strict';

const assert = require('node:assert/strict');

const supportPath = require.resolve('../lib/support-store');
const sitePath = require.resolve('../lib/site-store');
let visitorArgs;
let messageArgs;

require.cache[supportPath] = {
  id:supportPath, filename:supportPath, loaded:true,
  exports:{
    createCase:async (input) => input,
    visitorCase:async (...args) => { visitorArgs = args; return { case:{ id:args[1] }, messages:[] }; },
    addVisitorMessage:async (input) => { messageArgs = input; return { case:{ id:input.caseId }, messages:[] }; }
  }
};
require.cache[sitePath] = {
  id:sitePath, filename:sitePath, loaded:true,
  exports:{ verifyPublicKey:async (siteId) => ({ siteId:String(siteId).toLowerCase(), protected:true }) }
};

const handoff = require('../api/handoff');

function response() {
  return {
    headers:{}, statusCode:0, body:null,
    setHeader(name, value) { this.headers[name] = value; },
    end(raw) { this.body = JSON.parse(raw); }
  };
}

(async () => {
  const getRes = response();
  await handoff({ method:'GET', headers:{ authorization:'Bearer visitor-token' }, query:{ site:'Brand_A', caseId:'case-a' } }, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.deepEqual(visitorArgs, ['brand_a', 'case-a', 'visitor-token']);

  const postRes = response();
  await handoff({
    method:'POST', headers:{ authorization:'Bearer visitor-token' }, query:{}, socket:{ remoteAddress:'127.0.0.1' },
    body:{ action:'message', siteId:'Brand_B', caseId:'case-b', body:'hello' }
  }, postRes);
  assert.equal(postRes.statusCode, 200);
  assert.deepEqual(messageArgs, { siteId:'brand_b', caseId:'case-b', accessToken:'visitor-token', body:'hello' });

  console.log('handoff API tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
