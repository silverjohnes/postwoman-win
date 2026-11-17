'use strict';
/* ===== Postwoman renderer views: dialogs, result pane, runner, globals, history, log, settings, bootstrap ===== */
// ---------- dialogs ----------
function modal(content, { wide = false, onClose } = {}) {
  closeModal(); const close = () => { closeModal(); onClose && onClose(); };
  const box = h('div', { class: 'dlg' + (wide ? ' wide' : '') }, content); const m = h('div', { id: 'modal' }, box); m.addEventListener('mousedown', e => { if (e.target === m) close(); });
  m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }); document.body.append(m); return { close, box, el: m };
}
const closeModal = () => { const m = document.getElementById('modal'); if (m) m.remove(); };
const closeX = (fn, title) => h('button', { class: 'ib closex', title: title || T('btn.close'), onClick: fn }, ic('closeCircle', 17));
function promptDlg(title, def = '') { return new Promise(res => { const inp = h('input', { type: 'text', value: def, style: { width: '100%' } }); let done = false; const fin = v => { if (done) return; done = true; closeModal(); res(v); };
  const d = modal([h('h3', {}, title), inp, h('div', { class: 'btns' }, mkBtn(T('btn.cancel'), '', () => fin(null)), mkBtn(T('btn.save'), 'pri', () => fin(inp.value)))], { onClose: () => fin(null) });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fin(inp.value); } }); setTimeout(() => { inp.focus(); inp.select(); }, 20); }); }
function confirmDlg(msg) { return new Promise(res => { let done = false; const fin = v => { if (done) return; done = true; closeModal(); res(v); };
  const d = modal([h('div', {}, msg), h('div', { class: 'btns' }, mkBtn(T('btn.cancel'), '', () => fin(false)), mkBtn(T('btn.delete'), 'pri', () => fin(true)))], { onClose: () => fin(false) }); d.el.addEventListener('keydown', e => { if (e.key === 'Enter') fin(true); }); }); }
function folderHeadersDlg(f) {
  f._pw = f._pw || { headers: [] }; f._pw.headers = f._pw.headers || []; const before = clone(f._pw.headers); const rows = f._pw.headers;
  const t = kvTable({ rows, onChange: () => { markStructure(); }, keyPh: T('req.key'), valPh: T('req.value') });
  modal([h('h3', {}, T('folder.headers') + ' — ' + f.name), h('div', { style: { overflow: 'auto' } }, t), h('div', { class: 'btns' }, mkBtn(T('btn.close'), 'pri', () => { closeModal(); const after = clone(rows); if (JSON.stringify(before) !== JSON.stringify(after)) pushUndo({ scope: 'list', label: 'folder headers', undo() { f._pw.headers.splice(0, f._pw.headers.length, ...clone(before)); }, redo() { f._pw.headers.splice(0, f._pw.headers.length, ...clone(after)); } }); renderView(); })) ], { wide: true, onClose: () => { renderView(); } });
}

// ---------- status chip / http text ----------
const chipCls = c => !c ? 'c0' : c < 300 ? 'c2' : c < 400 ? 'c3' : c < 500 ? 'c4' : 'c5';
const statusChip = (code, text, o = {}) => h('span', { class: 'chip ' + (code >= 200 && code < 400 ? 'ok' : 'bad') + (o.sel ? ' sel' : '') + (o.large ? ' lg' : '') }, code ? String(code) : 'ERR');
const stamp = t => { const d = new Date(t || Date.now()), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
async function copyCurlOf(rec) { const t = await pw.makeCurl({ method: rec.method, url: rec.url, headers: rec.requestHeaders || [], body: rec.requestBody ? { mode: 'raw', raw: rec.requestBody } : { mode: 'none' } }); await pw.clipboard(t); toast(T('msg.copied')); }
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
const hdrText = list => (list || []).map(x => `${x.key}: ${x.value}`).join('\n');
function respText(rec, withHeaders) {
  const r = rec.response; if (!r) return rec.error ? `${T('res.error')}: ${rec.error}` : '';
  if (!withHeaders) return r.body === '' ? T('res.empty') : r.body;
  return `HTTP ${r.code} ${r.status || ''}\n${hdrText(r.headers)}\n\n${r.body}`;
}
function reqText(rec, withHeaders) {
  const b = rec.requestBody || ''; if (!withHeaders) return b === '' ? T('res.empty') : b;
  return `${rec.method || ''} ${rec.url || ''}\n${hdrText(rec.requestHeaders)}\n\n${b}`;
}
const isJsonResp = rec => /json/i.test(((rec.response?.headers || []).find(x => lc(x.key) === 'content-type') || {}).value || '') || /^\s*[\[{]/.test(rec.response?.body || '');

// ---------- result pane (used by Request tab, Runner details, History details) ----------
const VIZ_FRESH_MS = 8000;
function makeResult({ onClose } = {}) {
  let rec = null, tab = 'response';
  const top = h('div', { class: 'rtitle' }); const info = h('div', { class: 'rcol', style: { flex: 'none', padding: '8px 10px 0' } }); const trow = h('div', { class: 'trow', style: { padding: '6px 10px' } }); const body = h('div', { class: 'rbody', style: { padding: '0 10px 10px' } });
  const el = h('div', { class: 'col', style: { flex: 1, minHeight: 0 } }, top, info, trow, body);
  let viewer = null;
  const draw = () => {
    top.textContent = ''; info.textContent = ''; trow.textContent = ''; body.textContent = ''; viewer = null;
    if (onClose) { top.style.display = ''; top.append(h('b', { class: 'title' }, LM('Result')), h('div', { style: { flex: 1 } }), closeX(onClose, LM('Hide'))); } else top.style.display = 'none';
    if (!rec) { body.append(h('div', { class: 'empty' }, T('res.noResult'))); return; }
    if (rec.pending) { body.append(h('div', { class: 'row', style: { padding: '8px 0', gap: '10px' } }, ic('spinner', 16, 'spin'), h('span', { class: 'muted' }, LM('Sending request…')), h('div', { style: { flex: 1 } }), h('button', { class: 'dst', onClick: () => pw.runStop() }, LM('Stop')))); return; }
    const r = rec.response;
    info.append(h('div', { class: 'rline' }, `${rec.method || ''} ${rec.url || ''}`));
    const st = [r ? (r.status || '') : '', r ? `${r.time} ms` : '', stamp(rec.time)].filter(Boolean).join(' · ') + (rec.iteration > 0 ? LM(' · iteration %ld', rec.iteration) : '') + (r && r.size ? ' · ' + fmtSize(r.size) : '');
    info.append(h('div', { class: 'rstat' }, statusChip(r ? r.code : 0, '', { large: true }), h('span', { class: 'st' }, st)));
    if (rec.data && Object.keys(rec.data).length) info.append(h('div', { class: 'hint' }, LM('data: ') + Object.keys(rec.data).sort().map(k => `${k}=${rec.data[k]}`).join(', ')));
    if (rec.error) info.append(h('div', { class: 'hint', style: { color: 'var(--err)' } }, rec.error));
    const tl = [['request', LM('Request')], ['response', LM('Response')]]; if (rec.visualizer) tl.push(['visualize', LM('Visualize')]); tl.push(['console', T('res.console')]); if (!tl.some(x => x[0] === tab)) tab = 'response';
    trow.append(tabStrip(tl, tab, k => { tab = k; draw(); }), h('div', { style: { flex: 1 } }));
    if (tab === 'response' || tab === 'request') {
      const key = tab === 'response' ? 'showHeadersRes' : 'showHeadersReq'; const on = S.settings[key] !== false;
      trow.append(h('label', { class: 'row hint', style: { gap: '4px', color: 'var(--tx)' } }, h('input', { type: 'checkbox', checked: on, onChange: e => { S.settings[key] = e.target.checked; pw.patchSettings({ [key]: e.target.checked }); draw(); } }), LM('Headers')));
      const withH = on; const text = tab === 'response' ? respText(rec, withH) : reqText(rec, withH);
      if (tab === 'request') trow.append(h('button', { class: 'codebtn', title: LM('Copy as curl'), onClick: () => copyCurlOf(rec) }, '</>'));
      else { trow.append(h('button', { onClick: () => { pw.clipboard(text); toast(T('msg.copied')); } }, ic('copy', 14), LM('Copy')));
        if (r && r.body) trow.append(iconBtn('import', LM('Save response body…'), () => { const ct = lc((r.headers.find(x => lc(x.key) === 'content-type') || {}).value || ''); pw.saveBody({ name: rec.name || 'response', body: r.body, ext: /json/.test(ct) || /^\s*[\[{]/.test(r.body) ? 'json' : /xml/.test(ct) ? 'xml' : /html/.test(ct) ? 'html' : 'txt' }); }, '', 17)); }
      viewer = new Viewer({ lang: withH ? 'http' : (tab === 'response' && !isJsonResp(rec) ? 'text' : 'json') }); body.append(viewer.el);
      const note = r && r.truncated ? `… ${T('res.size')}: ${fmtSize(r.size)}` : '';
      // format JSON body even when headers are shown (http mode formats only the body part)
      if (withH) { const sep = text.indexOf('\n\n'); const head = text.slice(0, sep), b = text.slice(sep + 2); const looksJ = /^\s*[\[{]/.test(b); let fb = b, nt = note; if (looksJ) { const f = beautify(b); fb = f.text; if (!f.valid) nt = T('err.invalidJson'); } viewer.setText(head + '\n\n' + fb, { format: false, notice: nt }); }
      else viewer.setText(text, { format: true, notice: note });
    } else if (tab === 'visualize') { body.append(vizFrame(rec.visualizer)); }
    else { const out = h('div', { class: 'list mono', style: { padding: '8px', whiteSpace: 'pre-wrap' } });
      for (const t of rec.tests || []) out.append(h('div', { style: { color: t.passed ? 'var(--ok)' : 'var(--err)' } }, (t.passed ? '✔ ' : '✘ ') + t.name + (t.error ? ' — ' + t.error : '')));
      for (const l of rec.logs || []) out.append(h('div', {}, `[${l.level}] ${l.text}`)); if (!out.children.length) out.append(h('span', { class: 'muted' }, '—')); body.append(out); }
  };
  // visualization policy: a result that arrived < 8 s ago opens on "Visualize" (the script runs, as before);
  // an old result (request reopened, runner row picked, history) opens on "Response" and its script runs only after the person clicks "Visualize"
  el.set = r => { if (r !== rec) { const fresh = !!(r && r.visualizer && r._arrived && Date.now() - r._arrived < VIZ_FRESH_MS); if (fresh) tab = 'visualize'; else if (tab === 'visualize') tab = 'response'; } rec = r; draw(); }; el.setTab = t => { tab = t; }; el.redraw = draw; draw(); return el;
}
function vizFrame(v) {
  const f = h('iframe', { class: 'viz', sandbox: 'allow-scripts', src: 'viz.html' });
  // nosemgrep -- reviewed: the visualizer iframe is sandboxed without allow-same-origin: its origin is opaque, so "*" is the only possible target, and the payload is the request own data
  f.addEventListener('load', () => f.contentWindow.postMessage({ t: String(v.t ?? ''), d: v.d ?? {} }, '*'));
  return f;
}

// ---------- layout: tabs + views ----------
function renderTabs() {
  const el = document.getElementById('tabs'); el.textContent = '';
  el.append(tabStrip([['request', LM('Request')], ['runner', LM('Runner')], ['globals', LM('Globals')], ['log', LM('Log')]], S.tab, k => { S.tab = k; renderTabs(); renderView(); }));
  if (S.failedPaths.length) el.append(h('div', { class: 'warnbar row' }, ic('warn', 13), h('span', {}, S.failedPaths.join(' · ')), mkBtn(LM('Check paths in Settings'), '', () => openSettings(true))));
}
let resultEl = null, curlEl = null;
function renderView(full = true) {
  const v = document.getElementById('view'); const keepReq = !full && S.tab === 'request' && reqPane && reqPane.isConnected;
  if (!keepReq) v.textContent = ''; if (S.tab !== 'globals' && GL.hideAll) GL.hideAll();
  if (S.tab === 'request') {
    const r = S.sel.size > 1 ? null : activeReq(); let split = v.querySelector('.split');
    if (!keepReq) { split = h('div', { class: 'split' }); const left = h('div', { class: 'left' }, renderRequestPane()); split.append(left); v.append(split); } else { split.querySelectorAll('.right,.curlcol').forEach(x => x.remove()); }
    if (r && S.resultOpen && S.results.has(r.id)) {
      const right = h('div', { class: 'right', style: { width: (S.settings.resultWidth || 46) + '%' } }); const sp = h('div', { class: 'rsplit' }); right.append(sp); wireSplit(sp, right, split);
      resultEl = makeResult({ onClose: () => { S.resultOpen = false; renderView(false); } }); right.append(resultEl); renderResult(); split.append(right);
    }
    if (r && S.curlOpen) { curlEl = makeCurlPanel(r); split.append(curlEl); }
    if (r && !keepReq) setTimeout(() => restoreFocus(r), 0);
  } else if (S.tab === 'runner') v.append(runnerView());
  else if (S.tab === 'globals') v.append(globalsView());
  else v.append(logView());
}
function wireSplit(handle, right, split) {
  handle.addEventListener('mousedown', e => { e.preventDefault(); const move = ev => { const rect = split.getBoundingClientRect(); const pct = Math.min(75, Math.max(22, (rect.right - ev.clientX) / rect.width * 100)); right.style.width = pct + '%'; S.settings.resultWidth = Math.round(pct); };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); pw.patchSettings({ resultWidth: S.settings.resultWidth }); }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); });
}
function renderResult() { const r = activeReq(); if (!resultEl || !r) return; const rec = S.results.get(r.id); resultEl.set(rec || null); }
const substVars = t => String(t).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, k) => { const g = S.globals.find(x => x.enabled !== false && lc(x.key) === lc(k) && !x.secret); return g ? g.value : m; });
function makeCurlPanel(r) {
  const v = new Viewer({ lang: 'text' });
  const load = () => pw.makeCurl(effectiveRequest(r)).then(t => v.setText(S.settings.curlSubstitute !== false ? substVars(t) : t, { format: false }));
  const cb = h('input', { type: 'checkbox', checked: S.settings.curlSubstitute !== false, onChange: e => { S.settings.curlSubstitute = e.target.checked; pw.patchSettings({ curlSubstitute: e.target.checked }); load(); } });
  const box = h('div', { class: 'curlcol' }, h('div', { class: 'chead' }, h('b', {}, 'curl'), h('div', { style: { flex: 1 } }), h('button', { onClick: () => v.copyAll() }, ic('copy', 14), LM('Copy')), closeX(() => { S.curlOpen = false; renderView(false); })),
    h('label', { class: 'row hint', style: { color: 'var(--tx)' } }, cb, LM('Substitute variables')), h('div', { class: 'rbody', style: { flex: 1, minHeight: 0, padding: 0 } }, v.el), h('div', { class: 'hint' }, LM('Select any part of the command to copy only it.')));
  load(); return box;
}

// ---------- follow-bottom helper ----------
function followScroll(el) { let stick = true; el.addEventListener('scroll', () => { stick = el.scrollHeight - el.scrollTop - el.clientHeight < 6; }); return { after() { if (stick) el.scrollTop = el.scrollHeight; }, reset() { stick = true; el.scrollTop = el.scrollHeight; } }; }

// ---------- runner ----------
const RS = { rows: null, fileName: '', iterations: 1, state: 'idle', done: 0, total: 0, records: [], selIdx: null, failedRows: [], detail: null, listEl: null, followList: null };
function targetOfRunner() { const n = S.activeId && node(S.activeId); return n || null; }
function stepper(label, value, { min, max, step = 1, disabled = false }, onChange) {
  return h('span', { class: 'stepper' }, h('span', {}, label), h('span', { class: 'sb' }, h('button', { disabled, onClick: () => onChange(Math.min(max, value + step)) }, ic('up', 9)), h('button', { disabled, onClick: () => onChange(Math.max(min, value - step)) }, ic('down', 9))));
}
function runSelected() { if (!S.activeId || RS.state === 'running' || RS.state === 'paused') return; S.tab = 'runner'; renderTabs(); startRunner(); }
function togglePause() { if (RS.state === 'paused') pw.runResume(); else if (RS.state === 'running') pw.runPause(); }
function runnerView() {
  const t = targetOfRunner(); const root = h('div', { class: 'pane', style: { padding: '14px', gap: '8px' } });
  const running = RS.state === 'running' || RS.state === 'paused'; const hasData = !!RS.rows; const interval = S.settings.runnerIntervalMs || 0;
  root.append(h('div', { class: 'runtop', style: { justifyContent: 'space-between', flexWrap: 'nowrap' } }, h('b', {}, t ? LM('Target: %@', t.name) + (isFolder(t) ? LM(' (folder)') : '') : LM('Select a collection, folder or request in the sidebar')), h('span', { id: 'runstate', class: 'muted' }, `${T('runner.state.' + RS.state)} — ${RS.done}/${RS.total}`)));
  const ctl = [];
  if (!running) ctl.push(h('button', { class: 'pri', disabled: !t, onClick: startRunner }, LM('Run')));
  else ctl.push(RS.state === 'paused' ? mkBtn(LM('Resume'), '', () => pw.runResume()) : mkBtn(LM('Pause'), '', () => pw.runPause()), mkBtn(LM('Stop'), 'dst', () => pw.runStop()));
  root.append(h('div', { class: 'runtop' },
    stepper(hasData ? LM('Iterations: all rows') : LM('Iterations: %ld', RS.iterations), RS.iterations, { min: 1, max: 100000, disabled: hasData }, v => { RS.iterations = v; renderView(); }),
    stepper(LM('Interval: %ld ms', interval), interval, { min: 0, max: 3600000, step: 100 }, v => { S.settings.runnerIntervalMs = v; pw.patchSettings({ runnerIntervalMs: v }); renderView(); }),
    mkBtn(RS.fileName || LM('Data file (CSV/JSON)…'), '', async () => { const f = await pw.pickData(); if (f) { RS.rows = f.rows; RS.fileName = f.name; renderView(); } }),
    hasData ? closeX(() => { RS.rows = null; RS.fileName = ''; renderView(); }, LM('Remove')) : null, hasData ? mkBtn(LM('Preview'), '', previewDlg) : null,
    RS.failedRows.length ? mkBtn(LM('Errors CSV'), '', () => pw.saveCsv({ rows: RS.failedRows }), { title: LM('Data rows of failed requests, without duplicates') }) : null, h('div', { style: { flex: 1 } }), ...ctl));
  const list = h('div', { class: 'list', style: { flex: 1 } }); RS.listEl = list; RS.followList = followScroll(list);
  RS.detail = makeResult(); const det = h('div', { class: 'col', style: { flex: 1, border: '1px solid var(--bd)', borderRadius: '8px', minWidth: 0 } }, RS.detail);
  root.append(h('div', { class: 'row', style: { flex: 1, minHeight: 0, alignItems: 'stretch', gap: '10px' } }, h('div', { class: 'col', style: { width: '42%', minWidth: '320px' } }, list), det));
  RS.records.forEach((rec, i) => list.append(runnerRow(rec, i))); RS.followList.reset(); if (RS.selIdx != null && RS.records[RS.selIdx]) RS.detail.set(RS.records[RS.selIdx]); return root;
}
function runnerRow(rec, i) {
  const row = h('div', { class: 'li' + (RS.selIdx === i ? ' sel' : ''), onClick: () => { RS.selIdx = i; RS.listEl.querySelectorAll('.li').forEach((x, j) => x.classList.toggle('sel', j === i)); RS.detail.set(rec); } },
    h('span', { class: 'muted' }, `#${rec.iteration}`), statusChip(rec.response?.code, '', { sel: RS.selIdx === i }), h('span', { class: 'u', title: rec.url }, `${rec.name} — ${rec.url || ''}`), h('span', { class: 'muted' }, rec.response ? rec.response.time + ' ms' : ''));
  return row;
}
async function startRunner() {
  const t = targetOfRunner(); if (!t) return toast(T('err.noRun')); await pw.syncCollection(clone(S.col));
  RS.records = []; RS.selIdx = null; RS.failedRows = []; RS.done = 0; RS.state = 'running'; renderView();
  const res = await pw.runStart({ nodeId: t.id, rows: RS.rows, iterations: RS.iterations, intervalMs: S.settings.runnerIntervalMs || 0, source: 'runner' });
  if (res && res.__error) { RS.state = 'idle'; toast(errText(res.__error)); renderView(); }
}
function previewDlg() {
  const t = targetOfRunner(); if (!RS.rows || !t) return; let tab = 'vars'; const body = h('div', { class: 'col', style: { flex: 1, minHeight: 0, overflow: 'auto' } });
  const subst = (s, row) => String(s ?? '').replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, k) => { const key = Object.keys(row).find(x => lc(x) === lc(k)); if (key !== undefined) return row[key]; const g = S.globals.find(x => lc(x.key) === lc(k) && !x.secret); return g ? g.value : m; });
  const draw = () => { body.textContent = ''; tabs.textContent = ''; tabs.append(tabStrip([['vars', LM('Variables')], ['reqs', LM('Requests')]], tab, k => { tab = k; draw(); }), h('div', { style: { flex: 1 } }), closeX(() => closeModal()));
    if (tab === 'vars') { const cols = Object.keys(RS.rows[0] || {}); const tb = h('table', { class: 'hot' }, h('tr', {}, h('th', {}, '#'), cols.map(c => h('th', {}, c)))); RS.rows.slice(0, 2000).forEach((r, i) => tb.append(h('tr', {}, h('td', { class: 'muted' }, i + 1), cols.map(c => h('td', { class: 'mono' }, r[c]))))); body.append(tb); }
    else { const v = new Viewer({ lang: 'http' }); body.append(v.el); const reqs = allRequests(t); let txt = ''; RS.rows.slice(0, 200).forEach((row, i) => reqs.forEach(r => { const hs = [...folderHeadersFor(r.id), ...r.request.header.filter(x => !x.disabled)].map(x => `${subst(x.key, row)}: ${subst(x.value, row)}`).join('\n'); const b = r.request.body; txt += `# ${i + 1}  ${r.name}\n${r.request.method} ${subst(reqUrl(r), row)}\n${hs}\n\n${subst(b.mode === 'raw' ? b.raw : '', row)}\n\n`; })); v.setText(txt, { format: false }); } };
  const tabs = h('div', { class: 'trow' });
  modal([h('h3', {}, T('runner.previewTitle') + ' — ' + RS.fileName), tabs, body], { wide: true }); draw();
}

// ---------- globals ----------
const GL = { hideAll: null }; const SHOWN = new WeakMap();
function globalsView() {
  const root = h('div', { class: 'pane', style: { padding: '14px', gap: '8px' } }); const list = h('div', { style: { overflow: 'auto', flex: 1 } }); const save = debounce(() => pw.saveGlobals(S.globals), 400);
  const isEnc = v => String(v || '').startsWith('pwenc:1:');
  const hideNow = async g => { const sh = SHOWN.get(g); if (!sh) return; clearTimeout(sh.t); SHOWN.delete(g); if (sh.changed) { const enc = await secEncrypt(sh.text); if (enc && enc.__error) 0; else { g.value = enc; save(); } } draw(); };
  const later = g => { const sh = SHOWN.get(g); if (!sh) return; clearTimeout(sh.t); sh.t = setTimeout(() => hideNow(g), 30000); };
  GL.hideAll = () => S.globals.forEach(g => { if (SHOWN.has(g)) hideNow(g); });
  const draw = () => { list.textContent = '';
    S.globals.forEach((g, i) => {
      const key = h('input', { type: 'text', class: 'gk', value: g.key, placeholder: LM('Variable'), onInput: e => { g.key = e.target.value; save(); } });
      let val;
      if (!g.secret) val = h('input', { type: 'text', class: 'gv', value: g.value, placeholder: LM('Value'), onInput: e => { g.value = e.target.value; save(); } });
      else if (SHOWN.has(g)) val = h('input', { type: 'text', class: 'gv', value: SHOWN.get(g).text, onInput: e => { const sh = SHOWN.get(g); sh.text = e.target.value; sh.changed = true; later(g); } });
      else if (!g.value) val = h('input', { type: 'password', class: 'gv', placeholder: LM('Value'), onChange: async e => { const v = e.target.value; if (!v) return; const enc = await secEncrypt(v); if (enc && enc.__error) { 0; return; } g.value = enc; save(); draw(); } });
      else val = h('div', { class: 'masked' }, h('span', {}, '••••••••••'), !isEnc(g.value) ? h('span', { class: 'w', title: LM('Not encrypted yet. It will be encrypted at the next unlock.') }, ic('warn', 13)) : null);
      const eye = g.secret && g.value ? iconBtn(SHOWN.has(g) ? 'eyeOff' : 'eye', SHOWN.has(g) ? LM('Hide value') : LM('Show value'), async () => { if (SHOWN.has(g)) return hideNow(g); const p = await secReveal(g.value); if (p && p.__error) return 0; SHOWN.set(g, { text: p, changed: false, t: 0 }); later(g); draw(); }, '', 16) : null;
      const lock = iconBtn(g.secret ? 'lock' : 'unlock', g.secret ? LM('Secret variable: click to make it a normal variable') : LM('Hide value (store encrypted)'), async () => { if (g.secret) { const p = g.value ? await secReveal(g.value) : ''; if (p && p.__error) return 0; SHOWN.delete(g); g.value = p; g.secret = false; } else { const enc = await secEncrypt(g.value || ''); if (enc && enc.__error) return 0; g.value = g.value ? enc : ''; g.secret = true; } save(); draw(); }, g.secret ? 'on' : '', 16);
      list.append(h('div', { class: 'gvar' }, h('input', { type: 'checkbox', checked: g.enabled !== false, onChange: e => { g.enabled = e.target.checked; save(); } }), key, val, eye, lock, iconBtn('trash', T('btn.delete'), () => { SHOWN.delete(g); S.globals.splice(i, 1); save(); draw(); }, 'danger', 16)));
    }); };
  draw();
  root.append(h('div', { class: 'row' }, h('h3', { class: 'title' }, LM('Globals')), h('div', { class: 'grow' }), mkBtn(LM('Add'), '', () => { S.globals.push({ key: '', value: '', secret: false, enabled: true }); save(); draw(); const ks = list.querySelectorAll('input.gk'); const k = ks[ks.length - 1]; if (k) { k.focus(); k.scrollIntoView({ block: 'nearest' }); } })), list);
  return root;
}

// ---------- history ----------

// ---------- secret variables: built-in (account) encryption with a local fallback ----------
const TX = (en, ru) => (T.lang === 'ru' ? ru : en);
const errText = c => c === 'auth' ? T('vars.authFailed') : c === 'decrypt' ? TX('Cannot decrypt the secret variables: they were encrypted on another computer or account. Open Settings → Secret variables to reset the encryption.', 'Не удалось расшифровать секретные переменные: они зашифрованы на другом компьютере или в другой учётной записи. Откройте «Настройки → Секретные переменные», чтобы сбросить шифрование.') : c === 'noBuiltin' ? TX('Built-in encryption is unavailable', 'Встроенное шифрование недоступно') : String(c);
function infoDlg(title, text, okLabel, cancelLabel) { return new Promise(res => { let done = false; const fin = v => { if (done) return; done = true; closeModal(); res(v); };
  modal([h('h3', {}, title), h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.45 } }, text), h('div', { class: 'btns' }, mkBtn(cancelLabel || T('btn.cancel'), '', () => fin(false)), mkBtn(okLabel, 'pri', () => fin(true)))], { onClose: () => fin(false) }); }); }
const LOCAL_WARN = () => TX('Built-in encryption (Windows account) is not available on this computer.\n\nPostwoman can encrypt secret variables locally instead. Please note: the encryption key is NOT stored in your account — it lives in a file in this app\'s data folder on this computer only, and it is not part of the storage/backup folder. Encrypted variables will NOT be decryptable on another computer if you move your data there (you will have to enter them again). The key file is protected only by the access rights of your Windows profile.\n\nYou can switch back to account encryption later in Settings.', 'Встроенное шифрование (через учётную запись Windows) на этом компьютере недоступно.\n\nPostwoman может зашифровать секретные переменные локально. Важно: ключ шифрования НЕ хранится в учётной записи — он лежит в файле в папке данных приложения только на этом компьютере и не входит в папку хранения/резервную копию. Поэтому при переносе данных на другой компьютер зашифрованные переменные расшифровать не удастся (их придётся ввести заново). Файл ключа защищён только правами доступа вашего профиля Windows.\n\nПозже можно вернуться к шифрованию в учётной записи в настройках.');
async function offerLocal() { if (!await infoDlg(TX('Use local encryption?', 'Использовать локальное шифрование?'), LOCAL_WARN(), TX('Use local encryption', 'Включить локальное шифрование'))) return false;
  const r = await pw.secretSwitch({ to: 'local' }); if (r && !r.needsForce) return offerFinish(r); if (r && r.needsForce) { if (!await infoDlg(TX('Some values cannot be converted', 'Часть значений не удалось преобразовать'), TX(`${r.failed} secret value(s) cannot be decrypted with the current key and will be cleared.`, `Значений, которые не удаётся расшифровать текущим ключом: ${r.failed}. Они будут очищены.`), TX('Clear and continue', 'Очистить и продолжить'))) return false; return offerFinish(await pw.secretSwitch({ to: 'local', force: true })); }
  return offerFinish(r); }
function applySwitched(r) { if (r && r.globals) S.globals.forEach((g, i) => { const n = r.globals[i]; if (n && n.key === g.key) g.value = n.value; }); }
function offerFinish(r) { if (r && r.__error) { toast(errText(r.__error)); return false; } applySwitched(r); return true; }
async function secCall(fn) { let r = await fn(); if (r && r.__error === 'noBuiltin' && await offerLocal()) r = await fn(); if (r && r.__error) { toast(errText(r.__error)); } return r; }
const secEncrypt = v => secCall(() => pw.secretEncrypt(v));
const secReveal = v => secCall(() => pw.secretReveal(v));

const HS = { sel: new Set(), anchor: null, entries: [], total: 0 };
function historyPane(r) {
  const root = h('div', { class: 'col', style: { flex: 1, minHeight: 0, border: '1px solid var(--bd)', borderRadius: '8px', overflow: 'hidden' } });
  const head = h('div', { class: 'hhead' }); const list = h('div', { class: 'list', tabIndex: 0, style: { flex: 1, outline: 'none', border: 0, borderRadius: 0 } }); const det = makeResult(); const detBox = h('div', { class: 'col', style: { flex: 1, minHeight: 0 } });
  const cols = h('div', { class: 'cols' }, h('div', { class: 'lcol' }, list), h('div', { class: 'rcol col' }, detBox));
  const keepN = S.settings.historyAmount || 6, keepText = (S.settings.historyUnit === 'days' ? LM('%ld day(s)', keepN) : LM('%ld month(s)', keepN));
  const askDelete = async ids => { if (!ids.size) return; if (!await confirmDlg(ids.size === 1 ? LM('Delete the selected execution?') : LM('Delete %ld selected executions?', ids.size))) return;
    await pw.historyDelete({ id: r.id, ids: [...ids] }); HS.entries = HS.entries.filter(x => !ids.has(x.id)); HS.total = Math.max(0, HS.total - ids.size); HS.sel = new Set(HS.entries[0] ? [HS.entries[0].id] : []); HS.anchor = HS.entries[0]?.id || null; draw(); };
  const detail = () => { detBox.textContent = ''; if (HS.sel.size > 1) detBox.append(h('div', { class: 'empty', style: { flexDirection: 'column', gap: '10px' } }, h('div', { class: 'title muted' }, LM('%ld executions selected', HS.sel.size)), h('button', { class: 'dst', onClick: () => askDelete(HS.sel) }, ic('trash', 14), LM('Delete…'))));
    else if (HS.sel.size === 1) { detBox.append(det); det.set(HS.entries.find(x => HS.sel.has(x.id)) || null); } else detBox.append(h('div', { class: 'empty' }, LM('Select an execution'))); };
  const draw = () => { head.textContent = ''; list.textContent = '';
    head.append(h('b', {}, HS.total === 0 ? LM('History') : LM('%ld execution(s)', HS.total) + (HS.total > HS.entries.length ? LM(', latest %ld shown', HS.entries.length) : '')), h('span', { class: 'hint' }, LM('kept for %@ · Settings → History', keepText)), h('div', { style: { flex: 1 } }),
      HS.sel.size ? mkBtn(LM('Delete…'), '', () => askDelete(HS.sel)) : null, h('button', { disabled: HS.total === 0, onClick: async () => { if (!await confirmDlg(LM('Clear the history of "%@"?', r.name))) return; await pw.historyClear(r.id); HS.entries = []; HS.total = 0; HS.sel = new Set(); draw(); } }, LM('Clear…')));
    if (!HS.entries.length) { cols.style.display = 'none'; if (!root.querySelector('.empty')) root.append(h('div', { class: 'empty' }, LM('No executions recorded yet.\nRun the request and it will appear here.'))); return; }
    cols.style.display = ''; root.querySelector(':scope > .empty')?.remove();
    HS.entries.forEach((e, i) => { const sel = HS.sel.has(e.id);
      list.append(h('div', { class: 'li col2' + (sel ? ' sel' : ''), 'data-id': e.id, onMouseDown: ev => { if (ev.button === 2 && HS.sel.has(e.id)) return;
          if (ev.shiftKey && HS.anchor) { const a = HS.entries.findIndex(x => x.id === HS.anchor), b = i; const [lo, hi] = a < b ? [a, b] : [b, a]; if (!(ev.ctrlKey || ev.metaKey)) HS.sel.clear(); HS.entries.slice(lo, hi + 1).forEach(x => HS.sel.add(x.id)); }
          else if (ev.ctrlKey || ev.metaKey) { HS.sel.has(e.id) ? HS.sel.delete(e.id) : HS.sel.add(e.id); HS.anchor = e.id; } else { HS.sel = new Set([e.id]); HS.anchor = e.id; }
          draw(); detail(); list.focus(); },
        onContextMenu: ev => { ev.preventDefault(); const ids = HS.sel.has(e.id) ? HS.sel : new Set([e.id]); const m = h('div', { class: 'ctx', id: 'ctx' }, h('div', { class: 'dst', onClick: () => { closeCtx(); askDelete(ids); } }, h('span', {}, ids.size > 1 ? LM('Delete %ld executions…', ids.size) : LM('Delete…'))), h('hr'), h('div', { onClick: () => { closeCtx(); HS.sel = new Set(HS.entries.map(x => x.id)); draw(); detail(); } }, h('span', {}, LM('Select all')))); m.style.left = ev.clientX + 'px'; m.style.top = ev.clientY + 'px'; document.body.append(m); armCtx(); } },
        h('div', { class: 'r1' }, statusChip(e.response?.code, '', { sel }), h('span', { class: 'muted hint' }, e.response ? e.response.time + ' ms' : ''), h('span', { class: 'grow' }), e.data && Object.keys(e.data).length ? ic('table', 13) : null, e.error ? ic('warn', 13) : null), h('span', { class: 'ts' }, stamp(e.time)))); }); };
  list.addEventListener('keydown', e => { const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Delete' || (mod && e.key === 'Backspace')) { e.preventDefault(); askDelete(HS.sel); }
    else if (mod && e.code === 'KeyA') { e.preventDefault(); HS.sel = new Set(HS.entries.map(x => x.id)); draw(); detail(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const cur = Math.max(0, HS.entries.findIndex(x => x.id === HS.anchor)); const n = Math.min(HS.entries.length - 1, Math.max(0, cur + (e.key === 'ArrowDown' ? 1 : -1))); const id = HS.entries[n].id;
      if (e.shiftKey) { const a = HS.entries.findIndex(x => x.id === HS.anchor); const [lo, hi] = a < n ? [a, n] : [n, a]; HS.sel = new Set(HS.entries.slice(lo, hi + 1).map(x => x.id)); } else { HS.sel = new Set([id]); HS.anchor = id; }
      draw(); detail(); list.focus(); } });
  root.append(head, cols); HS.sel = new Set(); HS.entries = []; HS.total = 0; draw(); detail();
  pw.historyGet(r.id).then(es => { const all = Array.isArray(es) ? es : []; HS.total = all.length; HS.entries = all.slice(0, 200); if (HS.entries[0]) { HS.sel = new Set([HS.entries[0].id]); HS.anchor = HS.entries[0].id; } draw(); detail(); }); return root;
}

// ---------- log ----------
const LOGORDER = ['debug', 'info', 'warn', 'error']; const LOG = { entries: [], el: null, follow: null, level: 'debug', filter: '', cnt: null };
const fmtLog = e => `${new Date(e.t).toLocaleTimeString()}.${String(e.t % 1000).padStart(3, '0')} [${e.level.toUpperCase()}] ${e.scope}: ${e.msg}`;
const logVisible = e => LOGORDER.indexOf(e.level) >= LOGORDER.indexOf(LOG.level) && (!LOG.filter || fmtLog(e).toLowerCase().includes(LOG.filter));
const logCount = () => { if (LOG.cnt && LOG.el) LOG.cnt.textContent = `${LOG.el.childElementCount} / ${LOG.entries.length}`; };
function addLogLine(e) { if (!LOG.el || !logVisible(e)) { logCount(); return; } LOG.el.append(h('div', { class: 'lv-' + e.level }, fmtLog(e))); while (LOG.el.childElementCount > 6000) LOG.el.firstChild.remove(); LOG.follow.after(); logCount(); }
function logView() {
  const root = h('div', { class: 'pane', style: { padding: '14px', gap: '8px' } }); const pre = h('div', { id: 'logpre' }); LOG.el = pre; LOG.follow = followScroll(pre); LOG.level = S.settings.logMinLevel || 'debug';
  const refill = () => { pre.textContent = ''; LOG.entries.forEach(addLogLine); LOG.follow.reset(); logCount(); };
  const sel = h('select', { style: { width: '130px' }, onChange: e => { LOG.level = e.target.value; S.settings.logMinLevel = LOG.level; pw.patchSettings({ logMinLevel: LOG.level }); refill(); } }, [['debug', 'Debug+'], ['info', 'Info+'], ['warn', 'Warnings+'], ['error', 'Errors']].map(([v, l]) => h('option', { value: v, selected: LOG.level === v }, LM(l))));
  const flt = h('input', { type: 'text', placeholder: LM('Filter'), value: LOG.filter, onInput: e => { LOG.filter = e.target.value.toLowerCase(); refill(); } }); LOG.cnt = h('span', { class: 'cnt2' });
  root.append(h('div', { class: 'logbar' }, sel, flt, h('div', { class: 'grow', style: { flex: 1 } }), LOG.cnt, mkBtn(LM('Copy'), '', () => { pw.clipboard(pre.innerText); toast(T('msg.copied')); }), mkBtn(LM('Save…'), '', () => pw.saveText({ name: 'postwoman.log', text: pre.innerText })), mkBtn(LM('Clear'), '', async () => { await pw.logClear(); LOG.entries = []; pre.textContent = ''; logCount(); })), pre);
  refill(); return root;
}

// ---------- import ----------
async function importCollectionFile() { try { const res = await pw.importFile(); if (!res) return; if (res.__error) return toast(T('import.error', res.__error)); applyImport(res); } catch (e) { toast(T('import.error', e.message)); } }
const importDlg = importCollectionFile;
async function curlImportDlg() {
  let clip = ''; try { clip = await pw.clipboardRead(); } catch {}
  const ta = h('textarea', { rows: 10, spellcheck: 'false', style: { width: '100%', fontFamily: 'var(--mono)' } }); if (/^\s*curl/i.test(clip || '')) ta.value = clip;
  const err = h('div', { class: 'status-bad' }); const btn = h('button', { class: 'pri', onClick: () => go() }, LM('Import'));
  async function go() { const r = await pw.importCurl(ta.value); if (r && r.__error) { err.textContent = r.__error; return; } closeModal(); addCurlRequest(r); }
  const upd = () => { btn.disabled = !ta.value.trim(); }; ta.addEventListener('input', upd); upd();
  modal([h('div', {}, LM('Paste a cURL command, for example from “Copy as cURL” in the browser (bash or cmd).')), ta, err, h('div', { class: 'btns' }, mkBtn(LM('Cancel'), '', () => closeModal()), btn)]); setTimeout(() => ta.focus(), 20);
}
function importMenu(anchor) { popMenu(anchor, [[LM('Postman collection…'), importCollectionFile], [LM('cURL command…'), curlImportDlg]]); }
async function saveAll() { allRequests({ item: S.col.item }).filter(isDirty).forEach(r => { if (isDraft(r)) { delete r._pw.draft; if (!r.name) r.name = T('req.newName'); } rememberSaved(r); }); await persistNow(); toast(LM('Save All') + ' ✓'); }
function applyImport({ collection, globals }) {
  const n = allRequests({ item: collection.item }).length; const folder = { id: uuid(), name: collection.info.name || 'Imported', item: collection.item, _pw: { headers: [] } };
  listEdit('import', () => S.col.item.unshift(folder)); S.expanded.add(folder.id); let added = 0;
  for (const g of globals) { const ex = S.globals.find(x => lc(x.key) === lc(g.key)); if (!ex) { S.globals.push(g); added++; } else if (!ex.value && !ex.secret) { ex.value = g.value; added++; } }
  pw.saveGlobals(S.globals); persistNow(); renderTree(); toast(T('import.done', n, added));
}
function addCurlRequest(c) {
  const r = newReqItem(); let nm = c.url; try { const u = new URL(c.url.replace(/\{\{[^}]*\}\}/g, 'x')); nm = (u.pathname.split('/').filter(Boolean).pop() || u.host); } catch {} r.name = nm.slice(0, 60) || T('req.newName');
  r.request.method = c.method; setUrl(r, c.url); r.request.header = c.headers.map(x => ({ key: x.key, value: x.value }));
  const b = c.body; if (b.mode === 'raw') r.request.body = { mode: 'raw', raw: b.raw, options: { raw: { language: b.options?.raw?.language || 'text' } } }; else if (b.mode === 'none') r.request.body = { mode: 'none' }; else r.request.body = b;
  r._pw.deletedAuto = []; addRequest(r);
}

// ---------- settings ----------
function openSettings(checkNow) {
  const s = { ...S.settings }; const sec = (title, ...kids) => h('div', { class: 'sgroup' }, h('h4', {}, LM(title)), ...kids); const note = k => h('div', { class: 'hint', style: { margin: '4px 0 6px' } }, LM(k));
  const lrow = (label, ...el) => h('div', { class: 'lrow' }, h('span', {}, LM(label)), h('div', { class: 'row grow', style: { justifyContent: 'flex-end' } }, ...el));
  const lang = h('select', { style: { width: '200px' }, onChange: e => { s.language = e.target.value; } }, h('option', { value: 'auto', selected: s.language === 'auto' }, LM('Automatic (system)')), I18N.list.map(c => h('option', { value: c, selected: s.language === c }, I18N.names[c])));
  const sp = h('span', { class: 'path mono' }, s.storagePath || ''); const bp = h('span', { class: 'path mono' + (s.backupPath ? '' : ' muted') }, s.backupPath || LM('Not set'));
  const be = h('input', { type: 'checkbox', checked: !!s.backupEnabled, disabled: !s.backupPath, onChange: e => { s.backupEnabled = e.target.checked; } });
  const status = h('div', { class: 'hint mono' });
  const check = async () => { await pw.saveSettings({ storagePath: s.storagePath, backupPath: s.backupPath, backupEnabled: s.backupEnabled }); const r = await pw.checkPaths(); status.textContent = ''; r.forEach(x => status.append(h('div', { style: { color: x.ok ? 'var(--ok)' : 'var(--err)', wordBreak: 'break-all' } }, `${x.label || ''}${x.label ? ': ' : ''}${x.path} — ${x.ok ? LM('Available') : LM('Unavailable') + (x.error ? ' (' + x.error + ')' : '')}`))); };
  const num = (v, min, max, fn, w = 64) => { const i = h('input', { type: 'number', min, max, value: v, style: { width: w + 'px', textAlign: 'right' }, onChange: e => { let n = Math.round(+e.target.value); if (!isFinite(n)) n = min; n = Math.max(min, Math.min(max, n)); e.target.value = n; fn(n); } }); return i; };
  const unit = h('select', { style: { width: '100px' }, onChange: e => { s.historyUnit = e.target.value; } }, ['months', 'days'].map(u => h('option', { value: u, selected: s.historyUnit === u }, LM(u))));
  const vault = h('span', { class: 'grow' }, LM('Secrets are encrypted with Windows (DPAPI); showing a value asks for Windows Hello / your PIN.'));
  const encRow = () => { const box = h('div', { class: 'encbox' }); const draw = async () => { const st = await pw.secretStatus(); box.textContent = '';
      const local = st.mode === 'local'; box.append(h('div', { class: 'lrow' }, h('span', {}, TX('Encryption mode', 'Режим шифрования')), h('div', { class: 'row grow', style: { justifyContent: 'flex-end', gap: '8px' } }, h('b', {}, local ? TX('Local (key in this computer\'s app folder)', 'Локальное (ключ в папке приложения на этом компьютере)') : TX('Built-in (Windows account)', 'Встроенное (учётная запись Windows)')),
        mkBtn(local ? TX('Switch to account encryption…', 'Перейти на шифрование в учётной записи…') : TX('Switch to local encryption…', 'Перейти на локальное шифрование…'), '', async () => {
          if (local) { if (!st.builtinAvailable) return toast(errText('noBuiltin')); if (!await infoDlg(TX('Switch to account encryption?', 'Перейти на шифрование в учётной записи?'), TX('All secret variables are decrypted with the local key and encrypted again with the key protected by your Windows account. The local key file is deleted. Data encrypted this way can be read only in this Windows account.', 'Все секретные переменные будут расшифрованы локальным ключом и зашифрованы заново ключом, защищённым вашей учётной записью Windows. Файл локального ключа будет удалён. Такие данные читаются только в этой учётной записи Windows.'), TX('Switch', 'Перейти'))) return; }
          else if (!await infoDlg(TX('Switch to local encryption?', 'Перейти на локальное шифрование?'), LOCAL_WARN().replace(/^[^]*?\n\n/, ''), TX('Switch', 'Перейти'))) return;
          const to = local ? 'account' : 'local'; let r = await pw.secretSwitch({ to });
          if (r && r.needsForce) { if (!await infoDlg(TX('Some values cannot be converted', 'Часть значений не удалось преобразовать'), TX(`${r.failed} secret value(s) cannot be decrypted with the current key (for example the data was moved from another computer) and will be cleared.`, `Значений, которые не удаётся расшифровать текущим ключом (например, данные перенесены с другого компьютера): ${r.failed}. Они будут очищены.`), TX('Clear and switch', 'Очистить и перейти'))) return; r = await pw.secretSwitch({ to, force: true }); }
          if (r && r.__error) toast(errText(r.__error)); else { applySwitched(r); if (S.tab === 'globals') renderView(); toast(TX('Encryption mode changed', 'Режим шифрования изменён')); S.settings.secretMode = to; await draw(); } }))));
      if (local) box.append(h('div', { class: 'hint warnline' }, ic('warn', 13), TX('Local key: encrypted variables cannot be decrypted on another computer after moving the data.', 'Локальный ключ: при переносе данных на другой компьютер зашифрованные переменные расшифровать не удастся.')));
      else if (!st.builtinAvailable) box.append(h('div', { class: 'hint warnline' }, ic('warn', 13), TX('Built-in encryption is unavailable on this computer.', 'Встроенное шифрование на этом компьютере недоступно.'))); }; draw(); return box; };
  const authRow = () => { const box = h('div', { class: 'authbox' }); const draw = async () => { const st = await pw.authStatus(); box.textContent = '';
      box.append(h('div', { class: 'lrow' }, h('span', {}, TX('Windows Hello prompt', 'Запрос Windows Hello')), h('div', { class: 'row grow', style: { justifyContent: 'flex-end', gap: '8px' } },
        h('span', { class: st.skip ? 'muted' : '' }, st.skip ? TX('Not asking (the last attempt did not succeed)', 'Не спрашивать (последняя попытка не удалась)') : TX('Asked once per session', 'Спрашивается один раз за сеанс')),
        mkBtn(TX('Ask again', 'Спрашивать снова'), '', async () => { await pw.authReset(); toast(TX('The prompt is enabled again', 'Запрос снова включён')); draw(); })))); }; draw(); return box; };
  const body = h('div', { class: 'sbody' },
    sec('Language', lrow('Interface language', lang), note('The language changes after the app is restarted.'), lrow(thTr('Theme'), h('select', { style: { width: '200px' }, onChange: e => { s.theme = e.target.value; applyTheme(e.target.value); } }, THEMES.map(([id, en]) => h('option', { value: id, selected: (s.theme || 'dark') === id }, thTr(en))))), h('label', { class: 'row', style: { marginTop: '6px' } }, h('input', { type: 'checkbox', checked: !!s.invertScroll, onChange: e => { s.invertScroll = e.target.checked; S.settings.invertScroll = e.target.checked; setInvertScroll(e.target.checked); pw.patchSettings({ invertScroll: e.target.checked }); } }), TX('Reverse scroll direction (mouse wheel / touchpad) in all windows', 'Обратное направление прокрутки (колесо мыши / тачпад) во всех окнах'))),
    sec('Saving', h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!s.autosave, onChange: e => { s.autosave = e.target.checked; } }), LM('Autosave')), h('div', { class: 'hint', style: { margin: '4px 0 6px' } }, LM('With autosave on, every change is saved by itself (a request imported from cURL only after you save it with ⌘S). With autosave off, changes are written only by Save (⌘S) or Save All (⌥⌘S); when you quit, every unsaved item is offered for saving.').replace(/⌥⌘S/g, 'Ctrl+Shift+S').replace(/⌘S/g, 'Ctrl+S')), h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, mkBtn(LM('Keyboard Shortcuts'), '', () => pw.openHotkeys()))),
    sec('Storage', lrow('Folder', sp, mkBtn(LM('Choose…'), '', async () => { const p = await pw.pickFolder(); if (p) { s.storagePath = p; sp.textContent = p; } }), mkBtn(LM('Default'), '', () => { if (S.defaultStoragePath) { s.storagePath = S.defaultStoragePath; sp.textContent = s.storagePath; } })), note('Folder for collections, variables and history'), h('hr'),
      h('label', { class: 'row' }, be, LM('Duplicate writes to the backup folder')), lrow('Folder', bp, mkBtn(LM('Choose…'), '', async () => { const p = await pw.pickFolder(); if (p) { s.backupPath = p; bp.textContent = p; bp.classList.remove('muted'); be.disabled = false; } }), closeX(() => { s.backupPath = ''; s.backupEnabled = false; be.checked = false; be.disabled = true; bp.textContent = LM('Not set'); bp.classList.add('muted'); }, LM('Remove'))),
      note('Backup storage path. When switched on, every change is written to both folders. A cloud folder can be used as the backup.'), h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, mkBtn(LM('Check all paths'), '', check)), status),
    sec('Secret variables', lrow('Key storage', vault, mkBtn(LM('Lock now'), '', () => pw.secretLock())), encRow(), authRow(), note('Values marked with the lock are stored AES-256 encrypted. Secret values are masked in the Log and in the history. Collections are exported without them.')),
    sec('Requests', lrow('Timeout', num(s.timeoutSec, 0, 3600, v => { s.timeoutSec = v; }), h('span', { class: 'muted' }, LM('seconds'))), note('0 means no timeout. Applies to every request in the Runner.')),
    sec('History', lrow('Keep history for', num(s.historyAmount, 1, 36500, v => { s.historyAmount = v; }), unit), note('Default: 6 months. Older executions are deleted at startup, after runs and when you close Settings — not while you are typing.'), h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, mkBtn(LM('Delete older executions now'), '', async () => { await pw.saveSettings({ historyAmount: s.historyAmount, historyUnit: s.historyUnit }); const n = await pw.historyPrune(); toast(String(n ?? 0)); }))),
    sec('About', lrow('Version', h('span', { class: 'mono' }, `${S.version} (${S.build})`)), lrow('GitHub', h('a', { href: 'https://github.com/silverjohnes/postwoman-win', target: '_blank', class: 'mono', style: { color: 'var(--ac)' } }, 'https://github.com/silverjohnes/postwoman-win'))));
  modal([h('div', { class: 'row' }, h('h3', { class: 'grow' }, LM('Settings')), closeX(() => closeModal())), body, h('div', { class: 'btns' }, mkBtn(T('btn.cancel'), '', () => closeModal()), mkBtn(T('btn.save'), 'pri', async () => {
    const res = await pw.saveSettings(s); S.settings = res.settings; closeModal(); if (res.langChanged) { setLang(I18N.resolve(S.settings.language, navigator.language)); buildShell(); } if (res.reload) { await boot(true); } renderTabs(); renderView(); }))], { wide: true });
  if (checkNow) check();
}

// ---------- close handling (unsaved requests) ----------
async function handleClose() {
  const list = dirtyList(); if (!list.length) return pw.quitConfirmed(); let saveAllFlag = false, discardAllFlag = false;
  for (const r of list) {
    if (discardAllFlag) break;
    if (saveAllFlag) { await autoSaveForClose(r); continue; }
    const ans = await new Promise(res => { const d = modal([h('h3', {}, T('close.title')), h('div', {}, T('close.message', r.name)), h('div', { class: 'btns' }, mkBtn(T('btn.cancel'), '', () => { closeModal(); res('cancel'); }), mkBtn(T('btn.discard'), '', () => { closeModal(); res('discard'); }), mkBtn(T('btn.discardAll'), '', () => { closeModal(); res('discardAll'); }), mkBtn(T('btn.save'), 'pri', () => { closeModal(); res('save'); }), mkBtn(T('btn.saveAll'), 'pri', () => { closeModal(); res('saveAll'); }))], { onClose: () => res('abort') }); });
    if (ans === 'abort') return; if (ans === 'save') await autoSaveForClose(r); else if (ans === 'saveAll') { saveAllFlag = true; await autoSaveForClose(r); } else if (ans === 'discardAll') discardAllFlag = true;
  }
  pw.quitConfirmed();
}
async function autoSaveForClose(r) { if (isDraft(r)) { delete r._pw.draft; if (!r.name) r.name = T('req.newName'); } rememberSaved(r); await pw.saveCollection(snapshotForSave()); }

// ---------- hotkeys window ----------
const HOT = [['Ctrl+Enter', 'Send Request'], ['Ctrl+R', 'Run Selected'], ['Ctrl+.', 'Stop'], ['Ctrl+Shift+P', 'Pause'], ['Ctrl+N', 'New Request'], ['Ctrl+Shift+N', 'New Folder'], ['Ctrl+O', 'Import Collection…'], ['Ctrl+Shift+I', 'Import cURL…'], ['Ctrl+Shift+E', 'Export Collection…'],
  ['Ctrl+S', 'Save'], ['Ctrl+Shift+S', 'Save All'], ['Ctrl+Z', 'Undo in the focused part: the request list or the open request'], ['Ctrl+Shift+Z  Ctrl+Y', 'Redo in the focused part'], ['Ctrl+Alt+Z', 'Undo for the whole app'], ['Ctrl+Alt+Shift+Z', 'Redo for the whole app'],
  ['F2  Ctrl+E', 'Rename'], ['Ctrl+D', 'Duplicate'], ['Del  Ctrl+Backspace', 'Delete Selected Items'], ['Ctrl+C  Ctrl+X  Ctrl+V', 'Copy, cut and paste items in the list (a curl command is imported as a request)'], ['Ctrl+A', 'Select all'], ['↑ ↓ ← →', 'Move through the list (⇧ extends the selection)'],
  ['Shift-click  Ctrl-click', 'Select several: ⇧-click selects a range, ⌘-click adds or removes'], ['Del  Ctrl+Backspace', 'Delete the selected executions in History'], ['Ctrl+F', 'Find'], ['Ctrl+Shift+F', 'Search Collections'], ['Ctrl+G', 'Next Match'], ['Ctrl+Shift+G', 'Previous Match'], ['Ctrl+/', 'Comment / uncomment lines'],
  ['Ctrl+1', 'Request'], ['Ctrl+2', 'Runner'], ['Ctrl+3', 'Globals'], ['Ctrl+4', 'Log'], ['Ctrl+P', 'Settings'], ['F1', 'Keyboard Shortcuts']];
const winKeys = t => t.replace(/⇧-click/g, 'Shift-click').replace(/⌘-click/g, 'Ctrl-click').replace(/⇧/g, 'Shift');
function hotkeysView() {
  return h('div', { style: { padding: '16px', overflow: 'auto', height: '100vh' } }, HOT.map(([k, w]) => h('div', { class: 'kbdrow' }, h('span', { class: 'k' }, k), h('span', { style: { flex: 1 } }, winKeys(LM(w))))));
}


// ---------- optional reversed wheel / touchpad scrolling (setting "invertScroll"; off by default = the system direction) ----------
let invertOn = false;
function scrollableAt(el, dx, dy) {
  for (; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el); const oy = /(auto|scroll)/.test(cs.overflowY), ox = /(auto|scroll)/.test(cs.overflowX);
    if (dy && oy && el.scrollHeight > el.clientHeight + 1 && (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return el;
    if (dx && ox && el.scrollWidth > el.clientWidth + 1 && (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1)) return el;
  }
  return null;
}
function onWheelInvert(e) {
  if (!invertOn || e.ctrlKey || e.defaultPrevented) return;
  const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1;
  let dx = -e.deltaX * k, dy = -e.deltaY * k; if (e.shiftKey && !dx) { dx = dy; dy = 0; }
  const el = scrollableAt(e.target, dx, dy); e.preventDefault(); if (el) el.scrollBy(dx, dy);
}
function setInvertScroll(on) { invertOn = !!on; }
window.addEventListener('wheel', onWheelInvert, { capture: true, passive: false });

// ---------- colour themes ----------
const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['midnight', 'Midnight blue'], ['sepia', 'Sepia']];
const thTr = k => (window.THEME_TR ? window.THEME_TR.TH(T.lang, k) : k);
function applyTheme(id, persist = true) {
  if (!THEMES.some(t => t[0] === id)) id = 'dark';
  document.documentElement.dataset.theme = id; S.settings.theme = id; try { pw.winTheme(id); } catch {}
  if (persist) pw.patchSettings({ theme: id });
}
function themeMenu(anchor) {
  closeCtx(); const r = anchor.getBoundingClientRect(); const cur = S.settings.theme || 'dark';
  const m = h('div', { class: 'ctx', id: 'ctx' }, THEMES.map(([id, en]) => h('div', { onClick: () => { closeCtx(); applyTheme(id); } }, h('span', {}, h('span', { class: 'ck' }, cur === id ? '✓' : ''), thTr(en)))));
  document.body.append(m); m.style.left = Math.max(4, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 4)) + 'px'; m.style.top = (r.bottom + 2) + 'px'; armCtx();
}

// ---------- custom title bar with an HTML menu (same colours as the interface) ----------
const IS_MAC = /Mac/i.test(navigator.userAgent);
function menuModel() {
  const A = a => () => window.menuAct && window.menuAct(a), R = r => () => pw.winRole(r), S_ = '-', M = e => MENU_TR.MT(T.lang, e);
  return [
    [M('File'), [[T('btn.newRequest'), 'Ctrl+N', A('newRequest')], [T('btn.newFolder'), 'Ctrl+Shift+N', A('newFolder')], S_, [T('btn.import'), 'Ctrl+O', A('import')], [LM('cURL command…'), 'Ctrl+Shift+I', A('importCurl')], [T('btn.export'), 'Ctrl+Shift+E', A('export')], S_, [T('btn.save'), 'Ctrl+S', A('save')], [LM('Save All'), 'Ctrl+Shift+S', A('saveAll')], [T('btn.settings'), 'Ctrl+P', A('settings')], S_, [M('Exit'), 'Alt+F4', R('quit')]]],
    [M('Edit'), [[M('Cut'), 'Ctrl+X', R('cut')], [M('Copy'), 'Ctrl+C', R('copy')], [M('Paste'), 'Ctrl+V', R('paste')], [LM('Select all'), 'Ctrl+A', R('selectAll')], S_, [T('hot.find'), 'Ctrl+F', A('find')], [LM('Search Collections'), 'Ctrl+Shift+F', A('searchFocus')], [LM('Next Match'), 'Ctrl+G', A('next')], [LM('Previous Match'), 'Ctrl+Shift+G', A('prev')]]],
    [M('Run'), [[LM('Run Selected'), 'Ctrl+R', A('run')], [LM('Stop'), 'Ctrl+.', A('stop')], [LM('Pause'), 'Ctrl+Shift+P', A('pause')], S_, [LM('Request'), 'Ctrl+1', A('tab1')], [LM('Runner'), 'Ctrl+2', A('tab2')], [LM('Globals'), 'Ctrl+3', A('tab3')], [LM('Log'), 'Ctrl+4', A('tab4')]]],
    [M('Window'), [[M('Full screen'), 'F11', R('fullscreen')], S_, ...THEMES.map(([id, en]) => [((S.settings.theme || 'dark') === id ? '✓  ' : '      ') + thTr(en), '', () => applyTheme(id)]), S_, [M('Minimize'), '', R('minimize')], [M('Maximize / restore'), '', R('maximize')], S_, [LM('Keyboard Shortcuts'), 'F1', R('hotkeys')]]],
  ];
}
function titleBar() {
  if (IS_MAC) { document.body.classList.add('native-frame'); return null; }
  let open = -1; const bar = h('div', { id: 'titlebar' }); const titles = [];
  const close = () => { open = -1; document.getElementById('menudrop')?.remove(); titles.forEach(t => t.classList.remove('on')); document.removeEventListener('mousedown', outside, true); };
  const outside = e => { if (!e.target.closest || !e.target.closest('#menubar,#menudrop')) close(); };
  const show = i => { document.getElementById('menudrop')?.remove(); titles.forEach((t, j) => t.classList.toggle('on', j === i)); open = i; const m = menuModel()[i][1], tb = titles[i].getBoundingClientRect();
    const dd = h('div', { id: 'menudrop', class: 'ctx' }, m.map(it => it === '-' ? h('hr') : h('div', { class: 'mi', onMouseDown: e => e.preventDefault(), onClick: () => { close(); it[2](); } }, h('span', {}, it[0]), h('span', { class: 'acc' }, it[1]))));
    dd.style.left = tb.left + 'px'; dd.style.top = tb.bottom + 'px'; dd.style.minWidth = '260px'; document.body.append(dd); setTimeout(() => document.addEventListener('mousedown', outside, true), 0); };
  menuModel().forEach(([label], i) => { const t = h('button', { class: 'mt', tabIndex: -1, onMouseDown: e => e.preventDefault(), onClick: () => (open === i ? close() : show(i)), onMouseEnter: () => { if (open >= 0 && open !== i) show(i); } }, label); titles.push(t); });
  const tbtn = h('button', { class: 'themebtn', title: thTr('Theme'), tabIndex: -1, onMouseDown: e => e.preventDefault(), onClick: () => themeMenu(tbtn) }, ic('bulb', 18));
  bar.append(h('div', { class: 'tbicon' }), h('div', { id: 'menubar' }, titles), h('div', { class: 'tbtitle' }, 'Postwoman'), tbtn);
  bar.addEventListener('dblclick', e => { if (e.target === bar || e.target.classList.contains('tbtitle')) pw.winRole('maximize'); });
  return bar;
}

// ---------- shell / bootstrap ----------
function buildShell() {
  const app = document.getElementById('app'); app.textContent = '';
  const q = h('input', { type: 'text', id: 'search', placeholder: LM('Search by name'), value: S.filter.q, spellcheck: false, onInput: e => { S.filter.q = e.target.value; renderTree(); }, onKeydown: e => { if (e.key === 'Enter') { e.preventDefault(); jumpMatch(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape' && S.filter.q) { S.filter.q = ''; q.value = ''; renderTree(); } } });
  const bc = h('label', { class: 'row hint', style: { gap: '5px', padding: '4px 10px 6px' } }, h('input', { type: 'checkbox', checked: S.filter.content, onChange: e => { S.filter.content = e.target.checked; renderTree(); } }), LM('By content'));
  const sbox = h('div', { class: 'sbox' }, ic('search', 14), q, h('span', { id: 'scount', class: 'scount hidden' }), h('button', { id: 'sup', class: 'ib hidden', onClick: () => jumpMatch(-1) }, ic('up', 13)), h('button', { id: 'sdn', class: 'ib hidden', onClick: () => jumpMatch(1) }, ic('down', 13)), h('button', { id: 'sclr', class: 'ib hidden', title: LM('Clear'), onClick: () => { S.filter.q = ''; q.value = ''; renderTree(); q.focus(); } }, ic('closeCircle', 15)));
  const imp = h('button', { class: 'bl', onClick: e => importMenu(e.currentTarget) }, ic('import', 15), LM('Import'), ic('down', 10));
  const side = h('div', { id: 'side', style: { width: (S.settings.sideWidth || 300) + 'px' } }, sbox, bc, h('div', { id: 'tree' }),
    h('div', { class: 'sbar' }, h('button', { class: 'bl', onClick: newRequest }, ic('plus', 15), LM('New Request')), imp, h('span', { class: 'grow' }), h('button', { class: 'ib', title: LM('Settings'), onClick: () => openSettings() }, ic('gear', 17))));
  const sp = h('div', { id: 'splitter' }); sp.addEventListener('mousedown', e => { e.preventDefault(); const mv = ev => { const w = Math.min(innerWidth * .55, Math.max(220, ev.clientX)); side.style.width = w + 'px'; S.settings.sideWidth = Math.round(w); }; const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); pw.patchSettings({ sideWidth: S.settings.sideWidth }); }; document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up); });
  const bar = titleBar(); if (bar) app.append(bar);
  app.append(h('div', { id: 'shell' }, side, sp, h('div', { id: 'main' }, h('div', { id: 'tabs' }), h('div', { id: 'view' })))); treeInit(); renderTabs(); renderTree(); renderView(); updateSearchUi();
}
let wired = false;
async function boot(reload) {
  const init = await pw.init(); S.col = init.collection; S.globals = init.globals; S.settings = init.settings; applyTheme(S.settings.theme || 'dark', false); setInvertScroll(S.settings.invertScroll); S.version = init.version; S.build = init.build; S.failedPaths = init.failedPaths || []; S.defaultStoragePath = init.defaultStoragePath || '';
  if (!reload) LOG.entries = init.logs || []; setLang(init.lang); S.baseline.clear(); S.saved.clear();
  (function fix(items) { for (const n of items) { if (isFolder(n)) { n._pw = n._pw || { headers: [] }; n.id = n.id || uuid(); fix(n.item); } else { n.id = n.id || uuid(); ensureReq(n); rememberSaved(n); } } })(S.col.item);
  S.col.item.filter(isFolder).slice(0, 1).forEach(f => S.expanded.add(f.id));
  if (!reload) { document.title = 'Postwoman'; } buildShell();
}
function wireEvents() {
  if (wired) return; wired = true;
  pw.onLog(e => { LOG.entries.push(e); if (LOG.entries.length > 8000) LOG.entries.splice(0, 1000); addLogLine(e); });
  pw.onPaths(f => { S.failedPaths = f; renderTabs(); });
  pw.onGlobals(g => { S.globals = g; if (S.tab === 'globals') renderView(); });
  pw.onRunState(s => { if (s.source === 'runner' || RS.state !== 'idle' && s.source !== 'single') { RS.state = s.state; RS.total = s.total ?? RS.total; RS.done = s.done ?? RS.done; const st = document.getElementById('runstate'); if (st) { st.textContent = `${T('runner.state.' + RS.state)} — ${RS.done}/${RS.total}`; const pb = document.getElementById('progbar'); if (pb) pb.style.width = (RS.total ? RS.done / RS.total * 100 : 0) + '%'; } if (S.tab === 'runner' && ['paused', 'running', 'stopped', 'finished'].includes(s.state) && !s.done !== undefined) { /* buttons refresh below */ } } });
  pw.onRunRecord(rec => {
    rec._arrived = Date.now();
    if (rec.source === 'single') { S.results.set(rec.requestId, rec); const a = activeReq(); if (a && a.id === rec.requestId) { S.resultOpen = true; if (!resultEl || !resultEl.isConnected) renderView(false); else renderResult(); if (rec.visualizer && resultEl) resultEl.setTab('visualize'), renderResult(); } return; }
    RS.records.push(rec); if (RS.listEl && RS.listEl.isConnected) { RS.listEl.append(runnerRow(rec, RS.records.length - 1)); RS.followList.after(); }
  });
  pw.onRunFinished(r => {
    if (r.source === 'single') { S.running = false; return; }
    RS.state = r.error ? 'stopped' : (RS.state === 'stopped' ? 'stopped' : 'finished'); RS.failedRows = r.failedRows || []; if (!r.error && r.done === r.total && RS.state !== 'stopped') { RS.rows = null; RS.fileName = ''; } if (S.tab === 'runner') renderView();
  });
  const goTab = k => { S.tab = k; renderTabs(); renderView(); };
  window.menuAct = a => ({ newRequest, newFolder, import: importCollectionFile, importCurl: curlImportDlg, export: () => pw.exportCollection(S.col), save: () => saveRequest(activeReq()), saveAll, settings: () => openSettings(), run: runSelected, stop: () => pw.runStop(), pause: togglePause, tab1: () => goTab('request'), tab2: () => goTab('runner'), tab3: () => goTab('globals'), tab4: () => goTab('log'), searchFocus: () => { const e = document.getElementById('search'); e.focus(); e.select(); }, next: () => jumpMatch(1), prev: () => jumpMatch(-1), find: () => { const el = document.activeElement; const inst = (el && el.__inst) || document.querySelector('.ce-ta,.vv-sc')?.__inst; inst && inst.openFind(); } }[a] || (() => {}))(); pw.onMenu(window.menuAct);
  pw.onRequestClose(handleClose);
  // remember which pane (list / request window) was used last: the focused element can vanish on re-render (e.g. after rename Enter)
  const paneOf = t => (t && t.closest) ? (t.closest('#side') ? 'list' : t.closest('#view') ? 'request' : null) : null;
  for (const ev of ['mousedown', 'focusin']) document.addEventListener(ev, e => { const p = paneOf(e.target); if (p) S.pane = p; }, true);
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey; if (document.getElementById('modal')) return; const inSide = paneOf(e.target) ? paneOf(e.target) === 'list' : S.pane === 'list';
    // Windows: Ctrl+Alt == AltGr on many layouts (Polish ż, etc.) - never steal those keystrokes
    const altGr = e.altKey && e.getModifierState && e.getModifierState('AltGraph');
    if (mod && !altGr && (e.code === 'KeyZ' || e.code === 'KeyY')) { const scope = e.altKey ? null : (inSide ? 'list' : 'request'); e.preventDefault(); (e.code === 'KeyY' || e.shiftKey) ? doRedo(scope) : doUndo(scope); return; }
    if (mod && e.key === 'Enter' && S.tab === 'request') { e.preventDefault(); sendRequest(activeReq()); return; }
    if (mod && e.code === 'KeyW') { const r = activeReq(); if (r && isDraft(r) && S.tab === 'request') { e.preventDefault(); listEdit('close draft', () => { const l = locate(r.id); l.list.splice(l.index, 1); }); S.activeId = null; S.sel.clear(); renderView(); } return; }
    if (mod && e.shiftKey && e.code === 'KeyF') { e.preventDefault(); const s = document.getElementById('search'); s.focus(); s.select(); return; }
    if (mod && e.code === 'KeyR' && !e.shiftKey) { e.preventDefault(); runSelected(); return; }
    if (mod && !e.altKey && !e.shiftKey && e.code === 'Period') { e.preventDefault(); pw.runStop(); return; }
    if (mod && e.shiftKey && e.code === 'KeyP') { e.preventDefault(); togglePause(); return; }
    if (mod && e.shiftKey && e.code === 'KeyS') { e.preventDefault(); saveAll(); return; }
    if (mod && e.shiftKey && e.code === 'KeyI') { e.preventDefault(); curlImportDlg(); return; }
    if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyG') { e.preventDefault(); jumpMatch(1); return; }
    if (mod && !e.altKey && e.shiftKey && e.code === 'KeyG') { e.preventDefault(); jumpMatch(-1); return; }
    if (mod && !e.altKey && !e.shiftKey && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); goTab(['request', 'runner', 'globals', 'log'][+e.code.slice(5) - 1]); return; }
  });
}
(async function main() {
  const view = new URLSearchParams(location.search).get('view');
  if (view === 'hotkeys') { const init = await pw.init(); setLang(init.lang); document.title = T('hot.title'); document.getElementById('app').append(hotkeysView()); return; }
  wireEvents(); await boot();
})();
