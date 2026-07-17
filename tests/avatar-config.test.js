'use strict';

const assert = require('node:assert/strict');
const { DEFAULT_CONFIG, validateConfig } = require('../lib/avatar-config-store');

const valid = validateConfig(DEFAULT_CONFIG);
assert.equal(valid.engine, '2d');
assert.equal(valid.brandColor, '#5b54e8');
assert.equal(valid.width, 340);
assert.equal(valid.suggestions.length, 3);

assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, model2d: 'javascript:alert(1)' }), /HTTPS/);
assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, engine: '3d', model3d: '' }), /3D 模型/);
assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, width: 999 }), /280/);
assert.throws(() => validateConfig({ ...DEFAULT_CONFIG, suggestions: new Array(9).fill('問題') }), /最多 8/);

const localAsset = validateConfig({ ...DEFAULT_CONFIG, model2d: '/models/character/model3.json' });
assert.equal(localAsset.model2d, '/models/character/model3.json');

const korean = validateConfig({ ...DEFAULT_CONFIG, locale:'ko-KR' });
assert.equal(korean.locale, 'ko-KR');

console.log('avatar-config tests passed');
