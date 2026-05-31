import { Injectable, computed, inject, signal } from '@angular/core';
import { Task, TaskDraft } from '../models/task';
import { TaskRepository } from '../repositories/task.repository';
import { toFriendlyErrorMessage } from '../utils/error-message.util';
import { createId, nowIso, secondsBetween, secondsUntil } from '../utils/date-time.util';
import { HistoryService } from './history.service';
import { TaskValidationService } from './task-validation.service';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly repository = inject(TaskRepository);
  private readonly history = inject(HistoryService);
  private readonly validator = inject(TaskValidationService);

  readonly tasks = signal<Task[]>([]);
  readonly errorMessage = signal('');
  readonly activeTask = computed(() => this.tasks().find((task) => task.status === 'active'));
  readonly currentTask = computed(() =>
    this.tasks().find((task) => task.status === 'active' || task.status === 'paused'),
  );
  readonly pendingTasks = computed(() => this.tasks().filter((task) => task.status === 'pending'));
  readonly completedTasks = computed(() =>
    this.tasks().filter((task) => task.status === 'completed'),
  );
  readonly nextTaskCandidate = computed(() => this.pendingTasks()[0]);

  private readonly channel =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel('friendly-task-reminder');

  constructor() {
    this.channel?.addEventListener('message', (event: MessageEvent<string>) => {
      if (event.data === 'tasks-changed') {
        void this.load();
      }
    });
  }

  async load(): Promise<void> {
    try {
      const tasks = await this.repository.list();
      this.tasks.set(tasks.map((task) => this.normalizeTask(task)));
    } catch (error) {
      this.captureError(error, 'Tasks could not be loaded from local storage.');
    }
  }

  async create(draft: TaskDraft): Promise<boolean> {
    const validation = this.validator.validate(draft);
    if (!validation.valid) {
      this.errorMessage.set(validation.errors[0]);
      return false;
    }

    const timestamp = nowIso();
    const task: Task = {
      ...this.cleanDraft(draft),
      id: createId('task'),
      order: this.nextOrder(),
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      totalPausedSeconds: 0,
      reminderAttemptsShown: 0,
    };

    try {
      await this.repository.save(task);
      this.tasks.update((tasks) =>
        [...tasks, task].sort((first, second) => first.order - second.order),
      );
      this.broadcastChange();
      await this.history.record('task_created', `Created "${task.name}".`, task.id);
      this.errorMessage.set('');
      return true;
    } catch (error) {
      this.captureError(error, 'Task could not be created.');
      return false;
    }
  }

  async update(taskId: string, draft: TaskDraft): Promise<boolean> {
    const current = this.findTask(taskId);
    if (!current || current.status === 'completed') {
      this.errorMessage.set('Only pending or active tasks can be edited.');
      return false;
    }

    const validation = this.validator.validate(draft);
    if (!validation.valid) {
      this.errorMessage.set(validation.errors[0]);
      return false;
    }

    const updated: Task = {
      ...current,
      ...this.cleanDraft(draft),
      updatedAt: nowIso(),
      nextReminderAt: current.status === 'active' ? draft.reminderAt : current.nextReminderAt,
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record('task_edited', `Updated "${updated.name}".`, updated.id);
      this.errorMessage.set('');
      return true;
    } catch (error) {
      this.captureError(error, 'Task changes could not be saved.');
      return false;
    }
  }

  async delete(taskId: string): Promise<void> {
    const task = this.findTask(taskId);
    if (!task) {
      return;
    }

    if (task.status === 'active' || task.status === 'paused') {
      this.errorMessage.set('Complete the active task before deleting it.');
      return;
    }

    try {
      await this.repository.delete(taskId);
      this.tasks.update((tasks) => tasks.filter((item) => item.id !== taskId));
      this.broadcastChange();
      await this.history.record('task_deleted', `Deleted "${task.name}".`, task.id);
    } catch (error) {
      this.captureError(error, 'Task could not be deleted.');
    }
  }

  async importTasks(importedTasks: Task[]): Promise<void> {
    if (importedTasks.length === 0) {
      return;
    }

    try {
      await Promise.all(importedTasks.map((task) => this.repository.save(task)));
      this.tasks.update((tasks) =>
        [...tasks, ...importedTasks].sort((first, second) => first.order - second.order),
      );
      this.broadcastChange();
      for (const task of importedTasks) {
        await this.history.record('task_created', `Imported "${task.name}" from CSV.`, task.id);
      }
    } catch (error) {
      this.captureError(error, 'Imported tasks could not be saved.');
    }
  }

  async move(taskId: string, direction: -1 | 1): Promise<void> {
    const tasks = [...this.tasks()];
    const index = tasks.findIndex((task) => task.id === taskId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= tasks.length) {
      return;
    }

    [tasks[index], tasks[targetIndex]] = [tasks[targetIndex], tasks[index]];
    const reordered = tasks.map((task, order) => ({ ...task, order, updatedAt: nowIso() }));
    try {
      await Promise.all(reordered.map((task) => this.repository.save(task)));
      this.tasks.set(reordered);
      this.broadcastChange();
    } catch (error) {
      this.captureError(error, 'Task order could not be updated.');
    }
  }

  async start(taskId: string): Promise<void> {
    if (this.currentTask()) {
      this.errorMessage.set('Complete the active task before starting another.');
      return;
    }

    const task = this.findTask(taskId);
    if (!task || task.status !== 'pending') {
      this.errorMessage.set('Only pending tasks can be started.');
      return;
    }

    const startedAt = nowIso();
    const updated: Task = {
      ...task,
      status: 'active',
      activeStartedAt: startedAt,
      pausedAt: undefined,
      pausedRemainingSeconds: undefined,
      totalPausedSeconds: 0,
      nextReminderAt: task.reminderAt,
      reminderAttemptsShown: 0,
      updatedAt: startedAt,
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record('task_started', `Started "${updated.name}".`, updated.id);
      this.errorMessage.set('');
    } catch (error) {
      this.captureError(error, 'Task could not be started.');
    }
  }

  async completeActive(): Promise<void> {
    const task = this.currentTask();
    if (!task) {
      return;
    }

    const completedAt = nowIso();
    const completed: Task = {
      ...task,
      status: 'completed',
      completedAt,
      pausedAt: undefined,
      pausedRemainingSeconds: undefined,
      nextReminderAt: undefined,
      updatedAt: completedAt,
    };

    try {
      await this.saveAndReplace(completed);
      await this.history.record('task_completed', `Completed "${completed.name}".`, completed.id);
    } catch (error) {
      this.captureError(error, 'Task could not be completed.');
    }
  }

  async addTimeToActive(minutes: number): Promise<void> {
    const task = this.currentTask();
    if (!task || !Number.isInteger(minutes) || minutes < 1) {
      this.errorMessage.set('Extra time must be at least 1 minute.');
      return;
    }

    const nextReminderAt =
      task.status === 'paused' ? undefined : new Date(Date.now() + minutes * 60_000).toISOString();
    const updated: Task = {
      ...task,
      status: task.status,
      reminderAt: nextReminderAt ?? task.reminderAt,
      nextReminderAt,
      pausedRemainingSeconds: task.status === 'paused' ? minutes * 60 : undefined,
      updatedAt: nowIso(),
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record(
        'extra_time_added',
        `Added ${minutes} minutes to "${updated.name}".`,
        updated.id,
        {
          minutes,
        },
      );
      this.errorMessage.set('');
    } catch (error) {
      this.captureError(error, 'Extra time could not be applied.');
    }
  }

  async markReminderShown(task: Task): Promise<Task> {
    if (task.status !== 'active') {
      return task;
    }

    const attemptsShown = task.reminderAttemptsShown + 1;
    const nextReminderAt =
      attemptsShown < task.reminderCount
        ? new Date(Date.now() + task.reminderIntervalMinutes * 60_000).toISOString()
        : undefined;
    const updated: Task = {
      ...task,
      reminderAttemptsShown: attemptsShown,
      nextReminderAt,
      updatedAt: nowIso(),
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record(
        'reminder_shown',
        `Reminder ${attemptsShown} shown for "${updated.name}".`,
        updated.id,
        {
          attempt: attemptsShown,
          maxAttempts: updated.reminderCount,
        },
      );
      return updated;
    } catch (error) {
      this.captureError(error, 'Reminder state could not be updated.');
      return task;
    }
  }

  async pauseActive(now = new Date()): Promise<void> {
    const task = this.activeTask();
    if (!task) {
      return;
    }

    const pausedAt = now.toISOString();
    const updated: Task = {
      ...task,
      status: 'paused',
      pausedAt,
      pausedRemainingSeconds: secondsUntil(task.nextReminderAt, now),
      updatedAt: pausedAt,
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record('task_paused', `Paused "${updated.name}".`, updated.id);
      this.errorMessage.set('');
    } catch (error) {
      this.captureError(error, 'Task could not be paused.');
    }
  }

  async resumeActive(now = new Date()): Promise<void> {
    const task = this.currentTask();
    if (!task || task.status !== 'paused') {
      return;
    }

    const resumedAt = now.toISOString();
    const pausedSeconds = task.pausedAt ? secondsBetween(task.pausedAt, now) : 0;
    const remainingSeconds = Math.max(1, task.pausedRemainingSeconds ?? 1);
    const updated: Task = {
      ...task,
      status: 'active',
      pausedAt: undefined,
      pausedRemainingSeconds: undefined,
      totalPausedSeconds: task.totalPausedSeconds + pausedSeconds,
      nextReminderAt: new Date(now.getTime() + remainingSeconds * 1000).toISOString(),
      updatedAt: resumedAt,
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record('task_resumed', `Resumed "${updated.name}".`, updated.id);
      this.errorMessage.set('');
    } catch (error) {
      this.captureError(error, 'Task could not be resumed.');
    }
  }

  clearError(): void {
    this.errorMessage.set('');
  }

  private async saveAndReplace(task: Task): Promise<void> {
    await this.repository.save(task);
    this.tasks.update((tasks) =>
      tasks
        .map((item) => (item.id === task.id ? task : item))
        .sort((first, second) => first.order - second.order),
    );
    this.broadcastChange();
  }

  private findTask(taskId: string): Task | undefined {
    return this.tasks().find((task) => task.id === taskId);
  }

  private nextOrder(): number {
    return this.tasks().reduce((highest, task) => Math.max(highest, task.order), -1) + 1;
  }

  private cleanDraft(draft: TaskDraft): TaskDraft {
    return {
      name: draft.name.trim(),
      note: draft.note.trim(),
      category: draft.category.trim(),
      reminderAt: draft.reminderAt,
      reminderCount: draft.reminderCount,
      reminderIntervalMinutes: draft.reminderIntervalMinutes,
    };
  }

  private normalizeTask(task: Task): Task {
    return {
      ...task,
      totalPausedSeconds: task.totalPausedSeconds ?? 0,
      reminderAttemptsShown: task.reminderAttemptsShown ?? 0,
    };
  }

  private broadcastChange(): void {
    this.channel?.postMessage('tasks-changed');
  }

  private captureError(error: unknown, fallback: string): void {
    this.errorMessage.set(toFriendlyErrorMessage(error, fallback));
  }
}
