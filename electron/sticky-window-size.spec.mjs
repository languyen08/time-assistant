import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sizeModule from './sticky-window-size.cjs';

const { createStickyWindowSize } = sizeModule;
const workArea = { width: 1280, height: 800 };

function setup(saved) {
  const storage = {
    readFileSync: vi.fn(() => {
      if (saved === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return saved;
    }),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  const onError = vi.fn();
  const controller = createStickyWindowSize({
    filePath: 'profile/sticky-window-size.json',
    workArea,
    storage,
    onError,
  });
  const windowInstance = Object.assign(new EventEmitter(), {
    isDestroyed: vi.fn(() => false),
    getContentSize: vi.fn(() => [600, 300]),
    setContentSize: vi.fn(),
  });
  controller.attach(windowInstance);
  return { controller, windowInstance, storage, onError };
}

afterEach(() => vi.useRealTimers());

describe('Sticky Note native size', () => {
  it('allows native resizing with minimum dimensions and no fixed maximum width', () => {
    const { controller } = setup();
    expect(controller.options).toMatchObject({
      width: 460,
      height: 360,
      resizable: true,
      minWidth: 360,
      minHeight: 240,
    });
    expect(controller.options.maxWidth).toBeUndefined();
  });

  it('bounds automatic heights to the matching display and retains the current width', () => {
    const { controller, windowInstance, storage } = setup();
    controller.resizeToContent(windowInstance, 2000, workArea);
    expect(windowInstance.setContentSize).toHaveBeenLastCalledWith(600, 784);
    controller.resizeToContent(windowInstance, 50, workArea);
    expect(windowInstance.setContentSize).toHaveBeenLastCalledWith(600, 240);
    windowInstance.emit('resize');
    controller.save(windowInstance);
    expect(storage.writeFileSync).not.toHaveBeenCalled();
  });

  it('debounces user resizing and protects the user size from content changes', () => {
    vi.useFakeTimers();
    const { controller, windowInstance, storage } = setup();
    windowInstance.emit('will-resize');
    windowInstance.emit('resize');
    windowInstance.emit('resize');
    expect(controller.resizeToContent(windowInstance, 900, workArea)).toBe(false);
    expect(windowInstance.setContentSize).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(storage.writeFileSync).toHaveBeenCalledExactlyOnceWith(
      'profile/sticky-window-size.json',
      '{"width":600,"height":300}',
      'utf8',
    );
  });

  it('flushes a pending user resize on close or explicit quit save', () => {
    vi.useFakeTimers();
    const { controller, windowInstance, storage } = setup();
    windowInstance.emit('will-resize');
    windowInstance.emit('resize');
    windowInstance.emit('close');
    expect(storage.writeFileSync).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(250);
    expect(storage.writeFileSync).toHaveBeenCalledOnce();
    controller.save(windowInstance);
    expect(storage.writeFileSync).toHaveBeenCalledTimes(2);
  });

  it('restores user dimensions and prevents initial-open from overwriting them', () => {
    const { controller, windowInstance } = setup('{"width":600,"height":300}');
    expect(controller.options).toMatchObject({ width: 600, height: 300 });
    expect(controller.resizeToContent(windowInstance, 500, workArea)).toBe(false);
  });

  it.each([
    ['{"width":100,"height":100}', 360, 240],
    ['{"width":9000,"height":9000}', 1264, 784],
    ['{"width":"600","height":300}', 460, 360],
    ['{"width":-1,"height":300}', 460, 360],
    ['null', 460, 360],
    ['invalid json', 460, 360],
  ])('safely handles invalid or off-screen saved geometry: %s', (saved, width, height) => {
    expect(setup(saved).controller.options).toMatchObject({ width, height });
  });

  it('keeps resizing usable when persistence fails', () => {
    const { controller, windowInstance, storage, onError } = setup();
    storage.writeFileSync.mockImplementation(() => {
      throw new Error('disk unavailable');
    });
    windowInstance.emit('will-resize');
    expect(() => controller.save(windowInstance)).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
  });
});
