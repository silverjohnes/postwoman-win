'use strict';
// Secret variables: AES-256-GCM with a random data key. The data key itself is wrapped with the
// OS user-bound protector (Windows DPAPI via Electron safeStorage) and kept in userData/secret.key.
// Values in globals.json look like "pwenc:1:<iv>.<tag>.<ciphertext>" (base64) - file format unchanged.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const PREFIX = 'pwenc:1:';

class Secrets {
  // account: key wrapped by the OS user protector (DPAPI via safeStorage), file secret.key
  // local:   key stored as a plain file in userData (secret.local.key); not tied to the OS account, never travels with the data folder
  constructor({ dir, account, mode, log }) { this.dir = dir; this.account = account; this.mode = mode || (() => 'account'); this.log = log || (() => {}); this.keys = {}; }
  _file(m) { return path.join(this.dir, m === 'local' ? 'secret.local.key' : 'secret.key'); }
  builtinAvailable() { try { return !!this.account.available(); } catch { return false; } }
  _fail(code, msg) { const e = new Error(msg); e.code = code; return e; }
  _loadKey(m = this.mode(), create = true) {
    if (this.keys[m]) return this.keys[m];
    const f = this._file(m); let key;
    if (fs.existsSync(f)) {
      try { key = m === 'local' ? fs.readFileSync(f).slice(5) : this.account.unwrap(fs.readFileSync(f)); } catch (e) { throw this._fail('DECRYPT', 'cannot read the key: ' + e.message); }
      if (!key || key.length !== 32) throw this._fail('DECRYPT', 'bad key file');
    } else {
      if (!create) throw this._fail('DECRYPT', 'no key');
      if (m === 'account' && !this.builtinAvailable()) throw this._fail('NOBUILTIN', 'built-in (account) encryption is unavailable');
      key = crypto.randomBytes(32); fs.mkdirSync(this.dir, { recursive: true });
      try { fs.writeFileSync(f, m === 'local' ? Buffer.concat([Buffer.from('LOCAL'), key]) : this.account.wrap(key), { mode: 0o600 }); } catch (e) { throw this._fail(m === 'account' ? 'NOBUILTIN' : 'IO', e.message); }
      this.log('info', 'secrets', `created new data key (${m})`);
    }
    return (this.keys[m] = key);
  }
  isEncrypted(v) { return typeof v === 'string' && v.startsWith(PREFIX); }
  encrypt(plain, m) {
    const key = this._loadKey(m), iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
    return PREFIX + [iv, c.getAuthTag(), ct].map(b => b.toString('base64')).join('.');
  }
  decrypt(enc, m) {
    if (!this.isEncrypted(enc)) return enc;
    const key = this._loadKey(m, false);
    try {
      const [iv, tag, ct] = enc.slice(PREFIX.length).split('.').map(s => Buffer.from(s, 'base64'));
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    } catch (e) { throw this._fail('DECRYPT', 'cannot decrypt (the key belongs to another account or computer)'); }
  }
  // re-encrypt every secret value from one mode to the other; returns { list, converted, failed }
  migrate(list, from, to, force) {
    this._loadKey(to);                                   // throws NOBUILTIN early when the target is unavailable
    const out = [], res = { converted: 0, failed: 0 };
    for (const g of list) {
      if (!g.secret || !g.value) { out.push(g); continue; }
      try { const plain = this.isEncrypted(g.value) ? this.decrypt(g.value, from) : g.value; out.push({ ...g, value: this.encrypt(plain, to) }); res.converted++; }
      catch (e) { res.failed++; out.push(force ? { ...g, value: '' } : g); }
    }
    res.list = out; return res;
  }
  dropKey(m) { try { fs.unlinkSync(this._file(m)); } catch {} delete this.keys[m]; }
}

// Windows Hello / biometric / PIN prompt through WinRT UserConsentVerifier
function windowsHello(message) {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve({ ok: true, unavailable: true, reason: 'not-windows' });
    const msg = String(message || 'Postwoman').replace(/'/g, "''");
    const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime]
$as=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'})[0]
function Await($op,$t){$task=$as.MakeGenericMethod($t).Invoke($null,@($op));$task.Wait(-1)|Out-Null;$task.Result}
$a=Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
if($a -ne 'Available'){Write-Output "UNAVAILABLE:$a";exit 0}
$r=Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync('${msg}')) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
Write-Output "RESULT:$r"`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 120000, windowsHide: false }, (err, out) => {
      const o = String(out || '').trim();
      if (err && !o) return resolve({ ok: false, error: err.message });
      if (o.startsWith('UNAVAILABLE')) return resolve({ ok: true, unavailable: true, reason: o.slice(12) });
      resolve({ ok: o === 'RESULT:Verified', result: o.slice(7) });
    });
  });
}
module.exports = { Secrets, windowsHello, PREFIX };
