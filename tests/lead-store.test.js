'use strict';

const assert = require('node:assert/strict');
const { validateLead } = require('../lib/lead-store');

const base = { siteId:'default', name:'王小明', contact:'hello@example.com', request:'想了解企業方案', consent:true };
const emailLead = validateLead({ ...base, sourcePage:'https://example.com/pricing?token=secret#section' });
assert.equal(emailLead.contact, 'hello@example.com');
assert.equal(emailLead.sourcePage, 'https://example.com/pricing');

const phoneLead = validateLead({ ...base, contact:'0912-345-678', company:'範例公司' });
assert.equal(phoneLead.contact, '0912-345-678');
assert.equal(phoneLead.company, '範例公司');

assert.throws(() => validateLead({ ...base, consent:false }), /同意/);
assert.throws(() => validateLead({ ...base, contact:'請私訊我' }), /電子郵件或電話/);
assert.throws(() => validateLead({ ...base, name:'' }), /姓名/);

console.log('lead-store tests passed');
