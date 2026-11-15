'use strict';
// cURL parser (bash, cmd "^" style, PowerShell backticks) and generator
function normalize(s) {
  s = s.trim().replace(/^\s*(\$|>|PS [^>]*>)\s+(?=curl)/i, '');
  const cmdStyle = /\^"/.test(s) || /\^\r?\n/.test(s);
  if (cmdStyle) {
    s = s.replace(/\^\r?\n/g, ' ').replace(/\^(.)/g, '$1');      // cmd caret escapes
  }
  s = s.replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' ');        // bash / PowerShell continuations
  return { s, cmdStyle };
}
function tokenize(s) {
  const out = []; let cur = '', has = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { if (has) { out.push(cur); cur = ''; has = false; } i++; continue; }
    if (c === "$" && s[i + 1] === "'") {                       // ANSI-C quoting $'..'
      i += 2; has = true;
      while (i < s.length && s[i] !== "'") {
        if (s[i] === '\\') {
          const n = s[i + 1]; i += 2;
          const map = { n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"' };
          if (n === 'u') { cur += String.fromCharCode(parseInt(s.substr(i, 4), 16)); i += 4; }
          else if (n === 'x') { cur += String.fromCharCode(parseInt(s.substr(i, 2), 16)); i += 2; }
          else cur += map[n] ?? n;
        } else cur += s[i++];
      }
      i++; continue;
    }
    if (c === "'") { i++; has = true; while (i < s.length && s[i] !== "'") cur += s[i++]; i++; continue; }
    if (c === '"') {
      i++; has = true;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && /["\\$`]/.test(s[i + 1] || '')) { cur += s[i + 1]; i += 2; } else cur += s[i++];
      }
      i++; continue;
    }
    if (c === '\\' && i + 1 < s.length) { cur += s[i + 1]; i += 2; has = true; continue; }
    cur += c; has = true; i++;
  }
  if (has) out.push(cur);
  return out;
}
function parseCurl(text) {
  const { s } = normalize(text);
  const tk = tokenize(s);
  if (!tk.length || !/^curl(\.exe)?$/i.test(tk[0])) throw new Error('Not a curl command');
  const r = { method: null, url: '', headers: [], data: [], forms: [], user: null, get: false, head: false };
  const takes = new Set(['-X', '--request', '-H', '--header', '-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode',
    '-F', '--form', '-u', '--user', '--url', '-A', '--user-agent', '-b', '--cookie', '-e', '--referer', '-o', '--output', '-m', '--max-time', '--connect-timeout', '-x', '--proxy', '--json']);
  for (let i = 1; i < tk.length; i++) {
    let a = tk[i], v;
    if (a.startsWith('--') && a.includes('=')) { v = a.slice(a.indexOf('=') + 1); a = a.slice(0, a.indexOf('=')); }
    else if (/^-[A-Za-z].+/.test(a) && !a.startsWith('--') && takes.has(a.slice(0, 2))) { v = a.slice(2); a = a.slice(0, 2); }
    if (takes.has(a) && v === undefined) v = tk[++i];
    switch (a) {
      case '-X': case '--request': r.method = (v || '').toUpperCase(); break;
      case '-H': case '--header': { const k = v.indexOf(':'); if (k > 0) r.headers.push({ key: v.slice(0, k).trim(), value: v.slice(k + 1).trim() }); break; }
      case '-d': case '--data': case '--data-raw': case '--data-ascii': r.data.push({ v, kind: 'raw' }); break;
      case '--data-binary': r.data.push({ v, kind: 'binary' }); break;
      case '--data-urlencode': r.data.push({ v, kind: 'urlencode' }); break;
      case '--json': r.data.push({ v, kind: 'raw' }); r.headers.push({ key: 'Content-Type', value: 'application/json' }, { key: 'Accept', value: 'application/json' }); break;
      case '-F': case '--form': r.forms.push(v); break;
      case '-u': case '--user': r.user = v; break;
      case '-A': case '--user-agent': r.headers.push({ key: 'User-Agent', value: v }); break;
      case '-b': case '--cookie': r.headers.push({ key: 'Cookie', value: v }); break;
      case '-e': case '--referer': r.headers.push({ key: 'Referer', value: v }); break;
      case '--url': r.url = v; break;
      case '-G': case '--get': r.get = true; break;
      case '-I': case '--head': r.head = true; break;
      default: if (!a.startsWith('-') && !r.url) r.url = a;
    }
  }
  if (!r.url) throw new Error('No URL in curl command');
  return toRequest(r);
}
function toRequest(r) {
  let url = r.url;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith('{{')) url = 'http://' + url;
  const headers = r.headers.slice();
  const ct = (headers.find(h => h.key.toLowerCase() === 'content-type') || {}).value || '';
  let method = r.method, body = { mode: 'none' };
  if (r.user) { headers.push({ key: 'Authorization', value: 'Basic ' + Buffer.from(r.user).toString('base64') }); }
  if (r.forms.length) {
    body = { mode: 'formdata', formdata: r.forms.map(f => { const k = f.indexOf('='); const key = f.slice(0, k), val = f.slice(k + 1);
      return val.startsWith('@') ? { key, type: 'file', src: val.slice(1) } : { key, value: val, type: 'text' }; }) };
  } else if (r.data.length) {
    if (r.get) { url += (url.includes('?') ? '&' : '?') + r.data.map(d => d.v).join('&'); }
    else if (r.data.some(d => d.kind === 'urlencode') || /x-www-form-urlencoded/i.test(ct) || (!ct && r.data.every(d => /^[^{\[]*=/.test(d.v)))) {
      body = { mode: 'urlencoded', urlencoded: r.data.flatMap(d => d.v.split('&')).map(p => { const k = p.indexOf('='); const key = k < 0 ? p : p.slice(0, k); const val = k < 0 ? '' : p.slice(k + 1);
        let dv = val; try { dv = decodeURIComponent(val.replace(/\+/g, ' ')); } catch {} return { key, value: dv }; }) };
      if (!ct) headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
    } else {
      const raw = r.data.map(d => d.v).join('&');
      const isJson = /json/i.test(ct) || /^\s*[\[{]/.test(raw);
      body = { mode: 'raw', raw, options: { raw: { language: isJson ? 'json' : 'text' } } };
    }
  }
  if (!method) method = r.head ? 'HEAD' : (body.mode !== 'none' && !r.get) ? 'POST' : 'GET';
  return { method, url, headers, body };
}

// ---- generator ----
const q = s => "'" + String(s).replace(/'/g, `'\\''`) + "'";
function toCurl(req, opts = {}) {
  const parts = ['curl'];
  const m = (req.method || 'GET').toUpperCase();
  const body = req.body || { mode: 'none' };
  if (m !== 'GET' || body.mode !== 'none') parts.push('--location', '--request', m); else parts.push('--location');
  parts.push(q(req.url));
  for (const h of req.headers || []) if (!h.disabled && h.key) parts.push('--header', q(`${h.key}: ${h.value ?? ''}`));
  if (body.mode === 'raw') { parts.push('--data-raw', q(body.raw || '')); }
  else if (body.mode === 'urlencoded') {
    for (const f of body.urlencoded || []) { if (!f.disabled && f.key) parts.push('--data-urlencode', q(`${f.key}=${f.value ?? ''}`)); }
  } else if (body.mode === 'formdata') {
    for (const f of body.formdata || []) { if (!f.disabled && f.key) parts.push('--form', q(f.type === 'file' ? `${f.key}=@${f.src || ''}` : `${f.key}=${f.value ?? ''}`)); }
  } else if (body.mode === 'file' || body.mode === 'binary') { parts.push('--data-binary', q('@' + (body.file?.src || body.src || ''))); }
  return parts.join(opts.multiline === false ? ' ' : ' \\\n  ');
}
module.exports = { parseCurl, toCurl };
