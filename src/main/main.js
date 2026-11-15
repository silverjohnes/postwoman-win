'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, safeStorage, shell, clipboard, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { logger } = require('./logger');
const { Store } = require('./store');
const { Secrets, windowsHello } = require('./secrets');
const PM = require('./postman');
const { parseCurl, toCurl } = require('./curl');
const R = require('./runner');
const U = require('./util');
const I18N = require('../i18n');

const VERSION = '0.8.5', BUILD = '080511';
const DEFAULTS = { storagePath: '', backupEnabled: false, backupPath: '', timeoutSec: 10, historyAmount: 6, historyUnit: 'months', language: 'auto', autosave: true,
  secretMode: 'account', authSkip: false, invertScroll: false, theme: 'dark', logLevel: 'debug', runnerIntervalMs: 0, showHeadersRes: true, showHeadersReq: true, windowBounds: null };
let settings = { ...DEFAULTS }, win = null, hotkeyWin = null, store, secrets, ctl = null, closing = false;
let collection, globals = [];
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch {}
  if (!settings.storagePath) settings.storagePath = path.join(app.getPath('userData'), 'data');
  logger.setLevel('debug');
}
const saveSettings = () => { try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { logger.error('settings', e.message); } };
const lang = () => I18N.resolve(settings.language, app.getLocale());
const send = (ch, ...a) => { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); };

// ---------- secrets / auth ----------
let sessionAuthed = false;
async function ensureAuth(reason) {
  const t = I18N.make(lang());
  logger.info('auth', `authentication requested (${reason})`);
  const r = await windowsHello(t('vars.authPrompt'));
  if (r.unavailable) {
    logger.warn('auth', `Windows Hello unavailable: ${r.reason}`);
    const c = await dialog.showMessageBox(win, { type: 'question', buttons: [t('btn.save') === 'Save' ? 'Allow' : 'OK', t('btn.cancel')], defaultId: 1, cancelId: 1, message: t('vars.authUnavailable') });
    return c.response === 0;
  }
  logger.info('auth', r.ok ? 'authentication succeeded' : `authentication failed: ${r.result || r.error}`);
  return !!r.ok;
}
// Windows Hello is asked once; if that attempt does not succeed (cancelled, failed or unavailable) it is never asked again until the user resets it in Settings
async function requireSession(reason) {
  if (settings.authSkip || sessionAuthed) return true;
  const ok = await ensureAuth(reason);
  if (ok) sessionAuthed = true; else { settings.authSkip = true; saveSettings(); logger.warn('auth', 'authentication did not succeed: the prompt is switched off (Settings -> Secret variables)'); }
  return ok;
}

// ---------- themes: title bar overlay + native widgets ----------
const THEME_UI = { dark: { bg: '#1e1e1e', tx: '#f2f2f7', dark: true }, light: { bg: '#f6f6f8', tx: '#1d1d1f', dark: false }, midnight: { bg: '#1b2233', tx: '#e6ebf5', dark: true }, sepia: { bg: '#f3ead6', tx: '#3b2f1e', dark: false } };
function applyTheme(id) {
  const t = THEME_UI[id] || THEME_UI.dark; try { nativeTheme.themeSource = t.dark ? 'dark' : 'light'; } catch {}
  if (win && !win.isDestroyed()) { try { win.setBackgroundColor(t.bg); if (process.platform !== 'darwin') win.setTitleBarOverlay({ color: t.bg, symbolColor: t.tx, height: 36 }); } catch {} }
  return true;
}

// ---------- persistence ----------
function loadAll() {
  collection = store.loadCollection() || PM.emptyCollection();
  globals = (store.loadGlobals().values || []);
  const ids = []; PM.walk(collection.item, n => { if (!PM.isFolder(n)) ids.push(n.id); });
  pruneNow(ids);
}
function pruneNow(ids) {
  if (!ids) { ids = []; PM.walk(collection.item, n => { if (!PM.isFolder(n)) ids.push(n.id); }); }
  const ms = settings.historyUnit === 'days' ? 86400e3 : 30 * 86400e3;
  return store.pruneHistory(ids, Math.max(1, settings.historyAmount) * ms);
}
const persistCollection = () => store.saveCollection(collection);
const persistGlobals = () => store.saveGlobals({ values: globals });

function plainGlobals() { // decrypted copy for newman
  return globals.map(g => ({ ...g, value: g.secret ? secrets.decrypt(g.value) : g.value }));
}
function applyRunGlobals(plain) {
  for (const p of plain) {
    const ex = globals.find(g => U.lc(g.key) === U.lc(p.key));
    if (ex) ex.value = ex.secret ? secrets.encrypt(p.value) : p.value;
    else globals.push({ key: p.key, value: p.value, secret: false, enabled: true });
  }
  persistGlobals(); send('globals:updated', globals);
}

// ---------- IPC ----------
function registerIpc() {
  const h = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => { try { return await fn(...a); } catch (err) { logger.error('ipc', `${ch}: ${err.message}`); return { __error: err.message }; } });
  h('app:init', () => ({ collection, globals, settings, version: VERSION, build: BUILD, locale: app.getLocale(), lang: lang(), logs: logger.entries.slice(-2000), failedPaths: store.failed.size ? [...store.failed] : [], defaultStoragePath: path.join(app.getPath('userData'), 'data') }));
  h('collection:save', c => { collection = c; persistCollection(); logger.debug('store', 'collection saved'); return true; });
  h('collection:sync', c => { collection = c; return true; }); // in-memory only (drafts / unsaved edits can be run)
  h('globals:save', g => { globals = g; persistGlobals(); logger.debug('store', `globals saved (${g.length})`); return true; });
  h('settings:save', s => {
    const langChanged = s.language !== settings.language; const pathChanged = s.storagePath !== settings.storagePath;
    settings = { ...settings, ...s }; saveSettings(); logger.setLevel('debug'); pruneNow(); logger.info('settings', 'saved'); buildMenu();
    if (pathChanged) { logger.info('store', `storage path -> ${settings.storagePath}`); const c = store.loadCollection(); if (c) { collection = c; globals = store.loadGlobals().values || []; } else { persistCollection(); persistGlobals(); } }
    return { settings, reload: pathChanged, langChanged };
  });
  h('settings:patch', p => { settings = { ...settings, ...p }; saveSettings(); if (p.logLevel) logger.setLevel(p.logLevel); return true; });
  h('paths:check', () => store.checkPaths());
  h('dialog:folder', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
  h('dialog:openData', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'CSV / JSON', extensions: ['csv', 'json', 'txt'] }, { name: '*', extensions: ['*'] }] });
    if (r.canceled) return null; const p = r.filePaths[0]; return { name: path.basename(p), rows: R.parseDataFile(fs.readFileSync(p, 'utf8'), p) }; });
  h('dialog:openFile', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openFile'] }); return r.canceled ? null : r.filePaths[0]; });
  h('import:file', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Postman collection', extensions: ['json'] }] }); if (r.canceled) return null;
    logger.info('import', `file ${r.filePaths[0]}`); const res = PM.importCollection(fs.readFileSync(r.filePaths[0], 'utf8'));
    logger.info('import', `parsed: ${PM.allRequests({ item: res.collection.item }).length} requests, ${res.globals.length} variables`); return res;
  });
  h('import:curl', text => { logger.info('import', 'curl command'); const r = parseCurl(text); logger.debug('import', 'curl parsed', { method: r.method, url: r.url }); return r; });
  h('curl:make', req => toCurl(req));
  h('clipboard:read', () => clipboard.readText());
  h('save:text', async ({ name, text }) => { const r = await dialog.showSaveDialog(win, { defaultPath: U.safeFileName(name || 'text.txt') }); if (r.canceled) return false; fs.writeFileSync(r.filePath, String(text)); logger.info('save', r.filePath); return true; });
  h('history:prune', () => { const n = pruneNow(); logger.info('history', 'pruned manually'); return typeof n === 'number' ? n : 0; });
  h('secret:lock', () => { sessionAuthed = false; try { secrets.sessionAuthed = false; } catch {} logger.info('secrets', 'locked'); return true; });
  h('clipboard:write', t => { clipboard.writeText(String(t)); return true; });
  h('export:collection', async c => {
    const r = await dialog.showSaveDialog(win, { defaultPath: U.safeFileName((c.info.name || 'collection')) + '.postman_collection.json', filters: [{ name: 'Postman collection', extensions: ['json'] }] }); if (r.canceled) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(PM.exportCollection(c, globals), null, 2)); logger.info('export', r.filePath); return true;
  });
  h('save:body', async ({ name, body, ext }) => {
    const t = I18N.make(lang()); const def = `${t('file.responsePrefix')} ${U.safeFileName(name)} ${U.stamp()}.${ext}`;
    const r = await dialog.showSaveDialog(win, { title: t('file.saveTitle'), defaultPath: U.safeFileName(def) }); if (r.canceled) return false; fs.writeFileSync(r.filePath, body); logger.info('save', r.filePath); return true;
  });
  h('save:csv', async ({ rows }) => {
    const t = I18N.make(lang()); const seen = new Map(); rows.forEach(x => seen.set(JSON.stringify(x), x)); const uniq = [...seen.values()];
    const cols = [...new Set(uniq.flatMap(Object.keys))]; const r = await dialog.showSaveDialog(win, { title: t('file.csvTitle'), defaultPath: `${t('file.csvErrors')} ${U.stamp()}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled) return false; fs.writeFileSync(r.filePath, '﻿' + R.toCSV(uniq, cols)); logger.info('save', `${r.filePath} (${uniq.length} unique rows)`); return true;
  });
  // history
  h('history:get', id => store.loadHistory(id));
  h('history:delete', ({ id, ids }) => { const s = new Set(ids); store.saveHistory(id, store.loadHistory(id).filter(e => !s.has(e.id))); return true; });
  h('history:clear', id => { store.clearHistory(id); return true; });
  // secrets
  const secErr = e => ({ __error: e && e.code === 'NOBUILTIN' ? 'noBuiltin' : 'decrypt', detail: e && e.message });
  h('secret:encrypt', async v => { if (!await requireSession('encrypt')) return { __error: 'auth' }; try { return secrets.encrypt(v); } catch (e) { logger.warn('secrets', 'encrypt failed: ' + e.code); return secErr(e); } });
  h('secret:reveal', async enc => { if (!await requireSession('reveal')) return { __error: 'auth' }; try { return secrets.decrypt(enc); } catch (e) { logger.warn('secrets', 'decrypt failed: ' + e.code); return secErr(e); } });
  h('secret:status', () => ({ mode: settings.secretMode, builtinAvailable: secrets.builtinAvailable(), count: globals.filter(g => g.secret && g.value).length }));
  // switch the encryption mode ('account' <-> 'local'), re-encrypting every secret variable
  h('secret:switch', async ({ to, force }) => {
    const from = settings.secretMode; if (to === from) return { ok: true, converted: 0, failed: 0 };
    if (!await requireSession('switch')) return { __error: 'auth' };
    try {
      const r = secrets.migrate(globals, from, to, !!force);
      if (r.failed && !force) return { needsForce: true, failed: r.failed, converted: r.converted };
      globals = r.list; settings.secretMode = to; saveSettings(); persistGlobals(); secrets.dropKey(from); 
      logger.info('secrets', `mode ${from} -> ${to}: converted=${r.converted} failed=${r.failed}`); return { ok: true, converted: r.converted, failed: r.failed, globals };
    } catch (e) { logger.warn('secrets', 'switch failed: ' + e.code); return secErr(e); }
  });
  h('auth:status', () => ({ skip: !!settings.authSkip }));
  h('auth:reset', () => { settings.authSkip = false; sessionAuthed = false; saveSettings(); logger.info('auth', 'prompt re-enabled'); return { skip: false }; });
  h('win:theme', id => applyTheme(id));
  h('win:role', (role) => { const wc = win && win.webContents; if (!wc) return; ({ cut: () => wc.cut(), copy: () => wc.copy(), paste: () => wc.paste(), selectAll: () => wc.selectAll(), fullscreen: () => win.setFullScreen(!win.isFullScreen()), minimize: () => win.minimize(), maximize: () => (win.isMaximized() ? win.unmaximize() : win.maximize()), quit: () => win.close(), hotkeys: () => openHotkeys() })[role]?.(); });
  // logs
  h('log:clear', () => { logger.entries.length = 0; return true; });
  h('log:level', l => { settings.logLevel = l; saveSettings(); logger.setLevel(l); logger.info('log', `level -> ${l}`); return true; });
  // run
  h('run:start', async ({ nodeId, rows, iterations, intervalMs, source }) => {
    if (ctl && !ctl.stopped && ctl.running) return { __error: 'busy' };
    if (globals.some(g => g.secret) && !await requireSession('run')) return { __error: 'auth' };
    ctl = new R.RunController(); ctl.running = true; const myCtl = ctl;
    let plain; try { plain = plainGlobals(); } catch (e) { logger.warn('secrets', 'run: cannot decrypt secrets'); return { __error: 'decrypt' }; }
    settings.runnerIntervalMs = intervalMs ?? settings.runnerIntervalMs; saveSettings();
    logger.info('run', `start source=${source} node=${nodeId || '(all)'} rows=${rows ? rows.length : 0} iterations=${iterations} interval=${intervalMs}ms timeout=${settings.timeoutSec}s`);
    R.runNode({ col: collection, nodeId, globals: plain, rows, iterations, intervalMs, timeoutMs: settings.timeoutSec * 1000, version: VERSION, ctl: myCtl,
      log: (l, s, m, d) => logger.log(l, s, m, d),
      onRecord: rec => {
        const entry = { id: U.uid(), ...rec, visualizer: undefined, source }; // Visualize is never stored in history
        if (entry.response && entry.response.body.length > 4e6) { entry.response = { ...entry.response, body: entry.response.body.slice(0, 4e6), truncated: true }; }
        { const hst = store.loadHistory(rec.requestId); hst.unshift(entry); store.saveHistory(rec.requestId, hst); }
        send('run:record', { ...rec, id: entry.id, source });
      },
      onState: s => send('run:state', { ...s, source }),
    }).then(res => { myCtl.running = false; applyRunGlobals(plain); send('run:finished', { failedRows: res.failedRows, done: res.done, total: res.total, source }); logger.info('run', `finished ${res.done}/${res.total}`); })
      .catch(err => { myCtl.running = false; logger.error('run', err.stack || err.message); send('run:finished', { error: err.message, source }); });
    return true;
  });
  h('run:pause', () => { ctl && ctl.pause(); logger.info('run', 'paused'); send('run:state', { state: 'paused' }); return true; });
  h('run:resume', () => { ctl && ctl.resume(); logger.info('run', 'resumed'); return true; });
  h('run:stop', () => { ctl && ctl.stop(); logger.info('run', 'stop requested'); return true; });
  h('dirty:answer', () => true);
  ipcMain.on('app:quit-confirmed', () => { closing = true; if (win) win.close(); });
  ipcMain.on('hotkeys:open', () => openHotkeys());
  ipcMain.on('menu:rebuild', () => buildMenu());
}

// ---------- windows / menu ----------
function createWindow() {
  win = new BrowserWindow({ width: 1360, height: 860, minWidth: 980, minHeight: 600, title: 'Postwoman', backgroundColor: (THEME_UI[settings.theme] || THEME_UI.dark).bg, ...(process.platform === 'darwin' ? {} : { titleBarStyle: 'hidden', titleBarOverlay: { color: (THEME_UI[settings.theme] || THEME_UI.dark).bg, symbolColor: (THEME_UI[settings.theme] || THEME_UI.dark).tx, height: 36 } }), icon: path.join(__dirname, '../appicon-256.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, devTools: false } });
  win.webContents.setVisualZoomLevelLimits(1, 1);   // no pinch / Ctrl+wheel zoom
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  if (process.platform !== 'darwin') {   // no native menu: the HTML menu bar replaces it, so the shortcuts it showed are routed here
    const map = { KeyN: 'newRequest', KeyO: 'import', KeyS: 'save', KeyP: 'settings' }, mapShift = { KeyN: 'newFolder', KeyE: 'export' };
    win.webContents.on('before-input-event', (e, i) => {
      if (i.type !== 'keyDown') return; const mod = i.control || i.meta; let a = null;
      if (i.key === 'F1') { e.preventDefault(); return openHotkeys(); } if (i.key === 'F11') { e.preventDefault(); return win.setFullScreen(!win.isFullScreen()); }
      if (mod && !i.alt) a = i.shift ? mapShift[i.code] : map[i.code];
      if (mod && !i.alt && ['=', '+', '-', '_', '0'].includes(i.key)) { e.preventDefault(); return; }   // zoom shortcuts are disabled
      if (a) { e.preventDefault(); send('menu:action', a); }
    });
  }
  logger.onEntry(e => send('log:entry', e));
  store.onPathStatus = f => send('paths:status', f);
  win.on('close', e => { if (closing) return; e.preventDefault(); send('app:request-close'); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
function openHotkeys() {
  if (hotkeyWin && !hotkeyWin.isDestroyed()) { hotkeyWin.focus(); return; }
  hotkeyWin = new BrowserWindow({ width: 620, height: 640, parent: win, title: I18N.make(lang())('hot.title'), backgroundColor: '#1e1e1e', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  hotkeyWin.setMenu(null); hotkeyWin.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { view: 'hotkeys' } });
}
function buildMenu() {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
  const t = I18N.make(lang()); const L = (k, d) => { try { return d; } catch { return d; } }; const act = a => () => send('menu:action', a);
  const it = (label, accelerator, a) => ({ label, accelerator, click: act(a), registerAccelerator: false });   // keys are handled in the renderer; shown here for reference
  const tpl = [
    { label: 'File', submenu: [
      it(t('btn.newRequest'), 'Ctrl+N', 'newRequest'), it(t('btn.newFolder'), 'Ctrl+Shift+N', 'newFolder'), { type: 'separator' },
      it(t('btn.import'), 'Ctrl+O', 'import'), it('Import cURL…', 'Ctrl+Shift+I', 'importCurl'), it(t('btn.export'), 'Ctrl+Shift+E', 'export'), { type: 'separator' },
      it(t('btn.save'), 'Ctrl+S', 'save'), it('Save All', 'Ctrl+Shift+S', 'saveAll'), it(t('btn.settings'), 'Ctrl+P', 'settings'), { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }, it(t('hot.find'), 'Ctrl+F', 'find'), it('Search Collections', 'Ctrl+Shift+F', 'searchFocus'), it('Next Match', 'Ctrl+G', 'next'), it('Previous Match', 'Ctrl+Shift+G', 'prev')] },
    { label: 'Run', submenu: [it('Run Selected', 'Ctrl+R', 'run'), it('Stop', 'Ctrl+.', 'stop'), it('Pause', 'Ctrl+Shift+P', 'pause'), { type: 'separator' }, it('Request', 'Ctrl+1', 'tab1'), it('Runner', 'Ctrl+2', 'tab2'), it('Globals', 'Ctrl+3', 'tab3'), it('Log', 'Ctrl+4', 'tab4')] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { label: 'Keyboard Shortcuts', accelerator: 'F1', click: openHotkeys }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.whenReady().then(() => {

  loadSettings(); logger.info('app', `Postwoman ${VERSION} (build ${BUILD}) starting; electron ${process.versions.electron}, newman embedded`);
  store = new Store(() => settings);
  const account = { available: () => safeStorage.isEncryptionAvailable(), wrap: b => { if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage unavailable'); return safeStorage.encryptString(b.toString('base64')); },
    unwrap: b => b.slice(0, 5).toString() === 'PLAIN' ? b.slice(5) : Buffer.from(safeStorage.decryptString(b), 'base64') };   // 'PLAIN' = key files written by older builds
  secrets = new Secrets({ dir: app.getPath('userData'), account, mode: () => settings.secretMode || 'account', log: (l, s, m) => logger.log(l, s, m) });
  loadAll(); registerIpc(); buildMenu(); createWindow(); applyTheme(settings.theme);
  store.checkPaths();
});
app.on('window-all-closed', () => app.quit());
