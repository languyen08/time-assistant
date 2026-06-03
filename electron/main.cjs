const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { app, BrowserWindow, Menu, Notification, dialog, ipcMain, screen } = require('electron');

const APP_NAME = 'Time Assistant';
const APP_ID = 'local.assistant-time.time-assistant';

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

const isSmokeTest = process.argv.includes('--smoke-test');
if (isSmokeTest) {
  app.setPath('userData', path.join(os.tmpdir(), `friendly-task-reminder-smoke-${process.pid}`));
  app.disableHardwareAcceleration();
}

const STICKY_NOTE_COLORS = {
  yellow: '#f7efb0',
  green: '#cfe6d2',
  pink: '#f7d8df',
  purple: '#e2d8f2',
  blue: '#d4e5f7',
  gray: '#e1e1e1',
};
const STICKY_NOTE_WIDTH = 460;
const STICKY_RESIZE_REASONS = new Set([
  'content-change',
  'task-count-change',
  'active-task-change',
  'settings-note-count-change',
  'initial-open',
  'task-content-change',
  'reminder-opened',
  'reminder-closed',
  'color-change',
]);

let mainWindow;
let stickyWindow;
let stickyAlwaysOnTopPreference = true;

function resolveAppIconPath() {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(__dirname, '..', 'build-resources', 'app-icon.ico'),
          path.join(process.resourcesPath, 'build-resources', 'app-icon.ico'),
          path.join(__dirname, '..', 'src', 'assets', 'icons', 'app-icon.png'),
          path.join(process.resourcesPath, 'src', 'assets', 'icons', 'app-icon.png'),
        ]
      : [
          path.join(__dirname, '..', 'src', 'assets', 'icons', 'app-icon.png'),
          path.join(process.resourcesPath, 'src', 'assets', 'icons', 'app-icon.png'),
        ];

  return candidates.find((candidate) => {
    try {
      fsSync.accessSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

const appIconPath = resolveAppIconPath();

function resolveNotificationIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'src', 'assets', 'icons', 'app-icon-notification.png'),
    path.join(process.resourcesPath, 'src', 'assets', 'icons', 'app-icon-notification.png'),
    appIconPath,
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      fsSync.accessSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

const notificationIconPath = resolveNotificationIconPath();

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
    title: APP_NAME,
    backgroundColor: '#f7efe0',
    autoHideMenuBar: true,
    frame: false,
    ...(appIconPath ? { icon: appIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loadRenderer(mainWindow, 'main');
  if (appIconPath) {
    mainWindow.setIcon(appIconPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });

  if (isSmokeTest) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.close();
      app.quit();
    });
  }

  return mainWindow;
}

function stickyColorValue(color) {
  return STICKY_NOTE_COLORS[color] ?? STICKY_NOTE_COLORS.yellow;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stickyHeightBounds() {
  const minHeight = 240;
  const fallbackMax = 720;
  if (!stickyWindow || stickyWindow.isDestroyed()) {
    return { minHeight, maxHeight: fallbackMax };
  }

  const display = screen.getDisplayMatching(stickyWindow.getBounds());
  const maxHeight = Math.max(minHeight + 40, display.workAreaSize.height - 16);
  return { minHeight, maxHeight };
}

function createStickyWindow(alwaysOnTop, color) {
  stickyAlwaysOnTopPreference = alwaysOnTop;
  if (stickyWindow && !stickyWindow.isDestroyed()) {
    stickyWindow.setAlwaysOnTop(alwaysOnTop);
    stickyWindow.setBackgroundColor(stickyColorValue(color));
    stickyWindow.setIgnoreMouseEvents(false);
    stickyWindow.show();
    return stickyWindow;
  }

  stickyWindow = new BrowserWindow({
    width: STICKY_NOTE_WIDTH,
    height: 360,
    useContentSize: true,
    minWidth: STICKY_NOTE_WIDTH,
    maxWidth: STICKY_NOTE_WIDTH,
    minHeight: 240,
    maxHeight: Math.max(280, screen.getPrimaryDisplay().workAreaSize.height - 16),
    title: 'Task Sticky Note',
    backgroundColor: stickyColorValue(color),
    alwaysOnTop,
    autoHideMenuBar: true,
    frame: false,
    resizable: false,
    maximizable: false,
    ...(appIconPath ? { icon: appIconPath } : {}),
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
  if (appIconPath) {
    stickyWindow.setIcon(appIconPath);
  }

  if (isSmokeTest) {
    stickyWindow.webContents.once('did-finish-load', () => {
      stickyWindow.close();
      app.quit();
    });
  }

  return stickyWindow;
}

ipcMain.handle('assistant-time:set-sticky-window', (_event, options) => {
  if (!isRecord(options)) {
    return false;
  }

  const enabled = options.enabled === true;
  const alwaysOnTop = options.alwaysOnTop === true;
  const color = typeof options.color === 'string' ? options.color : 'yellow';

  if (!enabled) {
    stickyWindow?.close();
    return true;
  }

  createStickyWindow(alwaysOnTop, color);
  return true;
});

ipcMain.handle('assistant-time:set-reminder-overlay-state', (_event, payload) => {
  if (!isRecord(payload)) {
    return false;
  }

  const active = payload.active === true;
  const stickyAlwaysOnTop =
    payload.stickyAlwaysOnTop === undefined
      ? stickyAlwaysOnTopPreference
      : payload.stickyAlwaysOnTop === true;
  stickyAlwaysOnTopPreference = stickyAlwaysOnTop;

  if (!stickyWindow || stickyWindow.isDestroyed()) {
    return false;
  }

  if (active) {
    stickyWindow.setAlwaysOnTop(false);
    stickyWindow.setIgnoreMouseEvents(true, { forward: true });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    return true;
  }

  stickyWindow.setIgnoreMouseEvents(false);
  stickyWindow.setAlwaysOnTop(stickyAlwaysOnTopPreference);
  return true;
});

ipcMain.handle('assistant-time:resize-sticky-window', (_event, payload) => {
  if (!isRecord(payload)) {
    return false;
  }

  if (!stickyWindow || stickyWindow.isDestroyed()) {
    return false;
  }

  const nextHeight = Number(payload.height);
  const reason = typeof payload.reason === 'string' ? payload.reason : 'content-change';
  if (!Number.isFinite(nextHeight)) {
    return false;
  }

  if (!STICKY_RESIZE_REASONS.has(reason) || reason === 'color-change') {
    return false;
  }

  const { minHeight, maxHeight } = stickyHeightBounds();
  const nextBoundedHeight = Math.min(maxHeight, Math.max(minHeight, Math.ceil(nextHeight)));
  stickyWindow.setContentSize(STICKY_NOTE_WIDTH, nextBoundedHeight, true);
  return true;
});

ipcMain.handle('assistant-time:minimize-sticky-window', () => {
  if (!stickyWindow || stickyWindow.isDestroyed()) {
    return false;
  }

  stickyWindow.minimize();
  return true;
});

ipcMain.handle('assistant-time:close-app', () => {
  app.quit();
  return true;
});

ipcMain.handle('assistant-time:close-main-window', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  mainWindow.close();
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
  if (!isRecord(payload)) {
    return false;
  }

  const title =
    typeof payload.title === 'string' ? payload.title.slice(0, 120) : APP_NAME;
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 240) : '';

  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
      ...(notificationIconPath ? { icon: notificationIconPath } : {}),
    }).show();
  }

  return true;
});

ipcMain.handle('assistant-time:save-text-file', async (_event, payload) => {
  if (!isRecord(payload)) {
    return { ok: false, canceled: false, error: 'Invalid file payload.' };
  }

  const content = typeof payload.content === 'string' ? payload.content : '';
  const defaultPath =
    typeof payload.defaultPath === 'string' ? payload.defaultPath : 'friendly-task-reminder.csv';
  const filters = Array.isArray(payload.filters)
    ? payload.filters
        .filter(
          (filter) =>
            typeof filter?.name === 'string' &&
            Array.isArray(filter.extensions) &&
            filter.extensions.every((extension) => typeof extension === 'string'),
        )
        .map((filter) => ({
          name: filter.name.slice(0, 80),
          extensions: filter.extensions.map((extension) => extension.slice(0, 12)),
        }))
    : [{ name: 'CSV files', extensions: ['csv'] }];
  const result = await dialog.showSaveDialog(ownerWindow(), {
    defaultPath,
    filters,
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
  createStickyWindow(true, 'yellow');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createStickyWindow(true, 'yellow');
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
