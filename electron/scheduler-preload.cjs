const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantTime', {
  notify: (payload) => ipcRenderer.invoke('assistant-time:notify', payload),
});
