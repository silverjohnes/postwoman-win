'use strict';
/* ===== Shared utilities: highlighting, lenient beautify, layout-swap search, code editor, virtual viewer ===== */
const EN_ = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./~QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?@#$^&|";
const RU_ = "ёйцукенгшщзхъфывапролджэячсмитьбю.ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,\"№;:?/";
const _e2r = new Map(), _r2e = new Map();
for (let i = 0; i < Math.min(EN_.length, RU_.length); i++) { _e2r.set(EN_[i], RU_[i]); _r2e.set(RU_[i], EN_[i]); }
const _cv = (s, m) => Array.from(s).map(c => m.get(c) ?? c).join('');
function queryVariants(q) { const o = new Set([q.toLowerCase()]); for (const v of [_cv(q, _e2r), _cv(q, _r2e)]) if (v !== q) o.add(v.toLowerCase()); return [...o].filter(Boolean); }
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    // nosemgrep -- reviewed: HTML is built by paint()/esc() (all text escaped) or from static icon markup; HTML is built by paint()/esc() (all text escaped), static icon markup, or runs inside the sandboxed visualizer iframe (opaque origin, by design)
    else if (k === 'value') el.value = v; else if (k === 'checked') el.checked = !!v; else if (k === 'html') el.innerHTML = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}

// ---------- tokenizer ----------
const KW = /^(true|false|null|undefined|var|let|const|function|return|if|else|for|while|new|typeof|try|catch|throw|async|await|of|in|this)$/;
const TOK = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|\{\{[^{}\n]*\}\}|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\[\s\S])*`?|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|[A-Za-z_$][\w$]*|[{}\[\]():,;.=<>!+\-*\/&|?]/g;
function tokenize(text, lang) {
  const out = [];
  if (lang === 'http') {
    const sep = text.search(/\r?\n\r?\n/); const headEnd = sep < 0 ? text.length : sep; let pos = 0;
    text.slice(0, headEnd).split('\n').forEach((line, i) => {
      if (i === 0) { const m = /^([A-Z]+)(\s+)(\S.*)$/.exec(line) || /^(HTTP\/[\d.]+)(\s+)(.*)$/.exec(line); if (m) { out.push({ s: pos, e: pos + m[1].length, c: 'tk-kw' }); out.push({ s: pos + m[1].length + m[2].length, e: pos + line.length, c: 'tk-url' }); } }
      else { const k = line.indexOf(':'); if (k > 0) out.push({ s: pos, e: pos + k, c: 'tk-key' }); }
      pos += line.length + 1;
    });
    if (sep >= 0) { const bs = sep + (text[sep] === '\r' ? 4 : 2); for (const t of tokenize(text.slice(bs), 'json')) out.push({ s: t.s + bs, e: t.e + bs, c: t.c }); }
    return out;
  }
  TOK.lastIndex = 0; let m;
  while ((m = TOK.exec(text))) {
    const v = m[0], s = m.index; let c = null;
    if (v.startsWith('//') || v.startsWith('/*')) c = 'tk-com';
    else if (v.startsWith('{{')) c = 'tk-var';
    else if (v[0] === '"' || v[0] === "'" || v[0] === '`') { c = 'tk-str'; if (lang === 'json' || lang === 'js') { let j = s + v.length; while (text[j] === ' ' || text[j] === '\t') j++; if (text[j] === ':' && lang === 'json') c = 'tk-key'; } }
    else if (/^-?\d/.test(v)) c = 'tk-num';
    else if (KW.test(v)) c = (v === 'true' || v === 'false' || v === 'null') ? 'tk-lit' : 'tk-kw';
    else if (/^[A-Za-z_$]/.test(v)) { if (lang === 'js' && /^(pm|console|JSON|Math)$/.test(v)) c = 'tk-fn'; }
    else c = 'tk-pun';
    if (c) out.push({ s, e: s + v.length, c });
  }
  return out;
}
const VAR_ONLY = /\{\{[^{}\n]*\}\}/g;
function varTokens(text) { const o = []; VAR_ONLY.lastIndex = 0; let m; while ((m = VAR_ONLY.exec(text))) o.push({ s: m.index, e: m.index + m[0].length, c: 'tk-var' }); return o; }
// segments: syntax tokens (non-overlapping) + marks (may overlap tokens)
function paint(text, toks, marks) {
  const pts = new Set([0, text.length]);
  for (const t of toks) { pts.add(t.s); pts.add(t.e); }
  for (const t of marks) { pts.add(t.s); pts.add(t.e); }
  const P = [...pts].filter(p => p >= 0 && p <= text.length).sort((a, b) => a - b);
  let ti = 0, html = '';
  const tk = [...toks].sort((a, b) => a.s - b.s);
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1]; if (a === b) continue;
    while (ti < tk.length && tk[ti].e <= a) ti++;
    const cls = []; if (ti < tk.length && tk[ti].s <= a && tk[ti].e >= b) cls.push(tk[ti].c);
    for (const m of marks) if (m.s <= a && m.e >= b) cls.push(m.c);
    const seg = esc(text.slice(a, b));
    // nosemgrep -- reviewed: interpolated values are numbers or escaped text
    html += cls.length ? `<span class="${cls.join(' ')}">${seg}</span>` : seg;
  }
  return html;
}

// ---------- lenient beautify: never throws; keeps // comment lines untouched; formats valid parts of invalid JSON ----------
function beautify(src, indentStr = '  ') {
  const n = src.length; let depth = 0, i = 0, lineStart = true; const ind = () => indentStr.repeat(Math.max(0, depth));
  // output kept as chunks: trimming/peeking the tail is O(1) (a growing string + regex made this O(n^2) on 1 MB bodies)
  const parts = [];
  const trimTail = () => { while (parts.length) { const t = parts[parts.length - 1].replace(/[ \t]+$/, ''); if (t === '') parts.pop(); else { parts[parts.length - 1] = t; break; } } };
  const tailIsBlankLine = () => { for (let k = parts.length - 1; k >= 0; k--) { const p = parts[k]; for (let m = p.length - 1; m >= 0; m--) { const ch = p[m]; if (ch === ' ' || ch === '\t') continue; return ch === '\n'; } } return false; };
  const tailMatches = re => { let t = ''; for (let k = parts.length - 1; k >= 0 && t.length < 64; k--) t = parts[k] + t; return re.test(t); };
  const nl = () => { trimTail(); parts.push('\n' + ind()); lineStart = true; };
  const emit = s => { parts.push(s); lineStart = false; };
  let bad = false;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") { // string
      let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      if (src[j] !== c) bad = true; j = Math.min(n, j + 1); emit(src.slice(i, j)); i = j; continue;
    }
    if (c === '/' && src[i + 1] === '/') { // comment line: untouched, own line
      let j = src.indexOf('\n', i); if (j < 0) j = n; if (!lineStart && !tailIsBlankLine()) nl();
      trimTail(); const lineBegin = src.lastIndexOf('\n', i - 1) + 1; const lead = src.slice(lineBegin, i); emit((/^[ \t]*$/.test(lead) ? lead : '') + src.slice(i, j)); i = j; nl(); continue;
    }
    if (c === '/' && src[i + 1] === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; emit(src.slice(i, j)); i = j; continue; }
    if (c === '{' && src[i + 1] === '{') { const m = /^\{\{[^{}\n]*\}\}/.exec(src.slice(i, i + 300)); if (m) { emit(m[0]); i += m[0].length; continue; } }
    if (c === '{' || c === '[') {
      let j = i + 1; while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === (c === '{' ? '}' : ']')) { emit(c + src[j]); i = j + 1; continue; }
      emit(c); depth++; nl(); i++; continue;
    }
    if (c === '}' || c === ']') { depth = Math.max(0, depth - 1); if (!lineStart) nl(); else { trimTail(); parts.push(ind()); } emit(c); i++; continue; }
    if (c === ',') { emit(','); nl(); i++; while (i < n && /[ \t]/.test(src[i])) i++; continue; }
    if (c === ':') { emit(': '); i++; while (i < n && /[ \t]/.test(src[i])) i++; continue; }
    if (c === '\n' || c === '\r' || c === ' ' || c === '\t') { i++; continue; }
    // bare token (number/literal/garbage) up to delimiter
    let j = i; while (j < n && !/[\s,:{}\[\]"']/.test(src[j])) j++; if (j === i) j = i + 1; emit(src.slice(i, j)); i = j;
  }
  const res = parts.join('').replace(/[ \t]+\n/g, '\n').replace(/^\s+|\s+$/g, '');
  return { text: res, valid: !bad && isJson(src) };
}
function isJson(t) { try { JSON.parse(t); return true; } catch { return false; } }
const looksJson = t => /^\s*[\[{]/.test(t);

// ---------- find helpers ----------
function findAll(text, variants, limit = 20000) {
  const low = text.toLowerCase(), res = [];
  for (const v of variants) { let p = 0; while ((p = low.indexOf(v, p)) >= 0 && res.length < limit) { res.push({ s: p, e: p + v.length }); p += Math.max(1, v.length); } }
  res.sort((a, b) => a.s - b.s);
  const o = []; let end = -1; for (const r of res) if (r.s >= end) { o.push(r); end = r.e; } return o;
}

const ROW_H = 18, CH_W = 7.25, SOFT = 600, BIG_TEXT = 150000;
// ---------- CodeEditor: textarea + highlight layer ----------
class CodeEditor {
  constructor({ lang = 'json', value = '', placeholder = '', onChange, readOnly = false, minimal = false } = {}) {
    this.lang = lang; this.onChange = onChange; this.matches = []; this.cur = -1; this.occ = []; this.query = '';
    this.pre = h('pre', { class: 'ce-hl', 'aria-hidden': 'true' }); this.ta = h('textarea', { class: 'ce-ta', spellcheck: 'false', placeholder, readonly: readOnly, wrap: 'off' });
    this.markers = h('div', { class: 'ce-markers' });
    this.bar = h('div', { class: 'findbar hidden' });
    this.el = h('div', { class: 'ce' }, this.bar, h('div', { class: 'ce-body' }, this.pre, this.ta, this.markers));
    this.ta.__inst = this; this.ta.value = value; this._buildBar(); this._wire(); this.render();
  }
  get value() { return this.ta.value; }
  set value(v) { this.ta.value = v ?? ''; this.render(); }
  _wire() {
    const ta = this.ta;
    ta.addEventListener('input', () => { this.render(); this.onChange && this.onChange(ta.value); });
    ta.addEventListener('scroll', () => { this.pre.scrollTop = ta.scrollTop; this.pre.scrollLeft = ta.scrollLeft; if (this._big && !this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this._winCheck(); }); });
    ta.addEventListener('keydown', e => this._key(e));
    ta.addEventListener('keyup', () => this._occ()); ta.addEventListener('mouseup', () => this._occ());
  }
  _key(e) {
    const ta = this.ta;
    if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash' || e.code === 'NumpadDivide') && !e.altKey) { e.preventDefault(); this.toggleComment(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') { e.preventDefault(); this.openFind(); return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !ta.readOnly) { e.preventDefault(); this.replaceSel('  '); }
  }
  replaceSel(str, selectInner) {
    const ta = this.ta; ta.focus(); const s = ta.selectionStart, e = ta.selectionEnd;
    if (!document.execCommand('insertText', false, str)) { ta.setRangeText(str, s, e, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  toggleComment() {
    const ta = this.ta, v = ta.value; let s = ta.selectionStart, e = ta.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1; let le = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e); if (le < 0) le = v.length;
    const lines = v.slice(ls, le).split('\n'); const all = lines.every(l => !l.trim() || /^\s*\/\//.test(l));
    const out = lines.map(l => !l.trim() ? l : all ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.replace(/^(\s*)/, '$1// ')).join('\n');
    ta.setSelectionRange(ls, le); this.replaceSel(out); ta.setSelectionRange(ls, ls + out.length);
  }
  setFind(q) { this.query = q; this.compute(); this.render(); }
  openFind() { this.bar.classList.remove('hidden'); this.fi.focus(); this.fi.select(); const sel = this.ta.value.slice(this.ta.selectionStart, this.ta.selectionEnd); if (sel && !/\n/.test(sel)) { this.fi.value = sel; this.setFind(sel); } }
  closeFind() { this.bar.classList.add('hidden'); this.query = ''; this.matches = []; this.render(); this.ta.focus(); }
  _buildBar() {
    this.fi = h('input', { type: 'text', placeholder: (window.T ? T('search.find') : 'Find') });
    this.cnt = h('span', { class: 'cnt' });
    const nav = d => () => this.step(d);
    this.bar.append(this.fi, this.cnt, h('button', { class: 'ib', title: 'Shift+Enter', onClick: nav(-1) }, '↑'), h('button', { class: 'ib', title: 'Enter', onClick: nav(1) }, '↓'), h('button', { class: 'ib', onClick: () => this.closeFind() }, '✕'));
    this.fi.addEventListener('input', () => { this.setFind(this.fi.value); if (this.matches.length) { this.cur = 0; this.reveal(); } this.updCnt(); });
    this.fi.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); this.closeFind(); } });
  }
  compute() { this.matches = this.query ? findAll(this.ta.value, queryVariants(this.query)) : []; if (this.cur >= this.matches.length) this.cur = this.matches.length - 1; this.updCnt(); }
  updCnt() { this.cnt.textContent = !this.query ? '' : this.matches.length ? (window.T ? T('search.count', this.cur + 1, this.matches.length) : `${this.cur + 1}/${this.matches.length}`) : (window.T ? T('search.none') : '0'); }
  step(d) { if (!this.matches.length) return; this.cur = (this.cur + d + this.matches.length) % this.matches.length; this.reveal(); this.updCnt(); this.render(); }
  reveal() {
    const m = this.matches[this.cur]; if (!m) return; const ta = this.ta; const before = ta.value.slice(0, m.s); const line = before.split('\n').length - 1; const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18;
    ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 2); const col = m.s - (before.lastIndexOf('\n') + 1); ta.scrollLeft = Math.max(0, col * 7.3 - ta.clientWidth / 2); this.pre.scrollTop = ta.scrollTop; this.pre.scrollLeft = ta.scrollLeft;
  }
  _occ() {
    const ta = this.ta; const s = ta.selectionStart, e = ta.selectionEnd; const sel = ta.value.slice(s, e); const prev = this.occ.length;
    this.occ = (sel.length >= 2 && sel.length < 200 && !/\n/.test(sel) && !this.query) ? findAll(ta.value, [sel.toLowerCase()]).filter(r => r.s !== s) : [];
    if (this.occ.length || prev) this.render();
  }
  // line start offsets of the current text (cached): used by the windowed rendering and the scrollbar markers
  _lines() {
    const t = this.ta.value; if (this._lt === t) return this._ls;
    const ls = [0]; let p = -1; while ((p = t.indexOf('\n', p + 1)) >= 0) ls.push(p + 1);
    this._lt = t; this._ls = ls; return ls;
  }
  _lineOf(off) { const ls = this._lines(); let lo = 0, hi = ls.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ls[m] <= off) lo = m; else hi = m - 1; } return lo; }
  render() {
    const t = this.ta.value; const marks = this.matches.map((m, i) => ({ s: m.s, e: m.e, c: i === this.cur ? 'mk-cur' : 'mk-find' })).concat(this.occ.map(m => ({ s: m.s, e: m.e, c: 'mk-occ' })));
    if (t.length > BIG_TEXT) { this._big = true; this._renderWindow(t, marks); }
    else {
      this._big = false;
      const toks = this.lang === 'text' ? varTokens(t) : tokenize(t, this.lang);
      // nosemgrep -- reviewed: HTML is built by paint()/esc() (all text escaped) or from static icon markup; HTML is built by paint()/esc() (all text escaped), static icon markup, or runs inside the sandboxed visualizer iframe (opaque origin, by design)
      this.pre.innerHTML = paint(t, toks, marks) + '\n';
    }
    this._markers();
  }
  // big text (hundreds of KB and more): only the visible lines (+ a margin) are tokenised and painted, the rest are empty spacers.
  // Painting 3 MB at once took seconds and froze the window on paste / Beautify.
  _win() {
    const ls = this._lines(), n = ls.length, top = this.ta.scrollTop, hgt = this.ta.clientHeight || 600;
    return [Math.max(0, Math.floor((top - 8) / ROW_H) - 40), Math.min(n, Math.ceil((top + hgt) / ROW_H) + 40), n];
  }
  _renderWindow(t, marks) {
    const ls = this._lines(); const [a, b, n] = this._win();
    const from = ls[a] ?? 0, to = b < n ? ls[b] - 1 : t.length;
    const seg = t.slice(from, to); const huge = seg.length > 300000;
    const toks = huge ? [] : (this.lang === 'text' ? varTokens(seg) : tokenize(seg, this.lang));
    const mk = marks.filter(m => m.e > from && m.s < to).map(m => ({ s: Math.max(m.s, from) - from, e: Math.min(m.e, to) - from, c: m.c }));
    this._lw = [a, b];
    // nosemgrep -- reviewed: HTML is built by paint()/esc() (all text escaped) or from static icon markup; HTML is built by paint()/esc() (all text escaped), static icon markup, or runs inside the sandboxed visualizer iframe (opaque origin, by design); interpolated values are numbers or escaped text
    this.pre.innerHTML = `<div style="height:${a * ROW_H}px"></div>` + paint(seg, toks, mk) + '\n' + `<div style="height:${Math.max(0, n - b) * ROW_H}px"></div>`;
    this.pre.scrollTop = this.ta.scrollTop; this.pre.scrollLeft = this.ta.scrollLeft;
  }
  _winCheck() {
    if (!this._big) return; const [, , n] = this._win(); const [a, b] = this._lw || [0, 0];
    const v0 = Math.floor(this.ta.scrollTop / ROW_H), v1 = Math.ceil((this.ta.scrollTop + (this.ta.clientHeight || 600)) / ROW_H);
    if ((a > 0 && v0 < a + 8) || (b < n && v1 > b - 8)) this.render();
  }
  _markers() {
    const all = this.matches.length ? this.matches : this.occ; this.markers.textContent = ''; if (!all.length) return;
    const lines = this._lines().length; const seen = new Set();
    for (const m of all.slice(0, 3000)) { const y = Math.round(this._lineOf(m.s) / lines * 1000) / 10; if (seen.has(y)) continue; seen.add(y); this.markers.append(h('i', { style: { top: y + '%' }, class: this.matches.length ? 'f' : 'o' })); }
  }
  beautify() {
    const r = beautify(this.ta.value);
    if (r.text === this.ta.value) return r.valid;
    if (r.text.length > BIG_TEXT || this.ta.value.length > BIG_TEXT) { // execCommand on MBs of text takes tens of seconds (undo stack): set the value directly (no native undo for this step)
      this.ta.value = r.text; this.ta.setSelectionRange(0, 0); this.ta.scrollTop = 0; this.ta.dispatchEvent(new Event('input', { bubbles: true }));
    } else { this.ta.select(); this.replaceSel(r.text); }
    return r.valid;
  }
  focus() { this.ta.focus(); }
}

// ---------- Virtual viewer for large text (1 MB+): beautified, smooth, searchable ----------
class Viewer {
  constructor({ lang = 'json' } = {}) {
    this.lang = lang; this.rows = []; this.matches = []; this.cur = -1; this.occ = []; this.query = '';
    this.sc = h('div', { class: 'vv-sc', tabindex: '0' }); this.sc.__inst = this; this.spacer = h('div', { class: 'vv-spacer' }); this.layer = h('div', { class: 'vv-layer' }); this.sc.append(this.spacer, this.layer);
    this.markers = h('div', { class: 'ce-markers vv-markers' });
    this.bar = h('div', { class: 'findbar hidden' }); this.note = h('div', { class: 'vv-note hidden' });
    this.el = h('div', { class: 'vv' }, this.bar, this.note, h('div', { class: 'ce-body' }, this.sc, this.markers));
    this.fi = h('input', { type: 'text', placeholder: window.T ? T('search.find') : 'Find' }); this.cnt = h('span', { class: 'cnt' });
    this.bar.append(this.fi, this.cnt, h('button', { class: 'ib', onClick: () => this.step(-1) }, '↑'), h('button', { class: 'ib', onClick: () => this.step(1) }, '↓'), h('button', { class: 'ib', onClick: () => this.closeFind() }, '✕'));
    this.fi.addEventListener('input', () => { this.query = this.fi.value; this.compute(); if (this.matches.length) { this.cur = 0; this.reveal(); } this.updCnt(); this.draw(); });
    this.fi.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') this.closeFind(); });
    this.sc.addEventListener('scroll', () => { if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); }); });
    this.sc.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') { e.preventDefault(); this.openFind(); }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') { e.preventDefault(); this.copyAll(); }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && !String(getSelection()).length) { e.preventDefault(); this.copyAll(); }
    });
    this.sc.addEventListener('mouseup', () => this._occ());
    new ResizeObserver(() => this.draw()).observe(this.sc);
  }
  setText(text, { format = true, notice } = {}) {
    let note = notice || '';
    if (format && looksJson(text)) { const r = beautify(text); text = r.text; if (!r.valid) note = (window.T ? T('err.invalidJson') : 'JSON invalid; valid parts formatted'); }
    this.text = text; this.rows = []; this.rowStart = [];
    let pos = 0; for (const line of text.split('\n')) { if (line.length <= SOFT) { this.rows.push(line); this.rowStart.push(pos); } else for (let k = 0; k < line.length; k += SOFT) { this.rows.push(line.slice(k, k + SOFT)); this.rowStart.push(pos + k); } pos += line.length + 1; }
    this.maxLen = this.rows.reduce((m, r) => Math.max(m, r.length), 0); this.spacer.style.height = this.rows.length * ROW_H + 'px'; this.spacer.style.width = Math.max(this.maxLen * CH_W + 24, 10) + 'px';
    this.note.textContent = note; this.note.classList.toggle('hidden', !note);
    this.compute(); this.sc.scrollTop = 0; this.draw();
  }
  get plain() { return this.text || ''; }
  copyAll() { window.pw.clipboard(this.plain); toast(window.T ? T('msg.copied') : 'Copied'); }
  rowOf(off) { let lo = 0, hi = this.rowStart.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.rowStart[mid] <= off) lo = mid; else hi = mid - 1; } return lo; }
  openFind() { this.bar.classList.remove('hidden'); this.fi.focus(); this.fi.select(); }
  closeFind() { this.bar.classList.add('hidden'); this.query = ''; this.matches = []; this.draw(); this._markers(); this.sc.focus(); }
  compute() { this.matches = this.query ? findAll(this.text || '', queryVariants(this.query)) : []; this.updCnt(); this._markers(); }
  updCnt() { this.cnt.textContent = !this.query ? '' : this.matches.length ? (window.T ? T('search.count', this.cur + 1, this.matches.length) : `${this.cur + 1}/${this.matches.length}`) : (window.T ? T('search.none') : '0'); }
  step(d) { if (!this.matches.length) return; this.cur = (this.cur + d + this.matches.length) % this.matches.length; this.reveal(); this.updCnt(); this.draw(); }
  reveal() { const m = this.matches[this.cur]; if (!m) return; const r = this.rowOf(m.s); this.sc.scrollTop = Math.max(0, r * ROW_H - this.sc.clientHeight / 2); const col = m.s - this.rowStart[r]; this.sc.scrollLeft = Math.max(0, col * CH_W - this.sc.clientWidth / 2); }
  _occ() { const sel = String(getSelection()); const prev = this.occ.length; this.occ = (sel.length >= 2 && sel.length < 200 && !/\n/.test(sel) && !this.query) ? findAll(this.text || '', [sel.toLowerCase()], 5000) : []; if (this.occ.length || prev) { this.draw(); this._markers(); } }
  draw() {
    if (!this.rows.length) { this.layer.textContent = ''; return; }
    const top = this.sc.scrollTop, hgt = this.sc.clientHeight || 400; const a = Math.max(0, Math.floor(top / ROW_H) - 20), b = Math.min(this.rows.length, Math.ceil((top + hgt) / ROW_H) + 20);
    const marks = []; const add = (list, cls, curIdx) => { if (!list.length) return; const ra = this.rowStart[a] ?? 0, rb = (this.rowStart[b - 1] ?? 0) + (this.rows[b - 1] || '').length; list.forEach((m, i) => { if (m.e >= ra && m.s <= rb) marks.push({ s: m.s, e: m.e, c: curIdx === i ? 'mk-cur' : cls }); }); };
    add(this.matches, 'mk-find', this.cur); add(this.occ, 'mk-occ', -1);
    let html = ''; const fmt = this.lang === 'json' ? 'json' : this.lang;
    // tokenise the visible window as a single block so multi-line strings/comments stay right enough
    const block = this.rows.slice(a, b).join('\n'); const base = this.rowStart[a] ?? 0; const toks = this.lang === 'text' ? varTokens(block) : tokenize(block, fmt === 'json' ? 'json' : fmt);
    let off = 0;
    for (let r = a; r < b; r++) {
      const line = this.rows[r]; const lt = toks.filter(t => t.e > off && t.s < off + line.length).map(t => ({ s: Math.max(t.s, off) - off, e: Math.min(t.e, off + line.length) - off, c: t.c }));
      const lm = marks.filter(m => m.e > this.rowStart[r] && m.s < this.rowStart[r] + line.length + 1).map(m => ({ s: Math.max(m.s, this.rowStart[r]) - this.rowStart[r], e: Math.min(m.e, this.rowStart[r] + line.length) - this.rowStart[r], c: m.c })).filter(m => m.e > m.s);
      // nosemgrep -- reviewed: interpolated values are numbers or escaped text
      html += `<div class="vv-row" style="top:${r * ROW_H}px">${paint(line, lt, lm) || ' '}</div>`; off += line.length + 1;
    }
    // nosemgrep -- reviewed: HTML is built by paint()/esc() (all text escaped) or from static icon markup; HTML is built by paint()/esc() (all text escaped), static icon markup, or runs inside the sandboxed visualizer iframe (opaque origin, by design)
    this.layer.innerHTML = html;
  }
  _markers() {
    this.markers.textContent = ''; const all = this.matches.length ? this.matches : this.occ; if (!all.length) return; const seen = new Set(); const tot = this.rows.length || 1;
    for (const m of all.slice(0, 4000)) { const y = Math.round(this.rowOf(m.s) / tot * 1000) / 10; if (seen.has(y)) continue; seen.add(y); this.markers.append(h('i', { style: { top: y + '%' }, class: this.matches.length ? 'f' : 'o' })); }
  }
}
let _toastT; function toast(msg) { let t = document.getElementById('toast'); if (!t) { t = h('div', { id: 'toast' }); document.body.append(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove('on'), 1600); }
if (typeof module !== 'undefined') module.exports = { beautify, tokenize, queryVariants, findAll };
