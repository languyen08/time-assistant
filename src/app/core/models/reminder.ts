export type ReminderStatus = 'scheduled' | 'shown' | 'dismissed' | 'completed';

export interface Reminder {
  id: string;
  taskId: string;
  taskRunId?: string;
  attemptNumber: number;
  scheduledAt: string;
  shownAt?: string;
  status: ReminderStatus;
}

export interface ActiveReminder {
  taskId: string;
  taskName: string;
  attemptNumber: number;
  maxAttempts: number;
  shownAt: string;
  message: string;
}
