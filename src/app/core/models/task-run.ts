export type TaskRunStatus = 'active' | 'completed';

export interface TaskRun {
  id: string;
  taskId: string;
  startedAt: string;
  completedAt?: string;
  elapsedSeconds: number;
  status: TaskRunStatus;
}
