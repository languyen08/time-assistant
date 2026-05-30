const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('assistantTime', {
  platform: process.platform,
});
