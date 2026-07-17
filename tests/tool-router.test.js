'use strict';

const assert = require('node:assert/strict');
const router = require('../tool-router');

const tools = [
  {
    name:'checkout', label:'Checkout', description:'Buy a product', keywords:['checkout', 'buy'],
    examples:['buy two items'], priority:2,
    inputSchema:{
      type:'object',
      properties:{
        quantity:{ type:'integer', title:'Quantity', minimum:1, maximum:9, prefixes:['buy', 'quantity'] },
        productId:{ type:'string', contextKey:'productId' }
      },
      required:['quantity', 'productId']
    }
  },
  {
    name:'orders', label:'Order history', description:'See past orders',
    keywords:['order history', 'orders'], excludeKeywords:['checkout']
  }
];

const routed = router.route(tools, 'checkout and buy 2');
assert.equal(routed.match.tool.name, 'checkout');

const extracted = router.extract(routed.match.tool, 'checkout and buy 2', { productId:'sku-42' }, {});
assert.deepEqual(extracted.args, { quantity:2, productId:'sku-42' });
assert.deepEqual(extracted.missing, []);

assert.equal(router.route(tools, 'show order history').match.tool.name, 'orders');

const missing = router.extract(tools[0], 'buy now', { productId:'sku-42' }, {});
assert.deepEqual(missing.missing, ['quantity']);
const filled = router.extract(tools[0], '3', { productId:'sku-42' }, missing.args, ['quantity'], true);
assert.equal(filled.args.quantity, 3);

assert.equal(router.validate(tools[0].inputSchema, { quantity:20, productId:'x' }).ok, false);
assert.equal(router.validate({ type:'object', properties:{ email:{ type:'string', format:'email' } }, required:['email'] }, { email:'invalid' }).ok, false);
assert.equal(router.validate({ type:'object', properties:{ contact:{ type:'string', format:'contact' } }, required:['contact'] }, { contact:'hello@example.com' }).ok, true);
assert.equal(router.validate({ type:'object', properties:{ contact:{ type:'string', format:'contact' } }, required:['contact'] }, { contact:'0912-345-678' }).ok, true);
assert.equal(router.validate({ type:'object', properties:{ contact:{ type:'string', format:'contact' } }, required:['contact'] }, { contact:'call me' }).ok, false);
assert.equal(router.extract({ name:'consent', label:'Consent', inputSchema:{ type:'object', properties:{ consent:{ type:'boolean' } }, required:['consent'] } }, '我同意', {}, {}).args.consent, true);
assert.equal(router.extract({ name:'consent', label:'Consent', inputSchema:{ type:'object', properties:{ consent:{ type:'boolean' } }, required:['consent'] } }, '我不同意', {}, {}).args.consent, false);

const ambiguous = router.route([
  { name:'a', label:'Contact support', keywords:['support'], routeThreshold:0.2 },
  { name:'b', label:'Support center', keywords:['support'], routeThreshold:0.2 }
], 'need support');
assert.equal(ambiguous.ambiguous.length, 2);

console.log('tool router tests passed');
