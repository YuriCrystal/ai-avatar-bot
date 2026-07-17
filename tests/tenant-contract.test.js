'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const embed = fs.readFileSync(path.join(root, 'embed.js'), 'utf8');
const widget = fs.readFileSync(path.join(root, 'widget.html'), 'utf8');
const support = fs.readFileSync(path.join(root, 'lib', 'support-store.js'), 'utf8');
const sites = fs.readFileSync(path.join(root, 'lib', 'site-store.js'), 'utf8');

assert.match(embed, /getAttribute\('data-site-key'\)/, 'documented data-site-key must be read');
assert.match(embed, /cfg\.set\('sitekey', documentedSiteKey\)/, 'site key must reach widget query config');
assert.match(widget, /avatar-widget-mem:' \+ SITE_ID/, 'companion memory must be site scoped');
assert.match(widget, /avatar-widget-analytics-session:' \+ ANALYTICS_SITE/, 'analytics session must be site scoped');
assert.match(widget, /avatar-widget-handoff:' \+ handoffSiteId\(\)/, 'handoff token must be site scoped');
assert.match(widget, /'ko-KR-SunHiNeural'/, 'Korean locale needs a Korean neural voice');
assert.match(support, /WHERE site_id = \$1 AND id = \$2::uuid AND access_token_hash = \$3/, 'visitor cases must be constrained by site');
assert.match(sites, /isolationLevel:'Serializable'/, 'owner mutations must use serializable transactions');

console.log('tenant contract tests passed');
