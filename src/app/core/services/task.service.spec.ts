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
    await service.pauseActive(new Date('2026-05-30T10:10:00.000Z'));

    expect(service.currentTask()?.status).toBe('paused');
    expect(service.currentTask()?.pausedRemainingSeconds).toBe(1200);
    expect(record).toHaveBeenCalledWith('task_paused', 'Paused "Deep work".', 'task_1');
  });

  it('resumes a paused task and shifts the next reminder by remaining seconds', async () => {
    await service.pauseActive(new Date('2026-05-30T10:10:00.000Z'));
    await service.resumeActive(new Date('2026-05-30T10:20:00.000Z'));

    expect(service.currentTask()?.status).toBe('active');
    expect(service.currentTask()?.totalPausedSeconds).toBe(600);
    expect(service.currentTask()?.nextReminderAt).toBe('2026-05-30T10:40:00.000Z');
    expect(record).toHaveBeenCalledWith('task_resumed', 'Resumed "Deep work".', 'task_1');
  });

  it('extends the existing active reminder instead of overwriting it', async () => {
    await service.addTimeToActive(1, new Date('2026-05-30T10:10:00.000Z'));
    await service.addTimeToActive(1, new Date('2026-05-30T10:10:10.000Z'));

    expect(service.currentTask()?.nextReminderAt).toBe('2026-05-30T10:32:00.000Z');
    expect(service.currentTask()?.reminderAt).toBe('2026-05-30T10:30:00.000Z');
  });

  it('extends paused reminder seconds instead of replacing them', async () => {
    await service.pauseActive(new Date('2026-05-30T10:10:00.000Z'));
    await service.addTimeToActive(1, new Date('2026-05-30T10:11:00.000Z'));

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
});
