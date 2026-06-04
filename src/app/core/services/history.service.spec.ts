import { TestBed } from '@angular/core/testing';
import { HistoryEvent } from '../models/history-event';
import { HistoryRepository } from '../repositories/history.repository';
import { HistoryService } from './history.service';

const MAX_HISTORY_EVENTS = 10_000;

function historyEvent(index: number): HistoryEvent {
  return {
    id: `event_${index}`,
    type: 'task_created',
    occurredAt: new Date(Date.UTC(2026, 4, 30, 10, 0, 0) - index * 1000).toISOString(),
    summary: `Event ${index}`,
  };
}

describe('HistoryService', () => {
  it('prunes the oldest stored events when loading history above the cap', async () => {
    const deleteEvent = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        HistoryService,
        {
          provide: HistoryRepository,
          useValue: {
            list: vi.fn(async () =>
              Array.from({ length: MAX_HISTORY_EVENTS + 2 }, (_, index) =>
                historyEvent(MAX_HISTORY_EVENTS + 1 - index),
              ),
            ),
            append: vi.fn(async () => undefined),
            delete: deleteEvent,
            clear: vi.fn(async () => undefined),
          },
        },
      ],
    });

    const service = TestBed.inject(HistoryService);
    await service.load();

    expect(service.events()).toHaveLength(MAX_HISTORY_EVENTS);
    expect(service.events()[0]?.id).toBe('event_0');
    expect(service.events().at(-1)?.id).toBe(`event_${MAX_HISTORY_EVENTS - 1}`);
    expect((deleteEvent.mock.calls as string[][]).map((call) => call[0]).sort()).toEqual([
      `event_${MAX_HISTORY_EVENTS}`,
      `event_${MAX_HISTORY_EVENTS + 1}`,
    ]);
  });

  it('keeps only the newest events when recording past the cap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'));

    try {
      const append = vi.fn(async () => undefined);
      const deleteEvent = vi.fn(async () => undefined);
      TestBed.configureTestingModule({
        providers: [
          HistoryService,
          {
            provide: HistoryRepository,
            useValue: {
              list: vi.fn(async () => []),
              append,
              delete: deleteEvent,
              clear: vi.fn(async () => undefined),
            },
          },
        ],
      });

      const service = TestBed.inject(HistoryService);
      service.events.set(
        Array.from({ length: MAX_HISTORY_EVENTS }, (_, index) => historyEvent(index + 1)),
      );

      await service.record('task_created', 'Newest event');

      expect(service.events()).toHaveLength(MAX_HISTORY_EVENTS);
      expect(service.events()[0]?.summary).toBe('Newest event');
      expect(service.events().at(-1)?.id).toBe(`event_${MAX_HISTORY_EVENTS - 1}`);
      expect(append).toHaveBeenCalledTimes(1);
      expect(deleteEvent).toHaveBeenCalledWith(`event_${MAX_HISTORY_EVENTS}`);
    } finally {
      vi.useRealTimers();
    }
  });
});
