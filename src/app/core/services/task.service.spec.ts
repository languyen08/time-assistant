import { TestBed } from '@angular/core/testing';
import { Task } from '../models/task';
import { TaskRepository } from '../repositories/task.repository';
import { HistoryService } from './history.service';
import { TaskService } from './task.service';
import { TaskValidationService } from './task-validation.service';

function activeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_1',
    name: 'Deep work',
    note: '',
    category: '',
    reminderAt: '2026-05-30T10:30:00.000Z',
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    allowConcurrentStart: false,
    order: 0,
    status: 'active',
    createdAt: '2026-05-30T10:00:00.000Z',
    updatedAt: '2026-05-30T10:00:00.000Z',
    activeStartedAt: '2026-05-30T10:00:00.000Z',
    nextReminderAt: '2026-05-30T10:30:00.000Z',
    reminderAttemptsShown: 0,
    totalPausedSeconds: 0,
    ...overrides,
  };
}

function pendingTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_2',
    name: 'Scheduled work',
    note: '',
    category: '',
    reminderAt: '2026-05-30T10:00:00.000Z',
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    allowConcurrentStart: false,
    order: 1,
    status: 'pending',
    createdAt: '2026-05-30T09:00:00.000Z',
    updatedAt: '2026-05-30T09:00:00.000Z',
    reminderAttemptsShown: 0,
    totalPausedSeconds: 0,
    ...overrides,
  };
}

describe('TaskService pause/resume', () => {
  let service: TaskService;
  let savedTasks: Task[];
  let record: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    savedTasks = [activeTask()];
    record = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        TaskService,
        {
          provide: TaskRepository,
          useValue: {
            list: vi.fn(async () => savedTasks),
            save: vi.fn(async (task: Task) => {
              savedTasks = savedTasks.map((item) => (item.id === task.id ? task : item));
            }),
            delete: vi.fn(),
          },
        },
        { provide: HistoryService, useValue: { record } },
        {
          provide: TaskValidationService,
          useValue: { validate: vi.fn(() => ({ valid: true, errors: [] })) },
        },
      ],
    });
    service = TestBed.inject(TaskService);
    await service.load();
  });

  it('pauses an active task and freezes remaining reminder seconds', async () => {
    await service.pause('task_1', new Date('2026-05-30T10:10:00.000Z'));

    expect(service.currentTask()?.status).toBe('paused');
    expect(service.currentTask()?.pausedRemainingSeconds).toBe(1200);
    expect(record).toHaveBeenCalledWith('task_paused', 'Paused "Deep work".', 'task_1');
  });

  it('resumes a paused task and shifts the next reminder by remaining seconds', async () => {
    await service.pause('task_1', new Date('2026-05-30T10:10:00.000Z'));
    await service.resume('task_1', new Date('2026-05-30T10:20:00.000Z'));

    expect(service.currentTask()?.status).toBe('active');
    expect(service.currentTask()?.totalPausedSeconds).toBe(600);
    expect(service.currentTask()?.nextReminderAt).toBe('2026-05-30T10:40:00.000Z');
    expect(record).toHaveBeenCalledWith('task_resumed', 'Resumed "Deep work".', 'task_1');
  });

  it('extends the existing active reminder instead of overwriting it', async () => {
    await service.addTime('task_1', 1, new Date('2026-05-30T10:10:00.000Z'));
    await service.addTime('task_1', 1, new Date('2026-05-30T10:10:10.000Z'));

    expect(service.currentTask()?.nextReminderAt).toBe('2026-05-30T10:32:00.000Z');
    expect(service.currentTask()?.reminderAt).toBe('2026-05-30T10:30:00.000Z');
  });

  it('extends paused reminder seconds instead of replacing them', async () => {
    await service.pause('task_1', new Date('2026-05-30T10:10:00.000Z'));
    await service.addTime('task_1', 1, new Date('2026-05-30T10:11:00.000Z'));

    expect(service.currentTask()?.status).toBe('paused');
    expect(service.currentTask()?.pausedRemainingSeconds).toBe(1260);
  });
});

describe('TaskService automatic scheduling', () => {
  let service: TaskService;
  let savedTasks: Task[];
  let save: ReturnType<typeof vi.fn>;
  let record: ReturnType<typeof vi.fn>;

  async function configure(tasks: Task[]): Promise<void> {
    savedTasks = tasks;
    save = vi.fn(async (task: Task) => {
      const index = savedTasks.findIndex((item) => item.id === task.id);
      savedTasks =
        index < 0
          ? [...savedTasks, task]
          : savedTasks.map((item) => (item.id === task.id ? task : item));
    });
    record = vi.fn(async () => undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        TaskService,
        {
          provide: TaskRepository,
          useValue: {
            list: vi.fn(async () => savedTasks),
            save,
            delete: vi.fn(async (taskId: string) => {
              savedTasks = savedTasks.filter((task) => task.id !== taskId);
            }),
          },
        },
        { provide: HistoryService, useValue: { record } },
        {
          provide: TaskValidationService,
          useValue: { validate: vi.fn(() => ({ valid: true, errors: [] })) },
        },
      ],
    });
    service = TestBed.inject(TaskService);
    await service.load();
  }

  it('automatically starts a due pending task and records its origin', async () => {
    await configure([pendingTask({ nextAutoStartAt: '2026-05-30T10:30:00.000Z' })]);
    const now = new Date('2026-05-30T10:05:00.000Z');

    const started = await service.startAutomatically('task_2', now);

    expect(started).toBe(true);
    expect(service.currentTask()).toMatchObject({
      status: 'active',
      activeStartedAt: now.toISOString(),
      nextReminderAt: now.toISOString(),
      reminderAttemptsShown: 0,
    });
    expect(service.currentTask()?.nextAutoStartAt).toBeUndefined();
    expect(record).toHaveBeenCalledWith(
      'task_started',
      'Automatically started "Scheduled work".',
      'task_2',
      { source: 'automatic' },
    );
  });

  it('allows manual Start now before the scheduled time and clears retry state', async () => {
    await configure([
      pendingTask({
        reminderAt: '2026-05-30T12:00:00.000Z',
        nextAutoStartAt: '2026-05-30T12:30:00.000Z',
      }),
    ]);

    await service.start('task_2');

    expect(service.currentTask()?.status).toBe('active');
    expect(service.currentTask()?.nextReminderAt).toBe('2026-05-30T12:00:00.000Z');
    expect(service.currentTask()?.nextAutoStartAt).toBeUndefined();
  });

  it('clears an old retry when a pending Start time is edited', async () => {
    await configure([pendingTask({ nextAutoStartAt: '2026-05-30T10:30:00.000Z' })]);

    await service.update('task_2', {
      name: 'Scheduled work',
      note: '',
      category: '',
      reminderAt: '2026-05-30T11:00:00.000Z',
      reminderCount: 3,
      reminderIntervalMinutes: 5,
      allowConcurrentStart: false,
    });

    expect(service.pendingTasks()[0].reminderAt).toBe('2026-05-30T11:00:00.000Z');
    expect(service.pendingTasks()[0].nextAutoStartAt).toBeUndefined();
  });

  it('defers an old task without retry state by 30 minutes from reminderAt', async () => {
    await configure([pendingTask()]);

    const deferred = await service.deferAutomaticStart(
      'task_2',
      new Date('2026-05-30T10:00:00.000Z'),
    );

    expect(deferred).toBe(true);
    expect(service.pendingTasks()[0].nextAutoStartAt).toBe('2026-05-30T10:30:00.000Z');
    expect(record).toHaveBeenCalledWith(
      'auto_start_deferred',
      'Deferred automatic start for "Scheduled work" by 30 minutes.',
      'task_2',
      { minutes: 30, retryAt: '2026-05-30T10:30:00.000Z' },
    );
  });

  it('advances another 30 minutes when a retry is blocked again', async () => {
    await configure([pendingTask({ nextAutoStartAt: '2026-05-30T10:30:00.000Z' })]);

    await service.deferAutomaticStart('task_2', new Date('2026-05-30T10:30:00.000Z'));

    expect(service.pendingTasks()[0].nextAutoStartAt).toBe('2026-05-30T11:00:00.000Z');
  });

  it('catches up a long sleep in one persistence and history write', async () => {
    await configure([pendingTask()]);
    save.mockClear();
    record.mockClear();

    await service.deferAutomaticStart('task_2', new Date('2026-05-30T12:05:00.000Z'));

    expect(service.pendingTasks()[0].nextAutoStartAt).toBe('2026-05-30T12:30:00.000Z');
    expect(save).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      'auto_start_deferred',
      'Deferred automatic start for "Scheduled work" by 150 minutes.',
      'task_2',
      { minutes: 150, retryAt: '2026-05-30T12:30:00.000Z' },
    );
  });

  it.each(['active', 'paused'] as const)(
    'keeps a second automatic start pending while an %s task exists',
    async (status) => {
      await configure([
        activeTask({
          status,
          pausedAt: status === 'paused' ? '2026-05-30T10:00:00.000Z' : undefined,
        }),
        pendingTask(),
      ]);

      const started = await service.startAutomatically(
        'task_2',
        new Date('2026-05-30T10:05:00.000Z'),
      );

      expect(started).toBe(false);
      expect(service.pendingTasks()[0].status).toBe('pending');
    },
  );

  it('normalizes old tasks and preserves deterministic active/current collection order', async () => {
    await configure([
      activeTask({ id: 'active-2', order: 2 }),
      pendingTask({ id: 'paused-1', order: 1, status: 'paused', allowConcurrentStart: undefined }),
      activeTask({ id: 'active-0', order: 0 }),
    ] as Task[]);

    expect(service.activeTasks().map((task) => task.id)).toEqual(['active-0', 'active-2']);
    expect(service.currentTasks().map((task) => task.id)).toEqual([
      'active-0',
      'paused-1',
      'active-2',
    ]);
    expect(service.currentTasks()[1].allowConcurrentStart).toBe(false);
  });

  it.each(['active', 'paused'] as const)(
    'allows a concurrent task to start manually while another task is %s',
    async (status) => {
      await configure([activeTask({ status }), pendingTask({ allowConcurrentStart: true })]);

      await service.start('task_2');

      expect(service.currentTasks().map((task) => task.id)).toEqual(['task_1', 'task_2']);
      expect(service.activeTasks().some((task) => task.id === 'task_2')).toBe(true);
    },
  );

  it('blocks a non-concurrent manual start while another current task exists', async () => {
    await configure([activeTask(), pendingTask()]);

    await service.start('task_2');

    expect(service.pendingTasks().map((task) => task.id)).toEqual(['task_2']);
    expect(service.errorMessage()).toBe('Complete the active task before starting another.');
  });

  it('allows an automatic concurrent start but blocks a non-concurrent one', async () => {
    await configure([
      activeTask(),
      pendingTask({ id: 'concurrent', allowConcurrentStart: true }),
      pendingTask({ id: 'blocked', order: 2 }),
    ]);

    const startTime = new Date('2026-05-30T10:05:00.000Z');
    expect(await service.startAutomatically('concurrent', startTime)).toBe(true);
    expect(await service.startAutomatically('blocked', startTime)).toBe(false);
    expect(service.activeTasks().map((task) => task.id)).toEqual(['task_1', 'concurrent']);
    expect(service.pendingTasks().map((task) => task.id)).toEqual(['blocked']);
  });

  it('targets pause, resume, add time, completion, and deletion by task id', async () => {
    await configure([
      activeTask({ id: 'task-a', order: 0 }),
      activeTask({
        id: 'task-b',
        order: 1,
        nextReminderAt: '2026-05-30T10:30:00.000Z',
      }),
    ]);

    await service.pause('task-b', new Date('2026-05-30T10:10:00.000Z'));
    expect(service.currentTasks().find((task) => task.id === 'task-a')?.status).toBe('active');
    expect(service.currentTasks().find((task) => task.id === 'task-b')?.status).toBe('paused');

    await service.addTime('task-b', 1, new Date('2026-05-30T10:11:00.000Z'));
    expect(
      service.currentTasks().find((task) => task.id === 'task-b')?.pausedRemainingSeconds,
    ).toBe(1260);
    expect(service.currentTasks().find((task) => task.id === 'task-a')?.nextReminderAt).toBe(
      '2026-05-30T10:30:00.000Z',
    );

    await service.resume('task-b', new Date('2026-05-30T10:20:00.000Z'));
    expect(service.activeTasks().map((task) => task.id)).toEqual(['task-a', 'task-b']);

    await service.complete('task-b');
    expect(service.currentTasks().map((task) => task.id)).toEqual(['task-a']);
    expect(service.completedTasks().map((task) => task.id)).toEqual(['task-b']);

    await service.delete('task-a');
    expect(service.tasks().map((task) => task.id)).toEqual(['task-b']);
  });

  it('clears a stale retry when a pending task is edited to allow concurrency', async () => {
    await configure([pendingTask({ nextAutoStartAt: '2026-05-30T11:00:00.000Z' })]);

    await service.update('task_2', {
      name: 'Scheduled work',
      note: '',
      category: '',
      reminderAt: '2026-05-30T10:00:00.000Z',
      reminderCount: 3,
      reminderIntervalMinutes: 5,
      allowConcurrentStart: true,
    });

    expect(service.pendingTasks()[0].allowConcurrentStart).toBe(true);
    expect(service.pendingTasks()[0].nextAutoStartAt).toBeUndefined();
  });

  it('creates tasks with and without normalized deadline configuration', async () => {
    await configure([]);
    await service.create({
      name: 'No deadline',
      note: '',
      category: '',
      reminderAt: '2026-05-30T11:00:00.000Z',
      reminderCount: 3,
      reminderIntervalMinutes: 5,
      allowConcurrentStart: false,
    });
    await service.create({
      name: 'Has deadline',
      note: '',
      category: '',
      reminderAt: '2026-05-30T11:00:00.000Z',
      reminderCount: 3,
      reminderIntervalMinutes: 5,
      allowConcurrentStart: false,
      deadlineAt: '2026-05-30T12:00:00.000Z',
      deadlineMessage: '  Wrap this up.  ',
    });

    expect(service.tasks()[0]).toMatchObject({
      deadlineAt: undefined,
      deadlineMessage: undefined,
    });
    expect(service.tasks()[1]).toMatchObject({
      deadlineAt: '2026-05-30T12:00:00.000Z',
      deadlineMessage: 'Wrap this up.',
    });
    expect(service.tasks()[1].deadlineNotifiedAt).toBeUndefined();
    expect(service.tasks()[1].deadlineAcknowledgedAt).toBeUndefined();
  });

  it('re-arms a changed deadline and clears every deadline field when disabled', async () => {
    await configure([
      pendingTask({
        deadlineAt: '2026-05-30T11:00:00.000Z',
        deadlineMessage: 'Old message',
        deadlineNotifiedAt: '2026-05-30T11:00:00.000Z',
        deadlineAcknowledgedAt: '2026-05-30T11:01:00.000Z',
      }),
    ]);
    const baseDraft = {
      name: 'Scheduled work',
      note: '',
      category: '',
      reminderAt: '2026-05-30T10:00:00.000Z',
      reminderCount: 3,
      reminderIntervalMinutes: 5,
      allowConcurrentStart: false,
    };

    await service.update('task_2', {
      ...baseDraft,
      deadlineAt: '2026-05-30T12:00:00.000Z',
      deadlineMessage: 'New message',
    });
    expect(service.pendingTasks()[0]).toMatchObject({
      deadlineAt: '2026-05-30T12:00:00.000Z',
      deadlineNotifiedAt: undefined,
      deadlineAcknowledgedAt: undefined,
    });

    await service.update('task_2', baseDraft);
    expect(service.pendingTasks()[0]).toMatchObject({
      deadlineAt: undefined,
      deadlineMessage: undefined,
      deadlineNotifiedAt: undefined,
      deadlineAcknowledgedAt: undefined,
    });
  });

  it('preserves processing state for a message-only deadline edit', async () => {
    await configure([
      pendingTask({
        deadlineAt: '2026-05-30T11:00:00.000Z',
        deadlineMessage: 'Old message',
        deadlineNotifiedAt: '2026-05-30T11:00:00.000Z',
        deadlineAcknowledgedAt: '2026-05-30T11:01:00.000Z',
      }),
    ]);

    await service.update('task_2', {
      name: 'Scheduled work',
      note: '',
      category: '',
      reminderAt: '2026-05-30T10:00:00.000Z',
      reminderCount: 3,
      reminderIntervalMinutes: 5,
      allowConcurrentStart: false,
      deadlineAt: '2026-05-30T11:00:00.000Z',
      deadlineMessage: 'Updated message',
    });

    expect(service.pendingTasks()[0]).toMatchObject({
      deadlineMessage: 'Updated message',
      deadlineNotifiedAt: '2026-05-30T11:00:00.000Z',
      deadlineAcknowledgedAt: '2026-05-30T11:01:00.000Z',
    });
  });

  it('marks a deadline once, records one history event, and acknowledges only its task', async () => {
    await configure([
      pendingTask({
        id: 'deadline-a',
        deadlineAt: '2026-05-30T10:05:00.000Z',
        deadlineMessage: 'A',
      }),
      pendingTask({
        id: 'deadline-b',
        order: 2,
        deadlineAt: '2026-05-30T10:05:00.000Z',
        deadlineMessage: 'B',
      }),
    ]);
    const now = new Date('2026-05-30T10:10:00.000Z');

    expect(await service.markDeadlineNotified('deadline-a', now)).toBeDefined();
    expect(await service.markDeadlineNotified('deadline-a', now)).toBeUndefined();
    expect(record.mock.calls.filter(([type]) => type === 'deadline_reached')).toHaveLength(1);
    expect(record).toHaveBeenCalledWith(
      'deadline_reached',
      'Finish-by deadline reached for "Scheduled work".',
      'deadline-a',
      { deadlineAt: '2026-05-30T10:05:00.000Z' },
    );

    expect(await service.acknowledgeDeadline('deadline-a', now)).toBe(true);
    expect(await service.acknowledgeDeadline('deadline-a', now)).toBe(false);
    expect(service.tasks().find((task) => task.id === 'deadline-a')?.deadlineAcknowledgedAt).toBe(
      now.toISOString(),
    );
    expect(
      service.tasks().find((task) => task.id === 'deadline-b')?.deadlineAcknowledgedAt,
    ).toBeUndefined();
  });

  it('keeps historical deadline state when a current task completes', async () => {
    await configure([
      activeTask({
        deadlineAt: '2026-05-30T10:05:00.000Z',
        deadlineMessage: 'Done?',
        deadlineNotifiedAt: '2026-05-30T10:05:00.000Z',
      }),
    ]);

    await service.complete('task_1');

    expect(service.completedTasks()[0].deadlineNotifiedAt).toBe('2026-05-30T10:05:00.000Z');
  });
});
