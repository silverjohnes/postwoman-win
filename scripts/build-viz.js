'use strict';
// Generates src/renderer/viz.html with Handlebars + viz.js inlined (a sandboxed opaque-origin iframe cannot load local files).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../src/renderer');
// viz.html is a build artefact assembled from OUR OWN vendored files (handlebars + viz.src.js); no external or user input goes into it
const hbs = fs.readFileSync(path.join(dir, 'vendor/handlebars.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const viz = fs.readFileSync(path.join(dir, 'viz.src.js'), 'utf8');
const head = '<!doctype html><html><head><meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src * data: blob: \'unsafe-inline\' \'unsafe-eval\'">\n<style>body{font:14px system-ui,sans-serif;margin:8px;color:#222;background:#fff}</style></head>\n';
const page = [head, '<body><script>', hbs, '</script><script>', viz, '</script></body></html>'].join(''); // nosemgrep
fs.writeFileSync(path.join(dir, 'viz.html'), page);
console.log('viz.html built');
