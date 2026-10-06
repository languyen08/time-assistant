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
            (task.recurrenceTemplate || task.status !== 'completed'),
        )
        .map((task) => task.id);
      return { save: [], remove, result: remove };
    });
  }

  mutate<R>(plan: (tasks: Task[]) => { save: Task[]; remove?: string[]; result: R }): Promise<R> {
    return this.storage.mutate(TASK_STORE, plan);
  }

  ensureOccurrences(now = new Date()): Promise<Task[]> {
    return this.mutate((tasks) => {
      const save: Task[] = [];
      const created: Task[] = [];
      for (const template of tasks.filter((task) => task.recurrenceTemplate && task.recurrence)) {
        const series = tasks.filter(
          (task) =>
            !task.recurrenceTemplate && task.recurrenceSeriesId === template.recurrenceSeriesId,
        );
        // Keep unfinished occurrences, even when their dates are overdue.
        if (series.some((task) => task.status !== 'completed')) continue;
        const lastDate = series.reduce(
          (last, task) =>
            task.occurrenceDate && task.occurrenceDate > last ? task.occurrenceDate : last,
          template.recurrenceCursor ?? '',
        );
        const today = localDate(now);
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
      return { save, result: created };
    });
  }
}
