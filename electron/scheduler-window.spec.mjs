import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import schedulerWindowModule from './scheduler-window.cjs';

const { createSchedulerWindow, ensureSchedulerWindow, schedulerWindowOptions } =
  schedulerWindowModule;

function createFakeWindow() {
  const windowEvents = new EventEmitter();
  const webContents = new EventEmitter();
  let destroyed = false;

  return Object.assign(windowEvents, {
    webContents,
    isDestroyed: vi.fn(() => destroyed),
    destroy: vi.fn(() => {
      destroyed = true;
      windowEvents.emit('closed');
    }),
  });
}

function createBrowserWindowConstructor(windowInstance) {
  return vi.fn(function FakeBrowserWindow() {
    return windowInstance;
  });
}

describe('Scheduler BrowserWindow ownership', () => {
  it('creates exactly one Scheduler and reuses it on repeated ensure calls', () => {
    let schedulerWindow;
    const createWindow = vi.fn(() => createFakeWindow());

    schedulerWindow = ensureSchedulerWindow(schedulerWindow, createWindow);
    const firstWindow = schedulerWindow;
    schedulerWindow = ensureSchedulerWindow(schedulerWindow, createWindow);

    expect(createWindow).toHaveBeenCalledOnce();
    expect(schedulerWindow).toBe(firstWindow);
  });

  it('replaces a destroyed Scheduler instead of reusing it', () => {
    const destroyedWindow = createFakeWindow();
    destroyedWindow.destroy();
    const replacement = createFakeWindow();
    const createWindow = vi.fn(() => replacement);

    expect(ensureSchedulerWindow(destroyedWindow, createWindow)).toBe(replacement);
    expect(createWindow).toHaveBeenCalledOnce();
  });

  it('keeps Scheduler hidden, out of the taskbar, and non-focusable', () => {
    const options = schedulerWindowOptions();

    expect(options.show).toBe(false);
    expect(options.skipTaskbar).toBe(true);
    expect(options.focusable).toBe(false);
  });

  it('uses secure renderer settings with the dedicated preload and disables background throttling', () => {
    const options = schedulerWindowOptions();

    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    });
    expect(options.webPreferences.preload).toMatch(/scheduler-preload\.cjs$/);
    expect(options.webPreferences.preload).not.toMatch(/[\\/]preload\.cjs$/);
  });

  it('loads the shared Angular renderer with window=scheduler', () => {
    const windowInstance = createFakeWindow();
    const BrowserWindow = createBrowserWindowConstructor(windowInstance);
    const loadRenderer = vi.fn();

    const created = createSchedulerWindow({
      BrowserWindow,
      loadRenderer,
      isShuttingDown: () => false,
      onUnexpectedLoss: vi.fn(),
    });

    expect(created).toBe(windowInstance);
    expect(BrowserWindow).toHaveBeenCalledWith(schedulerWindowOptions());
    expect(loadRenderer).toHaveBeenCalledWith(windowInstance, 'scheduler');
  });

  it('uses a notify-only Scheduler preload surface', () => {
    const source = readFileSync(schedulerWindowOptions().webPreferences.preload, 'utf8');

    expect(source).toContain(
      "notify: (payload) => ipcRenderer.invoke('assistant-time:notify', payload)",
    );
    expect(source).not.toContain('openTextFile');
    expect(source).not.toContain('saveTextFile');
    expect(source).not.toContain('setStickyWindow');
    expect(source).not.toContain('focusMainWindow');
    expect(source).not.toContain('getReminderPresenter');
    expect(source).not.toContain('onReminderPresenterChanged');
  });

  it('exposes presenter selection only through the normal narrow preload', () => {
    const normalPreloadPath = schedulerWindowOptions().webPreferences.preload.replace(
      'scheduler-preload.cjs',
      'preload.cjs',
    );
    const source = readFileSync(normalPreloadPath, 'utf8');

    expect(source).toContain(
      "getReminderPresenter: () => ipcRenderer.invoke('assistant-time:get-reminder-presenter')",
    );
    expect(source).toContain(
      "ipcRenderer.on('assistant-time:reminder-presenter-changed', listener)",
    );
    expect(source).toContain("value === 'main' || value === 'sticky' ? value : 'none'");
  });

  it('reports unexpected Scheduler close so one owner can be restored', () => {
    const windowInstance = createFakeWindow();
    const onUnexpectedLoss = vi.fn();

    createSchedulerWindow({
      BrowserWindow: createBrowserWindowConstructor(windowInstance),
      loadRenderer: vi.fn(),
      isShuttingDown: () => false,
      onUnexpectedLoss,
    });
    windowInstance.emit('closed');

    expect(onUnexpectedLoss).toHaveBeenCalledOnce();
    expect(onUnexpectedLoss).toHaveBeenCalledWith(windowInstance);
  });

  it('destroys a lost renderer and reports it only once', () => {
    const windowInstance = createFakeWindow();
    const onUnexpectedLoss = vi.fn();

    createSchedulerWindow({
      BrowserWindow: createBrowserWindowConstructor(windowInstance),
      loadRenderer: vi.fn(),
      isShuttingDown: () => false,
      onUnexpectedLoss,
    });
    windowInstance.webContents.emit('render-process-gone');

    expect(windowInstance.destroy).toHaveBeenCalledOnce();
    expect(onUnexpectedLoss).toHaveBeenCalledOnce();
  });

  it('does not request Scheduler recreation during explicit shutdown', () => {
    const windowInstance = createFakeWindow();
    const onUnexpectedLoss = vi.fn();

    createSchedulerWindow({
      BrowserWindow: createBrowserWindowConstructor(windowInstance),
      loadRenderer: vi.fn(),
      isShuttingDown: () => true,
      onUnexpectedLoss,
    });
    windowInstance.emit('closed');

    expect(onUnexpectedLoss).not.toHaveBeenCalled();
  });
});
