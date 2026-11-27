'use strict';
/* ===== Postwoman renderer core: state, undo scopes, persistence, tree, request editor ===== */
const S = { col: null, globals: [], settings: {}, version: '', build: '', sel: new Set(), anchor: null, activeId: null, expanded: new Set(), tab: 'request',
  failedPaths: [], baseline: new Map(), filter: { q: '', content: false }, results: new Map(), curlOpen: false, resultOpen: true, renaming: null, running: false, focusMemo: new Map(), runnerFile: null };
let T = I18N.make('en'); window.T = T;
function setLang(code) { T = I18N.make(code); window.T = T; document.documentElement.lang = code; document.documentElement.dir = T.rtl ? 'rtl' : 'ltr'; }
const lc = s => String(s ?? '').toLowerCase();
const clone = o => JSON.parse(JSON.stringify(o));
const isFolder = n => Array.isArray(n.item);
const uuid = () => crypto.randomUUID();
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
// ---------- texts taken over from the macOS version (keys are the English texts of its Localizable.strings) ----------
const LM = (s, ...a) => { const code = T.lang === 'zh' ? 'zh-Hans' : T.lang; const m = (window.LANG_MAC || {})[code]; let out = (m && m[s] != null) ? m[s] : (s === 'Globals' ? 'Variables' : s); let i = 0; return out.replace(/%(?:(\d+)\$)?(?:@|ld)/g, (x, p) => String(a[p ? p - 1 : i++] ?? '')); };
const tabStrip = (items, cur, onSel) => h('div', { class: 'tabstrip' }, items.map(([k, l]) => h('button', { class: 'tab' + (cur === k ? ' on' : ''), onClick: () => onSel(k) }, l)));
const iconBtn = (name, title, fn, cls = '', size = 16) => h('button', { class: 'ib ' + cls, title, onClick: fn }, ic(name, size));
function popMenu(anchor, entries) { closeCtx(); const r = anchor.getBoundingClientRect(); const m = h('div', { class: 'ctx', id: 'ctx' }, entries.map(([label, fn]) => h('div', { onClick: () => { closeCtx(); fn(); } }, h('span', {}, label)))); m.style.left = Math.min(r.left, innerWidth - 230) + 'px'; document.body.append(m); const hh = m.offsetHeight; m.style.top = (r.top - hh - 4 > 0 ? r.top - hh - 4 : r.bottom + 4) + 'px'; armCtx(); }
Object.assign(S, { matches: [], matchSet: new Set(), matchIdx: 0, clip: [], clipCut: false, folderMode: new Map() });
const log = (level, scope, msg) => { try { console[level === 'error' ? 'error' : 'log'](`[${scope}] ${msg}`); } catch {} };

// ---------- tree model helpers ----------
function locate(id, items = S.col.item, parent = null, parents = []) {
  for (let i = 0; i < items.length; i++) { const n = items[i]; if (n.id === id) return { node: n, list: items, index: i, parent, parents };
    if (isFolder(n)) { const r = locate(id, n.item, n, [...parents, n]); if (r) return r; } }
  return null;
}
const node = id => (locate(id) || {}).node;
const activeReq = () => { const n = S.activeId && node(S.activeId); return n && !isFolder(n) ? n : null; };
function allRequests(n) { const o = []; (function r(x) { if (isFolder(x)) x.item.forEach(r); else o.push(x); })(n); return o; }
const allNodes = () => { const o = []; (function r(items) { for (const n of items) { o.push(n); if (isFolder(n)) r(n.item); } })(S.col.item); return o; };
function ensureReq(r) { r.request = r.request || { method: 'GET', url: { raw: '' }, header: [], body: { mode: 'raw', raw: '', options: { raw: { language: 'json' } } } };
  if (typeof r.request.url === 'string') r.request.url = { raw: r.request.url }; r.request.header = r.request.header || []; r.request.body = r.request.body || { mode: 'raw', raw: '', options: { raw: { language: 'json' } } };
  r._pw = r._pw || {}; r.event = r.event || []; return r; }
function newReqItem(name) { return ensureReq({ id: uuid(), name: name || T('req.newName'), request: { method: 'GET', url: { raw: '' }, header: [], body: { mode: 'raw', raw: '', options: { raw: { language: 'json' } } } }, event: [], _pw: { draft: true } }); }
const reqUrl = r => (typeof r.request.url === 'string' ? r.request.url : r.request.url.raw) || '';
const setUrl = (r, v) => { r.request.url = { raw: v }; };
function script(r, listen) { const e = r.event.find(x => x.listen === listen); return e ? (Array.isArray(e.script.exec) ? e.script.exec.join('\n') : String(e.script.exec || '')) : ''; }
function setScript(r, listen, text) { let e = r.event.find(x => x.listen === listen); if (!text.trim()) { r.event = r.event.filter(x => x.listen !== listen); return; } if (!e) { e = { listen, script: { type: 'text/javascript', exec: [] } }; r.event.push(e); } e.script.exec = text.split('\n'); }
function folderHeadersFor(id) { const loc = locate(id); if (!loc) return []; const m = new Map(); for (const f of loc.parents) for (const hd of (f._pw?.headers || [])) if (!hd.disabled && hd.key) m.set(lc(hd.key), { ...hd, from: f.name }); return [...m.values()]; }
const MANDATORY = new Set(['host', 'content-length']);
function hostOf(u) { const m = /^(?:[a-z]+:\/\/)?([^\/?#]+)/i.exec(u.replace(/\{\{[^}]*\}\}/g, 'x')); return m ? m[1] : ''; }
function autoHeaders(r) {
  const user = new Set(r.request.header.filter(x => !x.disabled).map(x => lc(x.key))), del = new Set((r._pw.deletedAuto || []).map(lc)); const body = r.request.body || { mode: 'none' };
  const L = [{ key: 'Host', value: hostOf(reqUrl(r)) || '<calculated when request is sent>' }];
  if (body.mode !== 'none') L.push({ key: 'Content-Length', value: '<calculated when request is sent>' });
  if (body.mode === 'raw') { const g = body.options?.raw?.language; L.push({ key: 'Content-Type', value: g === 'json' ? 'application/json' : g === 'xml' ? 'application/xml' : g === 'html' ? 'text/html' : g === 'javascript' ? 'application/javascript' : 'text/plain' }); }
  else if (body.mode === 'urlencoded') L.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
  else if (body.mode === 'formdata') L.push({ key: 'Content-Type', value: 'multipart/form-data; boundary=<calculated when request is sent>' });
  L.push({ key: 'User-Agent', value: `Postwoman/${S.version}` }, { key: 'Accept', value: '*/*' }, { key: 'Accept-Encoding', value: 'gzip, deflate, br' }, { key: 'Connection', value: 'keep-alive' });
  return L.filter(x => !user.has(lc(x.key)) && (MANDATORY.has(lc(x.key)) || !del.has(lc(x.key)))).map(x => ({ ...x, mandatory: MANDATORY.has(lc(x.key)) }));
}
function effectiveRequest(r) { // what is sent (for cURL), headers resolved
  const inh = folderHeadersFor(r.id).filter(x => !r.request.header.some(o => !o.disabled && lc(o.key) === lc(x.key)));
  const hs = [...inh.map(x => ({ key: x.key, value: x.value })), ...r.request.header.filter(x => !x.disabled && x.key), ...autoHeaders(r).filter(x => !x.mandatory && !/<calculated/.test(x.value))];
  const b = r.request.body || { mode: 'none' };
  return { method: r.request.method, url: reqUrl(r), headers: hs, body: b.mode === 'formdata' || b.mode === 'urlencoded' || b.mode === 'raw' ? b : (b.mode === 'binary' || b.mode === 'file' ? { mode: 'file', src: b.src || b.file?.src } : { mode: 'none' }) };
}

// ---------- undo scopes ----------
const U = { log: [], undone: [] }; // entries: {scope, undo(), redo(), done:true}
function pushUndo(e) { e.done = true; e.t = Date.now(); U.log.push(e); U.undone = U.undone.filter(x => x.scope !== e.scope); if (U.log.length > 500) U.log.splice(0, 100); pwLog('debug', 'undo', `record scope=${e.scope} ${e.label || ''}`); }
function undoEntry(e) { e.undo(); e.done = false; U.undone.push(e); pwLog('info', 'undo', `undo scope=${e.scope} ${e.label || ''}`); afterUndo(e); }
function redoEntry(e) { e.redo(); e.done = true; U.undone = U.undone.filter(x => x !== e); U.log.push(e); pwLog('info', 'undo', `redo scope=${e.scope} ${e.label || ''}`); afterUndo(e); }
function doUndo(scope) { const e = [...U.log].reverse().find(x => x.done && (!scope || x.scope === scope)); if (!e) return false; undoEntry(e); return true; }
function doRedo(scope) { const e = [...U.undone].reverse().find(x => !scope || x.scope === scope); if (!e) return false; redoEntry(e); return true; }
function afterUndo(e) { if (e.scope === 'list') { renderTree(); } else { renderView(); } renderTree(); markChanged(e.reqId); }
function pwLog(level, scope, msg) { log(level, scope, msg); }
// tree structure snapshots (keep node object references so deleted nodes can be restored)
const skel = items => items.map(n => ({ n, name: n.name, kids: isFolder(n) ? skel(n.item) : null }));
function restoreSkel(list, items) { items.length = 0; for (const s of list) { s.n.name = s.name; if (s.kids) restoreSkel(s.kids, s.n.item); items.push(s.n); } }
function listEdit(label, fn) {
  const before = skel(S.col.item); fn(); let after = skel(S.col.item);
  pushUndo({ scope: 'list', label, undo() { after = skel(S.col.item); restoreSkel(before, S.col.item); }, redo() { restoreSkel(after, S.col.item); } });
  markStructure();
}
// request edits: snapshot-based, coalesced bursts
let lastTouch = { id: null, t: 0 };
function reqTouch() {
  const r = activeReq(); if (!r) return; const now = Date.now();
  if (lastTouch.id === r.id && now - lastTouch.t < 900) { lastTouch.t = now; markChanged(r.id); return; }
  lastTouch = { id: r.id, t: now }; const before = clone(r), id = r.id; let redoState = null;
  const swap = state => { const t = node(id); if (!t) return; const keep = t.id; for (const k of Object.keys(t)) delete t[k]; Object.assign(t, clone(state)); t.id = keep; };
  pushUndo({ scope: 'request', reqId: id, label: r.name, undo() { const t = node(id); redoState = clone(t); swap(before); }, redo() { swap(redoState); } });
  markChanged(id);
}

// ---------- persistence / dirty ----------
const stripForCmp = r => JSON.stringify({ n: r.name, r: r.request, e: r.event, p: { d: r._pw?.deletedAuto || [], h: r._pw?.disabledParams || [] } });
const isDraft = r => !!r._pw?.draft;
const isDirty = r => isDraft(r) || (S.baseline.get(r.id) !== stripForCmp(r));
function snapshotForSave() {
  const c = clone(S.col);
  (function prune(items) { for (let i = items.length - 1; i >= 0; i--) { const n = items[i]; if (isFolder(n)) prune(n.item); else if (isDraft(n)) items.splice(i, 1); else if (!S.settings.autosave) { const cur = stripForCmp(n); if (S.baseline.get(n.id) !== cur && S.saved && S.saved.has(n.id)) items[i] = clone(S.saved.get(n.id)); } } })(c.item);
  return c;
}
S.saved = new Map(); // last persisted snapshot of each request (used when autosave is off)
function rememberSaved(r) { S.baseline.set(r.id, stripForCmp(r)); S.saved.set(r.id, clone(r)); }
async function persistNow() { await pw.saveCollection(snapshotForSave()); if (S.settings.autosave) allRequests({ item: S.col.item }).forEach(r => { if (!isDraft(r)) rememberSaved(r); }); renderTree(); }
const schedulePersist = debounce(persistNow, 500);
function refreshReqTabs() { try { const a = activeReq(); if (a && reqPane && reqPane.tabs) paintReqTabs(a); } catch {} }
function markChanged(id) { refreshReqTabs(); if (S.settings.autosave) { const r = id && node(id); if (r && !isFolder(r) && !isDraft(r)) schedulePersist(); } renderTreeLight(); }
function markStructure() { allRequests({ item: S.col.item }).forEach(r => { if (!S.baseline.has(r.id) && !isDraft(r)) rememberSaved(r); }); schedulePersist(); renderTree(); }
async function saveRequest(r) {
  if (!r) return; if (isDraft(r)) { const name = await promptDlg(T('req.saveAs'), r.name || T('req.newName')); if (name == null) return; r.name = name.trim() || T('req.newName'); delete r._pw.draft; }
  rememberSaved(r); await persistNow(); toast(T('btn.save') + ' ✓'); renderView();
}
const dirtyList = () => allRequests({ item: S.col.item }).filter(isDirty);

// ---------- tree rendering ----------
const treeEl = () => document.getElementById('tree');
function filtered() {
  const q = S.filter.q.trim(); S.matches = []; S.matchSet = new Set(); if (!q) return null; const vs = queryVariants(q); const hit = t => vs.some(v => lc(t).includes(v));
  const contentOf = r => [reqUrl(r), JSON.stringify(r.request.header), JSON.stringify(r.request.body), script(r, 'prerequest'), script(r, 'test')].join('\n');
  const keep = new Set(), hits = [];
  (function mark(items, ancestorHit, ancestors) { for (const n of items) {
    if (isFolder(n)) { const selfHit = !S.filter.content && hit(n.name); if (selfHit) hits.push(n.id); if (selfHit || ancestorHit) keep.add(n.id); mark(n.item, ancestorHit || selfHit, [...ancestors, n]); }
    else { const own = S.filter.content ? hit(contentOf(n)) : hit(n.name); if (own) hits.push(n.id); if (ancestorHit || own) { keep.add(n.id); ancestors.forEach(a => keep.add(a.id)); } } } })(S.col.item, false, []);
  S.matches = hits; S.matchSet = new Set(hits); if (S.matchIdx >= hits.length) S.matchIdx = 0; return keep;
}
function updateSearchUi() {
  const on = !!S.filter.q.trim(); const c = document.getElementById('scount'); if (!c) return;
  ['scount', 'sup', 'sdn', 'sclr'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.toggle('hidden', !on); });
  c.textContent = S.matches.length ? `${S.matchIdx + 1} / ${S.matches.length}` : '0'; c.classList.toggle('none', !S.matches.length);
  ['sup', 'sdn'].forEach(id => { const e = document.getElementById(id); if (e) e.disabled = !S.matches.length; });
  const q = document.getElementById('search'); if (q) q.placeholder = S.filter.content ? (T.lang === 'ru' ? 'Поиск по URL, заголовкам, телам, скриптам' : T.lang === 'en' ? 'Search URLs, headers, bodies, scripts' : LM('Search names, URLs, headers, bodies')) : LM('Search by name');
}
function jumpMatch(d) {
  if (!S.matches.length) return; const had = document.activeElement && document.activeElement.id === 'search';
  S.matchIdx = (S.matchIdx + d + S.matches.length) % S.matches.length; const id = S.matches[S.matchIdx];
  S.sel = new Set([id]); S.anchor = id; S.activeId = id; renderTabs(); renderView(); renderTree(); scrollToNode(id);
  if (had) setTimeout(() => { const q = document.getElementById('search'); if (q) q.focus(); }, 30);
}
function renderTree() {
  const el = treeEl(); if (!el) return; const keep = filtered(); el.textContent = ''; const rows = [];
  (function rec(items, depth) { for (const n of items) { if (keep && !keep.has(n.id)) continue; rows.push([n, depth]); if (isFolder(n) && (S.expanded.has(n.id) || keep)) rec(n.item, depth + 1); } })(S.col.item, 0);
  for (const [n, d] of rows) el.append(nodeRow(n, d));
  if (S.renaming) { const i = el.querySelector('.node input'); if (i) { i.focus(); i.select(); } }
  updateSearchUi();
}
function renderTreeLight() { renderTree(); }
function hlName(name, q) {
  const qq = (q || '').trim(); if (!qq) return [name]; const low = name.toLowerCase();
  for (const v of queryVariants(qq)) { const i = low.indexOf(v); if (i >= 0) return [name.slice(0, i), h('mark', {}, name.slice(i, i + v.length)), name.slice(i + v.length)]; }
  return [name];
}
function nodeRow(n, depth) {
  const f = isFolder(n); const sel = S.sel.has(n.id);
  const row = h('div', { class: 'node' + (sel ? ' sel' : '') + (S.activeId === n.id ? ' active' : '') + (S.matchSet.has(n.id) ? ' hit' : ''), 'data-id': n.id, draggable: S.renaming === n.id ? null : 'true', style: { '--d': depth } });
  row.append(h('span', { class: 'tw' }, f ? ic(S.expanded.has(n.id) || S.filter.q ? 'down' : 'right', 12) : null));
  if (f) row.append(h('span', { class: 'fi' }, ic('folder', 15))); else row.append(h('span', { class: 'badge m-' + n.request.method }, n.request.method.slice(0, 7)));
  if (S.renaming === n.id) {
    let done = false; const inp = h('input', { type: 'text', value: n.name });
    const commit = () => { if (done) return; done = true; const v = inp.value.trim(); S.renaming = null; if (v && v !== n.name) listEdit('rename', () => { n.name = v; }); else renderTree(); if (activeReq() && activeReq().id === n.id) renderView(); };
    const cancel = () => { if (done) return; done = true; S.renaming = null; renderTree(); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
    inp.addEventListener('blur', commit); inp.addEventListener('click', e => e.stopPropagation()); inp.addEventListener('dblclick', e => e.stopPropagation()); row.append(inp);
  } else { row.append(h('span', { class: 'nm', title: n.name }, ...hlName(n.name, S.filter.q))); if (!f && isDirty(n)) row.append(h('span', { class: 'dirty-dot', title: T('req.unsaved') })); }
  if (f && (n._pw?.headers || []).some(x => x.key)) row.append(h('span', { class: 'hdrmark', title: LM('Headers') }, ic('headerPlus', 13)));
  return row;
}
function selectNode(id, e) {
  const order = [...treeEl().querySelectorAll('.node')].map(x => x.dataset.id);
  if (e && e.shiftKey && S.anchor) { const a = order.indexOf(S.anchor), b = order.indexOf(id); const [lo, hi] = a < b ? [a, b] : [b, a]; if (!(e.ctrlKey || e.metaKey)) S.sel.clear(); order.slice(lo, hi + 1).forEach(x => S.sel.add(x)); }
  else if (e && (e.ctrlKey || e.metaKey)) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); S.anchor = id; }
  else { S.sel = new Set([id]); S.anchor = id; }
  S.activeId = id;
}
function openNode(id) { const n = node(id); if (!n) return; S.activeId = id; if (!isFolder(n)) { S.tab = 'request'; } renderTabs(); renderView(); renderTree(); }
function toggleExpand(id) { S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id); renderTree(); }

// ---------- tree actions ----------
function targetListForNew() { // new items go on TOP of the folder of the current selection (or root)
  const a = S.activeId && locate(S.activeId); if (!a) return { list: S.col.item, folder: null };
  if (isFolder(a.node)) { S.expanded.add(a.node.id); return { list: a.node.item, folder: a.node }; } return { list: a.list, folder: a.parent && a.parent.id ? a.parent : null };
}
function addRequest(r, where) {
  const t = where || targetListForNew(); listEdit('new request', () => { t.list.unshift(r); }); if (t.folder) { S.expanded.add(t.folder.id); locate(r.id).parents.forEach(p => S.expanded.add(p.id)); }
  S.sel = new Set([r.id]); S.anchor = r.id; S.activeId = r.id; S.tab = 'request'; renderTabs(); renderView(); renderTree(); scrollToNode(r.id); setTimeout(() => { const u = document.getElementById('urlin'); if (u) u.focus(); }, 30);
}
function newRequest() { const r = newReqItem(); addRequest(r); pwLogMain('info', 'tree', 'new request (draft)'); }
function newFolder() {
  const t = targetListForNew(); const f = { id: uuid(), name: T('req.folderName'), item: [], _pw: { headers: [] } };
  listEdit('new folder', () => t.list.unshift(f)); if (t.folder) S.expanded.add(t.folder.id); S.sel = new Set([f.id]); S.anchor = f.id; S.activeId = f.id; S.renaming = f.id; renderTabs(); renderView(); renderTree(); scrollToNode(f.id);
}
function scrollToNode(id) { const el = treeEl().querySelector(`[data-id="${id}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
function startRename(id) { id = id || S.activeId; if (!id) return; S.renaming = id; renderTree(); }
function dupNode(id) { const l = locate(id); if (!l) return; const copy = clone(l.node); (function re(n) { n.id = uuid(); if (isFolder(n)) n.item.forEach(re); else { n._pw = n._pw || {}; delete n._pw.draft; } })(copy); copy.name += ' copy'; listEdit('duplicate', () => l.list.splice(l.index + 1, 0, copy)); S.sel = new Set([copy.id]); S.activeId = copy.id; renderTree(); renderView(); }
async function deleteNodes(ids) {
  ids = ids && ids.length ? ids : [...S.sel]; if (!ids.length) return; const names = ids.map(i => node(i)?.name).filter(Boolean);
  if (!ids.every(i => { const n = node(i); return n && !isFolder(n) && isDraft(n); })) { if (!await confirmDlg(T('dlg.confirmDelete', names.length > 1 ? names.length + ' items' : names[0]))) return; }
  listEdit('delete', () => { for (const id of ids) { const l = locate(id); if (l) l.list.splice(l.index, 1); } }); S.sel.clear(); if (!locate(S.activeId || '')) S.activeId = null; renderView(); renderTree();
}
function moveNodes(ids, targetId, zone) {
  const tl = locate(targetId); if (!tl) return; ids = ids.filter(i => i !== targetId && !(locate(i) && (function inside(n) { return isFolder(n) && (n.id === targetId || n.item.some(inside)); })(locate(i).node)));
  if (!ids.length) return;
  listEdit('move', () => { const moving = ids.map(i => locate(i)).filter(Boolean).map(l => l.node); for (const m of moving) { const l = locate(m.id); l.list.splice(l.index, 1); }
    const t2 = locate(targetId); if (zone === 'in' && isFolder(t2.node)) { t2.node.item.push(...moving); S.expanded.add(t2.node.id); } else t2.list.splice(t2.index + (zone === 'after' ? 1 : 0), 0, ...moving); });
}
// update selection classes in place: rebuilding rows on mousedown detached the click target (click never opened the request) and killed drag start
function syncTreeClasses() { treeEl().querySelectorAll('.node').forEach(r => { r.classList.toggle('sel', S.sel.has(r.dataset.id)); r.classList.toggle('active', S.activeId === r.dataset.id); }); }
function treeInit() {
  const el = treeEl(); let drag = null;
  el.addEventListener('mousedown', e => { const row = e.target.closest('.node'); if (!row || e.target.tagName === 'INPUT') return; if (e.button === 2 && S.sel.has(row.dataset.id)) return; if (e.target.classList.contains('tw')) return; selectNode(row.dataset.id, e); S.activeId = row.dataset.id; syncTreeClasses(); });
  el.addEventListener('click', e => { const row = e.target.closest('.node'); if (!row) return; const n = node(row.dataset.id); if (e.target.classList.contains('tw') && isFolder(n)) { toggleExpand(n.id); return; } if (e.shiftKey || e.ctrlKey || e.metaKey) return; if (!isFolder(n)) { openNode(n.id); } else { renderTabs(); renderView(); } });
  el.addEventListener('dblclick', e => { const row = e.target.closest('.node'); if (!row) return; const n = node(row.dataset.id); if (isFolder(n)) toggleExpand(n.id); });
  el.addEventListener('contextmenu', e => { e.preventDefault(); const row = e.target.closest('.node'); if (row) { if (!S.sel.has(row.dataset.id)) { S.sel = new Set([row.dataset.id]); S.anchor = row.dataset.id; } S.activeId = row.dataset.id; renderTree(); } ctxMenu(e.clientX, e.clientY, row ? row.dataset.id : null); });
  el.addEventListener('dragstart', e => { const row = e.target.closest('.node'); if (!row) return; const id = row.dataset.id; drag = S.sel.has(id) ? [...S.sel] : [id]; e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; });
  const clr = () => el.querySelectorAll('.dt,.db,.di').forEach(x => x.classList.remove('dt', 'db', 'di'));
  el.addEventListener('dragover', e => { const row = e.target.closest('.node'); if (!row || !drag) return; e.preventDefault(); clr(); const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height; const f = isFolder(node(row.dataset.id)); row.classList.add(y < .28 ? 'dt' : y > .72 && !f ? 'db' : f ? 'di' : (y < .5 ? 'dt' : 'db')); });
  el.addEventListener('dragleave', e => { if (e.target === el) clr(); });
  el.addEventListener('drop', e => { e.preventDefault(); const row = e.target.closest('.node'); clr(); if (!row || !drag) return; const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height; const f = isFolder(node(row.dataset.id)); const zone = y < .28 ? 'before' : (f ? 'in' : (y < .5 ? 'before' : 'after')); moveNodes(drag, row.dataset.id, zone); drag = null; });
  el.addEventListener('dragend', () => { clr(); drag = null; });
  el.tabIndex = 0;
  el.addEventListener('keydown', e => {
    if (S.renaming) return; const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyC') { e.preventDefault(); copyNodes(false); }
    else if (mod && e.code === 'KeyX') { e.preventDefault(); copyNodes(true); }
    else if (mod && e.code === 'KeyV') { e.preventDefault(); pasteNodes(); }
    else if (mod && e.code === 'KeyA') { e.preventDefault(); S.sel = new Set([...treeEl().querySelectorAll('.node')].map(x => x.dataset.id)); syncTreeClasses(); }
    else if (e.key === 'F2' || (mod && e.code === 'KeyE')) { e.preventDefault(); startRename(); }
    else if (mod && e.code === 'KeyD') { e.preventDefault(); [...S.sel].forEach(dupNode); }
    else if (e.key === 'Delete') { e.preventDefault(); deleteNodes(); }
    else if (e.key === 'Enter') { e.preventDefault(); const n = node(S.activeId); if (n && isFolder(n)) toggleExpand(n.id); else if (n) openNode(n.id); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const order = [...el.querySelectorAll('.node')].map(x => x.dataset.id); let i = order.indexOf(S.activeId); i = Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); selectNode(order[i], e); renderTree(); scrollToNode(order[i]); const n = node(order[i]); if (n && !isFolder(n)) { renderTabs(); renderView(); } }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = node(S.activeId); if (n && isFolder(n)) { e.key === 'ArrowRight' ? S.expanded.add(n.id) : S.expanded.delete(n.id); renderTree(); } }
  });
}
function copyNodes(cut) { const ids = [...S.sel].filter(i => locate(i)); if (!ids.length) return; S.clip = ids.map(i => ({ id: i, node: clone(locate(i).node) })); S.clipCut = cut; pwLogMain('info', 'tree', `${cut ? 'cut' : 'copy'} ${ids.length} item(s)`); }
async function pasteNodes() {
  const t = S.activeId && node(S.activeId);
  if (!S.clip.length) { const txt = await pw.clipboardRead(); if (/^\s*curl\b/i.test(txt || '')) { const r = await pw.importCurl(txt); if (r && !r.__error) addCurlRequest(r); } return; }
  if (S.clipCut) { const ids = S.clip.map(c => c.id).filter(i => locate(i)); if (t && ids.length) moveNodes(ids, t.id, isFolder(t) ? 'in' : 'after'); S.clip = []; S.clipCut = false; renderTree(); return; }
  const copies = S.clip.map(c => { const cp = clone(c.node); (function re(m) { m.id = uuid(); if (isFolder(m)) m.item.forEach(re); else { m._pw = m._pw || {}; delete m._pw.draft; } })(cp); return cp; });
  listEdit('paste', () => { if (t && isFolder(t)) { t.item.unshift(...copies); S.expanded.add(t.id); } else if (t) { const l = locate(t.id); l.list.splice(l.index + 1, 0, ...copies); } else S.col.item.unshift(...copies); });
  S.sel = new Set(copies.map(c => c.id)); renderTree();
}
function ctxMenu(x, y, id) {
  closeCtx(); const n = id && node(id); const items = [];
  const it = (label, key, fn, cls) => items.push(h('div', { class: cls || '', onClick: () => { closeCtx(); fn(); } }, h('span', {}, label), h('kbd', {}, key || '')));
  if (n) it(LM('Run'), 'Ctrl+R', () => runSelected());
  it(LM('New Request'), 'Ctrl+N', () => { if (id) { S.activeId = id; } newRequest(); });
  if (!n || isFolder(n)) it(LM('New Folder'), 'Ctrl+Shift+N', () => { if (id) S.activeId = id; newFolder(); });
  if (n) { it(LM('Rename…'), 'F2', () => startRename(id)); it(LM('Copy'), 'Ctrl+C', () => copyNodes(false)); it(LM('Cut'), 'Ctrl+X', () => copyNodes(true)); }
  if (S.clip.length) it(LM('Paste'), 'Ctrl+V', pasteNodes);
  if (n) { it(LM('Duplicate'), 'Ctrl+D', () => [...S.sel].forEach(dupNode));
    if (!isFolder(n)) it(LM('Copy as curl'), '</>', () => copyCurl(n));
    items.push(h('hr')); it(LM('Delete'), 'Del', () => deleteNodes(), 'dst'); }
  const m = h('div', { class: 'ctx', id: 'ctx' }, items); m.style.left = Math.min(x, innerWidth - 230) + 'px'; m.style.top = Math.min(y, innerHeight - items.length * 30 - 20) + 'px'; document.body.append(m);
  armCtx();
}
const armCtx = () => setTimeout(() => { const f = e => { if (!document.getElementById('ctx')) return document.removeEventListener('mousedown', f, true); if (!(e.target.closest && e.target.closest('#ctx'))) { closeCtx(); document.removeEventListener('mousedown', f, true); } }; document.addEventListener('mousedown', f, true); }, 0);
const closeCtx = () => { const c = document.getElementById('ctx'); if (c) c.remove(); };
async function copyCurl(r) { const t = await pw.makeCurl(effectiveRequest(r)); await pw.clipboard(t); toast(T('msg.copied')); }
function pwLogMain(l, s, m) { log(l, s, m); }

// ---------- params <-> URL ----------
function parseQuery(url) { const i = url.indexOf('?'); if (i < 0) return []; const hash = url.indexOf('#', i); const q = url.slice(i + 1, hash < 0 ? undefined : hash); return q ? q.split('&').map(p => { const k = p.indexOf('='); return k < 0 ? { key: p, value: '' } : { key: p.slice(0, k), value: p.slice(k + 1) }; }) : []; }
function baseOf(url) { const i = url.indexOf('?'); const j = url.indexOf('#'); return i >= 0 ? url.slice(0, i) : (j >= 0 ? url.slice(0, j) : url); }
function paramsOf(r) { const en = parseQuery(reqUrl(r)).map(p => ({ ...p, disabled: false })); return [...en, ...(r._pw.disabledParams || []).map(p => ({ ...p, disabled: true }))]; }
function applyParams(r, rows) { const en = rows.filter(p => !p.disabled && (p.key || p.value)); r._pw.disabledParams = rows.filter(p => p.disabled).map(p => ({ key: p.key, value: p.value })); const q = en.map(p => `${p.key}${p.value !== '' || true ? '=' : ''}${p.value}`).join('&'); const u = reqUrl(r), i = u.indexOf('#'); const hash = i >= 0 ? u.slice(i) : ''; setUrl(r, baseOf(u) + (q ? '?' + q : '') + hash); }

// ---------- inputs with {{var}} highlight ----------
function hlInput({ value = '', placeholder = '', onInput, id, type = 'text' } = {}) {
  const pre = h('pre', {}); const inp = h('input', { type, value, placeholder, spellcheck: 'false', id });
  // nosemgrep -- reviewed: HTML is built by paint()/esc() (all text escaped) or from static icon markup; HTML is built by paint()/esc() (all text escaped), static icon markup, or runs inside the sandboxed visualizer iframe (opaque origin, by design)
  const paintIt = () => { pre.innerHTML = paint(inp.value, varTokens(inp.value), []) || ''; pre.scrollLeft = inp.scrollLeft; };
  inp.addEventListener('input', () => { paintIt(); onInput && onInput(inp.value); }); ['scroll', 'keyup', 'click', 'focus', 'mouseup'].forEach(ev => inp.addEventListener(ev, () => { pre.scrollLeft = inp.scrollLeft; }));
  const wrap = h('div', { class: 'hlin' }, pre, inp); wrap.input = inp; wrap.repaint = paintIt; paintIt(); return wrap;
}
// Wrap the selection in { } / {{ }} when "{" (or the key where "{" lives on EN layout, e.g. "Х" on RU) is pressed
let wrapState = null;
document.addEventListener('keydown', e => {
  const el = e.target; if (!(el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ['text', 'search'].includes(el.type)))) return;
  if (el.readOnly) return; const brace = e.key === '{' || (e.code === 'BracketLeft' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey);
  if (!brace) { wrapState = null; return; } const s = el.selectionStart, en = el.selectionEnd;
  if (wrapState && wrapState.el === el && wrapState.s === s && wrapState.e === en) { e.preventDefault(); const v = el.value; el.value = v.slice(0, s - 1) + '{{' + v.slice(s, en) + '}}' + v.slice(en + 1); el.setSelectionRange(s + 1, en + 1); wrapState = null; el.dispatchEvent(new Event('input', { bubbles: true })); return; }
  if (s === en) { wrapState = null; return; }
  e.preventDefault(); const v = el.value; const ins = '{' + v.slice(s, en) + '}'; el.focus();
  if (!document.execCommand('insertText', false, ins)) { el.setRangeText(ins, s, en, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
  el.setSelectionRange(s + 1, en + 1); wrapState = { el, s: s + 1, e: en + 1 };
}, true);
document.addEventListener('mousedown', () => { wrapState = null; }, true);

// ---------- resizable "name" column of the key/value tables ----------
// default width fits the longest name; a width dragged by hand is remembered per request (r._pw.kvw); double click on the bar returns to auto
function kvAutoWidth(keys) {
  const c = kvAutoWidth.cx || (kvAutoWidth.cx = document.createElement('canvas').getContext('2d')); c.font = '13px ' + (getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace');
  let w = 0; for (const k of keys) w = Math.max(w, c.measureText(k || '').width);
  return Math.min(480, Math.max(110, Math.ceil(w) + 34));
}
function kvColumns(tb, widths, getKeys, store) {
  // widths: fixed px / null (flexible) for every column; index 1 is the name column
  const cg = h('colgroup'); const cols = widths.map(w => h('col', { style: w ? { width: w + 'px' } : {} })); cg.append(...cols); tb.prepend(cg); tb.classList.add('kvfix');
  const cur = () => (store && store.get()) || kvAutoWidth(getKeys());
  const apply = () => { cols[1].style.width = cur() + 'px'; };
  const handle = () => {
    const bar = h('div', { class: 'kvres', title: LM('Drag to resize, double click for auto width') });
    bar.addEventListener('pointerdown', e => {
      if (e.button !== 0) return; e.preventDefault(); bar.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = cols[1].getBoundingClientRect().width; const max = Math.max(120, tb.getBoundingClientRect().width * 0.8);
      const mv = ev => { cols[1].style.width = Math.round(Math.min(max, Math.max(60, w0 + ev.clientX - x0))) + 'px'; tb.classList.add('kvdrag'); };
      const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); tb.classList.remove('kvdrag'); const w = Math.round(cols[1].getBoundingClientRect().width); if (store && Math.abs(w - w0) > 1) store.set(w); };
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    bar.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); if (store) store.set(null); apply(); });
    return bar;
  };
  apply(); return { apply, handle, auto: () => !(store && store.get()) };
}
// ---------- request editor ----------
const mkBtn = (label, cls, fn, attrs) => h('button', { class: cls || '', onClick: fn, ...(attrs || {}) }, label);
function kvTable({ rows, onChange, keyPh, valPh, withType, addTitle, store }) {
  const tb = h('table', { class: 'kv' }); const grid = kvColumns(tb, withType ? [24, 0, 76, 0, 30] : [24, 0, 0, 30], () => rows.map(r => r.key), store);
  const draw = () => { [...tb.children].forEach(c => { if (c.tagName !== 'COLGROUP') c.remove(); }); grid.apply();
    rows.forEach((row, i) => {
      const k = hlInput({ value: row.key || '', placeholder: keyPh || T('req.key'), onInput: v => { row.key = v; if (grid.auto()) grid.apply(); onChange(); } });
      const v = row.type === 'file' ? h('div', { class: 'row' }, h('span', { class: 'mono hint grow' }, row.src ? row.src.split(/[\\/]/).pop() : LM('No file selected')), mkBtn(LM('Select file…'), '', async () => { const p = await pw.pickFile(); if (p) { reqTouch(); row.src = p; onChange(); draw(); } })) : hlInput({ value: row.value || '', placeholder: valPh || T('req.value'), onInput: x => { row.value = x; onChange(); } });
      const en = h('input', { type: 'checkbox', checked: !row.disabled, onChange: e => { reqTouch(); row.disabled = !e.target.checked; onChange(); } });
      const ty = withType ? h('select', { onChange: e => { reqTouch(); row.type = e.target.value; onChange(); draw(); } }, [['text', LM('Text')], ['file', LM('File')]].map(([o, l]) => h('option', { value: o, selected: (row.type || 'text') === o }, l))) : null;
      tb.append(h('tr', {}, h('td', { style: { width: '24px' } }, en), h('td', { class: 'kvk' }, k, grid.handle()), ty ? h('td', { style: { width: '76px' } }, ty) : null, h('td', {}, v), h('td', { style: { width: '30px' } }, iconBtn('minus', T('btn.delete'), () => { reqTouch(); rows.splice(i, 1); onChange(); draw(); }, 'danger', 17))));
    });
    tb.append(h('tr', { class: 'addrow' }, h('td'), h('td', { colspan: withType ? 4 : 3 }, h('button', { onClick: () => { reqTouch(); rows.push({ key: '', value: '' }); onChange(); draw(); const ins = tb.querySelectorAll('tr'); const last = ins[ins.length - 2]; if (last) last.querySelector('input[type=text]').focus(); } }, addTitle || LM('Add header')))));
  }; draw(); return tb;
}
function headersTab(r) {
  const wrap = h('div', { class: 'col', style: { gap: '8px' } });
  const draw = () => { wrap.textContent = '';
    const inh = folderHeadersFor(r.id);
    if (inh.length) { const g = h('div', { class: 'gbox' }, h('div', { class: 'gt' }, LM('Inherited from folders (read-only)')));
      for (const x of inh) { const over = r.request.header.some(o => lc(o.key) === lc(x.key)); g.append(h('div', { class: 'lockrow' }, ic('lock', 12), h('span', { class: 'k' }, x.key), h('span', { class: 'v' + (over ? ' over' : ''), title: x.value }, x.value), h('span', { class: 'grow', style: { flex: 1 } }), h('span', { class: 'hint' }, LM('from %@', x.from) + (over ? LM(' · overridden below') : '')))); }
      wrap.append(g); }
    if (r._pw.authError) wrap.append(h('div', { class: 'authbanner' + (r._pw.authAlert ? ' alert' : '') }, h('span', { class: 'status-bad' }, ic('warn', 13), T('req.authError'))));
    const tb = h('table', { class: 'kv' }); const grid = kvColumns(tb, [24, 0, 0, 30], () => r.request.header.map(x => x.key), { get: () => r._pw.kvw, set: w => { if (w) r._pw.kvw = w; else delete r._pw.kvw; reqTouch(); } });
    r.request.header.forEach((row, i) => {
      const k = hlInput({ value: row.key || '', placeholder: T('req.key'), onInput: v => { row.key = v; if (grid.auto()) grid.apply(); reqTouch(); } }); const v = hlInput({ value: row.value || '', placeholder: T('req.value'), onInput: x => { row.value = x; reqTouch(); } });
      const bad = r._pw.authError && lc(row.key) === 'authorization';
      tb.append(h('tr', { 'data-auth': lc(row.key) === 'authorization' ? '1' : null }, h('td', { style: { width: '24px' } }, h('input', { type: 'checkbox', checked: !row.disabled, onChange: e => { reqTouch(); row.disabled = !e.target.checked; draw(); } })), h('td', { class: 'kvk' }, h('div', { class: 'row' }, bad ? h('span', { class: 'errmark', title: T('req.authError') }, ic('warn', 13)) : null, h('div', { class: 'grow' }, k)), grid.handle()), h('td', {}, v), h('td', { style: { width: '30px' } }, iconBtn('minus', T('btn.delete'), () => { reqTouch(); r.request.header.splice(i, 1); draw(); }, 'danger', 17))));
    });
    tb.append(h('tr', { class: 'addrow' }, h('td'), h('td', { colspan: 3 }, h('button', { onClick: () => { reqTouch(); r.request.header.push({ key: '', value: '' }); draw(); const rows = wrap.querySelectorAll('tr'); const l = rows[rows.length - 2]; if (l) l.querySelector('input[type=text]').focus(); } }, LM('Add header')))));
    wrap.append(tb);
    const auto = autoHeaders(r);
    if (auto.length) { const sec = h('div', { class: 'autosec' }, h('div', { class: 'gt' }, LM('Auto-generated headers (added by the runtime when the request is sent)')));
      for (const a of auto) sec.append(h('div', { class: 'lockrow mono', style: { padding: '2px 0' } }, ic('lock', 12), h('span', { class: 'k', style: { width: '150px' } }, a.key), h('span', { class: 'v', title: a.value }, a.value), h('span', { style: { flex: 1 } }),
        mkBtn(LM('Override'), 'bl', () => { reqTouch(); r.request.header.push({ key: a.key, value: /<calculated/.test(a.value) ? '' : a.value }); draw(); }),
        a.mandatory ? h('span', { style: { width: '26px' } }) : iconBtn('minus', LM('Do not send this header'), () => { reqTouch(); r._pw.deletedAuto = [...(r._pw.deletedAuto || []), a.key]; draw(); }, 'danger', 17)));
      wrap.append(sec); }
    const removed = r._pw.deletedAuto || [];
    if (removed.length) { const b = h('button', { class: 'bl hint' }, LM('Send this header again') + ` (${removed.length})…`); b.addEventListener('click', () => popMenu(b, removed.map(k => [k, () => { reqTouch(); r._pw.deletedAuto = (r._pw.deletedAuto || []).filter(x => lc(x) !== lc(k)); draw(); }]))); wrap.append(b); }
  }; draw(); wrap.redraw = draw; return wrap;
}
function jsonCheck(text) { const st = String(text || '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'); if (!st.trim()) return null; try { JSON.parse(st.replace(/\{\{[^}]*\}\}/g, '1')); return true; } catch { return false; } }
const jsonStatus = text => { const ok = jsonCheck(text); return ok == null ? h('span') : ok ? h('span', { class: 'status-ok' }, ic('checkCircle', 13), LM('Valid JSON')) : h('span', { class: 'status-bad' }, ic('closeCircle', 13), LM('Invalid JSON')); };
function bodyTab(r) {
  const b = r.request.body; const wrap = h('div', { class: 'col', style: { gap: '8px', flex: 1 } }); let editor = null;
  const setMode = m => { reqTouch(); b.mode = m === 'binary' ? 'file' : m; if (m === 'formdata') b.formdata = b.formdata || []; if (m === 'urlencoded') b.urlencoded = b.urlencoded || []; if (m === 'raw') { b.raw = b.raw ?? ''; b.options = b.options || { raw: { language: 'json' } }; } draw(); refreshHeaders(); refreshReqTabs(); };
  const draw = () => { wrap.textContent = ''; editor = null; const mode = b.mode === 'file' ? 'binary' : (b.mode || 'none');
    const modes = [['none', 'none'], ['formdata', 'form-data'], ['urlencoded', 'x-www-form-urlencoded'], ['raw', 'raw'], ['binary', 'binary']];
    const bar = h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, tabStrip(modes, mode, setMode));
    wrap.append(bar);
    if (mode === 'none') wrap.append(h('div', { class: 'empty' }, LM('This request does not have a body')));
    else if (mode === 'formdata') wrap.append(kvTable({ rows: b.formdata, onChange: () => { reqTouch(); refreshHeaders(); }, withType: true, addTitle: LM('Add field'), store: { get: () => r._pw.kvw, set: w => { if (w) r._pw.kvw = w; else delete r._pw.kvw; reqTouch(); } } }));
    else if (mode === 'urlencoded') wrap.append(kvTable({ rows: b.urlencoded, onChange: () => { reqTouch(); }, addTitle: LM('Add field'), store: { get: () => r._pw.kvw, set: w => { if (w) r._pw.kvw = w; else delete r._pw.kvw; reqTouch(); } } }));
    else if (mode === 'binary') { const f = b.src || b.file?.src || ''; wrap.append(h('div', { class: 'row' }, ic('file', 15), h('span', { class: 'mono' }, f ? f.split(/[\\/]/).pop() : LM('No file selected')), mkBtn(LM('Select file…'), '', async () => { const p = await pw.pickFile(); if (p) { reqTouch(); b.src = p; b.mode = 'file'; draw(); } }), f ? mkBtn(LM('Remove'), '', () => { reqTouch(); b.src = ''; if (b.file) b.file.src = ''; draw(); }) : null), h('div', { class: 'hint' }, LM('The file is sent as the raw body. It is copied into the storage folder (files).'))); }
    else { b.options = b.options || { raw: { language: 'json' } }; const lang = b.options.raw?.language || 'json';
      const sel = h('select', { style: { width: '130px' }, onChange: e => { reqTouch(); b.options.raw = { language: e.target.value }; draw(); refreshHeaders(); } }, [['text', 'Text'], ['json', 'JSON'], ['javascript', 'JavaScript'], ['html', 'HTML'], ['xml', 'XML']].map(([v, l]) => h('option', { value: v, selected: lang === v }, l)));
      bar.append(sel); let stat = h('span');
      if (lang === 'json') { stat = jsonStatus(b.raw); bar.append(stat, mkBtn(T('btn.beautify'), '', () => { reqTouch(); const ok = editor.beautify(); b.raw = editor.value; if (!ok) toast(T('err.invalidJson')); const ns = jsonStatus(b.raw); stat.replaceWith(ns); stat = ns; })); }
      editor = new CodeEditor({ lang: lang === 'json' ? 'json' : lang === 'javascript' ? 'js' : 'text', value: b.raw || '', placeholder: '{ }', onChange: v => { reqTouch(); b.raw = v; if (lang === 'json') { const ns = jsonStatus(v); stat.replaceWith(ns); stat = ns; } } }); editor.ta.id = 'body-editor'; wrap.append(editor.el); }
  }; draw(); wrap.getEditor = () => editor; return wrap;
}
let refreshHeaders = () => {};
function scriptsTab(r) {
  const wrap = h('div', { class: 'col', style: { flex: 1, gap: '6px' } }); const cur = r._pw.scriptTab || 'prerequest';
  const dot = k => script(r, k).trim() ? ' •' : '';
  const bar = tabStrip([['prerequest', 'PreScript' + dot('prerequest')], ['test', 'PostScript' + dot('test')]], cur, k => { r._pw.scriptTab = k; renderRequestTabBody(); });
  const ed = new CodeEditor({ lang: 'js', value: script(r, cur), placeholder: cur === 'test' ? 'pm.test("ok", () => pm.response.to.have.status(200));' : '// pm.globals.set("token", "...");', onChange: v => { reqTouch(); setScript(r, cur, v); } }); ed.ta.id = 'script-editor';
  wrap.append(h('div', { class: 'row' }, bar), h('div', { class: 'hint' }, cur === 'test' ? LM('JavaScript, runs after the response: pm.response, pm.test, pm.globals, pm.visualizer.set(template, data) → Visualize tab of the result') : LM('JavaScript, runs before the request: pm.request, pm.globals, pm.sendRequest, console.log… (Postman API)')), ed.el); return wrap;
}
let reqPane = null;
function renderRequestPane() {
  const r = activeReq(); const root = h('div', { class: 'pane' }); reqPane = root;
  if (S.sel.size > 1) { root.append(bulkEditor(null)); return root; }
  const an = S.activeId && node(S.activeId); if (an && isFolder(an)) { root.append(folderEditor(an)); return root; }
  if (!r) { root.append(h('div', { class: 'empty' }, LM('Select a request or folder'))); return root; } ensureReq(r);
  const name = h('input', { type: 'text', class: 'nm-in', id: 'namein', value: r.name, placeholder: LM('Name'), onInput: e => { reqTouch(); r.name = e.target.value; renderTree(); } });
  const method = h('select', { id: 'method', onChange: e => { reqTouch(); r.request.method = e.target.value; renderTree(); } }, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m => h('option', { value: m, selected: r.request.method === m }, m)));
  const url = hlInput({ value: reqUrl(r), placeholder: T('req.url'), id: 'urlin', onInput: v => { reqTouch(); setUrl(r, v); if ((r._pw.tab || 'body') === 'params') renderRequestTabBody(); } });
  // URL field: double click = word (native), triple click = the part between "/" and "/", four clicks = the whole address
  url.input.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.detail < 3) return; const inp = url.input, v = inp.value; e.preventDefault();
    if (e.detail >= 4) { inp.setSelectionRange(0, v.length); return; }
    const r = slashRange(v, inp.selectionStart); if (r) inp.setSelectionRange(r[0], r[1]); else inp.setSelectionRange(0, v.length); // empty piece (between //): select everything
  });
  url.input.addEventListener('focus', () => { if (S.settings && S.resultOpen && !S.running) { S.resultOpen = false; renderView(false); } }); // auto-hide result when editing the URL
  const send = h('button', { class: 'pri', onClick: () => sendRequest(r) }, LM('Run'));
  const curlBtn = h('button', { class: 'codebtn' + (S.curlOpen ? ' on' : ''), title: 'curl', onClick: () => { S.curlOpen = !S.curlOpen; renderView(false); } }, '</>');
  const tabs = h('div', { class: 'trow', id: 'rtabs' }); const body = h('div', { class: 'sbody', id: 'rbody' });
  root.append(h('div', { class: 'redit' }, h('div', { class: 'titlerow' }, name, curlBtn), h('div', { class: 'urlbar' }, method, url, send), tabs, body)); root.tabs = tabs; root.body = body; root.url = url; paintReqTabs(r); renderRequestTabBody();
  root.addEventListener('focusin', e => { S.focusMemo.set(r.id, { id: e.target.id || null, idx: [...root.querySelectorAll('input,textarea,select')].indexOf(e.target), tab: r._pw.tab || 'body' }); });
  return root;
}
function paintReqTabs(r) {
  const cur = r._pw.tab || 'body'; const b = r.request.body || { mode: 'none' }; const ps = paramsOf(r), nh = r.request.header.length;
  const hasBody = b.mode !== 'none' && (b.mode !== 'raw' || (b.raw || '').trim() !== ''); const hasScr = !!(script(r, 'prerequest').trim() || script(r, 'test').trim());
  const items = [['params', LM('Params') + (ps.length ? ` (${ps.filter(p => !p.disabled).length})` : '')], ['headers', LM('Headers') + (nh ? ` (${nh})` : '')], ['body', LM('Body') + (hasBody ? ' •' : '')], ['scripts', LM('Scripts') + (hasScr ? ' •' : '')], ['history', LM('History')]];
  reqPane.tabs.textContent = ''; reqPane.tabs.append(tabStrip(items, cur, k => { r._pw.tab = k; paintReqTabs(r); renderRequestTabBody(); schedulePersistTab(); }));
}
const schedulePersistTab = debounce(() => { const r = activeReq(); if (r && !isDraft(r) && S.settings.autosave) pw.saveCollection(snapshotForSave()); }, 800);
function renderRequestTabBody() {
  const r = activeReq(); if (!r || !reqPane || !reqPane.body) return; const cur = r._pw.tab || 'body'; const b = reqPane.body; b.textContent = ''; b.style.display = '';
  if (cur === 'params') { const rows = paramsOf(r); b.append(kvTable({ rows, onChange: () => { applyParams(r, rows); reqPane.url.input.value = reqUrl(r); reqPane.url.repaint(); refreshReqTabs(); }, keyPh: T('req.key'), valPh: T('req.value'), addTitle: LM('Add parameter'), store: { get: () => r._pw.kvw, set: w => { if (w) r._pw.kvw = w; else delete r._pw.kvw; reqTouch(); } } })); }
  else if (cur === 'headers') { const t = headersTab(r); refreshHeaders = () => t.redraw(); b.append(t); }
  else if (cur === 'body') { const t = bodyTab(r); b.append(t); b.style.display = 'flex'; }
  else if (cur === 'history') { b.append(historyPane(r)); b.style.display = 'flex'; }
  else { b.append(scriptsTab(r)); b.style.display = 'flex'; }
}
// ---------- folder editor (name, inherited headers, bulk edit) and bulk editor (several items selected) ----------
function folderEditor(f) {
  f._pw = f._pw || { headers: [] }; f._pw.headers = f._pw.headers || []; const mode = S.folderMode.get(f.id) || 'headers'; const rows = f._pw.headers;
  const root = h('div', { class: 'redit' });
  const name = h('input', { type: 'text', class: 'nm-in', value: f.name, onChange: e => { const v = e.target.value.trim(); if (v && v !== f.name) listEdit('rename', () => { f.name = v; }); } });
  root.append(h('div', { class: 'titlerow' }, name, mkBtn(LM('Run'), 'pri', () => runSelected())), h('div', { class: 'row' }, tabStrip([['headers', LM('Headers')], ['bulk', LM('Bulk edit')]], mode, k => { S.folderMode.set(f.id, k); renderView(); })));
  if (mode === 'headers') { let before = clone(rows); const commit = debounce(() => { const after = clone(rows); if (JSON.stringify(before) !== JSON.stringify(after)) { const b0 = before; pushUndo({ scope: 'list', label: 'folder headers', undo() { f._pw.headers.splice(0, f._pw.headers.length, ...clone(b0)); }, redo() { f._pw.headers.splice(0, f._pw.headers.length, ...clone(after)); } }); before = after; } markStructure(); }, 600);
    root.append(h('div', { class: 'hint' }, LM("Applied automatically to every nested request and shown there as read-only. A request's own header with the same name overrides it. When exporting, they are written into each request.")), kvTable({ rows, onChange: commit, addTitle: LM('Add header'), store: { get: () => f._pw.kvw, set: w => { if (w) f._pw.kvw = w; else delete f._pw.kvw; markStructure(); } } })); }
  else root.append(bulkEditor(f));
  return root;
}
function bulkEditor(embedded) {
  const ids = embedded ? [embedded.id] : [...S.sel]; const st = { headers: [], remove: '', replace: false, body: '', json: true, setCT: true };
  const targets = () => { const out = new Map(); for (const id of ids) { const l = locate(id); if (!l) continue; (isFolder(l.node) ? allRequests(l.node) : [l.node]).forEach(r => out.set(r.id, r)); } return [...out.values()]; };
  const root = h('div', { class: embedded ? 'col' : 'redit', style: { gap: '10px', flex: 1, minHeight: 0, overflow: 'auto' } });
  const draw = () => { root.textContent = ''; const n = targets().length;
    if (!embedded) root.append(h('div', { class: 'titlerow' }, h('span', { class: 'title grow', style: { flex: 1 } }, LM('%ld items selected', ids.length)), mkBtn(LM('Run'), 'pri', () => runSelected())));
    root.append(h('div', { class: 'muted' }, LM('Edit %ld request(s) at once. Folders include everything inside.', n)),
      h('div', { class: 'gbox' }, h('div', { class: 'gt' }, LM('Set / replace headers')), kvTable({ rows: st.headers, onChange: () => {}, addTitle: LM('Add header') })),
      h('input', { type: 'text', placeholder: LM('Remove headers (comma-separated names)'), value: st.remove, onInput: e => { st.remove = e.target.value; } }),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: st.replace, onChange: e => { st.replace = e.target.checked; draw(); } }), LM('Replace body')));
    if (st.replace) { const ta = h('textarea', { style: { flex: 1, minHeight: '120px', fontFamily: 'var(--mono)' }, onInput: e => { st.body = e.target.value; } }); ta.value = st.body;
      root.append(h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, tabStrip([['text', LM('Text')], ['json', 'JSON']], st.json ? 'json' : 'text', k => { st.json = k === 'json'; draw(); }), h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: st.setCT, onChange: e => { st.setCT = e.target.checked; } }), LM('Also set Content-Type')),
        st.json ? jsonStatus(st.body) : null, st.json ? mkBtn(T('btn.beautify'), '', () => { const r = beautify(st.body); st.body = r.text; draw(); }) : null), ta); }
    root.append(h('div', { class: 'row' }, h('div', { class: 'grow', style: { flex: 1 } }), h('button', { class: embedded ? '' : 'pri', disabled: !n, onClick: apply }, LM('Apply to %ld request(s)', n)))); };
  const apply = () => { const list = targets(); const before = list.map(r => [r.id, clone(r.request)]);
    for (const r of list) { ensureReq(r); const hs = r.request.header; const rm = st.remove.split(',').map(x => lc(x.trim())).filter(Boolean); r.request.header = hs.filter(x => !rm.includes(lc(x.key)));
      const set = st.headers.filter(x => x.key && x.key.trim()).map(x => ({ key: x.key.trim(), value: x.value || '' })); if (st.replace && st.setCT) set.push({ key: 'Content-Type', value: st.json ? 'application/json' : 'text/plain' });
      for (const x of set) { r.request.header = r.request.header.filter(o => lc(o.key) !== lc(x.key)); r.request.header.push(x); }
      if (st.replace) r.request.body = { mode: 'raw', raw: st.body, options: { raw: { language: st.json ? 'json' : 'text' } } }; }
    const after = list.map(r => [r.id, clone(r.request)]); const put = arr => arr.forEach(([id, rq]) => { const t = node(id); if (t) t.request = clone(rq); });
    pushUndo({ scope: 'list', label: 'bulk edit', undo() { put(before); }, redo() { put(after); } }); pwLogMain('info', 'bulk', `applied to ${list.length} request(s)`); st.headers = []; st.remove = ''; markStructure(); toast(LM('Apply to %ld request(s)', list.length) + ' ✓'); draw(); };
  draw(); return root;
}
function highlightAuthError(r) { const rows = reqPane && reqPane.querySelectorAll('tr[data-auth]'); if (rows) rows.forEach(x => { x.classList.add('blink'); setTimeout(() => x.classList.remove('blink'), 1800); }); }
function restoreFocus(r) { const m = S.focusMemo.get(r.id); if (!m || !reqPane) return; const els = [...reqPane.querySelectorAll('input,textarea,select')]; const e = (m.id && document.getElementById(m.id)) || els[m.idx]; if (e) e.focus({ preventScroll: true }); }
async function sendRequest(r) {
  if (!r) return; if (r._pw.authError) { r._pw.tab = 'headers'; paintReqTabs(r); renderRequestTabBody(); highlightAuthError(r); }
  await pw.syncCollection(clone(S.col)); S.running = true; S.results.set(r.id, { pending: true }); S.resultOpen = true; renderResult();
  const res = await pw.runStart({ nodeId: r.id, rows: null, iterations: 1, intervalMs: 0, source: 'single' }); if (res && res.__error) { S.running = false; S.results.set(r.id, { error: errText(res.__error) }); renderResult(); }
}
