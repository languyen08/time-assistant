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

  clear(): Promise<void> {
    return this.storage.clear(HISTORY_STORE);
  }
}
