function isUsableWindow(windowInstance) {
  return Boolean(windowInstance && !windowInstance.isDestroyed());
}

function getMainWindowMaximized(getMainWindow) {
  const windowInstance = getMainWindow();
  return isUsableWindow(windowInstance) ? windowInstance.isMaximized() : false;
}

function toggleMainWindowMaximized(getMainWindow) {
  const windowInstance = getMainWindow();
  if (!isUsableWindow(windowInstance)) {
    return false;
  }

  if (windowInstance.isMaximized()) {
    windowInstance.unmaximize();
  } else {
    windowInstance.maximize();
  }

  return windowInstance.isMaximized();
}

function openMainWindow({ getMainWindow, createMainWindow }) {
  let windowInstance = getMainWindow();
  if (!isUsableWindow(windowInstance)) {
    windowInstance = createMainWindow();
  }

  if (!isUsableWindow(windowInstance)) {
    return false;
  }

  if (windowInstance.isMinimized()) {
    windowInstance.restore();
  }

  windowInstance.show();
  windowInstance.focus();
  return true;
}

function closeMainWindow(getMainWindow) {
  const windowInstance = getMainWindow();
  if (!isUsableWindow(windowInstance)) {
    return false;
  }

  windowInstance.close();
  return true;
}

function hideStickyWindow(getStickyWindow) {
  const windowInstance = getStickyWindow();
  if (!isUsableWindow(windowInstance)) {
    return false;
  }

  windowInstance.hide();
  return true;
}

function showStickyWindow(getStickyWindow) {
  const windowInstance = getStickyWindow();
  if (!isUsableWindow(windowInstance)) {
    return false;
  }

  if (!windowInstance.isVisible()) {
    windowInstance.show();
  }
  windowInstance.focus();
  return true;
}

function quitApplication({ electronApp, getWindows, getTray }) {
  for (const windowInstance of getWindows()) {
    if (isUsableWindow(windowInstance)) {
      windowInstance.destroy();
    }
  }

  const trayInstance = getTray();
  if (trayInstance && !trayInstance.isDestroyed()) {
    trayInstance.destroy();
  }

  electronApp.quit();
  return true;
}

module.exports = {
  closeMainWindow,
  getMainWindowMaximized,
  hideStickyWindow,
  isUsableWindow,
  openMainWindow,
  quitApplication,
  showStickyWindow,
  toggleMainWindowMaximized,
};
