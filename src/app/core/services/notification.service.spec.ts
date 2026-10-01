import { TestBed } from '@angular/core/testing';
import { DEFAULT_APP_SETTINGS } from '../models/app-settings';
import { ActiveReminder } from '../models/reminder';
import { ElectronBridgeService } from './electron-bridge.service';
import { NotificationService } from './notification.service';

describe('NotificationService reminder dispatch', () => {
  const reminder: ActiveReminder = {
    taskId: 'task-1',
    taskName: 'Focus block',
    attemptNumber: 1,
    maxAttempts: 3,
    shownAt: '2026-05-30T10:00:00.000Z',
    message: 'A friendly reminder.',
  };
  let notify: ReturnType<typeof vi.fn>;
  let service: NotificationService;

  beforeEach(() => {
    notify = vi.fn(async () => true);
    TestBed.configureTestingModule({
      providers: [NotificationService, { provide: ElectronBridgeService, useValue: { notify } }],
    });
    service = TestBed.inject(NotificationService);
  });

  it('sends one native reminder without custom sound when sound is disabled', async () => {
    const playSound = vi.spyOn(
      service as unknown as { playSound(soundId: string): void },
      'playSound',
    );

    await service.showReminder(reminder, {
      ...DEFAULT_APP_SETTINGS,
      notificationSoundEnabled: false,
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith('Focus block', 'A friendly reminder.');
    expect(playSound).not.toHaveBeenCalled();
  });

  it('uses the configured custom sound exactly once when sound is enabled', async () => {
    const playSound = vi
      .spyOn(service as unknown as { playSound(soundId: string): void }, 'playSound')
      .mockImplementation(() => undefined);

    await service.showReminder(reminder, {
      ...DEFAULT_APP_SETTINGS,
      notificationSoundEnabled: true,
      notificationSoundId: 'low-bell',
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(playSound).toHaveBeenCalledOnce();
    expect(playSound).toHaveBeenCalledWith('low-bell');
  });
});
