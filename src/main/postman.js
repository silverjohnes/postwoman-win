'use strict';
const { uid, lc } = require('./util');
const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

const emptyCollection = () => ({ info: { _postman_id: uid(), name: 'Postwoman', schema: SCHEMA }, item: [], variable: [], _pw: { version: 1 } });
const isFolder = n => Array.isArray(n.item);

// ---------- helpers ----------
const urlRaw = u => typeof u === 'string' ? u : (u && (u.raw ?? buildUrl(u))) || '';
function buildUrl(u) {
  const host = Array.isArray(u.host) ? u.host.join('.') : (u.host || '');
  const p = Array.isArray(u.path) ? u.path.join('/') : (u.path || '');
  const q = (u.query || []).filter(x => !x.disabled).map(x => `${x.key}=${x.value ?? ''}`).join('&');
  return (u.protocol ? u.protocol + '://' : '') + host + (u.port ? ':' + u.port : '') + (p ? '/' + p : '') + (q ? '?' + q : '');
}
function walk(items, fn, parents = []) {
  for (const n of items) { fn(n, parents); if (isFolder(n)) walk(n.item, fn, [...parents, n]); }
}
const arr = x => Array.isArray(x) ? x : [];
const kv = list => Object.fromEntries(arr(list).map(a => [a.key, a.value]));

// ---------- auth -> header conversion (keeps it visible & editable) ----------
function authToHeaders(auth) {
  if (!auth || auth.type === 'noauth') return { headers: [], error: null, handled: true };
  const t = auth.type, d = kv(auth[t]);
  if (t === 'bearer') {
    const tok = d.token ?? '';
    return { headers: [{ key: 'Authorization', value: `Bearer ${tok}` }], error: tok ? null : 'empty-token', handled: true };
  }
  if (t === 'oauth2') {
    const tok = d.accessToken ?? ''; const prefix = d.headerPrefix ?? 'Bearer';
    if (d.addTokenTo === 'queryParams') return { headers: [], query: [{ key: 'access_token', value: tok }], error: tok ? null : 'empty-token', handled: true };
    return { headers: [{ key: 'Authorization', value: `${prefix} ${tok}`.trim() }], error: tok ? null : 'empty-token', handled: true };
  }
  if (t === 'basic') {
    const u = d.username ?? '', p = d.password ?? '';
    if (/\{\{/.test(u + p)) return { headers: [{ key: 'Authorization', value: `Basic ${u}:${p}` }], error: 'basic-with-variables', handled: true };
    return { headers: [{ key: 'Authorization', value: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64') }], error: null, handled: true };
  }
  if (t === 'apikey') {
    if (d.in === 'query') return { headers: [], query: [{ key: d.key ?? '', value: d.value ?? '' }], error: d.key ? null : 'empty-key', handled: true };
    return { headers: [{ key: d.key ?? 'X-API-Key', value: d.value ?? '' }], error: d.value ? null : 'empty-token', handled: true };
  }
  return { headers: [], error: null, handled: false }; // digest/hawk/awsv4/ntlm: leave to newman
}

// ---------- import ----------
function importCollection(json) {
  const src = typeof json === 'string' ? JSON.parse(json) : json;
  if (!src || !src.info || !Array.isArray(src.item)) throw new Error('Not a Postman collection (v2.0/v2.1)');
  const globals = [];
  for (const v of arr(src.variable)) if (v.key) globals.push({ key: v.key, value: String(v.value ?? ''), secret: false, enabled: v.disabled ? false : true });
  const convert = (n, inherited) => {
    if (isFolder(n)) {
      const auth = n.auth === undefined ? inherited : n.auth;
      const f = { id: uid(), name: n.name || 'Folder', item: [], _pw: { headers: [] } };
      if (n.description) f.description = n.description;
      if (n.event) f.event = n.event;
      f.item = n.item.map(c => convert(c, auth));
      return f;
    }
    const r = n.request && typeof n.request === 'object' ? n.request : { method: 'GET', url: n.request || '' };
    const auth = r.auth === undefined ? inherited : r.auth;
    const headers = arr(r.header).map(h => ({ key: h.key, value: h.value ?? '', disabled: !!h.disabled }));
    let url = urlRaw(r.url);
    const conv = authToHeaders(auth);
    const pw = { deletedAuto: [] };
    if (conv.handled) {
      for (const h of conv.headers) { if (!headers.some(x => lc(x.key) === lc(h.key))) headers.unshift({ ...h, fromAuth: true }); }
      for (const qp of conv.query || []) url += (url.includes('?') ? '&' : '?') + `${qp.key}=${qp.value}`;
      if (conv.error) pw.authError = conv.error;
    }
    const item = { id: uid(), name: n.name || 'Request', request: { method: (r.method || 'GET').toUpperCase(), url: { raw: url }, header: headers, body: normBody(r.body) }, event: n.event || [], _pw: pw };
    if (!conv.handled && auth) item.request.auth = auth;
    if (n.response) item.response = n.response;
    return item;
  };
  const col = emptyCollection();
  col.info.name = src.info.name || 'Postwoman';
  col.item = src.item.map(n => convert(n, src.auth));
  if (src.event) col.event = src.event;
  return { collection: col, globals };
}
function normBody(b) {
  if (!b || !b.mode) return { mode: 'raw', raw: '', options: { raw: { language: 'json' } } };
  return b;
}

// ---------- export (clean Postman v2.1; folder headers are baked in) ----------
function exportCollection(col, globals) {
  const clone = JSON.parse(JSON.stringify(col));
  const conv = (n, inh) => {
    if (isFolder(n)) { const h = [...inh, ...arr(n._pw?.headers).filter(x => !x.disabled)]; n.item = n.item.map(c => conv(c, h)); delete n._pw; delete n.id; return n; }
    const own = arr(n.request.header); const merged = [...inh.filter(h => !own.some(o => lc(o.key) === lc(h.key))).map(h => ({ key: h.key, value: h.value })), ...own.map(h => ({ key: h.key, value: h.value, ...(h.disabled ? { disabled: true } : {}) }))];
    n.request.header = merged; delete n._pw; delete n.id; return n;
  };
  clone.item = clone.item.map(n => conv(n, []));
  delete clone._pw;
  clone.variable = arr(globals).filter(v => !v.secret).map(v => ({ key: v.key, value: v.value, type: 'string' }));
  clone.info.schema = SCHEMA;
  return clone;
}

// ---------- lookup / mutation helpers ----------
function findNode(col, id) {
  let res = null;
  (function rec(items, parent, parents) { for (let i = 0; i < items.length; i++) { const n = items[i]; if (n.id === id) { res = { node: n, parent, index: i, list: items, parents }; return true; } if (isFolder(n) && rec(n.item, n, [...parents, n])) return true; } return false; })(col.item, col, []);
  return res;
}
function allRequests(node) { const out = []; (function rec(n) { if (isFolder(n)) n.item.forEach(rec); else out.push(n); })(node); return out; }
function collectFolderHeaders(parents) { // outermost first; inner folder overrides same-named
  const m = new Map();
  for (const f of parents) for (const h of arr(f._pw?.headers)) if (!h.disabled && h.key) m.set(lc(h.key), { key: h.key, value: h.value, from: f.name, fromId: f.id });
  return [...m.values()];
}

// ---------- automatic headers ----------
const MANDATORY = new Set(['host', 'content-length']);
function autoHeaders(req, version, hostFromUrl) {
  const user = new Set(arr(req.request.header).filter(h => !h.disabled).map(h => lc(h.key)));
  const deleted = new Set(arr(req._pw?.deletedAuto).map(lc));
  const body = req.request.body || { mode: 'none' };
  const list = [{ key: 'Host', value: hostFromUrl || '<calculated when request is sent>' }];
  if (body.mode !== 'none') list.push({ key: 'Content-Length', value: '<calculated when request is sent>' });
  if (body.mode === 'raw') { const lang = body.options?.raw?.language; list.push({ key: 'Content-Type', value: lang === 'json' ? 'application/json' : lang === 'xml' ? 'application/xml' : lang === 'html' ? 'text/html' : lang === 'javascript' ? 'application/javascript' : 'text/plain' }); }
  else if (body.mode === 'urlencoded') list.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
  else if (body.mode === 'formdata') list.push({ key: 'Content-Type', value: 'multipart/form-data; boundary=<calculated when request is sent>' });
  list.push({ key: 'User-Agent', value: `Postwoman/${version}` }, { key: 'Accept', value: '*/*' }, { key: 'Accept-Encoding', value: 'gzip, deflate, br' }, { key: 'Connection', value: 'keep-alive' });
  return list.filter(h => !user.has(lc(h.key)) && (MANDATORY.has(lc(h.key)) || !deleted.has(lc(h.key)))).map(h => ({ ...h, mandatory: MANDATORY.has(lc(h.key)) }));
}

// ---------- case-insensitive variables ----------
function canonVars(str, names) {
  if (typeof str !== 'string' || !str.includes('{{')) return str;
  return str.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, name) => names.has(lc(name)) ? `{{${names.get(lc(name))}}}` : m);
}
function canonDeep(v, names) {
  if (typeof v === 'string') return canonVars(v, names);
  if (Array.isArray(v)) return v.map(x => canonDeep(x, names));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = canonDeep(v[k], names); return o; }
  return v;
}

// Postman order: pre-request = collection -> folders (outer..inner) -> request; test = request -> folders (inner..outer) -> collection
function mergeEvents(col, parents, req) {
  const execOf = (n, listen) => arr(n.event).filter(e => e.listen === listen && !e.disabled).flatMap(e => { const x = e.script?.exec; return Array.isArray(x) ? x : (typeof x === 'string' ? x.split('\n') : []); });
  const chain = [col, ...parents];
  const pre = [...chain.flatMap(n => execOf(n, 'prerequest')), ...execOf(req, 'prerequest')];
  const test = [...execOf(req, 'test'), ...[...chain].reverse().flatMap(n => execOf(n, 'test'))];
  const ev = [];
  if (pre.length) ev.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } });
  if (test.length) ev.push({ listen: 'test', script: { type: 'text/javascript', exec: test } });
  return ev;
}

// ---------- build a runnable (flat) Postman collection for newman ----------
// opts: version, globals[{key,value,enabled}], dataRow (object) not substituted here (newman iterationData handles)
function buildRunCollection(col, nodeId, opts) {
  const target = nodeId ? findNode(col, nodeId) : { node: col, parents: [] };
  if (!target) throw new Error('Node not found: ' + nodeId);
  const names = new Map(arr(opts.globals).filter(g => g.enabled !== false).map(g => [lc(g.key), g.key]));
  for (const k of arr(opts.dataKeys)) names.set(lc(k), k); // iteration data overrides globals (as in Postman)
  const parentsBase = nodeId ? target.parents : [];
  const mkItem = (req, parents) => {
    const own = arr(req.request.header);
    const inherited = collectFolderHeaders(parents).filter(h => !own.some(o => lc(o.key) === lc(h.key)));
    const headers = [...inherited.map(h => ({ key: h.key, value: h.value })), ...own.filter(h => !h.disabled && h.key).map(h => ({ key: h.key, value: h.value }))];
    const auto = autoHeaders(req, opts.version || '0.8.5').filter(h => !h.mandatory);
    const have = new Set(headers.map(h => lc(h.key)));
    for (const a of auto) if (!have.has(lc(a.key)) && !/<calculated/.test(a.value)) headers.push({ key: a.key, value: a.value });
    const disabled = {};
    for (const k of ['user-agent', 'accept', 'accept-encoding', 'connection']) if (!have.has(k) && !auto.some(a => lc(a.key) === k)) disabled[k] = true;
    disabled['postman-token'] = true;
    const item = { name: req.name, event: mergeEvents(col, parents, req), request: { method: req.request.method, header: headers, url: urlRaw(req.request.url), body: req.request.body }, protocolProfileBehavior: { disabledSystemHeaders: disabled } };
    if (req.request.auth) item.request.auth = req.request.auth;
    return canonDeep(item, names);
  };
  const items = [];
  (function rec(n, parents) {
    if (isFolder(n)) n.item.forEach(c => rec(c, n === col ? parents : [...parents, n]));
    else items.push(mkItem(n, parents));
  })(target.node, parentsBase);
  // wrap: folder-level scripts are not flattened (Postman semantics: kept as events on a folder wrapper)
  return { info: { name: target.node.name || col.info.name, schema: SCHEMA }, item: items };
}

module.exports = { SCHEMA, emptyCollection, isFolder, urlRaw, importCollection, exportCollection, findNode, allRequests, collectFolderHeaders, autoHeaders, MANDATORY, buildRunCollection, canonVars, authToHeaders, walk };
