import { CsvService } from './csv.service';
import { Task } from '../models/task';

describe('CsvService', () => {
  const service = new CsvService();
  const task: Task = {
    id: 'task_1',
    name: 'Study Angular',
    note: 'Signals',
    category: 'Study',
    reminderAt: '2026-05-30T10:00:00.000Z',
    reminderEnabled: true,
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    allowConcurrentStart: true,
    order: 0,
    status: 'pending',
    createdAt: '2026-05-30T09:00:00.000Z',
    updatedAt: '2026-05-30T09:00:00.000Z',
    totalPausedSeconds: 0,
    reminderAttemptsShown: 0,
  };

  it('exports tasks with stable headers', () => {
    const csv = service.exportTasks([task]);

    expect(csv.split('\r\n')[0]).toBe(
      'id,name,note,category,reminderAt,reminderCount,reminderIntervalMinutes,allowConcurrentStart,deadlineAt,deadlineMessage,status,order,createdAt,updatedAt,activeStartedAt,pausedAt,pausedRemainingSeconds,totalPausedSeconds,completedAt,nextReminderAt,reminderAttemptsShown,reminderEnabled,recurrenceType,recurrenceDays,recurrenceStartDate,recurrenceEndDate,recurrenceSeriesId,occurrenceDate,recurrenceTemplate,recurrenceCursor',
    );
    expect(csv).toContain('Study Angular');
  });

  it('exports spreadsheet-friendly local date/time when configured', () => {
    const csv = service.exportTasks([task], 'yyyy-MM-dd HH:mm');

    expect(csv).not.toContain('2026-05-30T10:00:00.000Z');
    expect(csv).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  });

  it('round-trips custom recurrence defaults separately from occurrence overrides', () => {
    const template: Task = {
      ...task,
      id: 'series_1',
      name: 'Default name',
      recurrenceTemplate: true,
      recurrenceSeriesId: 'series_1',
      recurrence: {
        type: 'custom',
        daysOfWeek: [1, 3, 5],
        rangeStart: '2026-10-06',
        rangeEnd: '2026-12-31',
      },
      recurrenceCursor: '2026-10-07',
    };
    const occurrence: Task = {
      ...template,
      id: 'recurring:series_1:2026-10-07',
      recurrenceTemplate: undefined,
      recurrenceCursor: undefined,
      occurrenceDate: '2026-10-07',
      name: 'One day override',
      reminderEnabled: false,
    };
    const result = service.importTasks(service.exportTasks([template, occurrence]), []);
    expect(result.errors).toEqual([]);
    expect(result.importedCount).toBe(1);
    expect(result.tasks.find((item) => item.recurrenceTemplate)?.name).toBe('Default name');
    expect(result.tasks.find((item) => !item.recurrenceTemplate)).toMatchObject({
      name: 'One day override',
      reminderEnabled: false,
      occurrenceDate: '2026-10-07',
      recurrence: template.recurrence,
    });
  });

  it('remaps a repeated series import together, preserving deterministic occurrence IDs', () => {
    const template: Task = {
      ...task,
      id: 'series_1',
      recurrenceTemplate: true,
      recurrenceSeriesId: 'series_1',
      recurrence: { type: 'daily', rangeStart: '2026-10-06' },
      recurrenceCursor: '2026-10-06',
    };
    const occurrence: Task = {
      ...template,
      id: 'recurring:series_1:2026-10-06',
      recurrenceTemplate: undefined,
      recurrenceCursor: undefined,
      occurrenceDate: '2026-10-06',
    };
    const result = service.importTasks(service.exportTasks([template, occurrence]), [occurrence]);
    expect(result.errors).toEqual([]);
    const importedTemplate = result.tasks.find((item) => item.recurrenceTemplate)!;
    expect(importedTemplate.recurrenceSeriesId).not.toBe('series_1');
    expect(result.tasks.find((item) => !item.recurrenceTemplate)?.id).toBe(
      `recurring:${importedTemplate.recurrenceSeriesId}:2026-10-06`,
    );
  });

  it.each([
    ['monthly', '', '2026-10-06', '', '2026-10-06'],
    ['daily', '', '2026-02-30', '', '2026-10-06'],
    ['daily', '', '2026-10-06', '2026-10-05', '2026-10-06'],
    ['custom', '', '2026-10-06', '', '2026-10-06'],
    ['custom', '1;7', '2026-10-06', '', '2026-10-06'],
    ['daily', '', '2026-10-06', '', '06/10/2026'],
  ])('rejects invalid CSV recurrence %s / %s / %s / %s / %s', (type, days, start, end, date) => {
    const csv = `name,reminderEnabled,recurrenceType,recurrenceDays,recurrenceStartDate,recurrenceEndDate,recurrenceSeriesId,occurrenceDate\nRead,false,${type},${days},${start},${end},series_1,${date}`;
    const result = service.importTasks(csv, []);
    expect(result.importedCount).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('imports valid tasks and avoids duplicate ids', () => {
    const csv = service.exportTasks([task]);
    const result = service.importTasks(csv, [task]);

    expect(result.errors).toEqual([]);
    expect(result.importedCount).toBe(1);
    expect(result.tasks[0].id).not.toBe(task.id);
    expect(result.tasks[0].name).toBe(task.name);
    expect(result.tasks[0].allowConcurrentStart).toBe(true);
  });

  it('imports true and false concurrency values', () => {
    const trueTask = task;
    const falseTask = { ...task, id: 'task_2', allowConcurrentStart: false };

    const result = service.importTasks(service.exportTasks([trueTask, falseTask]), []);

    expect(result.errors).toEqual([]);
    expect(result.tasks.map((item) => item.allowConcurrentStart)).toEqual([true, false]);
  });

  it('round-trips enabled and disabled reminders', () => {
    const result = service.importTasks(
      service.exportTasks([task, { ...task, id: 'disabled', reminderEnabled: false }]),
      [],
    );
    expect(result.errors).toEqual([]);
    expect(result.tasks.map((item) => item.reminderEnabled)).toEqual([true, false]);
    expect(result.tasks[1].reminderAttemptsShown).toBe(0);
  });

  it('defaults old CSV without reminderEnabled to true', () => {
    const result = service.importTasks(
      'name,reminderAt,reminderCount,reminderIntervalMinutes\nLegacy,2026-05-30T10:00:00.000Z,3,5',
      [],
    );
    expect(result.errors).toEqual([]);
    expect(result.tasks[0].reminderEnabled).toBe(true);
    expect(result.tasks[0].recurrence).toBeUndefined();
  });

  it('imports disabled rows without reminder-specific columns or timing values', () => {
    const result = service.importTasks('name,reminderEnabled\nFocus,false', []);
    expect(result.errors).toEqual([]);
    expect(result.tasks[0]).toMatchObject({
      reminderEnabled: false,
      reminderCount: 0,
      reminderIntervalMinutes: 0,
    });
    expect(Number.isFinite(new Date(result.tasks[0].reminderAt).getTime())).toBe(true);
  });

  it('validates enabled rows while allowing blank reminder values on disabled rows', () => {
    const result = service.importTasks(
      'name,reminderEnabled,reminderAt,reminderCount,reminderIntervalMinutes\nFocus,false,,,\nInvalid,true,,,',
      [],
    );
    expect(result.importedCount).toBe(1);
    expect(result.tasks[0].reminderEnabled).toBe(false);
    expect(result.errors).toEqual([
      'Row 3: reminderAt must be a valid date/time.',
      'Row 3: reminderCount must be between 1 and 20.',
      'Row 3: reminderIntervalMinutes must be between 1 and 240.',
    ]);
  });

  it('rejects invalid reminderEnabled values with a row error', () => {
    const result = service.importTasks(
      'name,reminderEnabled,reminderAt,reminderCount,reminderIntervalMinutes\nInvalid,yes,2026-05-30T10:00:00.000Z,3,5',
      [],
    );
    expect(result.importedCount).toBe(0);
    expect(result.errors).toContain('Row 2: reminderEnabled must be true or false.');
  });

  it('imports old task CSV without the optional concurrency column as false', () => {
    const result = service.importTasks(
      [
        'name,reminderAt,reminderCount,reminderIntervalMinutes',
        'Old task,2026-05-30T10:00:00.000Z,3,5',
      ].join('\n'),
      [],
    );

    expect(result.errors).toEqual([]);
    expect(result.tasks[0].allowConcurrentStart).toBe(false);
  });

  it('rejects an invalid non-empty concurrency value', () => {
    const result = service.importTasks(
      [
        'name,reminderAt,reminderCount,reminderIntervalMinutes,allowConcurrentStart',
        'Bad task,2026-05-30T10:00:00.000Z,3,5,yes',
      ].join('\n'),
      [],
    );

    expect(result.importedCount).toBe(0);
    expect(result.errors).toContain('Row 2: allowConcurrentStart must be true or false.');
  });

  it('reports row-level validation errors', () => {
    const result = service.importTasks(
      ['name,reminderAt,reminderCount,reminderIntervalMinutes', ',not-a-date,0,999'].join('\n'),
      [],
    );

    expect(result.importedCount).toBe(0);
    expect(result.errors).toContain('Row 2: Task name is required.');
    expect(result.errors).toContain('Row 2: reminderAt must be a valid date/time.');
    expect(result.errors).toContain('Row 2: reminderCount must be between 1 and 20.');
    expect(result.errors).toContain('Row 2: reminderIntervalMinutes must be between 1 and 240.');
  });

  it('round-trips user-authored deadline columns without processing state', () => {
    const deadlineTask: Task = {
      ...task,
      deadlineAt: '2026-05-30T11:00:00.000Z',
      deadlineMessage: 'Finish the chapter.',
      deadlineNotifiedAt: '2026-05-30T11:00:00.000Z',
      deadlineAcknowledgedAt: '2026-05-30T11:01:00.000Z',
    };

    const csv = service.exportTasks([deadlineTask]);
    const result = service.importTasks(csv, []);

    expect(csv).not.toContain('deadlineNotifiedAt');
    expect(csv).not.toContain('deadlineAcknowledgedAt');
    expect(result.errors).toEqual([]);
    expect(result.tasks[0]).toMatchObject({
      deadlineAt: deadlineTask.deadlineAt,
      deadlineMessage: deadlineTask.deadlineMessage,
      deadlineNotifiedAt: undefined,
      deadlineAcknowledgedAt: undefined,
    });
  });

  it('imports old CSV without deadline columns as no deadline', () => {
    const result = service.importTasks(
      [
        'name,reminderAt,reminderCount,reminderIntervalMinutes',
        'Old task,2026-05-30T10:00:00.000Z,3,5',
      ].join('\n'),
      [],
    );

    expect(result.errors).toEqual([]);
    expect(result.tasks[0].deadlineAt).toBeUndefined();
    expect(result.tasks[0].deadlineMessage).toBeUndefined();
  });

  it.each([
    {
      row: 'Missing message,2026-05-30T10:00:00.000Z,3,5,2026-05-30T11:00:00.000Z,',
      error: 'Row 2: deadlineMessage is required when deadlineAt is present.',
    },
    {
      row: 'Missing deadline,2026-05-30T10:00:00.000Z,3,5,,Message only',
      error: 'Row 2: deadlineAt is required when deadlineMessage is present.',
    },
    {
      row: 'Early deadline,2026-05-30T10:00:00.000Z,3,5,2026-05-30T09:59:00.000Z,Too early',
      error: 'Row 2: deadlineAt must be later than reminderAt.',
    },
  ])('rejects invalid deadline pairs with row-level errors', ({ row, error }) => {
    const result = service.importTasks(
      [
        'name,reminderAt,reminderCount,reminderIntervalMinutes,deadlineAt,deadlineMessage',
        row,
      ].join('\n'),
      [],
    );

    expect(result.importedCount).toBe(0);
    expect(result.errors).toContain(error);
  });

  it('rejects deadline messages longer than 240 characters', () => {
    const result = service.importTasks(
      [
        'name,reminderAt,reminderCount,reminderIntervalMinutes,deadlineAt,deadlineMessage',
        `Long message,2026-05-30T10:00:00.000Z,3,5,2026-05-30T11:00:00.000Z,${'x'.repeat(241)}`,
      ].join('\n'),
      [],
    );

    expect(result.errors).toContain('Row 2: deadlineMessage cannot be more than 240 characters.');
  });
});
