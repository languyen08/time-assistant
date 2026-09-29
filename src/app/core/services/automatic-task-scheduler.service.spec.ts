import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Task } from '../models/task';
import { AutomaticTaskSchedulerService } from './automatic-task-scheduler.service';
import { BreakCoordinationService } from './break-coordination.service';
import { TaskService } from './task.service';

function task(id: string, order: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    note: '',
    category: '',
    reminderAt: '2026-05-30T10:00:00.000Z',
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    allowConcurrentStart: false,
    order,
    status: 'pending',
    createdAt: '2026-05-30T09:00:00.000Z',
    updatedAt: '2026-05-30T09:00:00.000Z',
    totalPausedSeconds: 0,
    reminderAttemptsShown: 0,
    ...overrides,
  };
}

describe('AutomaticTaskSchedulerService', () => {
  const now = new Date('2026-05-30T10:10:00.000Z');
  let tasks: ReturnType<typeof signal<Task[]>>;
  let blocked: ReturnType<typeof signal<boolean>>;
  let startAutomatically: ReturnType<typeof vi.fn>;
  let deferAutomaticStart: ReturnType<typeof vi.fn>;
  let breakListener: (() => void) | undefined;
  let service: AutomaticTaskSchedulerService;

  beforeEach(() => {
    tasks = signal<Task[]>([]);
    blocked = signal(false);
    startAutomatically = vi.fn(async (taskId: string, startedAt: Date) => {
      tasks.update((items) =>
        items.map((item) =>
          item.id === taskId
            ? { ...item, status: 'active', activeStartedAt: startedAt.toISOString() }
            : item,
        ),
      );
      return true;
    });
    deferAutomaticStart = vi.fn(async () => true);

    const taskService = {
      pendingTasks: computed(() => tasks().filter((item) => item.status === 'pending')),
      currentTasks: computed(() =>
        tasks().filter((item) => item.status === 'active' || item.status === 'paused'),
      ),
      startAutomatically,
      deferAutomaticStart,
    };
    const coordination = {
      blocked,
      subscribe: vi.fn((listener: () => void) => {
        breakListener = listener;
        return () => {
          breakListener = undefined;
        };
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        AutomaticTaskSchedulerService,
        { provide: TaskService, useValue: taskService },
        { provide: BreakCoordinationService, useValue: coordination },
      ],
    });
    service = TestBed.inject(AutomaticTaskSchedulerService);
  });

  it('starts the first due task when no task or break blocks it', async () => {
    tasks.set([task('due', 0)]);

    await service.check(now);

    expect(startAutomatically).toHaveBeenCalledWith('due', now);
    expect(deferAutomaticStart).not.toHaveBeenCalled();
  });

  it('does nothing for a future task', async () => {
    tasks.set([task('future', 0, { reminderAt: '2026-05-30T10:30:00.000Z' })]);

    await service.check(now);

    expect(startAutomatically).not.toHaveBeenCalled();
    expect(deferAutomaticStart).not.toHaveBeenCalled();
  });

  it.each(['active', 'paused'] as const)(
    'defers due pending tasks while an %s task blocks them',
    async (status) => {
      tasks.set([task('blocker', 0, { status }), task('due', 1)]);

      await service.check(now);

      expect(startAutomatically).not.toHaveBeenCalled();
      expect(deferAutomaticStart).toHaveBeenCalledWith('due', now);
    },
  );

  it('starts an overdue task immediately when its blocker disappears before a future retry', async () => {
    tasks.set([
      task('overdue', 0, {
        reminderAt: '2026-05-30T10:00:00.000Z',
        nextAutoStartAt: '2026-05-30T10:30:00.000Z',
      }),
    ]);

    await service.check(now);

    expect(startAutomatically).toHaveBeenCalledWith('overdue', now);
  });

  it.each(['prompt', 'running'] as const)(
    'does not start or defer while a break is %s',
    async () => {
      blocked.set(true);
      tasks.set([task('due', 0, { allowConcurrentStart: true })]);

      await service.check(now);

      expect(startAutomatically).not.toHaveBeenCalled();
      expect(deferAutomaticStart).not.toHaveBeenCalled();
    },
  );

  it('does not start or defer during a retained break and reevaluates promptly at expiry', async () => {
    vi.useFakeTimers();
    try {
      blocked.set(true);
      tasks.set([task('blocker', 0, { status: 'active' }), task('due', 1)]);
      await service.check(now);

      expect(startAutomatically).not.toHaveBeenCalled();
      expect(deferAutomaticStart).not.toHaveBeenCalled();

      tasks.set([task('due', 1)]);
      await service.check(now);

      expect(startAutomatically).not.toHaveBeenCalled();
      expect(deferAutomaticStart).not.toHaveBeenCalled();

      service.start();
      blocked.set(false);

      breakListener?.();
      await vi.runAllTicks();

      expect(startAutomatically).toHaveBeenCalledWith('due', expect.any(Date));
    } finally {
      service.stop();
      vi.useRealTimers();
    }
  });

  it('starts only the first queue task when several are overdue', async () => {
    tasks.set([task('second', 1), task('first', 0)]);

    await service.check(now);

    expect(startAutomatically).toHaveBeenCalledTimes(1);
    expect(startAutomatically).toHaveBeenCalledWith('first', now);
    expect(deferAutomaticStart).toHaveBeenCalledWith('second', now);
  });

  it.each(['active', 'paused'] as const)(
    'starts a due concurrent task while an %s task exists',
    async (status) => {
      tasks.set([
        task('blocker', 0, { status }),
        task('concurrent', 1, { allowConcurrentStart: true }),
      ]);

      await service.check(now);

      expect(startAutomatically).toHaveBeenCalledWith('concurrent', now);
      expect(deferAutomaticStart).not.toHaveBeenCalled();
    },
  );

  it('starts a non-concurrent task and then a concurrent task in queue order', async () => {
    tasks.set([task('first', 0), task('second', 1, { allowConcurrentStart: true })]);

    await service.check(now);

    expect(startAutomatically.mock.calls.map(([taskId]) => taskId)).toEqual(['first', 'second']);
    expect(deferAutomaticStart).not.toHaveBeenCalled();
  });

  it('starts a concurrent task then defers a later non-concurrent task', async () => {
    tasks.set([task('first', 0, { allowConcurrentStart: true }), task('second', 1)]);

    await service.check(now);

    expect(startAutomatically).toHaveBeenCalledTimes(1);
    expect(startAutomatically).toHaveBeenCalledWith('first', now);
    expect(deferAutomaticStart).toHaveBeenCalledWith('second', now);
  });

  it('starts several overdue concurrent tasks in deterministic queue order', async () => {
    tasks.set([
      task('blocker', 0, { status: 'active' }),
      task('third', 3, { allowConcurrentStart: true }),
      task('second', 2, { allowConcurrentStart: true }),
    ]);

    await service.check(now);

    expect(startAutomatically.mock.calls.map(([taskId]) => taskId)).toEqual(['second', 'third']);
  });

  it('ignores a future retry for an overdue task that now allows concurrency', async () => {
    tasks.set([
      task('blocker', 0, { status: 'active' }),
      task('concurrent', 1, {
        allowConcurrentStart: true,
        nextAutoStartAt: '2026-05-30T11:00:00.000Z',
      }),
    ]);

    await service.check(now);

    expect(startAutomatically).toHaveBeenCalledWith('concurrent', now);
    expect(deferAutomaticStart).not.toHaveBeenCalled();
  });
});
