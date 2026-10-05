import { TestBed } from '@angular/core/testing';
import { DEFAULT_APP_SETTINGS } from '../models/app-settings';
import { SettingsRepository } from '../repositories/settings.repository';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reloads settings on the existing cross-window channel without echoing the event', async () => {
    let listener: ((event: MessageEvent<string>) => void) | undefined;
    const postMessage = vi.fn();
    const close = vi.fn();
    const channelNames: string[] = [];
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor(name: string) {
          channelNames.push(name);
        }
        addEventListener(_type: string, callback: typeof listener) {
          listener = callback;
        }
        postMessage = postMessage;
        close = close;
      },
    );
    const get = vi.fn().mockResolvedValue({ ...DEFAULT_APP_SETTINGS, stickyVisibleNotes: 5 });
    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        {
          provide: SettingsRepository,
          useValue: { get, save: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    });
    const service = TestBed.inject(SettingsService);
    expect(service.settings().stickyVisibleNotes).toBe(2);
    listener?.(new MessageEvent('message', { data: 'settings-changed' }));
    await Promise.resolve();
    expect(service.settings().stickyVisibleNotes).toBe(5);
    expect(postMessage).not.toHaveBeenCalled();
    expect(channelNames).toEqual(['friendly-task-reminder']);
    listener?.(new MessageEvent('message', { data: 'tasks-changed' }));
    expect(get).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    expect(close).toHaveBeenCalledOnce();
  });

  it('broadcasts only successfully persisted updates and reset', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        addEventListener() {}
        postMessage = postMessage;
        close() {}
      },
    );
    const save = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        { provide: SettingsRepository, useValue: { get: vi.fn(), save } },
      ],
    });
    const service = TestBed.inject(SettingsService);
    await service.update({ stickyVisibleNotes: 5 });
    expect(postMessage).toHaveBeenLastCalledWith('settings-changed');
    await service.reset();
    expect(postMessage).toHaveBeenCalledTimes(2);
    save.mockRejectedValue(new Error('Storage unavailable'));
    await expect(service.update({ stickyVisibleNotes: 5 })).rejects.toThrow();
    expect(service.settings().stickyVisibleNotes).toBe(2);
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('loads and persists settings updates', async () => {
    const save = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        {
          provide: SettingsRepository,
          useValue: {
            get: vi.fn(async () => DEFAULT_APP_SETTINGS),
            save,
          },
        },
      ],
    });

    const service = TestBed.inject(SettingsService);
    await service.load();
    await service.update({ notificationSoundEnabled: false });

    expect(service.settings().notificationSoundEnabled).toBe(false);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ notificationSoundEnabled: false }));
  });

  it('resets settings to defaults', async () => {
    const save = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        {
          provide: SettingsRepository,
          useValue: {
            get: vi.fn(async () => DEFAULT_APP_SETTINGS),
            save,
          },
        },
      ],
    });

    const service = TestBed.inject(SettingsService);
    await service.load();
    await service.reset();

    expect(service.settings()).toEqual(DEFAULT_APP_SETTINGS);
    expect(save).toHaveBeenCalledWith(DEFAULT_APP_SETTINGS);
  });
});
