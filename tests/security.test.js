'use strict';

const assert = require('node:assert/strict');
const { newPublicKey, keyHash, publicKeysRequired } = require('../lib/site-store');
const { safeMetadata } = require('../lib/audit-store');

const first = newPublicKey();
const second = newPublicKey();
assert.match(first, /^avk_[A-Za-z0-9_-]{20,80}$/);
assert.notEqual(first, second);
assert.match(keyHash(first), /^[a-f0-9]{64}$/);
assert.notEqual(keyHash(first), keyHash(second));

const previousRequireSiteKey = process.env.REQUIRE_SITE_KEY;
process.env.REQUIRE_SITE_KEY = 'true';
assert.equal(publicKeysRequired(), true);
process.env.REQUIRE_SITE_KEY = 'false';
assert.equal(publicKeysRequired(), false);
if (previousRequireSiteKey == null) delete process.env.REQUIRE_SITE_KEY;
else process.env.REQUIRE_SITE_KEY = previousRequireSiteKey;

assert.deepEqual(safeMetadata({ status:'qualified', entryCount:12, published:true }), { status:'qualified', entryCount:12, published:true });
assert.deepEqual(safeMetadata({ contact:'hello@example.com', note:'private', siteKey:'avk_secret', token:'secret', body:'message' }), {});

console.log('security tests passed');
