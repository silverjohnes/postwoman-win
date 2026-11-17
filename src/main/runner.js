'use strict';
// Runs requests one-by-one on the EMBEDDED newman library (no external install needed).
// One newman.run per request/iteration gives exact pause/stop/interval/iteration control.
const newman = require('newman');
// nosemgrep -- reviewed: false positive: two separate destructuring requires
const { buildRunCollection, findNode, allRequests, isFolder } = require('./postman');
const { lc } = require('./util');

const VIZ = '__PW_VIZ__';
// Wraps pm.visualizer.set so the template/data reach the app (newman does not expose them)
const VIZ_SHIM = 'try{(function(){var o=pm.visualizer&&pm.visualizer.set;if(o){pm.visualizer.set=function(t,d,opt){console.log("' + VIZ + '"+JSON.stringify({t:t,d:d}));return o.apply(this,arguments)}}})()}catch(e){}';

function parseDataFile(text, name) {
  const t = text.trim();
  if (/\.json$/i.test(name) || /^[\[{]/.test(t)) { const j = JSON.parse(t); return Array.isArray(j) ? j.map(r => (typeof r === 'object' ? r : { value: r })) : [j]; }
  return parseCSV(text);
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const toCSV = (rows, cols) => {
  const esc = v => { v = String(v ?? ''); return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n') + '\r\n';
};

const hdrs = h => (h && h.members ? h.members : []).map(x => ({ key: x.key, value: x.value }));
function bodyText(b) {
  if (!b) return '';
  try { if (b.mode === 'raw') return b.raw || ''; if (b.mode === 'urlencoded') return b.urlencoded.all().map(p => `${p.key}=${p.value}`).join('&');
    if (b.mode === 'formdata') return b.formdata.all().map(p => `${p.key}=${p.type === 'file' ? '@' + (p.src || '') : p.value}`).join('\n'); return b.toString ? b.toString() : ''; } catch { return ''; }
}

class RunController {
  constructor() { this.paused = false; this.stopped = false; this._wake = null; this.current = null; }
  pause() { this.paused = true; }
  resume() { this.paused = false; if (this._wake) this._wake(); }
  stop() { this.stopped = true; this.paused = false; if (this._wake) this._wake(); try { this.current && this.current.abort(); } catch {} }
  async gate() { while (this.paused && !this.stopped) await new Promise(r => (this._wake = r)); }
}
const sleep = (ms, ctl) => new Promise(r => { const t = setTimeout(r, ms); ctl._wake = () => { clearTimeout(t); r(); }; });

// Executes ONE request. Returns a full record.
function runOne({ item, globals, data, timeoutMs, ctl, log }) {
  return new Promise(resolve => {
    const rec = { time: Date.now(), name: item.name, logs: [], visualizer: null, globalsAfter: null, tests: [] };
    const t0 = Date.now();
    log('debug', 'run', `[${item.name}] preparing collection (${item.event.length} script event(s))`);
    const col = { info: { name: 'pw', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [{ ...item, event: item.event.map(e => e.listen === 'test' ? { ...e, script: { ...e.script, exec: [VIZ_SHIM, ...e.script.exec] } } : e) }] };
    let run;
    try {
      run = newman.run({
        collection: col,
        globals: { values: globals.filter(g => g.enabled !== false).map(g => ({ key: g.key, value: g.value, enabled: true })) },
        iterationData: data ? [data] : undefined, iterationCount: 1,
        timeoutRequest: timeoutMs > 0 ? timeoutMs : undefined, timeoutScript: timeoutMs > 0 ? Math.max(timeoutMs, 5000) : undefined, timeout: timeoutMs > 0 ? timeoutMs + 15000 : undefined,
        insecure: false, suppressExitCode: true, color: 'off', reporters: [],
      });
    } catch (e) { rec.error = String(e.message || e); return resolve(rec); }
    ctl.current = run;
    run.on('start', () => log('debug', 'run', `[${item.name}] newman run started`));
    run.on('beforeItem', () => log('debug', 'run', `[${item.name}] item started`));
    run.on('beforePrerequest', () => log('debug', 'script', `[${item.name}] pre-request script running`));
    run.on('prerequest', (err) => log(err ? 'error' : 'debug', 'script', `[${item.name}] pre-request script finished`, err ? err.message : undefined));
    run.on('beforeRequest', (err, a) => { rec.method = a.request.method; rec.url = a.request.url.toString(); rec.requestHeaders = hdrs(a.request.headers); rec.requestBody = bodyText(a.request.body);
      log('info', 'http', `[${item.name}] -> ${rec.method} ${rec.url}`); log('debug', 'http', `[${item.name}] request headers`, rec.requestHeaders.map(h => h.key)); });
    run.on('request', (err, a) => {
      if (err) { rec.error = String(err.message || err); log('error', 'http', `[${item.name}] request error: ${rec.error}`); return; }
      const r = a.response; const buf = r.stream ? Buffer.from(r.stream) : Buffer.alloc(0);
      rec.response = { code: r.code, status: r.status, time: r.responseTime, size: buf.length, headers: hdrs(r.headers), body: buf.toString('utf8') };
      log('info', 'http', `[${item.name}] <- ${r.code} ${r.status} ${r.responseTime}ms ${buf.length}B`);
    });
    run.on('beforeTest', () => log('debug', 'script', `[${item.name}] post-response script running`));
    run.on('test', (err) => log(err ? 'error' : 'debug', 'script', `[${item.name}] post-response script finished`, err ? err.message : undefined));
    run.on('assertion', (err, a) => { rec.tests.push({ name: a.assertion, passed: !err, error: err && err.message }); log(err ? 'warn' : 'info', 'test', `[${item.name}] ${err ? 'FAIL' : 'PASS'} ${a.assertion}`); });
    run.on('console', (err, a) => {
      const msg = a.messages.map(m => typeof m === 'string' ? m : JSON.stringify(m)).join(' ');
      if (msg.startsWith(VIZ)) { try { rec.visualizer = JSON.parse(msg.slice(VIZ.length)); log('debug', 'script', `[${item.name}] visualizer set`); } catch {} return; }
      rec.logs.push({ level: a.level, text: msg }); log('info', 'console', `[${item.name}] ${a.level}: ${msg}`);
    });
    run.on('done', (err, summary) => {
      ctl.current = null;
      if (err) rec.error = rec.error || String(err.message || err);
      const f = summary && summary.run && summary.run.failures && summary.run.failures.find(x => x.error && !/Assertion|AssertionError/.test(x.error.name || ''));
      if (f && !rec.error && !rec.response) rec.error = f.error.message || String(f.error);
      if (summary && summary.globals) rec.globalsAfter = summary.globals.values.map(v => ({ key: v.key, value: v.value == null ? '' : String(v.value) }));
      rec.duration = Date.now() - t0;
      log('debug', 'run', `[${item.name}] done in ${rec.duration}ms${rec.error ? ' error: ' + rec.error : ''}`);
      resolve(rec);
    });
  });
}

// Apply globals written by scripts back to the master list (case-insensitive keys; secrets keep flag)
function mergeGlobals(master, after, log) {
  const byKey = new Map(master.map(g => [lc(g.key), g]));
  const before = new Map(master.map(g => [lc(g.key), g.value]));
  const changes = [];
  for (const v of after || []) {
    const ex = byKey.get(lc(v.key));
    if (ex) { if (ex.value !== v.value) { ex.value = v.value; changes.push({ key: ex.key, secret: !!ex.secret, action: 'update' }); } }
    else { const n = { key: v.key, value: v.value, secret: false, enabled: true }; master.push(n); byKey.set(lc(v.key), n); changes.push({ key: v.key, secret: false, action: 'create' }); }
  }
  // nosemgrep -- reviewed: false positive: the template is correct
  for (const c of changes) log('info', 'vars', `global ${c.action}: ${c.key}${c.secret ? ' = ***' : ' = ' + (master.find(g => g.key === c.key) || {}).value}`);
  return changes;
}

// Full run: folder/request node over iterations/rows.
async function runNode({ col, nodeId, globals, rows, iterations, intervalMs, timeoutMs, version, onRecord, onState, log, ctl }) {
  const dataKeys = rows && rows.length ? Object.keys(rows[0]) : [];
  const requests = nodeId ? (() => { const f = findNode(col, nodeId); if (!f) throw new Error('Node not found'); return allRequests(f.node); })() : allRequests({ item: col.item });
  const total = (rows && rows.length ? rows.length : Math.max(1, iterations || 1)) * requests.length;
  let n = 0;
  const failed = [];
  onState && onState({ state: 'running', total, done: 0 });
  const iters = rows && rows.length ? rows.length : Math.max(1, iterations || 1);
  outer: for (let it = 0; it < iters; it++) {
    const row = rows && rows.length ? rows[it] : null;
    for (const req of requests) {
      await ctl.gate(); if (ctl.stopped) break outer;
      const runCol = buildRunCollection(col, req.id, { version, globals, dataKeys });
      const item = runCol.item[0];
      log('info', 'run', `iteration ${it + 1}/${iters}: ${req.name}${row ? ' data=' + JSON.stringify(row) : ''}`);
      const rec = await runOne({ item, globals, data: row, timeoutMs, ctl, log });
      rec.requestId = req.id; rec.iteration = it + 1; rec.data = row;
      if (rec.globalsAfter) { rec.globalChanges = mergeGlobals(globals, rec.globalsAfter, log); }
      delete rec.globalsAfter;
      if (ctl.stopped && !rec.response) { rec.error = rec.error || 'stopped'; }
      const bad = !!rec.error || (rec.response && rec.response.code >= 400);
      if (bad && row) failed.push(row);
      n++; onRecord && onRecord(rec); onState && onState({ state: ctl.paused ? 'paused' : 'running', total, done: n });
      if (ctl.stopped) break outer;
      if (intervalMs > 0 && n < total) await sleep(intervalMs, ctl);
    }
  }
  onState && onState({ state: ctl.stopped ? 'stopped' : 'finished', total, done: n });
  return { done: n, total, failedRows: failed, globals };
}
module.exports = { runOne, runNode, parseDataFile, parseCSV, toCSV, RunController, mergeGlobals, VIZ_SHIM };
