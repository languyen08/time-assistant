export type TaskStatus = 'pending' | 'active' | 'paused' | 'completed';

export interface Task {
  id: string;
  name: string;
  note: string;
  category: string;
  reminderAt: string;
  reminderCount: number;
  reminderIntervalMinutes: number;
  order: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  activeStartedAt?: string;
  pausedAt?: string;
  pausedRemainingSeconds?: number;
  totalPausedSeconds: number;
  completedAt?: string;
  nextReminderAt?: string;
  reminderAttemptsShown: number;
}

export interface TaskDraft {
  name: string;
  note: string;
  category: string;
  reminderAt: string;
  reminderCount: number;
  reminderIntervalMinutes: number;
}
