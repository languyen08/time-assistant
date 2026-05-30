import { TestBed } from '@angular/core/testing';
import { HistoryService } from './history.service';
import { NotificationService } from './notification.service';
import { BreakService } from './break.service';
import { SettingsService } from './settings.service';

describe('BreakService', () => {
  let service: BreakService;
  let record: ReturnType<typeof vi.fn>;
  let showBreakComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    record = vi.fn(async () => undefined);
    showBreakComplete = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        BreakService,
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
});
