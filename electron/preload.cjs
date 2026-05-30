const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantTime', {
  platform: process.platform,
  focusMainWindow: () => ipcRenderer.invoke('assistant-time:focus-main-window'),
  notify: (payload) => ipcRenderer.invoke('assistant-time:notify', payload),
  setStickyWindow: (options) => ipcRenderer.invoke('assistant-time:set-sticky-window', options),
});
