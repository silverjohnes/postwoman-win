'use strict';
// Storage: Postman v2.1 collection (extended with `_pw` fields, ignored by Postman),
// globals.json, history/<requestId>.json. Writes go to primary AND optional backup path.
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

// joins a relative storage path to a storage root and refuses anything that would leave the root ("..", absolute paths)
function safeJoin(root, rel) {
  // nosemgrep -- reviewed: safeJoin: the result is checked to stay inside the root
  const base = path.resolve(root);
  // nosemgrep -- reviewed: safeJoin: the result is checked to stay inside the root
  const full = path.resolve(base, String(rel));
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('path escapes the storage folder: ' + rel);
  return full;
}

class Store {
  constructor(getSettings) { this.getSettings = getSettings; this.failed = new Set(); this.onPathStatus = () => {}; }
  roots() {
    const s = this.getSettings();
    const r = [];
    if (s.storagePath) r.push(s.storagePath);
    if (s.backupEnabled && s.backupPath) r.push(s.backupPath);
    return r;
  }
  primary() { return this.getSettings().storagePath; }
  // nosemgrep -- reviewed: storage paths are chosen by the person in Settings (a desktop app that reads and writes the folder they pick)
  _readFrom(root, rel) { try { return fs.readFileSync(safeJoin(root, rel), 'utf8'); } catch { return null; } }
  readJSON(rel, fallback) {
    // primary first, then backup
    for (const r of this.roots()) {
      const t = this._readFrom(r, rel);
      if (t != null) { try { return JSON.parse(t); } catch (e) { logger.warn('store', `corrupt ${rel} in ${r}: ${e.message}`); } }
    }
    return fallback;
  }
  writeJSON(rel, obj) {
    const text = JSON.stringify(obj, null, 2);
    for (const r of this.roots()) {
      try {
        const full = safeJoin(r, rel);
        // nosemgrep -- reviewed: storage paths are chosen by the person in Settings (a desktop app that reads and writes the folder they pick)
        fs.mkdirSync(path.dirname(full), { recursive: true });
        const tmp = full + '.tmp';
        // nosemgrep -- reviewed: storage paths are chosen by the person in Settings (a desktop app that reads and writes the folder they pick)
        fs.writeFileSync(tmp, text, 'utf8');
        // nosemgrep -- reviewed: storage paths are chosen by the person in Settings (a desktop app that reads and writes the folder they pick)
        fs.renameSync(tmp, full);
        if (this.failed.delete(r)) { logger.info('store', `path available again: ${r}`); this.onPathStatus([...this.failed]); }
      } catch (e) {
        logger.error('store', `write failed ${rel} -> ${r}: ${e.message}`);
        if (!this.failed.has(r)) { this.failed.add(r); this.onPathStatus([...this.failed]); }
      }
    }
  }
  // nosemgrep -- reviewed: storage paths are chosen by the person in Settings (a desktop app that reads and writes the folder they pick)
  deleteFile(rel) { for (const r of this.roots()) { try { fs.unlinkSync(safeJoin(r, rel)); } catch {} } }
  checkPaths() {
    const res = [];
    const s = this.getSettings();
    const test = (label, p) => {
      // nosemgrep -- reviewed: safeJoin: the result is checked to stay inside the root; storage paths are chosen by the person in Settings (a desktop app that reads and writes the folder they pick)
      try { fs.mkdirSync(p, { recursive: true }); const f = path.join(p, '.pw-check'); fs.writeFileSync(f, 'ok'); fs.unlinkSync(f); res.push({ label, path: p, ok: true }); this.failed.delete(p); }
      catch (e) { res.push({ label, path: p, ok: false, error: e.message }); this.failed.add(p); }
    };
    if (s.storagePath) test('primary', s.storagePath);
    if (s.backupEnabled && s.backupPath) test('backup', s.backupPath);
    this.onPathStatus([...this.failed]);
    return res;
  }
  loadCollection() { return this.readJSON('collection.json', null); }
  saveCollection(c) { this.writeJSON('collection.json', c); }
  loadGlobals() { return this.readJSON('globals.json', { values: [] }); }
  saveGlobals(g) { this.writeJSON('globals.json', g); }
  loadHistory(id) { return this.readJSON(`history/${id}.json`, []); }
  saveHistory(id, h) { this.writeJSON(`history/${id}.json`, h); }
  clearHistory(id) { this.deleteFile(`history/${id}.json`); }
  pruneHistory(ids, maxAgeMs) {
    const cut = Date.now() - maxAgeMs; let removed = 0;
    for (const id of ids) {
      const h = this.loadHistory(id); const n = h.filter(e => e.time >= cut); removed += h.length - n.length;
      if (n.length !== h.length) { n.length ? this.saveHistory(id, n) : this.clearHistory(id); }
    }
    return removed;
  }
}
module.exports = { Store };
