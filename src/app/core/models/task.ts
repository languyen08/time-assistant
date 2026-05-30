export type TaskStatus = 'pending' | 'active' | 'completed';

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
