import { Injectable, inject, signal } from '@angular/core';
import { HistoryEvent, HistoryEventType } from '../models/history-event';
import { HistoryRepository } from '../repositories/history.repository';
import { createId, nowIso } from '../utils/date-time.util';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly repository = inject(HistoryRepository);
  readonly events = signal<HistoryEvent[]>([]);

  async load(): Promise<void> {
    const events = await this.repository.list();
    this.events.set(
      events.sort((first, second) => second.occurredAt.localeCompare(first.occurredAt)),
    );
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

    await this.repository.append(event);
    this.events.update((events) => [event, ...events]);
  }
}
