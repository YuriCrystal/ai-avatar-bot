'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const embed = fs.readFileSync(path.join(root, 'embed.js'), 'utf8');
const widget = fs.readFileSync(path.join(root, 'widget.html'), 'utf8');
const landing = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vercelIgnore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');

assert.match(embed, /getAttribute\('data-model-mobile'\)/, 'embed loader must support a lightweight mobile model');
assert.match(embed, /navigator\.connection && navigator\.connection\.saveData/, 'embed loader must respect data-saver mode');
assert.match(embed, /getAttribute\('data-fallback-model'\)/, 'embed loader must forward an explicit fallback model');
assert.match(widget, /const FALLBACK_MODEL_URL = CFG\.get\('fallbackmodel'\) \|\| DEFAULT_2D_MODEL_URL/, 'widget must provide a default public fallback model');
assert.match(widget, /Live2DModel\.from\(FALLBACK_MODEL_URL/, 'widget must attempt the fallback model after a custom model failure');
assert.match(landing, /data-model-mobile="[^"]+"/, 'demo must configure its lightweight mobile model');
assert.match(landing, /data-fallback-model="https:\/\//, 'demo must configure a public fallback model');
assert.match(landing, /data-model="https:\/\/ai-avatar-mu-assets\.vercel\.app\/mu\.mobile\.model3\.json"/, 'hosted demo must load the optimized licensed model from the separate asset deployment');
assert.match(vercelIgnore, /^models\/$/m, 'the open-source app deployment must exclude proprietary model files');

console.log('model resilience tests passed');
