import { TestBed } from '@angular/core/testing';
import { Task } from '../models/task';
import { IndexedDbStorageAdapter } from '../storage/indexed-db-storage.adapter';
import { makeOccurrence } from '../utils/recurrence.util';
import { TaskRepository } from './task.repository';

export function seriesTemplate(overrides: Partial<Task> = {}): Task {
  return {
    id: 'series_1',
    recurrenceTemplate: true,
    recurrenceSeriesId: 'series_1',
    recurrence: { type: 'weekdays', rangeStart: '2026-10-06' },
    name: 'Read',
    note: '',
    category: '',
    reminderAt: new Date(2026, 9, 6, 9, 30).toISOString(),
    reminderEnabled: false,
    reminderCount: 0,
    reminderIntervalMinutes: 0,
    allowConcurrentStart: false,
    order: 0,
    status: 'pending',
    createdAt: '2026-10-06T00:00:00Z',
    updatedAt: '2026-10-06T00:00:00Z',
    totalPausedSeconds: 0,
    reminderAttemptsShown: 0,
    ...overrides,
  };
}

describe('TaskRepository lazy recurrence', () => {
  let records: Task[];
  let repository: TaskRepository;
  beforeEach(() => {
    records = [seriesTemplate()];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: IndexedDbStorageAdapter,
          useValue: {
            mutate: async (
              _store: string,
              plan: (tasks: Task[]) => { save: Task[]; remove?: string[]; result: unknown },
            ) => {
              const changes = plan(structuredClone(records));
              records = records
                .filter(
                  (task) =>
                    !changes.remove?.includes(task.id) &&
                    !changes.save.some((saved) => saved.id === task.id),
                )
                .concat(changes.save);
              return changes.result;
            },
          },
        },
      ],
    });
    repository = TestBed.inject(TaskRepository);
  });
  it('serializes repeated generation with one deterministic occurrence', async () => {
    const results = await Promise.all([
      repository.ensureOccurrences(new Date(2026, 9, 6)),
      repository.ensureOccurrences(new Date(2026, 9, 6)),
    ]);
    const created = results.flatMap((result) => result.created);
    expect(created).toHaveLength(1);
    expect(records.filter((task) => !task.recurrenceTemplate)).toHaveLength(1);
    expect(created[0].id).toBe('recurring:series_1:2026-10-06');
    expect(created[0].reminderEnabled).toBe(false);
  });
  it.each([
    ['weekdays', undefined, '2026-10-09', '2026-10-10', '2026-10-12'],
    ['custom', [1, 3], '2026-10-07', '2026-10-08', '2026-10-12'],
  ] as const)(
    'rolls %s work to the next eligible calendar date',
    async (type, daysOfWeek, previous, today, next) => {
      records[0].recurrence = {
        type,
        daysOfWeek: daysOfWeek ? [...daysOfWeek] : undefined,
        rangeStart: '2026-10-01',
      };
      records.push(makeOccurrence(records[0], previous));
      const changes = await repository.ensureOccurrences(new Date(`${today}T00:00:01`));
      expect(changes.interrupted).toHaveLength(1);
      expect(changes.created[0].occurrenceDate).toBe(next);
    },
  );
  it('interrupts expired and disabled series without creating more work', async () => {
    const template = records[0];
    const previous = makeOccurrence(template, '2026-10-06');
    records[0].recurrence!.rangeEnd = '2026-10-06';
    records.push(previous);
    expect(await repository.ensureOccurrences(new Date(2026, 9, 7))).toMatchObject({
      created: [],
      interrupted: [{ id: previous.id }],
    });
    records = [
      { ...template, recurrence: undefined },
      { ...previous, status: 'paused' },
    ];
    expect(await repository.ensureOccurrences(new Date(2026, 9, 7))).toMatchObject({
      created: [],
      interrupted: [{ id: previous.id }],
    });
  });
  it.each([
    ['2026-03-08', '2026-03-09'],
    ['2026-11-01', '2026-11-02'],
    ['2026-12-31', '2027-01-01'],
  ])('uses calendar boundaries across %s rather than adding 24 hours', async (previous, today) => {
    records[0].recurrence = { type: 'daily', rangeStart: previous };
    records.push(makeOccurrence(records[0], previous));
    const changes = await repository.ensureOccurrences(new Date(`${today}T00:00:01`));
    expect(changes.interrupted).toHaveLength(1);
    expect(changes.created[0].occurrenceDate).toBe(today);
    expect(new Date(changes.created[0].reminderAt).getHours()).toBe(9);
    expect(new Date(changes.created[0].reminderAt).getMinutes()).toBe(30);
  });
  it('skips missed dates without a backlog and interrupts unfinished overdue work', async () => {
    await repository.ensureOccurrences(new Date(2026, 11, 7));
    expect(
      records.filter((task) => !task.recurrenceTemplate).map((task) => task.occurrenceDate),
    ).toEqual(['2026-12-07']);
    await repository.ensureOccurrences(new Date(2026, 11, 10));
    expect(records).toHaveLength(3);
    expect(records.find((task) => task.occurrenceDate === '2026-12-07')?.status).toBe(
      'interrupted',
    );
    expect(records.find((task) => task.occurrenceDate === '2026-12-10')?.status).toBe('pending');
  });
  it('generates only the next weekday after completion, with fresh timing state', async () => {
    await repository.ensureOccurrences(new Date(2026, 9, 9));
    records = records.map((task) =>
      task.recurrenceTemplate
        ? task
        : {
            ...task,
            status: 'completed',
            activeStartedAt: '2026-10-09T00:00:00Z',
            totalPausedSeconds: 45,
          },
    );
    const {
      created: [next],
    } = await repository.ensureOccurrences(new Date(2026, 9, 9));
    expect(next.occurrenceDate).toBe('2026-10-12');
    expect(next.totalPausedSeconds).toBe(0);
    expect(next.activeStartedAt).toBeUndefined();
    expect(records.find((task) => task.occurrenceDate === '2026-10-09')?.totalPausedSeconds).toBe(
      45,
    );
  });
  it('does not regenerate a deleted allocation or generate beyond the inclusive end', async () => {
    records[0].recurrence!.rangeEnd = '2026-10-06';
    await repository.ensureOccurrences(new Date(2026, 9, 6));
    records = records.filter((task) => task.recurrenceTemplate);
    expect(await repository.ensureOccurrences(new Date(2026, 9, 6))).toEqual({
      created: [],
      interrupted: [],
    });
  });
  it('removes the series template and unfinished records while retaining completed history', async () => {
    const template = records[0];
    const pending = makeOccurrence(template, '2026-10-06');
    const completed = {
      ...makeOccurrence(template, '2026-10-05'),
      status: 'completed' as const,
      completedAt: '2026-10-05T10:00:00.000Z',
    };
    records.push(pending, completed);

    const removed = await repository.deleteSeries('series_1');

    expect(removed).toEqual(expect.arrayContaining([template.id, pending.id]));
    expect(records).toEqual([completed]);
    expect(await repository.ensureOccurrences(new Date(2026, 9, 7))).toEqual({
      created: [],
      interrupted: [],
    });
  });
});
