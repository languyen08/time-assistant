import { TestBed } from '@angular/core/testing';
import { Task, TaskDraft } from '../models/task';
import { TaskRepository } from '../repositories/task.repository';
import { IndexedDbStorageAdapter } from '../storage/indexed-db-storage.adapter';
import { localDate, makeOccurrence, onOccurrenceDate } from '../utils/recurrence.util';
import { HistoryService } from './history.service';
import { TaskService } from './task.service';
import { AutomaticTaskSchedulerService } from './automatic-task-scheduler.service';
import { BreakCoordinationService } from './break-coordination.service';
import { ChartSummaryService } from './chart-summary.service';
import { TimerService } from './timer.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { DeadlineSchedulerService } from './deadline-scheduler.service';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';
import { DEFAULT_APP_SETTINGS } from '../models/app-settings';

describe('TaskService recurrence lifecycle', () => {
  let service: TaskService;
  let records: Task[];
  let record: ReturnType<typeof vi.fn>;
  let recordBatch: ReturnType<typeof vi.fn>;
  const now = new Date(2026, 9, 6, 8);
  const draft: TaskDraft = {
    name: 'Read algorithms',
    note: '',
    category: 'Study',
    reminderEnabled: false,
    reminderAt: new Date(2026, 9, 6, 9, 30).toISOString(),
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    allowConcurrentStart: false,
    recurrence: { type: 'weekdays', rangeStart: '2026-10-06', rangeEnd: '2026-12-31' },
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    records = [];
    record = vi.fn(async () => undefined);
    recordBatch = vi.fn(async () => undefined);
    const save = (task: Task) => {
      records = records.filter((item) => item.id !== task.id).concat(structuredClone(task));
    };
    TestBed.configureTestingModule({
      providers: [
        TaskRepository,
        { provide: BreakCoordinationService, useValue: { blocked: vi.fn(() => false) } },
        {
          provide: NotificationService,
          useValue: {
            randomFriendlyMessage: () => 'Reminder',
            showReminder: vi.fn(),
            showDeadline: vi.fn(),
          },
        },
        { provide: SettingsService, useValue: { settings: () => DEFAULT_APP_SETTINGS } },
        {
          provide: IndexedDbStorageAdapter,
          useValue: {
            getAll: async () => structuredClone(records),
            get: async (_store: string, id: string) =>
              structuredClone(records.find((task) => task.id === id)),
            put: async (_store: string, task: Task) => save(task),
            delete: async (_store: string, id: string) => {
              records = records.filter((task) => task.id !== id);
            },
            mutate: async (
              _store: string,
              plan: (tasks: Task[]) => { save: Task[]; remove?: string[]; result: unknown },
            ) => {
              const changes = plan(structuredClone(records));
              records = records.filter((task) => !changes.remove?.includes(task.id));
              changes.save.forEach(save);
              return changes.result;
            },
          },
        },
        { provide: HistoryService, useValue: { record, recordBatch } },
      ],
    });
    service = TestBed.inject(TaskService);
    await service.load();
  });
  afterEach(() => vi.useRealTimers());

  it.each(['pending', 'active', 'paused'] as const)(
    'rolls a %s occurrence at local midnight with no carried runtime state',
    async (status) => {
      await service.create({ ...draft, reminderEnabled: true });
      const oldId = service.tasks()[0].id;
      vi.setSystemTime(new Date(2026, 9, 6, 23, 59));
      if (status !== 'pending') await service.start(oldId);
      if (status === 'paused') await service.pause(oldId);
      const before = structuredClone(records.find((task) => task.id === oldId)!);
      record.mockClear();
      recordBatch.mockClear();
      const midnight = new Date(2026, 9, 7, 0, 0, 1);
      vi.setSystemTime(midnight);
      await Promise.all([
        service.ensureRecurrences(midnight, true),
        service.ensureRecurrences(midnight, true),
        service.load(),
      ]);
      const old = records.find((task) => task.id === oldId)!;
      expect(old).toMatchObject({ status: 'interrupted', interruptedAt: midnight.toISOString() });
      expect(old.activeStartedAt).toBe(before.activeStartedAt);
      expect(old.pausedAt).toBe(before.pausedAt);
      expect(old.totalPausedSeconds).toBe(before.totalPausedSeconds);
      expect(old.completedAt).toBeUndefined();
      expect(old.pendingReminder).toBeUndefined();
      expect(old.nextReminderAt).toBeUndefined();
      expect(old.nextAutoStartAt).toBeUndefined();
      const fresh = service.pendingTasks()[0];
      expect(fresh).toMatchObject({
        occurrenceDate: '2026-10-07',
        totalPausedSeconds: 0,
        reminderAttemptsShown: 0,
      });
      for (const field of [
        'activeStartedAt',
        'pausedAt',
        'pausedRemainingSeconds',
        'completedAt',
        'interruptedAt',
        'pendingReminder',
        'nextReminderAt',
        'nextAutoStartAt',
        'deadlineNotifiedAt',
        'deadlineAcknowledgedAt',
      ] as const) {
        expect(fresh[field]).toBeUndefined();
      }
      expect(TestBed.inject(TimerService).elapsedSeconds(fresh)).toBe(0);
      expect(service.currentTasks()).toEqual([]);
      await service.load();
      expect(records.filter((task) => task.occurrenceDate === '2026-10-07')).toHaveLength(1);
      const events = recordBatch.mock.calls.flatMap(([rows]) => rows);
      expect(events.filter((event) => event.type === 'task_interrupted')).toHaveLength(1);
      expect(events.filter((event) => event.type === 'task_created')).toHaveLength(1);
      expect(record.mock.calls.some(([type]) => type === 'task_completed')).toBe(false);
    },
  );

  it('reconciles during a break, then automatically starts only when due and unblocked', async () => {
    const blocked = vi.mocked(TestBed.inject(BreakCoordinationService).blocked);
    blocked.mockReturnValue(true);
    await service.create(draft);
    await service.start(service.tasks()[0].id);
    const scheduler = TestBed.inject(AutomaticTaskSchedulerService);
    vi.setSystemTime(new Date(2026, 9, 7));
    await scheduler.check();
    const today = service.pendingTasks()[0];
    expect(today.occurrenceDate).toBe('2026-10-07');
    expect(service.currentTasks()).toEqual([]);
    blocked.mockReturnValue(false);
    await scheduler.check();
    expect(service.pendingTasks()[0].id).toBe(today.id);
    vi.setSystemTime(new Date(2026, 9, 7, 9, 30));
    await scheduler.check();
    expect(service.currentTask()?.id).toBe(today.id);
    expect(service.currentTask()?.activeStartedAt).toBe(new Date().toISOString());
    expect(TestBed.inject(TimerService).elapsedSeconds(service.currentTask())).toBe(0);
  });

  it.each(['load', 'ensureRecurrences'] as const)(
    'publishes committed rollover when history fails during %s',
    async (method) => {
      await service.create(draft);
      await service.start(service.tasks()[0].id);
      recordBatch.mockRejectedValueOnce(new Error('History unavailable'));
      vi.setSystemTime(new Date(2026, 9, 7));
      await service[method]();
      expect(service.currentTasks()).toEqual([]);
      expect(service.pendingTasks()[0].occurrenceDate).toBe('2026-10-07');
      expect(service.errorMessage()).toContain('History unavailable');
    },
  );

  it('rejects stale completion, pause, and editing after another renderer commits rollover', async () => {
    await service.create(draft);
    const old = service.tasks()[0];
    await service.start(old.id);
    vi.setSystemTime(new Date(2026, 9, 7));
    await TestBed.inject(TaskRepository).ensureOccurrences();
    const interrupted = structuredClone(records.find((task) => task.id === old.id));
    expect(await service.complete(old.id)).toBe(false);
    expect(await service.pause(old.id)).toBe(false);
    expect(await service.update(old.id, draft)).toBe(false);
    expect(await service.update(old.id, draft, 'future')).toBe(false);
    expect(records.find((task) => task.id === old.id)).toEqual(interrupted);
  });

  it('preserves completed records and excludes interrupted offline time from every focus chart', async () => {
    await service.create(draft);
    const oldId = service.tasks()[0].id;
    await service.start(oldId);
    const completed: Task = {
      ...service.currentTask()!,
      id: 'completed-past',
      occurrenceDate: '2026-10-05',
      status: 'completed',
      activeStartedAt: new Date(2026, 9, 5, 9).toISOString(),
      completedAt: new Date(2026, 9, 5, 10).toISOString(),
    };
    records.push(completed);
    const charts = TestBed.inject(ChartSummaryService);
    const expected = [
      charts.completedTasksPerDay([completed]),
      charts.focusMinutesPerDay([completed]),
      charts.focusMinutesByCategory([completed]),
    ];
    vi.setSystemTime(new Date(2026, 11, 14, 8));
    await service.load();
    expect(records.find((task) => task.id === completed.id)).toEqual(completed);
    expect([
      charts.completedTasksPerDay(service.tasks()),
      charts.focusMinutesPerDay(service.tasks()),
      charts.focusMinutesByCategory(service.tasks()),
    ]).toEqual(expected);
    expect(service.completedTasks()).toEqual([completed]);
  });

  it.each(['reminder', 'deadline'] as const)(
    'reconciles midnight before dispatching an old %s alert',
    async (kind) => {
      await service.create({
        ...draft,
        reminderEnabled: true,
        deadlineAt: new Date(2026, 9, 6, 23, 50).toISOString(),
        deadlineMessage: 'Finish',
      });
      await service.start(service.tasks()[0].id);
      vi.setSystemTime(new Date(2026, 9, 7, 0, 0, 1));
      if (kind === 'reminder') await TestBed.inject(ReminderSchedulerService).check();
      else await TestBed.inject(DeadlineSchedulerService).check();
      const notifications = TestBed.inject(NotificationService);
      expect(notifications.showReminder).not.toHaveBeenCalled();
      expect(notifications.showDeadline).not.toHaveBeenCalled();
      expect(service.currentTasks()).toEqual([]);
      expect(service.pendingTasks()[0].occurrenceDate).toBe('2026-10-07');
    },
  );

  it('allocates 100 series with one history batch and skips the redundant same-day scheduler check', async () => {
    await service.create(draft);
    const template = records.find((task) => task.recurrenceTemplate)!;
    records = Array.from({ length: 100 }, (_, index) => ({
      ...template,
      id: `bulk-${index}`,
      recurrenceSeriesId: `bulk-${index}`,
      recurrenceCursor: undefined,
    }));
    record.mockClear();
    const reconciliation = vi.spyOn(TestBed.inject(TaskRepository), 'ensureOccurrences');
    await service.load();
    expect(service.tasks()).toHaveLength(100);
    expect(record).not.toHaveBeenCalled();
    expect(recordBatch).toHaveBeenCalledOnce();
    const rows = recordBatch.mock.calls[0][0];
    expect(rows).toHaveLength(100);
    expect(new Set(rows.map((row: { taskId: string }) => row.taskId)).size).toBe(100);
    expect(rows.every((row: { type: string }) => row.type === 'task_created')).toBe(true);
    await service.ensureRecurrences(now, true);
    expect(reconciliation).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date(2026, 9, 7));
    await service.ensureRecurrences(new Date(2026, 9, 7), true);
    expect(reconciliation).toHaveBeenCalledTimes(3);
    expect(recordBatch).toHaveBeenCalledTimes(2);
    expect(recordBatch.mock.calls[1][0]).toHaveLength(200);
  });

  it('creates one executable occurrence and one hidden template, without reminders', async () => {
    expect(await service.create(draft)).toBe(true);
    expect(service.tasks()).toHaveLength(1);
    expect(records).toHaveLength(2);
    expect(service.tasks()[0]).toMatchObject({
      occurrenceDate: '2026-10-06',
      reminderEnabled: false,
      reminderCount: 0,
    });
    await Promise.all([service.load(), service.load(), service.ensureRecurrences()]);
    expect(record.mock.calls.filter(([type]) => type === 'task_created')).toHaveLength(1);
  });
  it('preserves occurrence elapsed/pause/completion and creates independent next task', async () => {
    await service.create(draft);
    const task = service.tasks()[0];
    await service.start(task.id);
    await service.pause(task.id, new Date(2026, 9, 6, 10));
    await service.resume(task.id, new Date(2026, 9, 6, 10, 5));
    expect(service.currentTask()?.totalPausedSeconds).toBe(300);
    expect(service.currentTask()?.nextReminderAt).toBeUndefined();
    expect(await service.addTime(task.id, 10)).toBe(false);
    expect(await service.complete(task.id)).toBe(true);
    expect(service.completedTasks()[0].totalPausedSeconds).toBe(300);
    expect(service.pendingTasks()[0]).toMatchObject({
      occurrenceDate: '2026-10-07',
      totalPausedSeconds: 0,
      reminderAttemptsShown: 0,
    });
    expect(record.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['task_started', 'task_paused', 'task_resumed', 'task_completed']),
    );
    expect(record.mock.calls.some(([type]) => type === 'reminder_shown')).toBe(false);
  });
  it('derives reminder and next-day Finish by with the same local clock on each date', async () => {
    await service.create({
      ...draft,
      reminderEnabled: true,
      deadlineAt: new Date(2026, 9, 7, 1, 15).toISOString(),
      deadlineMessage: 'Finish reading',
    });
    const task = service.tasks()[0];
    await service.start(task.id);
    expect(service.currentTask()?.nextReminderAt).toBe(task.reminderAt);
    await service.complete(task.id);
    const next = service.pendingTasks()[0];
    expect(new Date(next.reminderAt).getHours()).toBe(9);
    expect(new Date(next.reminderAt).getMinutes()).toBe(30);
    expect(localDate(new Date(next.deadlineAt!))).toBe('2026-10-08');
    expect(new Date(next.deadlineAt!).getHours()).toBe(1);
    expect(next.deadlineNotifiedAt).toBeUndefined();
  });
  it('does not propagate an occurrence-only override', async () => {
    await service.create(draft);
    const task = service.tasks()[0];
    expect(await service.update(task.id, { ...draft, name: 'Graph theory' }, 'occurrence')).toBe(
      true,
    );
    expect(service.tasks()[0].name).toBe('Graph theory');
    await service.start(task.id);
    await service.complete(task.id);
    expect(service.pendingTasks()[0].name).toBe('Read algorithms');
  });
  it('updates future defaults and unstarted future tasks while preserving completed and started past work', async () => {
    await service.create(draft);
    const selected = service.tasks()[0];
    const template = records.find((task) => task.recurrenceTemplate)!;
    const past = {
      ...makeOccurrence(template, '2026-10-05'),
      status: 'completed' as const,
      totalPausedSeconds: 55,
      completedAt: now.toISOString(),
    };
    const startedPast = {
      ...makeOccurrence(template, '2026-10-02'),
      status: 'active' as const,
      activeStartedAt: '2026-10-02T00:00:00Z',
    };
    const future = makeOccurrence(template, '2026-10-07');
    records.push(past, startedPast, future);
    await service.load();
    await service.update(
      selected.id,
      { ...draft, name: 'New default', reminderEnabled: true },
      'future',
    );
    expect(records.find((task) => task.id === past.id)).toEqual(past);
    expect(records.find((task) => task.id === startedPast.id)).toEqual({
      ...startedPast,
      status: 'interrupted',
      interruptedAt: now.toISOString(),
      nextAutoStartAt: undefined,
      nextReminderAt: undefined,
      pendingReminder: undefined,
    });
    expect(records.find((task) => task.id === future.id)).toMatchObject({
      name: 'New default',
      reminderEnabled: true,
    });
    expect(service.recurrenceTemplates()[0].name).toBe('New default');
  });
  it('removes an unstarted future date excluded by a changed schedule and uses the new next date', async () => {
    await service.create(draft);
    const selected = service.tasks()[0];
    const template = records.find((task) => task.recurrenceTemplate)!;
    const future = makeOccurrence(template, '2026-10-09');
    records.push(future);
    template.recurrenceCursor = future.occurrenceDate;
    await service.load();
    await service.update(
      selected.id,
      { ...draft, recurrence: { type: 'custom', daysOfWeek: [2, 3], rangeStart: '2026-10-06' } },
      'future',
    );
    expect(records.some((task) => task.id === future.id)).toBe(false);
    await service.start(selected.id);
    await service.complete(selected.id);
    expect(service.pendingTasks()[0].occurrenceDate).toBe('2026-10-07');
    expect(
      record.mock.calls.some(([type, , id]) => type === 'task_deleted' && id === future.id),
    ).toBe(true);
  });
  it('leaves history-bearing pending future records intact during schedule reconciliation', async () => {
    await service.create(draft);
    const selected = service.tasks()[0];
    const historical = {
      ...makeOccurrence(records.find((task) => task.recurrenceTemplate)!, '2026-10-09'),
      activeStartedAt: now.toISOString(),
      totalPausedSeconds: 30,
    };
    records.push(historical);
    await service.load();
    await service.update(
      selected.id,
      { ...draft, recurrence: { type: 'custom', daysOfWeek: [2], rangeStart: '2026-10-06' } },
      'future',
    );
    expect(records.find((task) => task.id === historical.id)).toEqual(historical);
  });
  it('deletes the template and every unfinished occurrence but preserves completed history', async () => {
    await service.create(draft);
    const current = service.tasks()[0];
    const template = records.find((task) => task.recurrenceTemplate)!;
    const future = makeOccurrence(template, '2026-10-07');
    const completed = {
      ...makeOccurrence(template, '2026-10-05'),
      status: 'completed' as const,
      completedAt: '2026-10-05T10:00:00.000Z',
      totalPausedSeconds: 75,
    };
    records.push(future, completed);
    await service.load();
    const historyCount = record.mock.calls.length;

    expect(await service.delete(current.id)).toBe(true);

    expect(records.find((task) => task.id === template.id)).toBeUndefined();
    expect(records.find((task) => task.id === current.id)).toBeUndefined();
    expect(records.find((task) => task.id === future.id)).toBeUndefined();
    expect(records.find((task) => task.id === completed.id)).toEqual(completed);
    expect(service.recurrenceTemplates()).toEqual([]);
    expect(service.tasks()).toEqual([completed]);
    expect(record.mock.calls.slice(historyCount)).toEqual([
      [
        'task_deleted',
        'Deleted recurring task "Read algorithms" and stopped future occurrences.',
        current.id,
      ],
    ]);

    await service.ensureRecurrences(new Date(2026, 9, 7));
    await service.load();
    expect(records).toEqual([completed]);
  });

  it('keeps a non-recurring delete limited to its selected task', async () => {
    await service.create({ ...draft, recurrence: undefined, name: 'One-off' });
    const plain = service.tasks()[0];
    expect(await service.delete(plain.id)).toBe(true);
    expect(records.some((task) => task.id === plain.id)).toBe(false);
  });
  it('stops future generation when repeat is disabled for this and future', async () => {
    await service.create(draft);
    const task = service.tasks()[0];
    await service.update(task.id, { ...draft, recurrence: undefined }, 'future');
    await service.start(task.id);
    await service.complete(task.id);
    expect(service.pendingTasks()).toHaveLength(0);
  });

  it('never generates before a future selected occurrence when its weekday is excluded', async () => {
    await service.create({ ...draft, recurrence: { type: 'weekdays', rangeStart: '2026-10-12' } });
    const selected = service.tasks()[0];
    expect(selected.occurrenceDate).toBe('2026-10-12');
    await service.update(
      selected.id,
      { ...draft, recurrence: { type: 'custom', daysOfWeek: [2], rangeStart: '2026-10-06' } },
      'future',
    );
    expect(service.pendingTasks()[0].occurrenceDate).toBe('2026-10-13');
    expect(service.recurrenceTemplates()[0].recurrence?.rangeStart).toBe('2026-10-12');
  });
  it('does not build a backlog when reopening after months', async () => {
    await service.create(draft);
    const first = service.tasks()[0];
    records = records.map((task) =>
      task.id === first.id ? { ...task, status: 'completed' as const } : task,
    );
    vi.setSystemTime(new Date(2026, 11, 14, 8));
    await service.load();
    expect(service.tasks()).toHaveLength(2);
    expect(service.pendingTasks()[0].occurrenceDate).toBe('2026-12-14');
  });
  it('interrupts yesterday active occurrence and creates a fresh daily occurrence on restart', async () => {
    await service.create({
      ...draft,
      recurrence: { type: 'daily', rangeStart: '2026-10-06' },
    });
    const yesterday = service.tasks()[0];
    await service.start(yesterday.id);
    const start = records.find((task) => task.id === yesterday.id)!.activeStartedAt;
    vi.setSystemTime(new Date(2026, 9, 7, 8));
    await service.load();

    const old = records.find((task) => task.id === yesterday.id)!;
    const today = service.pendingTasks()[0];
    expect(old.status).toBe('interrupted');
    expect(old.activeStartedAt).toBe(start);
    expect(old.completedAt).toBeUndefined();
    expect(today.occurrenceDate).toBe('2026-10-07');
    expect(today.activeStartedAt).toBeUndefined();
    expect(today.totalPausedSeconds).toBe(0);
    expect(today.reminderAttemptsShown).toBe(0);
    expect(
      recordBatch.mock.calls
        .flatMap(([events]) => events)
        .some(
          (event: { type: string; taskId: string }) =>
            event.type === 'task_interrupted' && event.taskId === yesterday.id,
        ),
    ).toBe(true);
    await service.load();
    expect(records.filter((task) => task.occurrenceDate === '2026-10-07')).toHaveLength(1);
  });

  it('does not replay missed daily dates after a long shutdown', async () => {
    await service.create({
      ...draft,
      recurrence: { type: 'daily', rangeStart: '2026-10-06' },
    });
    const yesterday = service.tasks()[0];
    await service.start(yesterday.id);
    await service.pause(yesterday.id, new Date(2026, 9, 6, 10));
    vi.setSystemTime(new Date(2026, 11, 14, 8));
    await service.load();
    expect(records.find((task) => task.id === yesterday.id)?.status).toBe('interrupted');
    expect(service.pendingTasks()).toHaveLength(1);
    expect(service.pendingTasks()[0].occurrenceDate).toBe('2026-12-14');
  });

  it('leaves one-time active tasks untouched on the next day', async () => {
    await service.create({ ...draft, recurrence: undefined });
    const task = service.tasks()[0];
    await service.start(task.id);
    vi.setSystemTime(new Date(2026, 9, 7, 8));
    await service.load();
    expect(service.currentTask()?.id).toBe(task.id);
    expect(service.currentTask()?.status).toBe('active');
  });
});
