import { describe, expect, it, vi } from 'vitest';
import startupLoginModule from './startup-login.cjs';

const { createStartupLoginController, resolveStartupExecutablePath } = startupLoginModule;

function createElectronApp(overrides = {}) {
  return {
    isPackaged: true,
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn(),
    ...overrides,
  };
}

describe('startup login controller', () => {
  it('uses the original portable executable when Electron Builder exposes it', () => {
    expect(
      resolveStartupExecutablePath(
        { PORTABLE_EXECUTABLE_FILE: 'C:\\Apps\\Time Assistant.exe' },
        'C:\\Temp\\extracted\\Time Assistant.exe',
      ),
    ).toBe('C:\\Apps\\Time Assistant.exe');
  });

  it('falls back to process.execPath for normal packaged applications', () => {
    expect(resolveStartupExecutablePath({}, 'C:\\Apps\\Time Assistant.exe')).toBe(
      'C:\\Apps\\Time Assistant.exe',
    );
  });

  it('does not read or register a startup item in development mode', () => {
    const electronApp = createElectronApp({ isPackaged: false });
    const controller = createStartupLoginController({
      electronApp,
      platform: 'win32',
      execPath: 'C:\\Dev\\electron.exe',
    });

    expect(controller.getStartAtLogin()).toBe(false);
    expect(controller.setStartAtLogin(true)).toBe(false);
    expect(electronApp.getLoginItemSettings).not.toHaveBeenCalled();
    expect(electronApp.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('reads the actual enabled state reported by Windows', () => {
    const electronApp = createElectronApp({
      getLoginItemSettings: vi.fn(() => ({
        openAtLogin: true,
        executableWillLaunchAtLogin: true,
      })),
    });
    const controller = createStartupLoginController({
      electronApp,
      platform: 'win32',
      execPath: 'C:\\Apps\\Time Assistant.exe',
    });

    expect(controller.getStartAtLogin()).toBe(true);
    expect(electronApp.getLoginItemSettings).toHaveBeenCalledWith({
      path: 'C:\\Apps\\Time Assistant.exe',
      args: [],
    });
  });

  it('enables and disables startup using the same executable identity for set and get', () => {
    let enabled = false;
    const electronApp = createElectronApp({
      getLoginItemSettings: vi.fn(() => ({
        openAtLogin: enabled,
        executableWillLaunchAtLogin: enabled,
      })),
      setLoginItemSettings: vi.fn((settings) => {
        enabled = settings.openAtLogin;
      }),
    });
    const controller = createStartupLoginController({
      electronApp,
      platform: 'win32',
      environment: { PORTABLE_EXECUTABLE_FILE: 'D:\\Portable\\Time Assistant.exe' },
      execPath: 'C:\\Temp\\extracted\\Time Assistant.exe',
    });

    expect(controller.setStartAtLogin(true)).toBe(true);
    expect(controller.setStartAtLogin(false)).toBe(false);
    expect(electronApp.setLoginItemSettings).toHaveBeenNthCalledWith(1, {
      path: 'D:\\Portable\\Time Assistant.exe',
      args: [],
      openAtLogin: true,
    });
    expect(electronApp.setLoginItemSettings).toHaveBeenNthCalledWith(2, {
      path: 'D:\\Portable\\Time Assistant.exe',
      args: [],
      openAtLogin: false,
    });
    expect(electronApp.getLoginItemSettings).toHaveBeenLastCalledWith({
      path: 'D:\\Portable\\Time Assistant.exe',
      args: [],
    });
  });

  it('rejects invalid IPC values before calling Electron', () => {
    const electronApp = createElectronApp();
    const controller = createStartupLoginController({ electronApp, platform: 'win32' });

    expect(() => controller.setStartAtLogin('yes')).toThrow(TypeError);
    expect(electronApp.setLoginItemSettings).not.toHaveBeenCalled();
  });
});
