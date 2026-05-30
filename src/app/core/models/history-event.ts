export type HistoryEventType =
  | 'task_created'
  | 'task_edited'
  | 'task_deleted'
  | 'task_started'
  | 'reminder_shown'
  | 'extra_time_added'
  | 'task_completed'
  | 'settings_changed';

export interface HistoryEvent {
  id: string;
  type: HistoryEventType;
  taskId?: string;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, string | number | boolean>;
}
