'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'admin.js'), 'utf8');
const $ = cheerio.load(html);

const ids = new Set();
$('[id]').each((index, element) => {
  const id = $(element).attr('id');
  assert.equal(ids.has(id), false, 'duplicate admin id: ' + id);
  ids.add(id);
});

for (const page of ['overview','avatar','knowledge','support','leads','analytics','install','settings']) {
  assert.equal($('[data-nav-page="' + page + '"]').length, 1, 'missing navigation: ' + page);
  assert.equal($('[data-workspace="' + page + '"]').length, 1, 'missing workspace: ' + page);
}

assert.equal($('[data-workspace].active').attr('data-workspace'), 'overview');
assert.equal($('[data-owner-only]').attr('data-nav-page'), 'settings');

for (const match of script.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
  assert.equal(ids.has(match[1]), true, 'admin.js references missing id: ' + match[1]);
}

console.log('admin dashboard tests passed');
