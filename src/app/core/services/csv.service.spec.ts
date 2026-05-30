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
    reminderCount: 3,
    reminderIntervalMinutes: 5,
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
      'id,name,note,category,reminderAt,reminderCount,reminderIntervalMinutes,status,order,createdAt,updatedAt,activeStartedAt,pausedAt,pausedRemainingSeconds,totalPausedSeconds,completedAt,nextReminderAt,reminderAttemptsShown',
    );
    expect(csv).toContain('Study Angular');
  });

  it('imports valid tasks and avoids duplicate ids', () => {
    const csv = service.exportTasks([task]);
    const result = service.importTasks(csv, [task]);

    expect(result.errors).toEqual([]);
    expect(result.importedCount).toBe(1);
    expect(result.tasks[0].id).not.toBe(task.id);
    expect(result.tasks[0].name).toBe(task.name);
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
});
