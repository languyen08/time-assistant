const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantTime', {
  platform: process.platform,
  closeApp: () => ipcRenderer.invoke('assistant-time:close-app'),
  closeMainWindow: () => ipcRenderer.invoke('assistant-time:close-main-window'),
  focusMainWindow: () => ipcRenderer.invoke('assistant-time:focus-main-window'),
  minimizeStickyWindow: () => ipcRenderer.invoke('assistant-time:minimize-sticky-window'),
  notify: (payload) => ipcRenderer.invoke('assistant-time:notify', payload),
  openTextFile: () => ipcRenderer.invoke('assistant-time:open-text-file'),
  setReminderOverlayState: (payload) =>
    ipcRenderer.invoke('assistant-time:set-reminder-overlay-state', payload),
  resizeStickyWindow: (payload) =>
    ipcRenderer.invoke('assistant-time:resize-sticky-window', payload),
  saveTextFile: (payload) => ipcRenderer.invoke('assistant-time:save-text-file', payload),
  setStickyWindow: (options) => ipcRenderer.invoke('assistant-time:set-sticky-window', options),
});
