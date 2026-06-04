import { Injectable, inject, signal } from '@angular/core';
import { HistoryEvent, HistoryEventType } from '../models/history-event';
import { HistoryRepository } from '../repositories/history.repository';
import { toFriendlyErrorMessage } from '../utils/error-message.util';
import { createId, nowIso } from '../utils/date-time.util';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly maxEvents = 10_000;
  private readonly repository = inject(HistoryRepository);
  readonly events = signal<HistoryEvent[]>([]);
  readonly errorMessage = signal('');

  async load(): Promise<void> {
    try {
      const events = this.sortNewestFirst(await this.repository.list());
      const { kept, removed } = this.trimToCap(events);
      if (removed.length > 0) {
        await this.deleteEvents(removed);
      }

      this.events.set(kept);
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
      const { kept, removed } = this.trimToCap([event, ...this.events()]);
      if (removed.length > 0) {
        await this.deleteEvents(removed);
      }

      this.events.set(kept);
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

  private sortNewestFirst(events: HistoryEvent[]): HistoryEvent[] {
    return [...events].sort((first, second) => second.occurredAt.localeCompare(first.occurredAt));
  }

  private trimToCap(events: HistoryEvent[]): {
    kept: HistoryEvent[];
    removed: HistoryEvent[];
  } {
    return {
      kept: events.slice(0, this.maxEvents),
      removed: events.slice(this.maxEvents),
    };
  }

  private async deleteEvents(events: HistoryEvent[]): Promise<void> {
    await Promise.all(events.map((event) => this.repository.delete(event.id)));
  }
}
