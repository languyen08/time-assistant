import { describe, expect, it, vi } from 'vitest';
import startupLoginModule from './startup-login.cjs';

const { createStartupLoginController, resolveStartupExecutablePath } = startupLoginModule;
const executable = 'C:\\Apps With Spaces\\Time Assistant.exe';
const identity = { path: `"${executable}"`, args: [] };

function setup(overrides = {}, options = {}) {
  let enabled = false;
  const electronApp = {
    isPackaged: true,
    getLoginItemSettings: vi.fn(() => ({
      openAtLogin: enabled,
      executableWillLaunchAtLogin: enabled,
    })),
    setLoginItemSettings: vi.fn((settings) => {
      enabled = settings.openAtLogin;
    }),
    ...overrides,
  };
  const logger = { error: vi.fn() };
  const controller = createStartupLoginController({
    electronApp,
    logger,
    platform: 'win32',
    environment: {},
    execPath: executable,
    ...options,
  });
  return { electronApp, controller, logger };
}

describe('startup login controller', () => {
  it('resolves the original portable launcher instead of its temporary process', () => {
    expect(
      resolveStartupExecutablePath(
        { PORTABLE_EXECUTABLE_FILE: executable },
        'C:\\Temp\\extracted.exe',
      ),
    ).toBe(executable);
    expect(resolveStartupExecutablePath({}, executable)).toBe(executable);
    expect(
      resolveStartupExecutablePath(
        { PORTABLE_EXECUTABLE_DIR: 'C:\\Portable' },
        'C:\\Temp\\extracted.exe',
      ),
    ).toBeUndefined();
  });

  it.each([
    [{ isPackaged: false }, {}, 'development'],
    [{}, { platform: 'linux' }, 'platform'],
    [{}, { smokeTest: true }, 'smoke-test'],
    [{}, { environment: { PORTABLE_EXECUTABLE_DIR: 'D:\\Portable' } }, 'executable-unavailable'],
  ])('does not read or write unsupported startup configuration', (overrides, options, reason) => {
    const { controller, electronApp } = setup(overrides, options);
    expect(controller.getStartAtLogin()).toMatchObject({
      supported: false,
      enabled: false,
      reason,
    });
    expect(controller.setStartAtLogin(true)).toMatchObject({ ok: false, reason });
    expect(electronApp.getLoginItemSettings).not.toHaveBeenCalled();
    expect(electronApp.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('reads the OS state including Startup Apps approval', () => {
    const { controller, electronApp } = setup({
      getLoginItemSettings: vi.fn(() => ({
        openAtLogin: true,
        executableWillLaunchAtLogin: false,
      })),
    });
    expect(controller.getStartAtLogin()).toEqual({ ok: true, supported: true, enabled: false });
    expect(electronApp.getLoginItemSettings).toHaveBeenCalledWith(identity);
  });

  it.each(['unpacked', 'portable'])(
    'enables/disables %s with quoted, identical read/write targets',
    (packaging) => {
      const { controller, electronApp } = setup(
        {},
        {
          environment: packaging === 'portable' ? { PORTABLE_EXECUTABLE_FILE: executable } : {},
          execPath: packaging === 'portable' ? 'C:\\Temp\\extracted.exe' : executable,
        },
      );
      expect(controller.setStartAtLogin(true)).toEqual({
        ok: true,
        supported: true,
        enabled: true,
      });
      expect(controller.setStartAtLogin(false)).toEqual({
        ok: true,
        supported: true,
        enabled: false,
      });
      expect(electronApp.setLoginItemSettings).toHaveBeenNthCalledWith(1, {
        ...identity,
        openAtLogin: true,
        enabled: true,
      });
      expect(electronApp.setLoginItemSettings).toHaveBeenNthCalledWith(2, {
        ...identity,
        openAtLogin: false,
        enabled: false,
      });
      expect(electronApp.getLoginItemSettings).toHaveBeenLastCalledWith(identity);
    },
  );

  it('prevents the pinned Electron path-with-spaces false negative', () => {
    let written = false;
    const { controller } = setup({
      setLoginItemSettings: vi.fn(() => {
        written = true;
      }),
      getLoginItemSettings: vi.fn(({ path }) => ({
        openAtLogin: written,
        executableWillLaunchAtLogin: written && path.startsWith('"') && path.endsWith('"'),
      })),
    });
    expect(controller.setStartAtLogin(true).enabled).toBe(true);
  });

  it('returns confirmed state and logs a native write error', () => {
    const error = new Error('Access denied');
    const { controller, logger } = setup({
      setLoginItemSettings: vi.fn(() => {
        throw error;
      }),
    });
    expect(controller.setStartAtLogin(true)).toMatchObject({
      ok: false,
      enabled: false,
      reason: 'native-error',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ operation: 'write', executable, error }),
    );
  });

  it('reports a silent native failure through read-back mismatch', () => {
    const { controller, logger } = setup({ setLoginItemSettings: vi.fn() });
    expect(controller.setStartAtLogin(true)).toMatchObject({
      ok: false,
      enabled: false,
      reason: 'read-back-mismatch',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('never fabricates disabled OS state when reading fails', () => {
    const { controller, logger } = setup({
      getLoginItemSettings: vi.fn(() => {
        throw new Error('Read denied');
      }),
    });
    expect(controller.getStartAtLogin()).toMatchObject({
      ok: false,
      enabled: null,
      reason: 'read-error',
    });
    expect(controller.setStartAtLogin(true)).toMatchObject({
      ok: false,
      enabled: null,
      reason: 'read-error',
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('rejects invalid IPC values before calling Electron', () => {
    const { controller, electronApp } = setup();
    expect(() => controller.setStartAtLogin('yes')).toThrow(TypeError);
    expect(electronApp.setLoginItemSettings).not.toHaveBeenCalled();
  });
});
