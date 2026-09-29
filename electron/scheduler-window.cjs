function isUsableWindow(windowInstance) {
  return Boolean(windowInstance && !windowInstance.isDestroyed());
}

function schedulerWindowOptions() {
  return {
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  };
}

function createSchedulerWindow({ BrowserWindow, loadRenderer, isShuttingDown, onUnexpectedLoss }) {
  const windowInstance = new BrowserWindow(schedulerWindowOptions());
  let lossReported = false;

  const reportUnexpectedLoss = () => {
    if (lossReported) {
      return;
    }

    lossReported = true;
    if (!isShuttingDown()) {
      onUnexpectedLoss(windowInstance);
    }
  };

  windowInstance.on('closed', reportUnexpectedLoss);
  windowInstance.webContents.on('render-process-gone', () => {
    if (!windowInstance.isDestroyed()) {
      windowInstance.destroy();
    }
    reportUnexpectedLoss();
  });

  loadRenderer(windowInstance, 'scheduler');
  return windowInstance;
}

function ensureSchedulerWindow(currentWindow, createWindow) {
  return isUsableWindow(currentWindow) ? currentWindow : createWindow();
}

module.exports = {
  createSchedulerWindow,
  ensureSchedulerWindow,
  schedulerWindowOptions,
};
