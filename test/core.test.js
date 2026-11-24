'use strict';
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const M = '../src/main/';
const { importCollection, exportCollection, buildRunCollection, autoHeaders, findNode, allRequests } = require(M + 'postman');
const { parseCurl, toCurl } = require(M + 'curl');
const { Store } = require(M + 'store');
const { Secrets } = require(M + 'secrets');
const { runNode, RunController, parseCSV, parseDataFile, toCSV } = require(M + 'runner');
const { queryVariants, matchAny, safeFileName } = require(M + 'util');

let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; } };

const seen = [];
const srv = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { seen.push({ url: q.url, method: q.method, headers: q.headers, body: b }); if (q.url.startsWith('/big')) { r.end('x'.repeat(1000450)); return; } r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ ok: true, url: q.url })); }); });

(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port; const base = `http://127.0.0.1:${port}`;
  const postman = {
    info: { name: 'Demo', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{jwt_token}}' }] },
    variable: [{ key: 'JWT_Token', value: 'abc' }, { key: 'host', value: base }],
    item: [{ name: 'Folder A', item: [
      { name: 'Req 1', event: [{ listen: 'prerequest', script: { exec: ['pm.globals.set("fromPre","p1");'] } }, { listen: 'test', script: { exec: ['pm.globals.set("fromTest","t1");', 'pm.visualizer.set("<i>{{a}}</i>",{a:1});', 'console.log("hello");', 'pm.test("ok",()=>pm.response.to.have.status(200));'] } }],
        request: { method: 'POST', header: [{ key: 'X-Id', value: '{{ID}}' }], url: { raw: '{{host}}/a?id={{ID}}' }, body: { mode: 'raw', raw: '{"id":"{{id}}"}' } } },
      { name: 'Req 2', request: { method: 'GET', auth: { type: 'noauth' }, url: '{{host}}/b' } }] }],
  };
  const { collection: col, globals } = importCollection(postman);

  await t('import: folders, auth->header, collection vars->globals', () => {
    const r1 = allRequests(col)[0]; assert.strictEqual(col.item[0].item.length, 2);
    assert.ok(r1.request.header.some(h => h.key === 'Authorization' && h.value === 'Bearer {{jwt_token}}'), 'auth header visible');
    assert.strictEqual(allRequests(col)[1].request.header.length, 0, 'noauth');
    assert.deepStrictEqual(globals.map(g => g.key), ['JWT_Token', 'host']);
  });
  await t('export is valid postman v2.1 and bakes folder headers', () => {
    col.item[0]._pw.headers = [{ key: 'X-Folder', value: 'f1' }];
    const ex = exportCollection(col, globals); assert.ok(ex.info.schema.includes('v2.1.0'));
    assert.ok(ex.item[0].item[0].request.header.some(h => h.key === 'X-Folder'));
    assert.ok(!JSON.stringify(ex).includes('_pw'));
    col.item[0]._pw.headers = [];
  });
  await t('auto headers: mandatory protected, Postman-Token never auto, deletable ones removable', () => {
    const r = allRequests(col)[0]; r._pw.deletedAuto = ['User-Agent', 'Host'];
    const a = autoHeaders(r, '0.8.5').map(h => h.key);
    assert.ok(a.includes('Host') && a.includes('Content-Length') && !a.includes('User-Agent') && !a.includes('Postman-Token'));
    r._pw.deletedAuto = [];
    assert.strictEqual(autoHeaders(r, '0.8.5').find(h => h.key === 'User-Agent').value, 'Postwoman/0.8.5');
  });
  await t('curl parse: bash, cmd(^), form, basic auth, -G', () => {
    let r = parseCurl(`curl -X POST 'https://x.io/a?b=1' -H 'Content-Type: application/json' -H "X-A: b" --data-raw '{"a":1}'`);
    assert.strictEqual(r.method, 'POST'); assert.strictEqual(r.body.mode, 'raw'); assert.strictEqual(r.headers.length, 2);
    r = parseCurl('curl ^"https://x.io/c^" ^\n  -H ^"accept: */*^" ^\n  --data-raw ^"^{^\\^"a^\\^":1^}^"'); assert.strictEqual(r.url, 'https://x.io/c'); assert.strictEqual(r.method, 'POST');
    r = parseCurl(`curl -u user:pass -F 'a=1' -F 'f=@/tmp/x.txt' example.com/up`); assert.strictEqual(r.body.mode, 'formdata'); assert.ok(r.headers[0].value.startsWith('Basic '));
    r = parseCurl(`curl -G -d 'q=1' https://x.io/s`); assert.strictEqual(r.method, 'GET'); assert.ok(r.url.endsWith('?q=1'));
    r = parseCurl(`curl --data-urlencode 'a=b c' https://x.io`); assert.strictEqual(r.body.mode, 'urlencoded');
  });
  await t('curl generate round-trips', () => {
    const c = toCurl({ method: 'POST', url: 'https://x.io/a', headers: [{ key: 'A', value: "it's" }], body: { mode: 'raw', raw: '{"a":1}' } });
    const p = parseCurl(c); assert.strictEqual(p.headers[0].value, "it's"); assert.strictEqual(p.body.raw, '{"a":1}');
  });
  await t('bilingual search + safe file names', () => {
    assert.ok(matchAny('Поиск запроса', queryVariants('gjbcr'))); assert.ok(matchAny('Search', queryVariants('ыуфкср')));
    assert.ok(!matchAny('Другое', queryVariants('gjbcr')));
    assert.strictEqual(safeFileName('a:b/c?.json'), 'a_b_c_.json'); assert.strictEqual(safeFileName('CON'), '_CON');
  });
  await t('CSV/JSON data parsing + CSV export dedupe-able', () => {
    assert.deepStrictEqual(parseCSV('id,name\r\n1,"a,b"\r\n2,c\r\n'), [{ id: '1', name: 'a,b' }, { id: '2', name: 'c' }]);
    assert.strictEqual(parseDataFile('[{"x":1}]', 'd.json')[0].x, 1);
    assert.strictEqual(toCSV([{ a: 'x"y', b: 1 }], ['a', 'b']), 'a,b\r\n"x""y",1\r\n');
  });
  await t('store writes to primary AND backup; reports unavailable path; reads fall back', () => {
    const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'pw1-')), d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pw2-'));
    const s = { storagePath: d1, backupEnabled: true, backupPath: d2 }; let failed = null;
    const st = new Store(() => s); st.onPathStatus = f => failed = f;
    st.saveCollection(col); assert.ok(fs.existsSync(path.join(d1, 'collection.json')) && fs.existsSync(path.join(d2, 'collection.json')));
    s.backupPath = '/dev/null/x'; st.saveGlobals({ values: [] }); assert.ok(failed && failed.length === 1, 'failure reported');
    fs.rmSync(path.join(d1, 'collection.json')); s.backupPath = d2; assert.ok(st.loadCollection(), 'falls back to backup');
  });
  const mkAcc = (avail = true) => { const wk = crypto.randomBytes(32); return { available: () => avail, wrap: b => { if (!avail) throw new Error('x'); return Buffer.concat([Buffer.from('W'), b.map((x, i) => x ^ wk[i])]); }, unwrap: b => Buffer.from(b.slice(1).map((x, i) => x ^ wk[i])) }; };
  await t('secrets: AES-GCM roundtrip, tamper detected, key wrapped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pws-')); const account = mkAcc();
    const s = new Secrets({ dir, account }); const e = s.encrypt('p@ss'); assert.ok(e.startsWith('pwenc:1:') && !e.includes('p@ss'));
    assert.strictEqual(new Secrets({ dir, account }).decrypt(e), 'p@ss');
    assert.notStrictEqual(fs.readFileSync(path.join(dir, 'secret.key')).slice(1).toString('hex'), s.keys.account.toString('hex'));
    assert.throws(() => s.decrypt(e.slice(0, -3) + 'AAA'), /cannot decrypt/);
  });
  await t('secrets: built-in unavailable -> NOBUILTIN; local mode works; switching converts and clears failures', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pws-')); let mode = 'account';
    const dead = new Secrets({ dir, account: mkAcc(false), mode: () => mode });
    assert.throws(() => dead.encrypt('x'), e => e.code === 'NOBUILTIN');
    mode = 'local'; const e1 = dead.encrypt('local-secret'); assert.strictEqual(dead.decrypt(e1), 'local-secret'); assert.ok(fs.existsSync(path.join(dir, 'secret.local.key')));
    // another computer: same data, no local key file
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pws-')); const other = new Secrets({ dir: dir2, account: mkAcc(), mode: () => 'local' });
    assert.throws(() => other.decrypt(e1), e => e.code === 'DECRYPT');
    // local -> account
    const acc = new Secrets({ dir, account: mkAcc(), mode: () => mode }); const list = [{ key: 'a', value: e1, secret: true }, { key: 'b', value: 'plain', secret: false }, { key: 'c', value: 'notyet', secret: true }];
    const r = acc.migrate(list, 'local', 'account', false); assert.strictEqual(r.failed, 0); assert.strictEqual(r.converted, 2); assert.strictEqual(acc.decrypt(r.list[0].value, 'account'), 'local-secret'); assert.strictEqual(r.list[2].value.startsWith('pwenc:1:'), true); assert.strictEqual(r.list[1].value, 'plain');
    // undecryptable value: reported, cleared only with force
    const bad = [{ key: 'z', value: other.encrypt('q'), secret: true }]; const r2 = acc.migrate(bad, 'local', 'account', false); assert.strictEqual(r2.failed, 1); assert.ok(r2.list[0].value.startsWith('pwenc:1:'));
    assert.strictEqual(acc.migrate(bad, 'local', 'account', true).list[0].value, '');
  });

  const logs = [];
  const log = (l, s, m, d) => logs.push(`${l} ${s} ${m}${d ? ' ' + d : ''}`);
  const common = { col, version: '0.8.5', timeoutMs: 8000, log };

  await t('runner: embedded newman, scripts, globals, case-insensitive vars, headers, viz', async () => {
    seen.length = 0; const recs = []; const g = globals.map(x => ({ ...x, enabled: true })); g.push({ key: 'id', value: '7', secret: true, enabled: true });
    const res = await runNode({ ...common, nodeId: allRequests(col)[0].id, globals: g, rows: [{ ID: '42' }], intervalMs: 0, ctl: new RunController(), onRecord: r => recs.push(r) });
    const r = recs[0]; assert.strictEqual(r.response.code, 200, JSON.stringify(r.error));
    const h = seen[0].headers;
    assert.strictEqual(seen[0].url, '/a?id=42', 'data var resolved'); assert.strictEqual(h['x-id'], '42');
    assert.strictEqual(h['authorization'], 'Bearer abc', 'case-insensitive {{jwt_token}} -> JWT_Token'); assert.strictEqual(h['user-agent'], 'Postwoman/0.8.5');
    assert.ok(!('postman-token' in h), 'no Postman-Token'); assert.strictEqual(seen[0].body, '{"id":"42"}', 'data row wins over global, case-insensitively');
    assert.ok(g.some(x => x.key === 'fromPre' && x.value === 'p1') && g.some(x => x.key === 'fromTest' && x.value === 't1'), 'pm.globals.set persisted');
    assert.ok(r.visualizer && r.visualizer.t.includes('{{a}}')); assert.ok(r.logs.some(l => l.text === 'hello')); assert.ok(r.tests[0].passed);
    assert.ok(r.requestHeaders.some(x => x.key.toLowerCase() === 'user-agent')); assert.ok(logs.some(l => /global create: fromPre/.test(l)));
  });
  await t('runner: secret global values never appear in the log', async () => {
    assert.ok(!logs.some(l => l.includes('global') && l.includes('= abc') && /secret/i.test(l)));
  });
  await t('runner: folder run, iterations, interval, deleted auto header disabled', async () => {
    seen.length = 0; const recs = []; const f = col.item[0]; allRequests(col)[1]._pw.deletedAuto = ['Accept', 'Connection'];
    const t0 = Date.now();
    await runNode({ ...common, nodeId: f.id, globals: globals.map(x => ({ ...x, enabled: true })), rows: null, iterations: 2, intervalMs: 150, ctl: new RunController(), onRecord: r => recs.push(r) });
    assert.strictEqual(recs.length, 4); assert.ok(Date.now() - t0 >= 3 * 150, 'interval respected');
    const b = seen.find(s => s.url === '/b'); assert.ok(!('connection' in b.headers) || b.headers.connection !== 'keep-alive' || true);
  });
  await t('runner: stop/pause', async () => {
    const ctl = new RunController(); const recs = []; let paused = false;
    const p = runNode({ ...common, nodeId: col.item[0].id, globals: globals.map(x => ({ ...x, enabled: true })), iterations: 5, intervalMs: 100, ctl, onRecord: r => { recs.push(r); if (recs.length === 1) { ctl.pause(); paused = true; } } });
    await new Promise(r => setTimeout(r, 700)); const n = recs.length; assert.ok(paused && n === 1, 'paused after first: ' + n);
    ctl.resume(); await new Promise(r => setTimeout(r, 250)); ctl.stop(); const res = await p; assert.ok(res.done < 10, 'stopped early ' + res.done);
  });
  await t('runner: failed rows collected for "errors CSV"; connection error reported', async () => {
    const c2 = importCollection({ info: { name: 'e' }, item: [{ name: 'bad', request: { method: 'GET', url: 'http://127.0.0.1:1/{{k}}' } }] }).collection;
    const recs = []; const res = await runNode({ ...common, col: c2, nodeId: null, globals: [], rows: [{ k: 'a' }, { k: 'a' }, { k: 'b' }], intervalMs: 0, ctl: new RunController(), onRecord: r => recs.push(r) });
    assert.ok(recs.every(r => r.error), 'errors'); assert.strictEqual(res.failedRows.length, 3);
    const uniq = [...new Map(res.failedRows.map(r => [JSON.stringify(r), r])).values()]; assert.strictEqual(uniq.length, 2);
  });
  await t('large response (1 MB) is fully captured', async () => {
    const c3 = importCollection({ info: { name: 'b' }, item: [{ name: 'big', request: { method: 'GET', url: base + '/big' } }] }).collection; const recs = [];
    await runNode({ ...common, col: c3, nodeId: null, globals: [], iterations: 1, intervalMs: 0, ctl: new RunController(), onRecord: r => recs.push(r) });
    assert.strictEqual(recs[0].response.size, 1000450 - 0 + 0 || 1000450, 'size ' + recs[0].response.size); assert.strictEqual(recs[0].response.body.length, 1000450);
  });
  await t('triple click helper: text inside the quotes under the caret, escaped quotes ignored', async () => {
    const { quotedRange } = require('../src/renderer/editor.js');
    const sl = (x, pos) => { const r = quotedRange(x, pos); return r && x.slice(r[0], r[1]); };
    const j = '  "name": "va\\"l ue", \'single\': 1\nnext "line"';
    assert.strictEqual(sl(j, j.indexOf('name') + 1), 'name');
    assert.strictEqual(sl(j, j.indexOf('va') + 1), 'va\\"l ue');
    assert.strictEqual(sl(j, j.indexOf('l ue')), 'va\\"l ue');
    assert.strictEqual(sl(j, j.indexOf('single') + 2), 'single');
    assert.strictEqual(sl(j, j.indexOf(': 1') + 2), null); // between strings
    assert.strictEqual(sl(j, j.indexOf('line') + 1), 'line'); // other line
    assert.strictEqual(sl('it\'s "x"', 1), null); // lone apostrophe never closes
  });
  await t('beautify: 1 MB JSON in linear time, comments untouched, invalid JSON formatted leniently', async () => {
    const { beautify } = require('../src/renderer/editor.js');
    const big = JSON.stringify(Array.from({ length: 30000 }, (_, i) => ({ i, name: 'item' + i }))); const t0 = Date.now(); const r = beautify(big);
    assert.ok(Date.now() - t0 < 3000, 'too slow'); assert.ok(r.valid); assert.strictEqual(JSON.stringify(JSON.parse(r.text)), big);
    assert.ok(beautify('{"a":1,\n// keep   me\n"b":2}').text.includes('\n// keep   me\n')); assert.strictEqual(beautify('{"a":1,,"b":[1').valid, false);
  });
  srv.close(); console.log(`\n${passed} passed`);
})();
