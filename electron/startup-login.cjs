'use strict';

function resolveStartupExecutablePath(environment = process.env, execPath = process.execPath) {
  const portableExecutablePath = environment.PORTABLE_EXECUTABLE_FILE;
  return typeof portableExecutablePath === 'string' && portableExecutablePath.length > 0
    ? portableExecutablePath
    : execPath;
}

function createStartupLoginController({
  electronApp,
  platform = process.platform,
  environment = process.env,
  execPath = process.execPath,
  smokeTest = false,
}) {
  const isSupported = () => platform === 'win32' && electronApp.isPackaged && !smokeTest;
  const loginItemIdentity = () => ({
    path: resolveStartupExecutablePath(environment, execPath),
    args: [],
  });

  function getStartAtLogin() {
    if (!isSupported()) {
      return false;
    }

    const settings = electronApp.getLoginItemSettings(loginItemIdentity());
    return settings.executableWillLaunchAtLogin ?? settings.openAtLogin;
  }

  function setStartAtLogin(enabled) {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('Start-at-login value must be a boolean.');
    }

    if (!isSupported()) {
      return false;
    }

    electronApp.setLoginItemSettings({
      ...loginItemIdentity(),
      openAtLogin: enabled,
    });
    return getStartAtLogin();
  }

  return {
    getStartAtLogin,
    setStartAtLogin,
  };
}

module.exports = {
  createStartupLoginController,
  resolveStartupExecutablePath,
};
