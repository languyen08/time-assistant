const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const isSmokeTest = process.argv.includes('--smoke-test');

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    title: 'Friendly Task Reminder',
    backgroundColor: '#f7efe0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, '..', 'dist', 'friendly-task-reminder', 'browser', 'index.html'),
    );
  }

  if (isSmokeTest) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.close();
      app.quit();
    });
  }

  return mainWindow;
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
