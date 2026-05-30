import { Injectable } from '@angular/core';
import Papa from 'papaparse';
import { HistoryEvent } from '../models/history-event';
import { Task, TaskStatus } from '../models/task';
import { createId, nowIso } from '../utils/date-time.util';

const TASK_HEADERS = [
  'id',
  'name',
  'note',
  'category',
  'reminderAt',
  'reminderCount',
  'reminderIntervalMinutes',
  'status',
  'order',
  'createdAt',
  'updatedAt',
  'activeStartedAt',
  'pausedAt',
  'pausedRemainingSeconds',
  'totalPausedSeconds',
  'completedAt',
  'nextReminderAt',
  'reminderAttemptsShown',
] as const;

const HISTORY_HEADERS = ['id', 'type', 'taskId', 'occurredAt', 'summary', 'metadataJson'] as const;

const REQUIRED_TASK_HEADERS = [
  'name',
  'reminderAt',
  'reminderCount',
  'reminderIntervalMinutes',
] as const;

const VALID_STATUSES: TaskStatus[] = ['pending', 'active', 'paused', 'completed'];

type TaskCsvRow = Record<(typeof TASK_HEADERS)[number], string>;
type HistoryCsvRow = Record<(typeof HISTORY_HEADERS)[number], string>;
type RawCsvRow = Record<string, string | undefined>;

export interface TaskImportResult {
  tasks: Task[];
  errors: string[];
  importedCount: number;
  skippedCount: number;
}

@Injectable({ providedIn: 'root' })
export class CsvService {
  exportTasks(tasks: Task[]): string {
    const rows: TaskCsvRow[] = tasks.map((task) => ({
      id: task.id,
      name: task.name,
      note: task.note,
      category: task.category,
      reminderAt: task.reminderAt,
      reminderCount: String(task.reminderCount),
      reminderIntervalMinutes: String(task.reminderIntervalMinutes),
      status: task.status,
      order: String(task.order),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      activeStartedAt: task.activeStartedAt ?? '',
      pausedAt: task.pausedAt ?? '',
      pausedRemainingSeconds: task.pausedRemainingSeconds?.toString() ?? '',
      totalPausedSeconds: String(task.totalPausedSeconds ?? 0),
      completedAt: task.completedAt ?? '',
      nextReminderAt: task.nextReminderAt ?? '',
      reminderAttemptsShown: String(task.reminderAttemptsShown ?? 0),
    }));

    return Papa.unparse(rows, { columns: [...TASK_HEADERS] });
  }

  exportHistory(events: HistoryEvent[]): string {
    const rows: HistoryCsvRow[] = events.map((event) => ({
      id: event.id,
      type: event.type,
      taskId: event.taskId ?? '',
      occurredAt: event.occurredAt,
      summary: event.summary,
      metadataJson: event.metadata ? JSON.stringify(event.metadata) : '',
    }));

    return Papa.unparse(rows, { columns: [...HISTORY_HEADERS] });
  }

  importTasks(csv: string, existingTasks: Task[]): TaskImportResult {
    const parsed = Papa.parse<RawCsvRow>(csv, {
      header: true,
      skipEmptyLines: 'greedy',
    });
    const errors = parsed.errors.map((error) =>
      error.row === undefined ? error.message : `Row ${error.row + 2}: ${error.message}`,
    );
    const existingIds = new Set(existingTasks.map((task) => task.id));
    const importedIds = new Set<string>();
    const importedTasks: Task[] = [];
    const baseOrder =
      existingTasks.reduce((highest, task) => Math.max(highest, task.order), -1) + 1;

    if (parsed.data.length > 0) {
      const firstRow = parsed.data[0];
      for (const header of REQUIRED_TASK_HEADERS) {
        if (!(header in firstRow)) {
          errors.push(`Missing required column "${header}".`);
        }
      }
    }

    if (errors.length > 0) {
      return {
        tasks: [],
        errors,
        importedCount: 0,
        skippedCount: parsed.data.length,
      };
    }

    parsed.data.forEach((row, index) => {
      const rowNumber = index + 2;
      const rowErrors = this.validateTaskRow(row, rowNumber);
      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        return;
      }

      const now = nowIso();
      const originalId = this.text(row['id']);
      const id =
        originalId && !existingIds.has(originalId) && !importedIds.has(originalId)
          ? originalId
          : createId('task');
      importedIds.add(id);

      const requestedStatus = this.status(row['status']);
      const status = requestedStatus === 'completed' ? 'completed' : 'pending';
      const task: Task = {
        id,
        name: this.text(row['name']),
        note: this.text(row['note']),
        category: this.text(row['category']),
        reminderAt: new Date(this.text(row['reminderAt'])).toISOString(),
        reminderCount: this.integer(row['reminderCount']),
        reminderIntervalMinutes: this.integer(row['reminderIntervalMinutes']),
        order: baseOrder + importedTasks.length,
        status,
        createdAt: this.optionalIso(row['createdAt']) ?? now,
        updatedAt: this.optionalIso(row['updatedAt']) ?? now,
        activeStartedAt: undefined,
        pausedAt: undefined,
        pausedRemainingSeconds: undefined,
        totalPausedSeconds: this.optionalInteger(row['totalPausedSeconds']) ?? 0,
        completedAt: status === 'completed' ? this.optionalIso(row['completedAt']) : undefined,
        nextReminderAt: undefined,
        reminderAttemptsShown: this.optionalInteger(row['reminderAttemptsShown']) ?? 0,
      };

      importedTasks.push(task);
    });

    return {
      tasks: importedTasks,
      errors,
      importedCount: importedTasks.length,
      skippedCount: parsed.data.length - importedTasks.length,
    };
  }

  private validateTaskRow(row: RawCsvRow, rowNumber: number): string[] {
    const errors: string[] = [];
    const name = this.text(row['name']);
    const reminderAt = this.text(row['reminderAt']);
    const reminderCount = this.integer(row['reminderCount']);
    const reminderInterval = this.integer(row['reminderIntervalMinutes']);
    const statusText = this.text(row['status']);

    if (!name) {
      errors.push(`Row ${rowNumber}: Task name is required.`);
    }

    if (!this.isIsoDate(reminderAt)) {
      errors.push(`Row ${rowNumber}: reminderAt must be a valid date/time.`);
    }

    if (!Number.isInteger(reminderCount) || reminderCount < 1 || reminderCount > 20) {
      errors.push(`Row ${rowNumber}: reminderCount must be between 1 and 20.`);
    }

    if (!Number.isInteger(reminderInterval) || reminderInterval < 1 || reminderInterval > 240) {
      errors.push(`Row ${rowNumber}: reminderIntervalMinutes must be between 1 and 240.`);
    }

    if (statusText && !VALID_STATUSES.includes(statusText as TaskStatus)) {
      errors.push(`Row ${rowNumber}: status must be pending, active, paused, or completed.`);
    }

    return errors;
  }

  private text(value: string | undefined): string {
    return value?.trim() ?? '';
  }

  private status(value: string | undefined): TaskStatus {
    const status = this.text(value);
    return VALID_STATUSES.includes(status as TaskStatus) ? (status as TaskStatus) : 'pending';
  }

  private integer(value: string | undefined): number {
    return Number(this.text(value));
  }

  private optionalInteger(value: string | undefined): number | undefined {
    const parsed = this.integer(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  private optionalIso(value: string | undefined): string | undefined {
    const text = this.text(value);
    return this.isIsoDate(text) ? new Date(text).toISOString() : undefined;
  }

  private isIsoDate(value: string): boolean {
    return Boolean(value && !Number.isNaN(new Date(value).getTime()));
  }
}
