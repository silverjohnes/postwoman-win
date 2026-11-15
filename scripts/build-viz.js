'use strict';
// Generates src/renderer/viz.html with Handlebars + viz.js inlined (a sandboxed opaque-origin iframe cannot load local files).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../src/renderer');
const hbs = fs.readFileSync(path.join(dir, 'vendor/handlebars.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const viz = fs.readFileSync(path.join(dir, 'viz.src.js'), 'utf8');
fs.writeFileSync(path.join(dir, 'viz.html'), `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src * data: blob: 'unsafe-inline' 'unsafe-eval'">
<style>body{font:14px system-ui,sans-serif;margin:8px;color:#222;background:#fff}</style></head>
<body><script>${hbs}</script><script>${viz}</script></body></html>`);
console.log('viz.html built');
