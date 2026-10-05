'use strict';

const { win32: path } = require('node:path');

function resolveStartupExecutablePath(environment = process.env, execPath = process.execPath) {
  const portableExecutablePath = environment.PORTABLE_EXECUTABLE_FILE;
  if (typeof portableExecutablePath === 'string' && portableExecutablePath.length > 0) {
    return portableExecutablePath;
  }
  // Never register an extracted portable process if the launcher identity is missing.
  if (environment.PORTABLE_EXECUTABLE_DIR || environment.PORTABLE_EXECUTABLE_APP_FILENAME) {
    return undefined;
  }
  return execPath;
}

function createStartupLoginController({
  electronApp,
  platform = process.platform,
  environment = process.env,
  execPath = process.execPath,
  smokeTest = false,
  logger = console,
}) {
  const executable = resolveStartupExecutablePath(environment, execPath);
  const reason =
    platform !== 'win32'
      ? 'platform'
      : !electronApp.isPackaged
        ? 'development'
        : smokeTest
          ? 'smoke-test'
          : !executable ||
              !path.isAbsolute(executable) ||
              !/\.exe$/i.test(executable) ||
              executable.includes('"')
            ? 'executable-unavailable'
            : undefined;
  const messages = {
    platform: 'Startup is available on Windows.',
    development: 'Startup is available in packaged Windows builds.',
    'smoke-test': 'Startup is disabled during smoke tests.',
    'executable-unavailable': 'The startup executable could not be found. Try the installer build.',
    'native-error': 'Windows startup could not be changed. Please try again.',
    'read-error': 'Windows startup status could not be read. Please try again.',
    'read-back-mismatch': 'Windows did not confirm the startup change. Check Windows Startup Apps.',
  };

  // Electron 44.4.5 parses the lookup path as a command line. Quoting prevents
  // spaces from truncating it, and is also accepted by setLoginItemSettings.
  const loginItemIdentity = () => ({ path: `"${executable}"`, args: [] });
  const unsupported = () => ({
    ok: false,
    supported: false,
    enabled: false,
    reason,
    message: messages[reason],
  });

  function diagnose(operation, error) {
    logger.error('Windows startup operation failed', { operation, executable, error });
  }

  function readState() {
    const settings = electronApp.getLoginItemSettings(loginItemIdentity());
    return settings.executableWillLaunchAtLogin ?? settings.openAtLogin;
  }

  function getStartAtLogin() {
    if (reason) return unsupported();
    try {
      return { ok: true, supported: true, enabled: readState() };
    } catch (error) {
      diagnose('read', error);
      return {
        ok: false,
        supported: true,
        enabled: null,
        reason: 'read-error',
        message: messages['read-error'],
      };
    }
  }

  function setStartAtLogin(enabled) {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('Start-at-login value must be a boolean.');
    }
    if (reason) return unsupported();

    let nativeError;
    try {
      electronApp.setLoginItemSettings({ ...loginItemIdentity(), openAtLogin: enabled, enabled });
    } catch (error) {
      nativeError = error;
      diagnose('write', error);
    }

    const confirmed = getStartAtLogin();
    if (!confirmed.ok) return confirmed;
    if (nativeError) {
      return { ...confirmed, ok: false, reason: 'native-error', message: messages['native-error'] };
    }
    if (confirmed.enabled !== enabled) {
      diagnose(
        'read-back',
        new Error(`Requested startup=${enabled}, confirmed=${confirmed.enabled}`),
      );
      return {
        ...confirmed,
        ok: false,
        reason: 'read-back-mismatch',
        message: messages['read-back-mismatch'],
      };
    }
    return confirmed;
  }

  return { getStartAtLogin, setStartAtLogin };
}

module.exports = { createStartupLoginController, resolveStartupExecutablePath };
