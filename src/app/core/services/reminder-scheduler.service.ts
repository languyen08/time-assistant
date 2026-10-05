import { Injectable, computed, inject, signal } from '@angular/core';
import { ActiveReminder } from '../models/reminder';
import { isDue } from '../utils/date-time.util';
import { toFriendlyErrorMessage } from '../utils/error-message.util';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';
import { TaskService } from './task.service';

const CHECK_INTERVAL_MS = 1_000;

@Injectable({ providedIn: 'root' })
export class ReminderSchedulerService {
  private readonly taskService = inject(TaskService);
  private readonly notifications = inject(NotificationService);
  private readonly settings = inject(SettingsService);

  readonly activeReminder = computed<ActiveReminder | undefined>(() => {
    const task = this.taskService
      .tasks()
      .find(
        (candidate) => candidate.reminderEnabled !== false && Boolean(candidate.pendingReminder),
      );
    const pending = task?.pendingReminder;
    return task && pending
      ? {
          taskId: task.id,
          taskName: task.name,
          attemptNumber: pending.attemptNumber,
          maxAttempts: pending.maxAttempts,
          shownAt: pending.shownAt,
          message: pending.message,
        }
      : undefined;
  });
  readonly hasReminder = computed(() => Boolean(this.activeReminder()));
  readonly errorMessage = signal('');
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
      if (
        this.taskService
          .tasks()
          .some((task) => task.reminderEnabled !== false && Boolean(task.pendingReminder))
      ) {
        return;
      }

      const task = this.taskService
        .activeTasks()
        .find(
          (candidate) =>
            candidate.status === 'active' &&
            candidate.reminderEnabled !== false &&
            candidate.reminderAttemptsShown < candidate.reminderCount &&
            isDue(candidate.nextReminderAt, now),
        );
      if (!task) {
        return;
      }

      const message = this.notifications.randomFriendlyMessage();
      const updated = await this.taskService.triggerReminder(task.id, message, now);
      if (!updated?.pendingReminder) {
        return;
      }

      const pending = updated.pendingReminder;
      try {
        await this.notifications.showReminder(
          {
            taskId: updated.id,
            taskName: updated.name,
            attemptNumber: pending.attemptNumber,
            maxAttempts: pending.maxAttempts,
            shownAt: pending.shownAt,
            message: pending.message,
          },
          this.settings.settings(),
        );
      } catch {
        // Persisted processing state intentionally prevents repeated native notification retries.
      }
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'Reminder check failed.'));
    } finally {
      this.checking = false;
    }
  }

  dismiss(taskId: string): Promise<boolean> {
    return this.taskService.dismissReminder(taskId);
  }
}
