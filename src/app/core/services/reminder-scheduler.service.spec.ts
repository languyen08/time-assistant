import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_APP_SETTINGS } from '../models/app-settings';
import { Task } from '../models/task';
import { NotificationService } from './notification.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { SettingsService } from './settings.service';
import { TaskService } from './task.service';
import { TimerService } from './timer.service';

function task(id: string, order: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    note: '',
    category: '',
    reminderAt: '2026-05-30T10:00:00.000Z',
    reminderEnabled: true,
    reminderCount: 2,
    reminderIntervalMinutes: 5,
    allowConcurrentStart: false,
    order,
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
  const now = new Date('2026-05-30T10:00:01.000Z');
  let tasks: ReturnType<typeof signal<Task[]>>;
  let triggerReminder: ReturnType<typeof vi.fn>;
  let dismissReminder: ReturnType<typeof vi.fn>;
  let showReminder: ReturnType<typeof vi.fn>;
  let service: ReminderSchedulerService;
  let order: string[];

  beforeEach(() => {
    tasks = signal<Task[]>([]);
    order = [];
    triggerReminder = vi.fn(async (taskId: string, message: string, triggeredAt: Date) => {
      const selected = tasks().find((candidate) => candidate.id === taskId);
      if (!selected || tasks().some((candidate) => candidate.pendingReminder)) {
        return undefined;
      }
      const attemptNumber = selected.reminderAttemptsShown + 1;
      const updated: Task = {
        ...selected,
        reminderAttemptsShown: attemptNumber,
        nextReminderAt:
          attemptNumber < selected.reminderCount
            ? new Date(
                triggeredAt.getTime() + selected.reminderIntervalMinutes * 60_000,
              ).toISOString()
            : undefined,
        pendingReminder: {
          attemptNumber,
          maxAttempts: selected.reminderCount,
          shownAt: triggeredAt.toISOString(),
          message,
        },
      };
      tasks.update((items) => items.map((item) => (item.id === taskId ? updated : item)));
      order.push('persist');
      return updated;
    });
    dismissReminder = vi.fn(async (taskId: string) => {
      let dismissed = false;
      tasks.update((items) =>
        items.map((item) => {
          if (item.id !== taskId || !item.pendingReminder) {
            return item;
          }
          dismissed = true;
          return { ...item, pendingReminder: undefined };
        }),
      );
      return dismissed;
    });
    showReminder = vi.fn(async () => {
      order.push('notify');
    });

    TestBed.configureTestingModule({
      providers: [
        ReminderSchedulerService,
        {
          provide: TaskService,
          useValue: {
            tasks,
            activeTasks: () => tasks().filter((candidate) => candidate.status === 'active'),
            triggerReminder,
            dismissReminder,
          },
        },
        { provide: TimerService, useValue: { now: signal(now) } },
        {
          provide: NotificationService,
          useValue: {
            randomFriendlyMessage: () => 'A friendly reminder.',
            showReminder,
          },
        },
        { provide: SettingsService, useValue: { settings: signal(DEFAULT_APP_SETTINGS) } },
      ],
    });
    service = TestBed.inject(ReminderSchedulerService);
  });

  it('persists one due occurrence before notifying with configured settings', async () => {
    tasks.set([task('due', 0)]);

    await service.check(now);

    expect(triggerReminder).toHaveBeenCalledWith('due', 'A friendly reminder.', now);
    expect(tasks()[0].pendingReminder).toEqual({
      attemptNumber: 1,
      maxAttempts: 2,
      shownAt: now.toISOString(),
      message: 'A friendly reminder.',
    });
    expect(tasks()[0].reminderAttemptsShown).toBe(1);
    expect(tasks()[0].nextReminderAt).toBe('2026-05-30T10:05:01.000Z');
    expect(showReminder).toHaveBeenCalledOnce();
    expect(showReminder.mock.calls[0][1]).toEqual(DEFAULT_APP_SETTINGS);
    expect(order).toEqual(['persist', 'notify']);
  });

  it('ignores disabled tasks even with due timing and repeats, without notifications or attempts', async () => {
    tasks.set([task('disabled', 0, { reminderEnabled: false })]);
    await service.check(now);
    await service.check(new Date(now.getTime() + 600_000));
    expect(triggerReminder).not.toHaveBeenCalled();
    expect(showReminder).not.toHaveBeenCalled();
    expect(tasks()[0].reminderAttemptsShown).toBe(0);
    expect(service.activeReminder()).toBeUndefined();
  });

  it('does not present stale pending reminders on disabled tasks', async () => {
    tasks.set([
      task('disabled', 0, {
        reminderEnabled: false,
        pendingReminder: {
          attemptNumber: 1,
          maxAttempts: 2,
          shownAt: now.toISOString(),
          message: 'Stale reminder.',
        },
      }),
    ]);
    expect(service.hasReminder()).toBe(false);
    await service.check(now);
    expect(showReminder).not.toHaveBeenCalled();
  });

  it('skips disabled tasks while preserving scheduling for enabled and legacy tasks', async () => {
    const { reminderEnabled: omitted, ...legacy } = task('legacy', 1);
    tasks.set([task('disabled', 0, { reminderEnabled: false }), legacy as Task]);
    await service.check(now);
    expect(triggerReminder).toHaveBeenCalledWith('legacy', 'A friendly reminder.', now);
    expect(showReminder).toHaveBeenCalledOnce();
  });

  it('blocks every new occurrence while any task has a pending reminder', async () => {
    tasks.set([
      task('pending', 0, {
        pendingReminder: {
          attemptNumber: 1,
          maxAttempts: 2,
          shownAt: now.toISOString(),
          message: 'Existing reminder.',
        },
        reminderAttemptsShown: 1,
      }),
      task('due', 1),
    ]);

    await service.check(now);

    expect(triggerReminder).not.toHaveBeenCalled();
    expect(showReminder).not.toHaveBeenCalled();
  });

  it('serializes multiple due tasks in order and ignores paused tasks', async () => {
    tasks.set([task('first', 0), task('paused', 1, { status: 'paused' }), task('second', 2)]);

    await service.check(now);
    await service.check(now);
    expect(triggerReminder.mock.calls.map(([taskId]) => taskId)).toEqual(['first']);

    await service.dismiss('first');
    await service.check(now);
    expect(triggerReminder.mock.calls.map(([taskId]) => taskId)).toEqual(['first', 'second']);
    expect(triggerReminder).not.toHaveBeenCalledWith(
      'paused',
      expect.any(String),
      expect.any(Date),
    );
  });

  it('derives the stable active reminder from persisted task state after restart', async () => {
    tasks.set([
      task('restart', 0, {
        reminderAttemptsShown: 1,
        pendingReminder: {
          attemptNumber: 1,
          maxAttempts: 2,
          shownAt: '2026-05-30T09:59:00.000Z',
          message: 'Persisted message.',
        },
      }),
    ]);

    await service.check(now);

    expect(service.activeReminder()).toEqual({
      taskId: 'restart',
      taskName: 'Task restart',
      attemptNumber: 1,
      maxAttempts: 2,
      shownAt: '2026-05-30T09:59:00.000Z',
      message: 'Persisted message.',
    });
    expect(triggerReminder).not.toHaveBeenCalled();
    expect(showReminder).not.toHaveBeenCalled();
  });

  it('does not retry native notification after a persisted occurrence if notification fails', async () => {
    tasks.set([task('failure', 0)]);
    showReminder.mockRejectedValueOnce(new Error('IPC unavailable'));

    await expect(service.check(now)).resolves.toBeUndefined();
    await service.check(now);

    expect(tasks()[0].pendingReminder).toBeDefined();
    expect(triggerReminder).toHaveBeenCalledTimes(1);
    expect(showReminder).toHaveBeenCalledTimes(1);
  });
});
