'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => { const f = (_e, ...a) => cb(...a); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };
contextBridge.exposeInMainWorld('pw', {
  init: inv('app:init'), saveCollection: inv('collection:save'), syncCollection: inv('collection:sync'), saveGlobals: inv('globals:save'), saveSettings: inv('settings:save'), patchSettings: inv('settings:patch'),
  checkPaths: inv('paths:check'), pickFolder: inv('dialog:folder'), pickData: inv('dialog:openData'), pickFile: inv('dialog:openFile'),
  importFile: inv('import:file'), importCurl: inv('import:curl'), makeCurl: inv('curl:make'), clipboard: inv('clipboard:write'), clipboardRead: inv('clipboard:read'), saveText: inv('save:text'), historyPrune: inv('history:prune'), secretLock: inv('secret:lock'), secretStatus: inv('secret:status'), authStatus: inv('auth:status'), authReset: inv('auth:reset'), winTheme: inv('win:theme'), secretSwitch: inv('secret:switch'), winRole: inv('win:role'), exportCollection: inv('export:collection'),
  saveBody: inv('save:body'), saveCsv: inv('save:csv'),
  historyGet: inv('history:get'), historyDelete: inv('history:delete'), historyClear: inv('history:clear'),
  secretEncrypt: inv('secret:encrypt'), secretReveal: inv('secret:reveal'),
  logClear: inv('log:clear'), logLevel: inv('log:level'),
  runStart: inv('run:start'), runPause: inv('run:pause'), runResume: inv('run:resume'), runStop: inv('run:stop'),
  quitConfirmed: () => ipcRenderer.send('app:quit-confirmed'), openHotkeys: () => ipcRenderer.send('hotkeys:open'), rebuildMenu: () => ipcRenderer.send('menu:rebuild'),
  onLog: on('log:entry'), onRunRecord: on('run:record'), onRunState: on('run:state'), onRunFinished: on('run:finished'), onGlobals: on('globals:updated'),
  onPaths: on('paths:status'), onMenu: on('menu:action'), onRequestClose: on('app:request-close'),
});
