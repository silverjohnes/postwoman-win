'use strict';
const crypto = require('crypto');
const uid = () => crypto.randomUUID();

// Keyboard layout conversion (RU <-> EN, QWERTY/ЙЦУКЕН) for bilingual search
const EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./~QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?@#$^&|";
const RU = "ёйцукенгшщзхъфывапролджэячсмитьбю.ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,\"№;:?/";
const e2r = new Map(), r2e = new Map();
for (let i = 0; i < Math.min(EN.length, RU.length); i++) { e2r.set(EN[i], RU[i]); r2e.set(RU[i], EN[i]); }
const conv = (s, m) => Array.from(s).map(c => m.get(c) ?? c).join('');
const swapLayout = s => [conv(s, e2r), conv(s, r2e)].filter(x => x !== s);
// all query variants: original + layout-swapped, lowercased
function queryVariants(q) {
  const out = new Set([q.toLowerCase()]);
  for (const v of swapLayout(q)) out.add(v.toLowerCase());
  return [...out].filter(Boolean);
}
const matchAny = (text, variants) => { const t = String(text || '').toLowerCase(); return variants.some(v => t.includes(v)); };

// Cross-OS safe file name (Windows/macOS/Linux)
function safeFileName(name) {
  let s = String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(s)) s = '_' + s;
  return s.slice(0, 180) || '_';
}
const pad = n => String(n).padStart(2, '0');
function stamp(d = new Date(), sep = '.', tsep = ' ') {
  return `${d.getFullYear()}${sep}${pad(d.getMonth() + 1)}${sep}${pad(d.getDate())}${tsep}${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}
// case-insensitive variable lookup helpers
const lc = s => String(s ?? '').toLowerCase();
module.exports = { uid, swapLayout, queryVariants, matchAny, safeFileName, stamp, lc };
