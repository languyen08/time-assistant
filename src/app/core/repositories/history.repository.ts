import { Injectable, inject } from '@angular/core';
import { HistoryEvent } from '../models/history-event';
import { IndexedDbStorageAdapter } from '../storage/indexed-db-storage.adapter';

const HISTORY_STORE = 'history';

@Injectable({ providedIn: 'root' })
export class HistoryRepository {
  private readonly storage = inject(IndexedDbStorageAdapter);

  list(): Promise<HistoryEvent[]> {
    return this.storage.getAll<HistoryEvent>(HISTORY_STORE);
  }

  append(event: HistoryEvent): Promise<void> {
    return this.storage.put(HISTORY_STORE, event);
  }

  /** Append every row and prune once against fresh persisted state in one transaction. */
  appendBatch(events: HistoryEvent[], maxEvents: number): Promise<HistoryEvent[]> {
    return this.storage.mutate<HistoryEvent, HistoryEvent[]>(HISTORY_STORE, (stored) => {
      const incomingIds = new Set(events.map((event) => event.id));
      // A later row wins timestamp ties, matching sequential record() publication.
      const ordered = [...events]
        .reverse()
        .concat(stored.filter((event) => !incomingIds.has(event.id)))
        .sort((first, second) => second.occurredAt.localeCompare(first.occurredAt));
      const kept = ordered.slice(0, maxEvents);
      const keptIds = new Set(kept.map((event) => event.id));
      return {
        save: events.filter((event) => keptIds.has(event.id)),
        remove: ordered.slice(maxEvents).map((event) => event.id),
        result: kept,
      };
    });
  }

  delete(id: string): Promise<void> {
    return this.storage.delete(HISTORY_STORE, id);
  }

  clear(): Promise<void> {
    return this.storage.clear(HISTORY_STORE);
  }
}
