import { Injectable, computed, signal } from '@angular/core';
import { Task } from '../models/task';
import { formatDuration, secondsBetween, secondsUntil } from '../utils/date-time.util';

@Injectable({ providedIn: 'root' })
export class TimerService {
  readonly now = signal(new Date());
  readonly nowTick = computed(() => this.now());
  private intervalId: number | undefined;

  start(): void {
    this.intervalId ??= window.setInterval(() => this.now.set(new Date()), 1000);
  }

  stop(): void {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  elapsedSeconds(task: Task | undefined): number {
    if (!task?.activeStartedAt || (task.status !== 'active' && task.status !== 'paused')) {
      return 0;
    }

    const end = task.status === 'paused' && task.pausedAt ? new Date(task.pausedAt) : this.now();
    return Math.max(0, secondsBetween(task.activeStartedAt, end) - (task.totalPausedSeconds ?? 0));
  }

  remainingSeconds(task: Task | undefined): number {
    if (!task || (task.status !== 'active' && task.status !== 'paused')) {
      return 0;
    }

    if (task.status === 'paused') {
      return task.pausedRemainingSeconds ?? 0;
    }

    return secondsUntil(task.nextReminderAt, this.now());
  }

  format(seconds: number): string {
    return formatDuration(seconds);
  }
}
