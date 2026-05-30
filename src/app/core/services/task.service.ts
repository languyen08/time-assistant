import { Injectable, computed, inject, signal } from '@angular/core';
import { Task, TaskDraft } from '../models/task';
import { TaskRepository } from '../repositories/task.repository';
import { createId, nowIso } from '../utils/date-time.util';
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
  readonly pendingTasks = computed(() => this.tasks().filter((task) => task.status === 'pending'));
  readonly completedTasks = computed(() =>
    this.tasks().filter((task) => task.status === 'completed'),
  );
  readonly nextTaskCandidate = computed(() => this.pendingTasks()[0]);

  async load(): Promise<void> {
    this.tasks.set(await this.repository.list());
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
      reminderAttemptsShown: 0,
    };

    await this.repository.save(task);
    this.tasks.update((tasks) =>
      [...tasks, task].sort((first, second) => first.order - second.order),
    );
    await this.history.record('task_created', `Created "${task.name}".`, task.id);
    this.errorMessage.set('');
    return true;
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

    await this.saveAndReplace(updated);
    await this.history.record('task_edited', `Updated "${updated.name}".`, updated.id);
    this.errorMessage.set('');
    return true;
  }

  async delete(taskId: string): Promise<void> {
    const task = this.findTask(taskId);
    if (!task) {
      return;
    }

    if (task.status === 'active') {
      this.errorMessage.set('Complete the active task before deleting it.');
      return;
    }

    await this.repository.delete(taskId);
    this.tasks.update((tasks) => tasks.filter((item) => item.id !== taskId));
    await this.history.record('task_deleted', `Deleted "${task.name}".`, task.id);
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
    await Promise.all(reordered.map((task) => this.repository.save(task)));
    this.tasks.set(reordered);
  }

  async start(taskId: string): Promise<void> {
    if (this.activeTask()) {
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
      nextReminderAt: task.reminderAt,
      reminderAttemptsShown: 0,
      updatedAt: startedAt,
    };

    await this.saveAndReplace(updated);
    await this.history.record('task_started', `Started "${updated.name}".`, updated.id);
    this.errorMessage.set('');
  }

  async completeActive(): Promise<void> {
    const task = this.activeTask();
    if (!task) {
      return;
    }

    const completedAt = nowIso();
    const completed: Task = {
      ...task,
      status: 'completed',
      completedAt,
      nextReminderAt: undefined,
      updatedAt: completedAt,
    };

    await this.saveAndReplace(completed);
    await this.history.record('task_completed', `Completed "${completed.name}".`, completed.id);
  }

  async addTimeToActive(minutes: number): Promise<void> {
    const task = this.activeTask();
    if (!task || !Number.isInteger(minutes) || minutes < 1) {
      this.errorMessage.set('Extra time must be at least 1 minute.');
      return;
    }

    const nextReminderAt = new Date(Date.now() + minutes * 60_000).toISOString();
    const updated: Task = {
      ...task,
      reminderAt: nextReminderAt,
      nextReminderAt,
      updatedAt: nowIso(),
    };

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
  }

  async markReminderShown(task: Task): Promise<Task> {
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
}
