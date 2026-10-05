import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Task } from '../models/task';
import { DeadlineSchedulerService } from './deadline-scheduler.service';
import { NotificationService } from './notification.service';
import { TaskService } from './task.service';

function task(id: string, order: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    note: '',
    category: '',
    reminderAt: '2026-05-30T09:00:00.000Z',
    reminderEnabled: true,
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    allowConcurrentStart: false,
    deadlineAt: '2026-05-30T10:00:00.000Z',
    deadlineMessage: `Deadline message ${id}`,
    order,
    status: 'pending',
    createdAt: '2026-05-30T08:00:00.000Z',
    updatedAt: '2026-05-30T08:00:00.000Z',
    totalPausedSeconds: 0,
    reminderAttemptsShown: 0,
    ...overrides,
  };
}

describe('DeadlineSchedulerService', () => {
  const now = new Date('2026-05-30T10:05:00.000Z');
  let tasks: ReturnType<typeof signal<Task[]>>;
  let markDeadlineNotified: ReturnType<typeof vi.fn>;
  let showDeadline: ReturnType<typeof vi.fn>;
  let order: string[];
  let service: DeadlineSchedulerService;

  beforeEach(() => {
    tasks = signal<Task[]>([]);
    order = [];
    markDeadlineNotified = vi.fn(async (taskId: string, processedAt: Date) => {
      const selected = tasks().find((candidate) => candidate.id === taskId);
      if (!selected || selected.deadlineNotifiedAt) {
        return undefined;
      }
      const updated = { ...selected, deadlineNotifiedAt: processedAt.toISOString() };
      tasks.update((items) => items.map((item) => (item.id === taskId ? updated : item)));
      order.push('persist');
      return updated;
    });
    showDeadline = vi.fn(async () => {
      order.push('notify');
      return true;
    });

    TestBed.configureTestingModule({
      providers: [
        DeadlineSchedulerService,
        { provide: TaskService, useValue: { tasks, markDeadlineNotified } },
        { provide: NotificationService, useValue: { showDeadline } },
      ],
    });
    service = TestBed.inject(DeadlineSchedulerService);
  });

  it.each(['pending', 'active', 'paused'] as const)('triggers a due %s task', async (status) => {
    tasks.set([task('due', 0, { status })]);

    await service.check(now);

    expect(markDeadlineNotified).toHaveBeenCalledWith('due', now);
    expect(showDeadline).toHaveBeenCalledWith('Task due', 'Deadline message due');
    expect(order).toEqual(['persist', 'notify']);
  });

  it('ignores completed, future, and already processed deadlines', async () => {
    tasks.set([
      task('completed', 0, { status: 'completed' }),
      task('future', 1, { deadlineAt: '2026-05-30T11:00:00.000Z' }),
      task('processed', 2, { deadlineNotifiedAt: '2026-05-30T10:00:00.000Z' }),
    ]);

    await service.check(now);

    expect(markDeadlineNotified).not.toHaveBeenCalled();
    expect(showDeadline).not.toHaveBeenCalled();
  });

  it('triggers during a running break because break coordination is not a dependency', async () => {
    tasks.set([task('break-does-not-block', 0)]);

    await service.check(now);

    expect(markDeadlineNotified).toHaveBeenCalledWith('break-does-not-block', now);
  });

  it('processes at most one overdue task per check in deterministic order', async () => {
    tasks.set([task('second', 2), task('first', 1)]);

    await service.check(now);
    expect(markDeadlineNotified.mock.calls.map(([taskId]) => taskId)).toEqual(['first']);

    await service.check(now);
    expect(markDeadlineNotified.mock.calls.map(([taskId]) => taskId)).toEqual(['first', 'second']);
  });

  it('processes an overdue task after a long offline interval', async () => {
    tasks.set([task('offline', 0, { deadlineAt: '2026-05-20T10:00:00.000Z' })]);

    await service.check(now);

    expect(markDeadlineNotified).toHaveBeenCalledWith('offline', now);
  });

  it('does not repeat a deadline after restart when persisted state exists', async () => {
    tasks.set([task('restart', 0, { deadlineNotifiedAt: '2026-05-30T10:00:00.000Z' })]);

    await service.check(now);
    await service.check(now);

    expect(markDeadlineNotified).not.toHaveBeenCalled();
    expect(showDeadline).not.toHaveBeenCalled();
  });

  it('keeps persisted processing state and does not retry after native notification failure', async () => {
    tasks.set([task('failure', 0)]);
    showDeadline.mockRejectedValueOnce(new Error('IPC unavailable'));

    await expect(service.check(now)).resolves.toBeUndefined();
    expect(tasks()[0].deadlineNotifiedAt).toBe(now.toISOString());

    await service.check(now);
    expect(markDeadlineNotified).toHaveBeenCalledTimes(1);
    expect(showDeadline).toHaveBeenCalledTimes(1);
  });
});
