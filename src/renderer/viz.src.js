'use strict';
// Visualize sandbox: runs in its own sandboxed iframe (opaque origin, no access to the app or the pw bridge).
// Receives {t: handlebars template, d: data} via postMessage and renders it like Postman's pm.visualizer.
addEventListener('message', e => {
  if (e.source !== window.parent) return; // only the host window may send a template (this frame has an opaque origin, so the source is the check)
  const m = e.data || {}; if (typeof m.t !== 'string') return;
  try {
    const html = Handlebars.compile(m.t)(m.d);
    const shim = '<script>window.pm={getData:function(cb){cb(null,' + JSON.stringify(m.d ?? {}).replace(/</g, '\\u003c') + ')},onload:function(){}};<\/script>';
    // nosemgrep -- reviewed: HTML is built by paint()/esc() (all text escaped), static icon markup, or runs inside the sandboxed visualizer iframe (opaque origin, by design)
    document.open(); document.write('<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui,sans-serif;margin:8px;color:#222}</style>' + shim + html); document.close();
  } catch (err) { document.body.textContent = String(err.message || err); }
});
