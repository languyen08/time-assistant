import { TestBed } from '@angular/core/testing';
import { DEFAULT_APP_SETTINGS } from '../models/app-settings';
import { SettingsRepository } from '../repositories/settings.repository';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
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
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ notificationSoundEnabled: false }),
    );
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
