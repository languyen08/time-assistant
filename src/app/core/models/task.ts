export type TaskStatus = 'pending' | 'active' | 'paused' | 'completed';

export interface RecurrenceRule {
  type: 'daily' | 'weekdays' | 'custom';
  /** JavaScript weekdays: Sunday = 0, Monday = 1. */
  daysOfWeek?: number[];
  rangeStart: string;
  rangeEnd?: string;
}

export type RecurrenceEditScope = 'occurrence' | 'future';

export interface PendingReminder {
  attemptNumber: number;
  maxAttempts: number;
  shownAt: string;
  message: string;
}

export interface Task {
  recurrence?: RecurrenceRule;
  recurrenceSeriesId?: string;
  occurrenceDate?: string;
  /** Hidden defaults record in the existing tasks store; never executable. */
  recurrenceTemplate?: boolean;
  /** Last allocated date, including deleted occurrences. */
  recurrenceCursor?: string;
  id: string;
  name: string;
  note: string;
  category: string;
  reminderAt: string;
  reminderEnabled: boolean;
  reminderCount: number;
  reminderIntervalMinutes: number;
  allowConcurrentStart: boolean;
  order: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  activeStartedAt?: string;
  pausedAt?: string;
  pausedRemainingSeconds?: number;
  totalPausedSeconds: number;
  completedAt?: string;
  deadlineAt?: string;
  deadlineMessage?: string;
  deadlineNotifiedAt?: string;
  deadlineAcknowledgedAt?: string;
  nextAutoStartAt?: string;
  nextReminderAt?: string;
  reminderAttemptsShown: number;
  pendingReminder?: PendingReminder;
}

export interface TaskDraft {
  recurrence?: RecurrenceRule;
  name: string;
  note: string;
  category: string;
  reminderAt: string;
  reminderEnabled?: boolean;
  reminderCount: number;
  reminderIntervalMinutes: number;
  allowConcurrentStart: boolean;
  deadlineAt?: string;
  deadlineMessage?: string;
}
