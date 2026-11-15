'use strict';
const LEVELS = ['debug', 'info', 'warn', 'error'];
class Logger {
  constructor() { this.entries = []; this.level = 'debug'; this.sinks = []; this.max = 20000; }
  setLevel(l) { if (LEVELS.includes(l)) this.level = l; }
  onEntry(fn) { this.sinks.push(fn); }
  log(level, scope, msg, data) {
    if (LEVELS.indexOf(level) < LEVELS.indexOf(this.level)) return;
    const e = { t: Date.now(), level, scope, msg: String(msg) + (data !== undefined ? ' ' + safe(data) : '') };
    this.entries.push(e);
    if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
    for (const s of this.sinks) { try { s(e); } catch {} }
  }
  debug(s, m, d) { this.log('debug', s, m, d); }
  info(s, m, d) { this.log('info', s, m, d); }
  warn(s, m, d) { this.log('warn', s, m, d); }
  error(s, m, d) { this.log('error', s, m, d); }
}
function safe(d) { try { return typeof d === 'string' ? d : JSON.stringify(d); } catch { return String(d); } }
module.exports = { Logger, LEVELS, logger: new Logger() };
