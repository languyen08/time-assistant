import { TestBed } from '@angular/core/testing';
import { HistoryService } from './history.service';
import { NotificationService } from './notification.service';
import { BreakService } from './break.service';
import { BreakCoordinationService } from './break-coordination.service';
import { SettingsService } from './settings.service';

describe('BreakService', () => {
  let service: BreakService;
  let record: ReturnType<typeof vi.fn>;
  let showBreakComplete: ReturnType<typeof vi.fn>;
  let publish: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    record = vi.fn(async () => undefined);
    showBreakComplete = vi.fn(async () => undefined);
    publish = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        BreakService,
        { provide: BreakCoordinationService, useValue: { publish } },
        { provide: HistoryService, useValue: { record } },
        { provide: NotificationService, useValue: { showBreakComplete } },
        {
          provide: SettingsService,
          useValue: { settings: () => ({ notificationSoundEnabled: true }) },
        },
      ],
    });
    service = TestBed.inject(BreakService);
  });

  it('prompts with the provided default duration', () => {
    service.prompt(10);

    expect(service.state()).toBe('prompt');
    expect(service.session().remainingSeconds).toBe(600);
  });

  it('counts down and completes a break', async () => {
    vi.useFakeTimers();

    await service.start(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.state()).toBe('complete');
    expect(service.session().remainingSeconds).toBe(0);
    expect(showBreakComplete).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('stops an active break early and records the event', async () => {
    await service.start(5);
    await service.stopEarly();

    expect(service.state()).toBe('idle');
    expect(service.session().remainingSeconds).toBe(0);
    expect(record).toHaveBeenCalledWith('break_skipped', 'Break stopped early.');
  });

  it('publishes a running session end time and stops that same retained session', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T10:00:00.000Z'));
    try {
      await service.start(10);
      const runningCall = publish.mock.calls.find(([state]) => state === 'running');

      expect(runningCall).toEqual([
        'running',
        {
          sessionId: expect.any(String),
          endsAt: '2026-05-30T10:10:00.000Z',
        },
      ]);

      await service.stopEarly();

      expect(publish).toHaveBeenCalledWith('idle', {
        sessionId: runningCall?.[1].sessionId,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
