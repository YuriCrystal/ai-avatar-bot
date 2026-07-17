'use strict';

const assert = require('node:assert/strict');
const { strictSiteId, validRole } = require('../lib/site-store');
const { roleAllows } = require('../lib/site-auth');

assert.equal(strictSiteId('Brand_TW'), 'brand_tw');
assert.throws(() => strictSiteId(''), /網站代號/);
assert.throws(() => strictSiteId('../default'), /網站代號/);
assert.throws(() => strictSiteId('a'.repeat(41)), /網站代號/);
assert.equal(validRole('owner'), 'owner');
assert.throws(() => validRole('admin'), /角色/);

assert.equal(roleAllows('viewer', 'read'), true);
assert.equal(roleAllows('viewer', 'write'), false);
assert.equal(roleAllows('editor', 'write'), true);
assert.equal(roleAllows('editor', 'owner'), false);
assert.equal(roleAllows('owner', 'owner'), true);

console.log('site authorization tests passed');
