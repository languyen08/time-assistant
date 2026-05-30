const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { app, BrowserWindow, Menu, Notification, dialog, ipcMain } = require('electron');

const isSmokeTest = process.argv.includes('--smoke-test');
if (isSmokeTest) {
  app.setPath('userData', path.join(os.tmpdir(), `friendly-task-reminder-smoke-${process.pid}`));
  app.disableHardwareAcceleration();
}
let mainWindow;
let stickyWindow;

function rendererEntry(windowMode) {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    return {
      type: 'url',
      value: `${devServerUrl}?window=${windowMode}`,
    };
  }

  return {
    type: 'file',
    value: path.join(__dirname, '..', 'dist', 'friendly-task-reminder', 'browser', 'index.html'),
    query: { window: windowMode },
  };
}

function loadRenderer(windowInstance, windowMode) {
  const entry = rendererEntry(windowMode);
  if (entry.type === 'url') {
    windowInstance.loadURL(entry.value);
    return;
  }

  windowInstance.loadFile(entry.value, { query: entry.query });
}

function ownerWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  if (stickyWindow && !stickyWindow.isDestroyed()) {
    return stickyWindow;
  }

  return undefined;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    title: 'Friendly Task Reminder',
    backgroundColor: '#f7efe0',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loadRenderer(mainWindow, 'main');

  if (isSmokeTest) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.close();
      app.quit();
    });
  }

  return mainWindow;
}

function createStickyWindow(alwaysOnTop) {
  if (stickyWindow && !stickyWindow.isDestroyed()) {
    stickyWindow.setAlwaysOnTop(alwaysOnTop);
    stickyWindow.show();
    return stickyWindow;
  }

  stickyWindow = new BrowserWindow({
    width: 340,
    height: 420,
    minWidth: 300,
    minHeight: 320,
    title: 'Task Sticky Note',
    backgroundColor: '#fff2a8',
    alwaysOnTop,
    autoHideMenuBar: true,
    frame: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  stickyWindow.on('closed', () => {
    stickyWindow = undefined;
  });
  loadRenderer(stickyWindow, 'sticky');

  if (isSmokeTest) {
    stickyWindow.webContents.once('did-finish-load', () => {
      stickyWindow.close();
      app.quit();
    });
  }

  return stickyWindow;
}

ipcMain.handle('assistant-time:set-sticky-window', (_event, options) => {
  const enabled = Boolean(options?.enabled);
  const alwaysOnTop = Boolean(options?.alwaysOnTop);

  if (!enabled) {
    stickyWindow?.close();
    return true;
  }

  createStickyWindow(alwaysOnTop);
  return true;
});

ipcMain.handle('assistant-time:focus-main-window', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }

  mainWindow.show();
  mainWindow.focus();
  return true;
});

ipcMain.handle('assistant-time:notify', (_event, payload) => {
  const title =
    typeof payload?.title === 'string' ? payload.title.slice(0, 120) : 'Friendly Task Reminder';
  const body = typeof payload?.body === 'string' ? payload.body.slice(0, 240) : '';

  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }

  return true;
});

ipcMain.handle('assistant-time:save-text-file', async (_event, payload) => {
  const content = typeof payload?.content === 'string' ? payload.content : '';
  const defaultPath =
    typeof payload?.defaultPath === 'string' ? payload.defaultPath : 'friendly-task-reminder.csv';
  const result = await dialog.showSaveDialog(ownerWindow(), {
    defaultPath,
    filters: [{ name: 'CSV files', extensions: ['csv'] }],
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  try {
    await fs.writeFile(result.filePath, content, 'utf8');
    return { ok: true, canceled: false, filePath: result.filePath };
  } catch (error) {
    return {
      ok: false,
      canceled: false,
      error: error instanceof Error ? error.message : 'File could not be saved.',
    };
  }
});

ipcMain.handle('assistant-time:open-text-file', async () => {
  const result = await dialog.showOpenDialog(ownerWindow(), {
    properties: ['openFile'],
    filters: [{ name: 'CSV files', extensions: ['csv'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }

  try {
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');
    return { ok: true, canceled: false, filePath, content };
  } catch (error) {
    return {
      ok: false,
      canceled: false,
      error: error instanceof Error ? error.message : 'File could not be opened.',
    };
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createStickyWindow(true);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createStickyWindow(true);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
