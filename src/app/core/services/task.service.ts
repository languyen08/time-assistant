import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { RecurrenceEditScope, Task, TaskDraft } from '../models/task';
import { TaskRepository } from '../repositories/task.repository';
import { toFriendlyErrorMessage } from '../utils/error-message.util';
import { createId, isDue, nowIso, secondsBetween, secondsUntil } from '../utils/date-time.util';
import { HistoryService } from './history.service';
import { TaskValidationService } from './task-validation.service';
import {
  includesRecurrenceDate,
  localDate,
  makeOccurrence,
  nextOccurrenceDate,
  onOccurrenceDate,
} from '../utils/recurrence.util';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly repository = inject(TaskRepository);
  private readonly history = inject(HistoryService);
  private readonly validator = inject(TaskValidationService);

  readonly tasks = signal<Task[]>([]);
  readonly recurrenceTemplates = signal<Task[]>([]);
  private recurrenceCheckDate = '';
  readonly errorMessage = signal('');
  readonly activeTasks = computed(() => this.tasks().filter((task) => task.status === 'active'));
  readonly currentTasks = computed(() =>
    this.tasks().filter((task) => task.status === 'active' || task.status === 'paused'),
  );
  readonly activeTask = computed(() => this.activeTasks()[0]);
  readonly currentTask = computed(() => this.currentTasks()[0]);
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
    inject(DestroyRef).onDestroy(() => this.channel?.close());
    this.channel?.addEventListener('message', (event: MessageEvent<string>) => {
      if (event.data === 'tasks-changed') {
        void this.load();
      }
    });
  }

  async load(): Promise<void> {
    try {
      let tasks = await this.repository.list();
      this.recurrenceTemplates.set(tasks.filter((task) => task.recurrenceTemplate));
      if (tasks.some((task) => task.recurrenceTemplate && task.recurrence)) {
        const created = await this.repository.ensureOccurrences();
        if (created.length) {
          await this.recordOccurrences(created);
          tasks = await this.repository.list();
          this.broadcastChange();
        }
      }
      this.recurrenceTemplates.set(tasks.filter((task) => task.recurrenceTemplate));
      this.tasks.set(
        tasks
          .filter((task) => !task.recurrenceTemplate)
          .map((task) => this.normalizeTask(task))
          .sort((first, second) => first.order - second.order),
      );
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

    if (draft.recurrence && !nextOccurrenceDate(draft.recurrence, localDate())) {
      this.errorMessage.set('The repeat period has no remaining occurrence.');
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
      if (draft.recurrence) {
        const seriesId = createId('series');
        const date = nextOccurrenceDate(draft.recurrence, localDate())!;
        const template: Task = {
          ...task,
          id: seriesId,
          recurrenceTemplate: true,
          recurrenceSeriesId: seriesId,
          recurrenceCursor: date,
        };
        const occurrence = await this.repository.mutate((tasks) => {
          const created = makeOccurrence(template, date);
          created.order = tasks.reduce((highest, item) => Math.max(highest, item.order), -1) + 1;
          return { save: [template, created], result: created };
        });
        this.recurrenceTemplates.update((templates) => [...templates, template]);
        this.tasks.update((tasks) =>
          [...tasks, occurrence].sort((first, second) => first.order - second.order),
        );
        this.broadcastChange();
        await this.recordOccurrences([occurrence]);
        this.errorMessage.set('');
        return true;
      }
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

  async update(
    taskId: string,
    draft: TaskDraft,
    scope: RecurrenceEditScope = 'occurrence',
  ): Promise<boolean> {
    const current = this.findTask(taskId);
    if (!current || current.status === 'completed') {
      this.errorMessage.set('Only pending, active, or paused tasks can be edited.');
      return false;
    }

    if (current.occurrenceDate && scope === 'future' && draft.recurrence) {
      draft = {
        ...draft,
        recurrence: {
          ...draft.recurrence,
          rangeStart:
            draft.recurrence.rangeStart > current.occurrenceDate
              ? draft.recurrence.rangeStart
              : current.occurrenceDate,
        },
      };
    }

    const validation = this.validator.validate(
      draft,
      new Date(),
      current.recurrenceSeriesId ? draft.reminderAt : current.reminderAt,
      current.recurrenceSeriesId ? draft.deadlineAt : current.deadlineAt,
    );
    if (!validation.valid) {
      this.errorMessage.set(validation.errors[0]);
      return false;
    }

    const cleanedDraft = this.cleanDraft(draft);
    if (current.recurrenceSeriesId && current.occurrenceDate) {
      const anchor = localDate(new Date(cleanedDraft.reminderAt));
      if (cleanedDraft.deadlineAt)
        cleanedDraft.deadlineAt = onOccurrenceDate(
          cleanedDraft.deadlineAt,
          current.occurrenceDate,
          anchor,
        );
      cleanedDraft.reminderAt = onOccurrenceDate(cleanedDraft.reminderAt, current.occurrenceDate);
    }
    if (
      !current.recurrenceSeriesId &&
      draft.recurrence &&
      current.status !== 'pending' &&
      !includesRecurrenceDate(draft.recurrence, localDate(new Date(current.reminderAt)))
    ) {
      this.errorMessage.set(
        'The current task date must be included in the repeat period and weekdays.',
      );
      return false;
    }
    const deadlineChanged = cleanedDraft.deadlineAt !== current.deadlineAt;
    const updated: Task = {
      ...current,
      ...cleanedDraft,
      updatedAt: nowIso(),
      deadlineNotifiedAt: cleanedDraft.deadlineAt
        ? deadlineChanged
          ? undefined
          : current.deadlineNotifiedAt
        : undefined,
      deadlineAcknowledgedAt: cleanedDraft.deadlineAt
        ? deadlineChanged
          ? undefined
          : current.deadlineAcknowledgedAt
        : undefined,
      nextAutoStartAt:
        current.status === 'pending' &&
        (draft.reminderAt !== current.reminderAt ||
          (!current.allowConcurrentStart && draft.allowConcurrentStart))
          ? undefined
          : current.nextAutoStartAt,
      nextReminderAt: !cleanedDraft.reminderEnabled
        ? undefined
        : current.status === 'active'
          ? cleanedDraft.reminderAt
          : current.nextReminderAt,
      pausedRemainingSeconds: !cleanedDraft.reminderEnabled
        ? undefined
        : current.status === 'paused' && current.reminderEnabled === false
          ? secondsUntil(cleanedDraft.reminderAt, new Date())
          : current.pausedRemainingSeconds,
      pendingReminder: cleanedDraft.reminderEnabled ? current.pendingReminder : undefined,
    };

    try {
      if (current.recurrenceSeriesId && scope === 'future') {
        await this.updateSeries(current, updated, cleanedDraft);
        this.errorMessage.set('');
        return true;
      }
      if (!current.recurrenceSeriesId && draft.recurrence) {
        const seriesId = createId('series');
        const date =
          current.status === 'pending' && !current.activeStartedAt
            ? nextOccurrenceDate(draft.recurrence, localDate())
            : localDate(new Date(updated.reminderAt));
        if (!date) throw new Error('The repeat period has no remaining occurrence.');
        const template: Task = {
          ...updated,
          id: seriesId,
          recurrenceTemplate: true,
          recurrenceSeriesId: seriesId,
          recurrenceCursor: date,
        };
        const occurrence =
          current.status === 'pending' && !current.activeStartedAt
            ? {
                ...makeOccurrence(template, date),
                id: current.id,
                order: current.order,
                createdAt: current.createdAt,
              }
            : { ...updated, recurrenceSeriesId: seriesId, occurrenceDate: date };
        await this.repository.mutate(() => ({ save: [template, occurrence], result: undefined }));
        await this.load();
        this.broadcastChange();
      } else {
        await this.saveAndReplace(updated);
      }
      await this.history.record('task_edited', `Updated "${updated.name}".`, updated.id);
      this.errorMessage.set('');
      return true;
    } catch (error) {
      this.captureError(error, 'Task changes could not be saved.');
      return false;
    }
  }

  async delete(taskId: string): Promise<boolean> {
    const task = this.findTask(taskId);
    if (!task) {
      return false;
    }

    try {
      if (task.recurrenceSeriesId) {
        const removedTaskIds = await this.repository.deleteSeries(task.recurrenceSeriesId);
        this.recurrenceTemplates.update((templates) =>
          templates.filter((item) => item.recurrenceSeriesId !== task.recurrenceSeriesId),
        );
        this.tasks.update((tasks) => tasks.filter((item) => !removedTaskIds.includes(item.id)));
      } else {
        await this.repository.delete(taskId);
        this.tasks.update((tasks) => tasks.filter((item) => item.id !== taskId));
      }
      this.broadcastChange();
    } catch (error) {
      this.captureError(error, 'Task could not be deleted.');
      return false;
    }

    try {
      await this.history.record(
        'task_deleted',
        task.recurrenceSeriesId
          ? `Deleted recurring task "${task.name}" and stopped future occurrences.`
          : `Deleted "${task.name}".`,
        task.id,
      );
      this.errorMessage.set('');
    } catch (error) {
      this.captureError(error, 'The task was deleted, but its history could not be saved.');
    }
    return true;
  }

  async importTasks(importedTasks: Task[]): Promise<void> {
    if (importedTasks.length === 0) {
      return;
    }

    try {
      await Promise.all(importedTasks.map((task) => this.repository.save(task)));
      await this.load();
      this.broadcastChange();
      for (const task of importedTasks) {
        if (task.recurrenceTemplate) continue;
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
    const task = this.findTask(taskId);
    if (!task || task.status !== 'pending') {
      this.errorMessage.set('Only pending tasks can be started.');
      return;
    }

    if (!task.allowConcurrentStart && this.currentTasks().length > 0) {
      this.errorMessage.set('Complete the active task before starting another.');
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
      nextAutoStartAt: undefined,
      nextReminderAt: task.reminderEnabled === false ? undefined : task.reminderAt,
      reminderAttemptsShown: 0,
      pendingReminder: undefined,
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

  async startAutomatically(taskId: string, now: Date): Promise<boolean> {
    const task = this.findTask(taskId);
    if (!task || task.status !== 'pending') {
      return false;
    }

    if (!task.allowConcurrentStart && this.currentTasks().length > 0) {
      return false;
    }

    const startedAt = now.toISOString();
    const updated: Task = {
      ...task,
      status: 'active',
      activeStartedAt: startedAt,
      pausedAt: undefined,
      pausedRemainingSeconds: undefined,
      totalPausedSeconds: 0,
      nextAutoStartAt: undefined,
      nextReminderAt: task.reminderEnabled === false ? undefined : startedAt,
      reminderAttemptsShown: 0,
      pendingReminder: undefined,
      updatedAt: startedAt,
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record(
        'task_started',
        `Automatically started "${updated.name}".`,
        updated.id,
        { source: 'automatic' },
      );
      this.errorMessage.set('');
      return true;
    } catch (error) {
      this.captureError(error, 'Task could not be started automatically.');
      return false;
    }
  }

  async deferAutomaticStart(taskId: string, now: Date): Promise<boolean> {
    const task = this.findTask(taskId);
    if (!task || task.status !== 'pending') {
      return false;
    }

    const effectiveAttempt = new Date(task.nextAutoStartAt ?? task.reminderAt).getTime();
    if (!Number.isFinite(effectiveAttempt) || effectiveAttempt > now.getTime()) {
      return false;
    }

    const increments = Math.floor((now.getTime() - effectiveAttempt) / (30 * 60_000)) + 1;
    const minutes = increments * 30;
    const retryAt = new Date(effectiveAttempt + minutes * 60_000).toISOString();
    const updated: Task = {
      ...task,
      nextAutoStartAt: retryAt,
      updatedAt: now.toISOString(),
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record(
        'auto_start_deferred',
        `Deferred automatic start for "${updated.name}" by ${minutes} minutes.`,
        updated.id,
        { minutes, retryAt },
      );
      this.errorMessage.set('');
      return true;
    } catch (error) {
      this.captureError(error, 'Automatic start retry could not be saved.');
      return false;
    }
  }

  async complete(taskId: string): Promise<boolean> {
    const task = this.findTask(taskId);
    if (!task || (task.status !== 'active' && task.status !== 'paused')) {
      return false;
    }

    const completedAt = nowIso();
    const completed: Task = {
      ...task,
      status: 'completed',
      completedAt,
      pausedAt: undefined,
      pausedRemainingSeconds: undefined,
      nextReminderAt: undefined,
      pendingReminder: undefined,
      updatedAt: completedAt,
    };

    try {
      await this.saveAndReplace(completed);
    } catch (error) {
      this.captureError(error, 'Task could not be completed.');
      return false;
    }

    try {
      await this.history.record('task_completed', `Completed "${completed.name}".`, completed.id);
      if (completed.recurrenceSeriesId) await this.ensureRecurrences();
      this.errorMessage.set('');
    } catch (error) {
      this.captureError(error, 'The task was completed, but its history could not be saved.');
    }
    return true;
  }

  async addTime(taskId: string, minutes: number, now = new Date()): Promise<boolean> {
    let task = this.findTask(taskId);
    if (task) {
      try {
        task = await this.repository.get(taskId);
      } catch (error) {
        this.captureError(error, 'Extra time could not be applied.');
        return false;
      }
    }
    if (task?.reminderEnabled === false) {
      this.errorMessage.set('This task has no reminder to extend.');
      return false;
    }
    if (
      !task ||
      (task.status !== 'active' && task.status !== 'paused') ||
      !Number.isInteger(minutes) ||
      minutes < 1
    ) {
      this.errorMessage.set('Extra time must be at least 1 minute.');
      return false;
    }

    const nextReminderAt =
      task.status === 'paused'
        ? undefined
        : new Date(
            Math.max(
              now.getTime(),
              task.nextReminderAt ? new Date(task.nextReminderAt).getTime() : now.getTime(),
            ) +
              minutes * 60_000,
          ).toISOString();
    const pausedRemainingSeconds =
      task.status === 'paused'
        ? Math.max(0, task.pausedRemainingSeconds ?? 0) + minutes * 60
        : undefined;
    const updated: Task = {
      ...this.normalizeTask(task),
      status: task.status,
      reminderAt: task.reminderAt,
      nextReminderAt,
      pausedRemainingSeconds,
      pendingReminder: undefined,
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
      return true;
    } catch (error) {
      this.captureError(error, 'Extra time could not be applied.');
      return false;
    }
  }

  async triggerReminder(
    taskId: string,
    message: string,
    now = new Date(),
  ): Promise<Task | undefined> {
    let updated: Task;
    try {
      const persistedTasks = await this.repository.list();
      if (
        persistedTasks.some(
          (task) => task.reminderEnabled !== false && Boolean(task.pendingReminder),
        )
      ) {
        return undefined;
      }

      const task = await this.repository.get(taskId);
      if (
        !task ||
        task.reminderEnabled === false ||
        task.status !== 'active' ||
        task.pendingReminder ||
        task.reminderAttemptsShown >= task.reminderCount ||
        !isDue(task.nextReminderAt, now)
      ) {
        return undefined;
      }

      const attemptsShown = task.reminderAttemptsShown + 1;
      const shownAt = now.toISOString();
      updated = {
        ...this.normalizeTask(task),
        reminderAttemptsShown: attemptsShown,
        nextReminderAt:
          attemptsShown < task.reminderCount
            ? new Date(now.getTime() + task.reminderIntervalMinutes * 60_000).toISOString()
            : undefined,
        pendingReminder: {
          attemptNumber: attemptsShown,
          maxAttempts: task.reminderCount,
          shownAt,
          message,
        },
        updatedAt: shownAt,
      };

      await this.saveAndReplace(updated);
    } catch (error) {
      this.captureError(error, 'Reminder state could not be updated.');
      return undefined;
    }

    try {
      await this.history.record(
        'reminder_shown',
        `Reminder ${updated.reminderAttemptsShown} shown for "${updated.name}".`,
        updated.id,
        {
          attempt: updated.reminderAttemptsShown,
          maxAttempts: updated.reminderCount,
        },
      );
      this.errorMessage.set('');
    } catch (error) {
      this.captureError(error, 'The reminder was saved, but its history could not be recorded.');
    }
    return updated;
  }

  async dismissReminder(taskId: string): Promise<boolean> {
    try {
      const task = await this.repository.get(taskId);
      if (!task?.pendingReminder) {
        return false;
      }

      const updated: Task = {
        ...this.normalizeTask(task),
        pendingReminder: undefined,
        updatedAt: nowIso(),
      };
      await this.saveAndReplace(updated);
      this.errorMessage.set('');
      return true;
    } catch (error) {
      this.captureError(error, 'Reminder dismissal could not be saved.');
      return false;
    }
  }

  async markDeadlineNotified(taskId: string, now: Date): Promise<Task | undefined> {
    const task = this.findTask(taskId);
    if (!task || !task.deadlineAt || task.status === 'completed' || task.deadlineNotifiedAt) {
      return undefined;
    }

    const updated: Task = {
      ...task,
      deadlineNotifiedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    try {
      await this.saveAndReplace(updated);
    } catch (error) {
      this.captureError(error, 'Deadline state could not be saved.');
      return undefined;
    }

    try {
      await this.history.record(
        'deadline_reached',
        `Finish-by deadline reached for "${updated.name}".`,
        updated.id,
        { deadlineAt: updated.deadlineAt! },
      );
    } catch (error) {
      this.captureError(error, 'The deadline was saved, but its history could not be recorded.');
    }

    return updated;
  }

  async acknowledgeDeadline(taskId: string, now = new Date()): Promise<boolean> {
    const task = this.findTask(taskId);
    if (!task?.deadlineNotifiedAt || task.deadlineAcknowledgedAt) {
      return false;
    }

    const updated: Task = {
      ...task,
      deadlineAcknowledgedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    try {
      await this.saveAndReplace(updated);
      this.errorMessage.set('');
      return true;
    } catch (error) {
      this.captureError(error, 'Deadline acknowledgement could not be saved.');
      return false;
    }
  }

  async pause(taskId: string, now = new Date()): Promise<boolean> {
    const task = this.findTask(taskId);
    if (!task || task.status !== 'active') {
      return false;
    }

    const pausedAt = now.toISOString();
    const updated: Task = {
      ...task,
      status: 'paused',
      pausedAt,
      pausedRemainingSeconds:
        task.reminderEnabled === false ? undefined : secondsUntil(task.nextReminderAt, now),
      pendingReminder: undefined,
      updatedAt: pausedAt,
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record('task_paused', `Paused "${updated.name}".`, updated.id);
      this.errorMessage.set('');
      return true;
    } catch (error) {
      this.captureError(error, 'Task could not be paused.');
      return false;
    }
  }

  async resume(taskId: string, now = new Date()): Promise<boolean> {
    const task = this.findTask(taskId);
    if (!task || task.status !== 'paused') {
      return false;
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
      nextReminderAt:
        task.reminderEnabled === false
          ? undefined
          : new Date(now.getTime() + remainingSeconds * 1000).toISOString(),
      updatedAt: resumedAt,
    };

    try {
      await this.saveAndReplace(updated);
      await this.history.record('task_resumed', `Resumed "${updated.name}".`, updated.id);
      this.errorMessage.set('');
      return true;
    } catch (error) {
      this.captureError(error, 'Task could not be resumed.');
      return false;
    }
  }

  clearError(): void {
    this.errorMessage.set('');
  }

  async ensureRecurrences(now = new Date(), onlyIfDateChanged = false): Promise<void> {
    if (!this.recurrenceTemplates().some((task) => task.recurrence)) return;
    const today = localDate(now);
    if (onlyIfDateChanged && this.recurrenceCheckDate === today) return;
    try {
      const created = await this.repository.ensureOccurrences(now);
      this.recurrenceCheckDate = today;
      if (created.length) {
        await this.recordOccurrences(created);
        await this.load();
        this.broadcastChange();
      }
    } catch (error) {
      this.captureError(error, 'The next repeating task could not be created.');
    }
  }

  private async recordOccurrences(tasks: Task[]): Promise<void> {
    for (const task of tasks)
      await this.history.record('task_created', `Created "${task.name}".`, task.id);
  }

  private async updateSeries(current: Task, updated: Task, draft: TaskDraft): Promise<void> {
    const today = localDate();
    const changes = await this.repository.mutate((tasks) => {
      const template = tasks.find(
        (task) => task.recurrenceTemplate && task.recurrenceSeriesId === current.recurrenceSeriesId,
      );
      if (!template) throw new Error('The repeat defaults are missing.');
      const replacement = { ...template, ...draft, updatedAt: nowIso() };
      const save: Task[] = [replacement];
      const removed: Task[] = [];
      for (const task of tasks) {
        if (
          task.recurrenceTemplate ||
          task.recurrenceSeriesId !== current.recurrenceSeriesId ||
          !task.occurrenceDate ||
          task.occurrenceDate < current.occurrenceDate! ||
          task.status === 'completed'
        )
          continue;
        const untouched =
          task.status === 'pending' &&
          !task.activeStartedAt &&
          !task.totalPausedSeconds &&
          !task.reminderAttemptsShown &&
          !task.deadlineNotifiedAt;
        const selected = task.id === current.id && task.occurrenceDate >= today;
        if (selected && task.updatedAt !== current.updatedAt)
          throw new Error('This occurrence changed in another window. Reopen it before saving.');
        if (!selected && !(untouched && task.occurrenceDate >= today)) continue;
        if (
          untouched &&
          task.occurrenceDate > current.occurrenceDate! &&
          (!draft.recurrence || !includesRecurrenceDate(draft.recurrence, task.occurrenceDate))
        ) {
          removed.push(task);
          continue;
        }
        if (
          untouched &&
          draft.recurrence &&
          !includesRecurrenceDate(draft.recurrence, task.occurrenceDate)
        ) {
          removed.push(task);
          continue;
        }
        // Reconcile unstarted future records; preserve all timing on the selected current task.
        save.push(
          selected
            ? updated
            : {
                ...makeOccurrence(replacement, task.occurrenceDate),
                id: task.id,
                order: task.order,
                createdAt: task.createdAt,
              },
        );
      }
      if (removed.length) {
        // Removed future allocations must not suppress earlier dates in the new schedule.
        replacement.recurrenceCursor = tasks
          .filter(
            (task) =>
              !task.recurrenceTemplate &&
              task.recurrenceSeriesId === current.recurrenceSeriesId &&
              !removed.some((item) => item.id === task.id),
          )
          .reduce(
            (last, task) =>
              task.occurrenceDate && task.occurrenceDate > last ? task.occurrenceDate : last,
            '',
          );
      }
      return {
        save,
        remove: removed.map((task) => task.id),
        result: { edited: save.slice(1), removed },
      };
    });
    for (const task of changes.edited)
      await this.history.record('task_edited', `Updated "${task.name}".`, task.id);
    for (const task of changes.removed)
      await this.history.record(
        'task_deleted',
        `Deleted "${task.name}" after repeat change.`,
        task.id,
      );
    await this.load();
    this.broadcastChange();
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

  private cleanDraft(draft: TaskDraft): TaskDraft & { reminderEnabled: boolean } {
    return {
      recurrence: draft.recurrence,
      name: draft.name.trim(),
      note: draft.note.trim(),
      category: draft.category.trim(),
      reminderAt: draft.reminderAt || (draft.reminderEnabled === false ? nowIso() : ''),
      reminderEnabled: draft.reminderEnabled !== false,
      reminderCount: draft.reminderEnabled === false ? 0 : draft.reminderCount,
      reminderIntervalMinutes: draft.reminderEnabled === false ? 0 : draft.reminderIntervalMinutes,
      allowConcurrentStart: draft.allowConcurrentStart,
      deadlineAt: draft.deadlineAt || undefined,
      deadlineMessage: draft.deadlineAt ? draft.deadlineMessage?.trim() || undefined : undefined,
    };
  }

  private normalizeTask(task: Task): Task {
    return {
      ...task,
      reminderEnabled: task.reminderEnabled !== false,
      allowConcurrentStart: task.allowConcurrentStart ?? false,
      totalPausedSeconds: task.totalPausedSeconds ?? 0,
      reminderAttemptsShown: task.reminderAttemptsShown ?? 0,
      deadlineAt: task.deadlineAt ?? undefined,
      deadlineMessage: task.deadlineMessage ?? undefined,
      deadlineNotifiedAt: task.deadlineNotifiedAt ?? undefined,
      deadlineAcknowledgedAt: task.deadlineAcknowledgedAt ?? undefined,
      nextReminderAt: task.reminderEnabled === false ? undefined : task.nextReminderAt,
      pausedRemainingSeconds:
        task.reminderEnabled === false ? undefined : task.pausedRemainingSeconds,
      pendingReminder:
        task.reminderEnabled === false ? undefined : (task.pendingReminder ?? undefined),
    };
  }

  private broadcastChange(): void {
    this.channel?.postMessage('tasks-changed');
  }

  private captureError(error: unknown, fallback: string): void {
    this.errorMessage.set(toFriendlyErrorMessage(error, fallback));
  }
}
