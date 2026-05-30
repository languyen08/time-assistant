import { Injectable, computed, inject, signal } from '@angular/core';
import { ActiveReminder } from '../models/reminder';
import { isDue, nowIso } from '../utils/date-time.util';
import { TaskService } from './task.service';
import { TimerService } from './timer.service';

@Injectable({ providedIn: 'root' })
export class ReminderSchedulerService {
  private readonly taskService = inject(TaskService);
  private readonly timer = inject(TimerService);

  readonly activeReminder = signal<ActiveReminder | undefined>(undefined);
  readonly hasReminder = computed(() => Boolean(this.activeReminder()));
  private intervalId: number | undefined;

  start(): void {
    this.intervalId ??= window.setInterval(() => void this.check(), 1000);
  }

  stop(): void {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  async check(now = this.timer.now()): Promise<void> {
    const task = this.taskService.activeTask();
    if (!task || this.activeReminder()) {
      return;
    }

    if (task.reminderAttemptsShown >= task.reminderCount || !isDue(task.nextReminderAt, now)) {
      return;
    }

    const updated = await this.taskService.markReminderShown(task);
    this.activeReminder.set({
      taskId: updated.id,
      taskName: updated.name,
      attemptNumber: updated.reminderAttemptsShown,
      maxAttempts: updated.reminderCount,
      shownAt: nowIso(),
    });
  }

  dismiss(): void {
    this.activeReminder.set(undefined);
  }
}
