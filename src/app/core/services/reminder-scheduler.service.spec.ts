import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Task } from '../models/task';
import { NotificationService } from './notification.service';
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
    allowConcurrentStart: false,
    order: 0,
    status: 'active',
    createdAt: '2026-05-30T09:00:00.000Z',
    updatedAt: '2026-05-30T09:00:00.000Z',
    activeStartedAt: '2026-05-30T09:00:00.000Z',
    totalPausedSeconds: 0,
    nextReminderAt: '2026-05-30T10:00:00.000Z',
    reminderAttemptsShown: 0,
    ...overrides,
  };
}

describe('ReminderSchedulerService', () => {
  it('opens a reminder when the active task reaches its reminder time', async () => {
    const task = createActiveTask();
    const activeTasks = signal<Task[]>([task]);
    const markReminderShown = vi.fn(async (taskId: string) => ({
      ...activeTasks().find((candidate) => candidate.id === taskId)!,
      reminderAttemptsShown: 1,
    }));

    TestBed.configureTestingModule({
      providers: [
        ReminderSchedulerService,
        { provide: TaskService, useValue: { activeTasks, markReminderShown } },
        { provide: TimerService, useValue: { now: signal(new Date('2026-05-30T10:00:01.000Z')) } },
        {
          provide: NotificationService,
          useValue: { randomFriendlyMessage: () => 'A friendly reminder.' },
        },
      ],
    });

    const service = TestBed.inject(ReminderSchedulerService);
    await service.check(new Date('2026-05-30T10:00:01.000Z'));

    expect(markReminderShown).toHaveBeenCalledWith(task.id, new Date('2026-05-30T10:00:01.000Z'));
    expect(service.activeReminder()?.taskName).toBe('Read chapter');
    expect(service.activeReminder()?.attemptNumber).toBe(1);
    expect(service.activeReminder()?.message).toBe('A friendly reminder.');
  });

  it('does not open a reminder after the maximum attempt count', async () => {
    const activeTasks = signal<Task[]>([
      createActiveTask({
        reminderAttemptsShown: 2,
      }),
    ]);
    const markReminderShown = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ReminderSchedulerService,
        { provide: TaskService, useValue: { activeTasks, markReminderShown } },
        { provide: TimerService, useValue: { now: signal(new Date('2026-05-30T10:10:00.000Z')) } },
        {
          provide: NotificationService,
          useValue: { randomFriendlyMessage: () => 'A friendly reminder.' },
        },
      ],
    });

    const service = TestBed.inject(ReminderSchedulerService);
    await service.check(new Date('2026-05-30T10:10:00.000Z'));

    expect(markReminderShown).not.toHaveBeenCalled();
    expect(service.activeReminder()).toBeUndefined();
  });

  it('serializes due reminders in task order and ignores paused tasks', async () => {
    const now = new Date('2026-05-30T10:00:01.000Z');
    const activeTasks = signal<Task[]>([
      createActiveTask({ id: 'task-a', name: 'First', order: 0 }),
      createActiveTask({ id: 'paused', name: 'Paused', order: 1, status: 'paused' }),
      createActiveTask({ id: 'task-b', name: 'Second', order: 2 }),
    ]);
    const markReminderShown = vi.fn(async (taskId: string) => {
      const selected = activeTasks().find((task) => task.id === taskId);
      if (!selected) {
        return undefined;
      }
      const updated = {
        ...selected,
        reminderAttemptsShown: selected.reminderAttemptsShown + 1,
        nextReminderAt: '2026-05-30T10:05:01.000Z',
      };
      activeTasks.update((tasks) => tasks.map((task) => (task.id === taskId ? updated : task)));
      return updated;
    });

    TestBed.configureTestingModule({
      providers: [
        ReminderSchedulerService,
        { provide: TaskService, useValue: { activeTasks, markReminderShown } },
        { provide: TimerService, useValue: { now: signal(now) } },
        {
          provide: NotificationService,
          useValue: { randomFriendlyMessage: () => 'A friendly reminder.' },
        },
      ],
    });

    const service = TestBed.inject(ReminderSchedulerService);
    await service.check(now);
    await service.check(now);

    expect(markReminderShown).toHaveBeenCalledTimes(1);
    expect(markReminderShown).toHaveBeenCalledWith('task-a', now);
    expect(service.activeReminder()?.taskId).toBe('task-a');

    service.dismiss();
    await service.check(now);

    expect(markReminderShown).toHaveBeenLastCalledWith('task-b', now);
    expect(service.activeReminder()?.taskId).toBe('task-b');
    expect(markReminderShown).not.toHaveBeenCalledWith('paused', now);
  });
});
