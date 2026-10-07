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
  it('keeps every batch row private until commit, then publishes once', async () => {
    let commit!: (events: HistoryEvent[]) => void;
    const appendBatch = vi.fn(
      (_events: HistoryEvent[], _maxEvents: number) =>
        new Promise<HistoryEvent[]>((resolve) => {
          commit = resolve;
        }),
    );
    TestBed.configureTestingModule({
      providers: [{ provide: HistoryRepository, useValue: { appendBatch } }],
    });
    const service = TestBed.inject(HistoryService);
    const publish = vi.spyOn(service.events, 'set');
    const pending = service.recordBatch(
      Array.from({ length: 100 }, (_, index) => ({
        type: 'task_created' as const,
        summary: `Created ${index}`,
        taskId: `task-${index}`,
      })),
    );
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
    const rows = appendBatch.mock.calls[0][0] as HistoryEvent[];
    expect(rows).toHaveLength(100);
    expect(new Set(rows.map((row) => row.id)).size).toBe(100);
    expect(rows.map((row) => row.taskId)).toEqual(
      Array.from({ length: 100 }, (_, index) => `task-${index}`),
    );
    expect(appendBatch).toHaveBeenCalledWith(rows, MAX_HISTORY_EVENTS);
    commit(rows);
    await pending;
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(rows);
  });

  it('preserves state on a failed batch and allows a later operation', async () => {
    const appendBatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Transaction aborted'))
      .mockResolvedValueOnce([historyEvent(1)]);
    TestBed.configureTestingModule({
      providers: [{ provide: HistoryRepository, useValue: { appendBatch } }],
    });
    const service = TestBed.inject(HistoryService);
    service.events.set([historyEvent(0)]);
    await expect(
      service.recordBatch([{ type: 'task_created', summary: 'Failed' }]),
    ).rejects.toThrow('Transaction aborted');
    expect(service.events()).toEqual([historyEvent(0)]);
    expect(service.errorMessage()).toBeTruthy();
    await service.recordBatch([{ type: 'task_created', summary: 'Next' }]);
    expect(service.events()).toEqual([historyEvent(1)]);
    expect(service.errorMessage()).toBe('');
  });

  it('orders a load, batch and clear so stale reads cannot undo publication or clearing', async () => {
    let finishLoad!: (events: HistoryEvent[]) => void;
    const list = vi.fn(
      () =>
        new Promise<HistoryEvent[]>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const appendBatch = vi.fn(async () => [historyEvent(1)]);
    const clear = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: HistoryRepository, useValue: { list, appendBatch, clear } }],
    });
    const service = TestBed.inject(HistoryService);
    const loading = service.load();
    const writing = service.recordBatch([{ type: 'task_created', summary: 'New' }]);
    const clearing = service.clear();
    await Promise.resolve();
    expect(appendBatch).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    finishLoad([historyEvent(0)]);
    await loading;
    await writing;
    await clearing;
    expect(service.events()).toEqual([]);
    expect(appendBatch).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
  });

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
