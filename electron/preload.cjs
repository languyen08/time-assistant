const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantTime', {
  platform: process.platform,
  closeMainWindow: () => ipcRenderer.invoke('assistant-time:close-main-window'),
  focusMainWindow: () => ipcRenderer.invoke('assistant-time:focus-main-window'),
  getMainWindowMaximized: () => ipcRenderer.invoke('assistant-time:get-main-window-maximized'),
  getReminderPresenter: () => ipcRenderer.invoke('assistant-time:get-reminder-presenter'),
  getStartAtLogin: () => ipcRenderer.invoke('assistant-time:get-start-at-login'),
  hideStickyWindow: () => ipcRenderer.invoke('assistant-time:hide-sticky-window'),
  minimizeStickyWindow: () => ipcRenderer.invoke('assistant-time:minimize-sticky-window'),
  notify: (payload) => ipcRenderer.invoke('assistant-time:notify', payload),
  openUserGuide: () => ipcRenderer.invoke('assistant-time:open-user-guide'),
  openTextFile: () => ipcRenderer.invoke('assistant-time:open-text-file'),
  setReminderOverlayState: (payload) =>
    ipcRenderer.invoke('assistant-time:set-reminder-overlay-state', payload),
  resizeStickyWindow: (payload) =>
    ipcRenderer.invoke('assistant-time:resize-sticky-window', payload),
  saveTextFile: (payload) => ipcRenderer.invoke('assistant-time:save-text-file', payload),
  setStartAtLogin: (enabled) => ipcRenderer.invoke('assistant-time:set-start-at-login', enabled),
  setStickyWindow: (options) => ipcRenderer.invoke('assistant-time:set-sticky-window', options),
  toggleMainWindowMaximized: () =>
    ipcRenderer.invoke('assistant-time:toggle-main-window-maximized'),
  onMainWindowMaximizedChanged: (callback) => {
    const listener = (_event, maximized) => callback(maximized === true);
    ipcRenderer.on('assistant-time:main-window-maximized-changed', listener);
    return () => {
      ipcRenderer.removeListener('assistant-time:main-window-maximized-changed', listener);
    };
  },
  onReminderPresenterChanged: (callback) => {
    const listener = (_event, value) => {
      const presenter = value === 'main' || value === 'sticky' ? value : 'none';
      callback(presenter);
    };
    ipcRenderer.on('assistant-time:reminder-presenter-changed', listener);
    return () => {
      ipcRenderer.removeListener('assistant-time:reminder-presenter-changed', listener);
    };
  },
});
