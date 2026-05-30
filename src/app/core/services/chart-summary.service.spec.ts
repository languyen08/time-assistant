import { ChartSummaryService } from './chart-summary.service';
import { HistoryEvent } from '../models/history-event';
import { Task } from '../models/task';

describe('ChartSummaryService', () => {
  const service = new ChartSummaryService();

  it('groups completed tasks and focus minutes by day', () => {
    const tasks: Task[] = [
      {
        id: 'task_1',
        name: 'Read',
        note: '',
        category: 'Study',
        reminderAt: '2026-05-30T10:00:00.000Z',
        reminderCount: 3,
        reminderIntervalMinutes: 5,
        order: 0,
        status: 'completed',
        createdAt: '2026-05-30T08:00:00.000Z',
        updatedAt: '2026-05-30T10:00:00.000Z',
        activeStartedAt: '2026-05-30T09:00:00.000Z',
        totalPausedSeconds: 600,
        completedAt: '2026-05-30T10:00:00.000Z',
        reminderAttemptsShown: 1,
      },
    ];

    const completed = service.completedTasksPerDay(tasks);
    const focus = service.focusMinutesPerDay(tasks);

    expect(completed.labels).toEqual(['2026-05-30']);
    expect(completed.datasets[0].data).toEqual([1]);
    expect(focus.datasets[0].data).toEqual([50]);
  });

  it('summarizes reminders and extensions', () => {
    const events: HistoryEvent[] = [
      {
        id: 'event_1',
        type: 'reminder_shown',
        occurredAt: '2026-05-30T10:00:00.000Z',
        summary: 'Reminder shown.',
      },
      {
        id: 'event_2',
        type: 'extra_time_added',
        occurredAt: '2026-05-30T10:05:00.000Z',
        summary: 'Extra time added.',
      },
    ];

    const summary = service.reminderSummary(events);

    expect(summary.labels).toEqual(['Extensions', 'Reminders']);
    expect(summary.datasets[0].data).toEqual([1, 1]);
  });
});
