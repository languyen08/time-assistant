import { Injectable, inject, signal } from '@angular/core';
import { HistoryEvent, HistoryEventType } from '../models/history-event';
import { HistoryRepository } from '../repositories/history.repository';
import { toFriendlyErrorMessage } from '../utils/error-message.util';
import { createId, nowIso } from '../utils/date-time.util';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly repository = inject(HistoryRepository);
  readonly events = signal<HistoryEvent[]>([]);
  readonly errorMessage = signal('');

  async load(): Promise<void> {
    try {
      const events = await this.repository.list();
      this.events.set(
        events.sort((first, second) => second.occurredAt.localeCompare(first.occurredAt)),
      );
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(
        toFriendlyErrorMessage(error, 'History could not be loaded from local storage.'),
      );
      throw error;
    }
  }

  async record(
    type: HistoryEventType,
    summary: string,
    taskId?: string,
    metadata?: Record<string, string | number | boolean>,
  ): Promise<void> {
    const event: HistoryEvent = {
      id: createId('event'),
      type,
      taskId,
      occurredAt: nowIso(),
      summary,
      metadata,
    };

    try {
      await this.repository.append(event);
      this.events.update((events) => [event, ...events]);
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'History event could not be recorded.'));
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.repository.clear();
      this.events.set([]);
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'History could not be cleared.'));
      throw error;
    }
  }
}
