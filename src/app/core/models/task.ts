export type TaskStatus = 'pending' | 'active' | 'paused' | 'completed';

export interface PendingReminder {
  attemptNumber: number;
  maxAttempts: number;
  shownAt: string;
  message: string;
}

export interface Task {
  id: string;
  name: string;
  note: string;
  category: string;
  reminderAt: string;
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
  name: string;
  note: string;
  category: string;
  reminderAt: string;
  reminderCount: number;
  reminderIntervalMinutes: number;
  allowConcurrentStart: boolean;
  deadlineAt?: string;
  deadlineMessage?: string;
}
