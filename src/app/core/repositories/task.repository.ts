import { startupSpan } from '../utils/startup-profile';
import { Injectable, inject } from '@angular/core';
import { Task } from '../models/task';
import { IndexedDbStorageAdapter } from '../storage/indexed-db-storage.adapter';
import {
  localDate,
  makeOccurrence,
  nextCalendarDay,
  nextOccurrenceDate,
} from '../utils/recurrence.util';

const TASK_STORE = 'tasks';

@Injectable({ providedIn: 'root' })
export class TaskRepository {
  private readonly storage = inject(IndexedDbStorageAdapter);

  async list(): Promise<Task[]> {
    const profileEnd = startupSpan('task-repository-list');
    try {
      const tasks = await this.storage.getAll<Task>(TASK_STORE);
      return tasks.sort((first, second) => first.order - second.order);
    } finally {
      profileEnd();
    }
  }

  get(taskId: string): Promise<Task | undefined> {
    return this.storage.get<Task>(TASK_STORE, taskId);
  }

  save(task: Task): Promise<void> {
    if (task.recurrenceSeriesId && !task.recurrenceTemplate) {
      return this.mutate((tasks) => {
        const current = tasks.find((item) => item.id === task.id);
        if (
          current?.status === 'interrupted' ||
          (current?.occurrenceDate &&
            current.occurrenceDate < localDate() &&
            (current.status === 'pending' ||
              current.status === 'active' ||
              current.status === 'paused'))
        ) {
          throw new Error('This occurrence ended in another window. Reload before trying again.');
        }
        return { save: [task], result: undefined };
      });
    }
    return this.storage.put(TASK_STORE, task);
  }

  delete(taskId: string): Promise<void> {
    return this.storage.delete(TASK_STORE, taskId);
  }

  /**
   * Stops a recurring task atomically. Completed occurrences stay available for history and charts;
   * the template and every unfinished occurrence are removed so no renderer can allocate another.
   */
  deleteSeries(seriesId: string): Promise<string[]> {
    return this.mutate((tasks) => {
      const remove = tasks
        .filter(
          (task) =>
            task.recurrenceSeriesId === seriesId &&
            (task.recurrenceTemplate ||
              (task.status !== 'completed' && task.status !== 'interrupted')),
        )
        .map((task) => task.id);
      return { save: [], remove, result: remove };
    });
  }

  mutate<R>(plan: (tasks: Task[]) => { save: Task[]; remove?: string[]; result: R }): Promise<R> {
    return this.storage.mutate(TASK_STORE, plan);
  }

  ensureOccurrences(now = new Date()): Promise<{ created: Task[]; interrupted: Task[] }> {
    return this.mutate((tasks) => {
      const save: Task[] = [];
      const created: Task[] = [];
      const interrupted: Task[] = [];
      const today = localDate(now);
      // Also close already allocated work when future repetition has been disabled.
      for (const task of tasks.filter(
        (task) => !task.recurrenceTemplate && task.recurrenceSeriesId,
      )) {
        if (
          task.occurrenceDate &&
          task.occurrenceDate < today &&
          (task.status === 'pending' || task.status === 'active' || task.status === 'paused')
        ) {
          const closed: Task = {
            ...task,
            status: 'interrupted',
            interruptedAt: now.toISOString(),
            updatedAt: now.toISOString(),
            nextReminderAt: undefined,
            pendingReminder: undefined,
            nextAutoStartAt: undefined,
          };
          save.push(closed);
          interrupted.push(closed);
        }
      }
      for (const template of tasks.filter((task) => task.recurrenceTemplate && task.recurrence)) {
        const series = tasks.filter(
          (task) =>
            !task.recurrenceTemplate && task.recurrenceSeriesId === template.recurrenceSeriesId,
        );
        // Current or future unfinished occurrences must not be duplicated.
        if (
          series.some(
            (task) =>
              task.occurrenceDate &&
              task.occurrenceDate >= today &&
              (task.status === 'pending' || task.status === 'active' || task.status === 'paused'),
          )
        )
          continue;
        const lastDate = series.reduce(
          (last, task) =>
            task.occurrenceDate && task.occurrenceDate > last ? task.occurrenceDate : last,
          template.recurrenceCursor ?? '',
        );
        const after = lastDate && lastDate >= today ? nextCalendarDay(lastDate) : today;
        const date = nextOccurrenceDate(template.recurrence!, after);
        if (!date) continue;
        const occurrence = makeOccurrence(template, date, now);
        if (tasks.some((task) => task.id === occurrence.id)) continue;
        occurrence.order =
          tasks.concat(save).reduce((last, task) => Math.max(last, task.order), -1) + 1;
        save.push({ ...template, recurrenceCursor: date }, occurrence);
        created.push(occurrence);
      }
      return { save, result: { created, interrupted } };
    });
  }
}
