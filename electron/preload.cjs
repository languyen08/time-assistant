const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantTime', {
  platform: process.platform,
  focusMainWindow: () => ipcRenderer.invoke('assistant-time:focus-main-window'),
  notify: (payload) => ipcRenderer.invoke('assistant-time:notify', payload),
  openTextFile: () => ipcRenderer.invoke('assistant-time:open-text-file'),
  saveTextFile: (payload) => ipcRenderer.invoke('assistant-time:save-text-file', payload),
  setStickyWindow: (options) => ipcRenderer.invoke('assistant-time:set-sticky-window', options),
});
