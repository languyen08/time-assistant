import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Task } from '../models/task';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { TaskService } from './task.service';
import { TimerService } from './timer.service';

function createActiveTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_1',
    name: 'Read chapter',
    note: '',
    category: 'Study',
    reminderAt: '2026-05-30T10:00:00.000Z',
    reminderCount: 2,
    reminderIntervalMinutes: 5,
    order: 0,
    status: 'active',
    createdAt: '2026-05-30T09:00:00.000Z',
    updatedAt: '2026-05-30T09:00:00.000Z',
    activeStartedAt: '2026-05-30T09:00:00.000Z',
    nextReminderAt: '2026-05-30T10:00:00.000Z',
    reminderAttemptsShown: 0,
    ...overrides,
  };
}

describe('ReminderSchedulerService', () => {
  it('opens a reminder when the active task reaches its reminder time', async () => {
    const task = createActiveTask();
    const activeTask = signal<Task | undefined>(task);
    const markReminderShown = vi.fn(async (shownTask: Task) => ({
      ...shownTask,
      reminderAttemptsShown: shownTask.reminderAttemptsShown + 1,
    }));

    TestBed.configureTestingModule({
      providers: [
        ReminderSchedulerService,
        { provide: TaskService, useValue: { activeTask, markReminderShown } },
        { provide: TimerService, useValue: { now: signal(new Date('2026-05-30T10:00:01.000Z')) } },
      ],
    });

    const service = TestBed.inject(ReminderSchedulerService);
    await service.check(new Date('2026-05-30T10:00:01.000Z'));

    expect(markReminderShown).toHaveBeenCalledWith(task);
    expect(service.activeReminder()?.taskName).toBe('Read chapter');
    expect(service.activeReminder()?.attemptNumber).toBe(1);
  });

  it('does not open a reminder after the maximum attempt count', async () => {
    const activeTask = signal<Task | undefined>(
      createActiveTask({
        reminderAttemptsShown: 2,
      }),
    );
    const markReminderShown = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ReminderSchedulerService,
        { provide: TaskService, useValue: { activeTask, markReminderShown } },
        { provide: TimerService, useValue: { now: signal(new Date('2026-05-30T10:10:00.000Z')) } },
      ],
    });

    const service = TestBed.inject(ReminderSchedulerService);
    await service.check(new Date('2026-05-30T10:10:00.000Z'));

    expect(markReminderShown).not.toHaveBeenCalled();
    expect(service.activeReminder()).toBeUndefined();
  });
});
