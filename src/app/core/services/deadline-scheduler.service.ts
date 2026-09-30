import { Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';
import { TaskService } from './task.service';

const CHECK_INTERVAL_MS = 1_000;

@Injectable({ providedIn: 'root' })
export class DeadlineSchedulerService {
  private readonly taskService = inject(TaskService);
  private readonly notifications = inject(NotificationService);
  private intervalId: number | undefined;
  private checking = false;

  start(): void {
    if (this.intervalId !== undefined) {
      return;
    }

    void this.check();
    this.intervalId = window.setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== undefined) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  async check(now = new Date()): Promise<void> {
    if (this.checking) {
      return;
    }

    this.checking = true;
    try {
      const task = [...this.taskService.tasks()]
        .sort((first, second) => first.order - second.order)
        .find(
          (candidate) =>
            Boolean(candidate.deadlineAt) &&
            (candidate.status === 'pending' ||
              candidate.status === 'active' ||
              candidate.status === 'paused') &&
            !candidate.deadlineNotifiedAt &&
            new Date(candidate.deadlineAt!).getTime() <= now.getTime(),
        );
      if (!task) {
        return;
      }

      const processed = await this.taskService.markDeadlineNotified(task.id, now);
      if (!processed) {
        return;
      }

      try {
        await this.notifications.showDeadline(processed.name, processed.deadlineMessage ?? '');
      } catch {
        // Processing is intentionally not cleared: deduplication survives native IPC failure.
      }
    } finally {
      this.checking = false;
    }
  }
}
