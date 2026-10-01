import { describe, expect, it, vi } from 'vitest';
import windowLifecycleModule from './window-lifecycle.cjs';

const {
  closeMainWindow,
  getMainWindowMaximized,
  getReminderPresenter,
  hideStickyWindow,
  openMainWindow,
  publishReminderPresenterChanged,
  quitApplication,
  showStickyWindow,
  toggleMainWindowMaximized,
} = windowLifecycleModule;

function createWindow(overrides = {}) {
  let maximized = false;
  return {
    webContents: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
    isMaximized: vi.fn(() => maximized),
    maximize: vi.fn(() => {
      maximized = true;
    }),
    unmaximize: vi.fn(() => {
      maximized = false;
    }),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    ...overrides,
  };
}

describe('window lifecycle helpers', () => {
  it('selects Main, Sticky, or none from BrowserWindow existence', () => {
    const mainWindow = createWindow();
    const stickyWindow = createWindow();

    expect(
      getReminderPresenter(
        () => mainWindow,
        () => stickyWindow,
      ),
    ).toBe('main');
    expect(
      getReminderPresenter(
        () => undefined,
        () => stickyWindow,
      ),
    ).toBe('sticky');
    expect(
      getReminderPresenter(
        () => undefined,
        () => undefined,
      ),
    ).toBe('none');
    expect(
      getReminderPresenter(
        () => createWindow({ isDestroyed: vi.fn(() => true) }),
        () => stickyWindow,
      ),
    ).toBe('sticky');
  });

  it('publishes sticky to main and main to sticky transitions with constrained payloads', () => {
    let mainWindow;
    let stickyWindow = createWindow();
    const publish = () =>
      publishReminderPresenterChanged({
        getMainWindow: () => mainWindow,
        getStickyWindow: () => stickyWindow,
        stickyAlwaysOnTop: true,
      });

    expect(publish()).toBe('sticky');
    expect(stickyWindow.webContents.send).toHaveBeenLastCalledWith(
      'assistant-time:reminder-presenter-changed',
      'sticky',
    );

    mainWindow = createWindow();
    expect(publish()).toBe('main');
    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith(
      'assistant-time:reminder-presenter-changed',
      'main',
    );
    expect(stickyWindow.webContents.send).toHaveBeenLastCalledWith(
      'assistant-time:reminder-presenter-changed',
      'main',
    );

    mainWindow = undefined;
    expect(publish()).toBe('sticky');
    expect(stickyWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(stickyWindow.setAlwaysOnTop).toHaveBeenLastCalledWith(true);

    stickyWindow = undefined;
    expect(publish()).toBe('none');
  });
  it('maximizes and restores from the actual BrowserWindow state', () => {
    const windowInstance = createWindow();
    const getWindow = () => windowInstance;

    expect(getMainWindowMaximized(getWindow)).toBe(false);
    expect(toggleMainWindowMaximized(getWindow)).toBe(true);
    expect(windowInstance.maximize).toHaveBeenCalledOnce();
    expect(toggleMainWindowMaximized(getWindow)).toBe(false);
    expect(windowInstance.unmaximize).toHaveBeenCalledOnce();
  });

  it('handles missing or destroyed main windows safely', () => {
    expect(getMainWindowMaximized(() => undefined)).toBe(false);
    expect(toggleMainWindowMaximized(() => undefined)).toBe(false);
    expect(closeMainWindow(() => undefined)).toBe(false);
    expect(toggleMainWindowMaximized(() => createWindow({ isDestroyed: vi.fn(() => true) }))).toBe(
      false,
    );
  });

  it('Tray Open Time Assistant reuses an existing Main without a duplicate', () => {
    const windowInstance = createWindow({ isMinimized: vi.fn(() => true) });
    const createMainWindow = vi.fn();

    expect(openMainWindow({ getMainWindow: () => windowInstance, createMainWindow })).toBe(true);
    expect(createMainWindow).not.toHaveBeenCalled();
    expect(windowInstance.restore).toHaveBeenCalledOnce();
    expect(windowInstance.show).toHaveBeenCalledOnce();
    expect(windowInstance.focus).toHaveBeenCalledOnce();
  });

  it('Tray Open Time Assistant creates exactly one Main when absent', () => {
    const createdWindow = createWindow();
    const createMainWindow = vi.fn(() => createdWindow);

    expect(openMainWindow({ getMainWindow: () => undefined, createMainWindow })).toBe(true);
    expect(createMainWindow).toHaveBeenCalledOnce();
    expect(createdWindow.show).toHaveBeenCalledOnce();
    expect(createdWindow.focus).toHaveBeenCalledOnce();
  });

  it('Sticky X hides Sticky without affecting Main, Tray, or app', () => {
    const stickyWindow = createWindow();
    const mainWindow = createWindow();
    const schedulerWindow = createWindow();
    const electronApp = { quit: vi.fn() };
    const tray = { destroy: vi.fn(), isDestroyed: vi.fn(() => false) };

    expect(hideStickyWindow(() => stickyWindow)).toBe(true);
    expect(stickyWindow.hide).toHaveBeenCalledOnce();
    expect(stickyWindow.close).not.toHaveBeenCalled();
    expect(stickyWindow.destroy).not.toHaveBeenCalled();
    expect(mainWindow.close).not.toHaveBeenCalled();
    expect(mainWindow.destroy).not.toHaveBeenCalled();
    expect(schedulerWindow.destroy).not.toHaveBeenCalled();
    expect(tray.destroy).not.toHaveBeenCalled();
    expect(electronApp.quit).not.toHaveBeenCalled();
  });

  it('Tray icon click shows hidden Sticky and does not create or focus Main', () => {
    const stickyWindow = createWindow({ isVisible: vi.fn(() => false) });
    const createMainWindow = vi.fn();
    const focusMainWindow = vi.fn();

    expect(showStickyWindow(() => stickyWindow)).toBe(true);
    expect(stickyWindow.show).toHaveBeenCalledOnce();
    expect(stickyWindow.focus).toHaveBeenCalledOnce();
    expect(createMainWindow).not.toHaveBeenCalled();
    expect(focusMainWindow).not.toHaveBeenCalled();
  });

  it('Tray icon click shows Sticky and leaves an existing Main untouched', () => {
    const stickyWindow = createWindow({ isVisible: vi.fn(() => false) });
    const mainWindow = createWindow();

    expect(showStickyWindow(() => stickyWindow)).toBe(true);
    expect(stickyWindow.show).toHaveBeenCalledOnce();
    expect(mainWindow.show).not.toHaveBeenCalled();
    expect(mainWindow.focus).not.toHaveBeenCalled();
    expect(mainWindow.destroy).not.toHaveBeenCalled();
  });

  it('Tray icon click focuses an already visible Sticky without creating another', () => {
    const stickyWindow = createWindow({ isVisible: vi.fn(() => true) });
    const createStickyWindow = vi.fn();

    expect(showStickyWindow(() => stickyWindow)).toBe(true);
    expect(stickyWindow.show).not.toHaveBeenCalled();
    expect(stickyWindow.focus).toHaveBeenCalledOnce();
    expect(createStickyWindow).not.toHaveBeenCalled();
  });

  it('Main X closes only Main while visible Sticky, Tray, and app remain', () => {
    const mainWindow = createWindow();
    const stickyWindow = createWindow({ isVisible: vi.fn(() => true) });
    const schedulerWindow = createWindow();
    const electronApp = { quit: vi.fn() };
    const tray = { destroy: vi.fn(), isDestroyed: vi.fn(() => false) };

    expect(closeMainWindow(() => mainWindow)).toBe(true);
    expect(mainWindow.close).toHaveBeenCalledOnce();
    expect(stickyWindow.hide).not.toHaveBeenCalled();
    expect(stickyWindow.destroy).not.toHaveBeenCalled();
    expect(schedulerWindow.destroy).not.toHaveBeenCalled();
    expect(tray.destroy).not.toHaveBeenCalled();
    expect(electronApp.quit).not.toHaveBeenCalled();
  });

  it('Main X closes only Main while hidden Sticky, Tray, and app remain', () => {
    const mainWindow = createWindow();
    const stickyWindow = createWindow({ isVisible: vi.fn(() => false) });
    const schedulerWindow = createWindow();
    const electronApp = { quit: vi.fn() };
    const tray = { destroy: vi.fn(), isDestroyed: vi.fn(() => false) };

    expect(closeMainWindow(() => mainWindow)).toBe(true);
    expect(mainWindow.close).toHaveBeenCalledOnce();
    expect(stickyWindow.show).not.toHaveBeenCalled();
    expect(stickyWindow.hide).not.toHaveBeenCalled();
    expect(stickyWindow.destroy).not.toHaveBeenCalled();
    expect(schedulerWindow.destroy).not.toHaveBeenCalled();
    expect(tray.destroy).not.toHaveBeenCalled();
    expect(electronApp.quit).not.toHaveBeenCalled();
  });

  it('Tray Quit destroys every window and the Tray before quitting', () => {
    const mainWindow = createWindow();
    const stickyWindow = createWindow();
    const guideWindow = createWindow();
    const schedulerWindow = createWindow();
    const tray = { destroy: vi.fn(), isDestroyed: vi.fn(() => false) };
    const electronApp = { quit: vi.fn() };

    expect(
      quitApplication({
        electronApp,
        getWindows: () => [mainWindow, stickyWindow, guideWindow, schedulerWindow],
        getTray: () => tray,
      }),
    ).toBe(true);
    expect(mainWindow.destroy).toHaveBeenCalledOnce();
    expect(stickyWindow.destroy).toHaveBeenCalledOnce();
    expect(guideWindow.destroy).toHaveBeenCalledOnce();
    expect(schedulerWindow.destroy).toHaveBeenCalledOnce();
    expect(tray.destroy).toHaveBeenCalledOnce();
    expect(electronApp.quit).toHaveBeenCalledOnce();
  });

  it('skips already destroyed resources during Tray Quit', () => {
    const electronApp = { quit: vi.fn() };
    const destroyedWindow = createWindow({ isDestroyed: vi.fn(() => true) });
    const destroyedTray = { destroy: vi.fn(), isDestroyed: vi.fn(() => true) };

    expect(
      quitApplication({
        electronApp,
        getWindows: () => [destroyedWindow],
        getTray: () => destroyedTray,
      }),
    ).toBe(true);
    expect(destroyedWindow.destroy).not.toHaveBeenCalled();
    expect(destroyedTray.destroy).not.toHaveBeenCalled();
    expect(electronApp.quit).toHaveBeenCalledOnce();
  });

  it('handles missing or destroyed Sticky windows safely', () => {
    expect(hideStickyWindow(() => undefined)).toBe(false);
    expect(showStickyWindow(() => undefined)).toBe(false);
    expect(hideStickyWindow(() => createWindow({ isDestroyed: vi.fn(() => true) }))).toBe(false);
  });
});
