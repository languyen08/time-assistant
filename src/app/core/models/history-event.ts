export type HistoryEventType =
  | 'task_created'
  | 'task_edited'
  | 'task_deleted'
  | 'task_started'
  | 'reminder_shown'
  | 'extra_time_added'
  | 'task_paused'
  | 'task_resumed'
  | 'task_completed'
  | 'break_started'
  | 'break_skipped'
  | 'break_completed'
  | 'settings_changed';

export interface HistoryEvent {
  id: string;
  type: HistoryEventType;
  taskId?: string;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, string | number | boolean>;
}
