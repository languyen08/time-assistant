import { TestBed } from '@angular/core/testing';
import { Task } from '../models/task';
import { TimerService } from './timer.service';

describe('TimerService', () => {
  let service: TimerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TimerService);
    service.now.set(new Date('2026-05-30T10:10:30.000Z'));
  });

  it('calculates active task elapsed seconds', () => {
    const task = {
      status: 'active',
      activeStartedAt: '2026-05-30T10:00:00.000Z',
    } as Task;

    expect(service.elapsedSeconds(task)).toBe(630);
  });

  it('calculates seconds remaining until the next reminder', () => {
    const task = {
      status: 'active',
      nextReminderAt: '2026-05-30T10:12:00.000Z',
    } as Task;

    expect(service.remainingSeconds(task)).toBe(90);
  });

  it('formats durations for the app timer', () => {
    expect(service.format(75)).toBe('01:15');
    expect(service.format(3670)).toBe('1h 01m');
  });
});
