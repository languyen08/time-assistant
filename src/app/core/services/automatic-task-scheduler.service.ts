import { Injectable, inject } from '@angular/core';
import { BreakCoordinationService } from './break-coordination.service';
import { TaskService } from './task.service';

const CHECK_INTERVAL_MS = 1_000;
const INITIAL_HANDSHAKE_DELAY_MS = 100;

@Injectable({ providedIn: 'root' })
export class AutomaticTaskSchedulerService {
  private readonly taskService = inject(TaskService);
  private readonly breakCoordination = inject(BreakCoordinationService);
  private intervalId: number | undefined;
  private initialCheckId: number | undefined;
  private removeBreakListener: (() => void) | undefined;
  private checking = false;

  start(): void {
    if (this.intervalId !== undefined) {
      return;
    }

    this.removeBreakListener = this.breakCoordination.subscribe(() => void this.check());
    this.initialCheckId = window.setTimeout(() => {
      this.initialCheckId = undefined;
      void this.check();
    }, INITIAL_HANDSHAKE_DELAY_MS);
    this.intervalId = window.setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.initialCheckId !== undefined) {
      window.clearTimeout(this.initialCheckId);
      this.initialCheckId = undefined;
    }
    if (this.intervalId !== undefined) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.removeBreakListener?.();
    this.removeBreakListener = undefined;
  }

  async check(now = new Date()): Promise<void> {
    if (this.checking || this.breakCoordination.blocked()) {
      return;
    }

    this.checking = true;
    try {
      const pendingTasks = [...this.taskService.pendingTasks()].sort(
        (first, second) => first.order - second.order,
      );

      if (!this.taskService.currentTask()) {
        const overdueTask = pendingTasks.find(
          (task) => new Date(task.reminderAt).getTime() <= now.getTime(),
        );
        if (overdueTask) {
          await this.taskService.startAutomatically(overdueTask.id, now);
        }
        return;
      }

      for (const task of pendingTasks) {
        if (this.breakCoordination.blocked()) {
          return;
        }
        const effectiveAttempt = task.nextAutoStartAt ?? task.reminderAt;
        if (new Date(effectiveAttempt).getTime() <= now.getTime()) {
          await this.taskService.deferAutomaticStart(task.id, now);
        }
      }
    } finally {
      this.checking = false;
    }
  }
}
