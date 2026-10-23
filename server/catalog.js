// Loads public/catalog.js (an ES module shared with the browser) into CommonJS — one registry for client + server.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'catalog.js'), 'utf8').replace(/^export const /gm, 'exports.');
const ctx = { exports: {} };
vm.runInNewContext(src, ctx, { filename: 'catalog.js' });
module.exports = ctx.exports;
