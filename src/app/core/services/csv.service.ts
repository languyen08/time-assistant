import { Injectable } from '@angular/core';
import Papa from 'papaparse';
import { HistoryEvent } from '../models/history-event';
import { RecurrenceRule, Task, TaskStatus } from '../models/task';
import { createId, nowIso } from '../utils/date-time.util';
import { isCalendarDate, occurrenceId, recurrenceErrors } from '../utils/recurrence.util';

const TASK_HEADERS = [
  'id',
  'name',
  'note',
  'category',
  'reminderAt',
  'reminderCount',
  'reminderIntervalMinutes',
  'allowConcurrentStart',
  'deadlineAt',
  'deadlineMessage',
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
  'reminderEnabled',
  'recurrenceType',
  'recurrenceDays',
  'recurrenceStartDate',
  'recurrenceEndDate',
  'recurrenceSeriesId',
  'occurrenceDate',
  'recurrenceTemplate',
  'recurrenceCursor',
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
  exportTasks(tasks: Task[], dateTimeFormat = "yyyy-MM-dd'T'HH:mm:ssxxx"): string {
    const rows: TaskCsvRow[] = tasks.map((task) => ({
      id: task.id,
      name: task.name,
      note: task.note,
      category: task.category,
      reminderAt: this.formatDateTime(task.reminderAt, dateTimeFormat),
      reminderCount: task.reminderEnabled === false ? '' : String(task.reminderCount),
      reminderIntervalMinutes:
        task.reminderEnabled === false ? '' : String(task.reminderIntervalMinutes),
      reminderEnabled: String(task.reminderEnabled !== false),
      recurrenceType: task.recurrence?.type ?? '',
      recurrenceDays: task.recurrence?.daysOfWeek?.join(';') ?? '',
      recurrenceStartDate: task.recurrence?.rangeStart ?? '',
      recurrenceEndDate: task.recurrence?.rangeEnd ?? '',
      recurrenceSeriesId: task.recurrenceSeriesId ?? '',
      occurrenceDate: task.occurrenceDate ?? '',
      recurrenceTemplate: task.recurrenceTemplate ? 'true' : '',
      recurrenceCursor: task.recurrenceCursor ?? '',
      allowConcurrentStart: String(task.allowConcurrentStart),
      deadlineAt: this.formatDateTime(task.deadlineAt, dateTimeFormat),
      deadlineMessage: task.deadlineMessage ?? '',
      status: task.status,
      order: String(task.order),
      createdAt: this.formatDateTime(task.createdAt, dateTimeFormat),
      updatedAt: this.formatDateTime(task.updatedAt, dateTimeFormat),
      activeStartedAt: this.formatDateTime(task.activeStartedAt, dateTimeFormat),
      pausedAt: this.formatDateTime(task.pausedAt, dateTimeFormat),
      pausedRemainingSeconds: task.pausedRemainingSeconds?.toString() ?? '',
      totalPausedSeconds: String(task.totalPausedSeconds ?? 0),
      completedAt: this.formatDateTime(task.completedAt, dateTimeFormat),
      nextReminderAt: this.formatDateTime(task.nextReminderAt, dateTimeFormat),
      reminderAttemptsShown: String(task.reminderAttemptsShown ?? 0),
    }));

    return Papa.unparse(rows, { columns: [...TASK_HEADERS] });
  }

  exportHistory(events: HistoryEvent[], dateTimeFormat = "yyyy-MM-dd'T'HH:mm:ssxxx"): string {
    const rows: HistoryCsvRow[] = events.map((event) => ({
      id: event.id,
      type: event.type,
      taskId: event.taskId ?? '',
      occurredAt: this.formatDateTime(event.occurredAt, dateTimeFormat),
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
    const seriesIds = new Map<string, string>();
    const existingSeries = new Set(
      existingTasks.map((task) => task.recurrenceSeriesId).filter(Boolean),
    );
    const baseOrder =
      existingTasks.reduce((highest, task) => Math.max(highest, task.order), -1) + 1;

    if (parsed.data.length > 0) {
      const firstRow = parsed.data[0];
      const requiredHeaders = parsed.data.some(
        (row) => this.boolean(row['reminderEnabled']) !== false,
      )
        ? REQUIRED_TASK_HEADERS
        : ['name'];
      for (const header of requiredHeaders) {
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
      let id =
        originalId && !existingIds.has(originalId) && !importedIds.has(originalId)
          ? originalId
          : createId('task');
      const originalSeries = this.text(row['recurrenceSeriesId']);
      let seriesId: string | undefined;
      if (originalSeries) {
        seriesId = seriesIds.get(originalSeries);
        if (!seriesId) {
          seriesId =
            existingSeries.has(originalSeries) || existingIds.has(originalSeries)
              ? createId('series')
              : originalSeries;
          seriesIds.set(originalSeries, seriesId);
        }
      }
      const template = this.boolean(row['recurrenceTemplate']) === true;
      const occurrenceDate = this.text(row['occurrenceDate']) || undefined;
      if (template) id = seriesId!;
      else if (seriesId && occurrenceDate) id = occurrenceId(seriesId, occurrenceDate);
      if (importedIds.has(id)) {
        errors.push(`Row ${rowNumber}: Duplicate recurring occurrence or template.`);
        return;
      }
      importedIds.add(id);

      const requestedStatus = this.status(row['status']);
      const status = requestedStatus === 'completed' ? 'completed' : 'pending';
      const reminderEnabled = this.boolean(row['reminderEnabled']) !== false;
      const task: Task = {
        recurrence: this.rowRecurrence(row),
        recurrenceSeriesId: seriesId,
        recurrenceTemplate: template || undefined,
        recurrenceCursor: this.text(row['recurrenceCursor']) || undefined,
        occurrenceDate,
        id,
        name: this.text(row['name']),
        note: this.text(row['note']),
        category: this.text(row['category']),
        reminderAt: this.optionalIso(row['reminderAt']) ?? now,
        reminderEnabled,
        reminderCount: reminderEnabled ? this.integer(row['reminderCount']) : 0,
        reminderIntervalMinutes: reminderEnabled ? this.integer(row['reminderIntervalMinutes']) : 0,
        allowConcurrentStart: this.boolean(row['allowConcurrentStart']) ?? false,
        deadlineAt: this.optionalIso(row['deadlineAt']),
        deadlineMessage: this.text(row['deadlineMessage']) || undefined,
        order: baseOrder + importedTasks.length,
        status,
        createdAt: this.optionalIso(row['createdAt']) ?? now,
        updatedAt: this.optionalIso(row['updatedAt']) ?? now,
        activeStartedAt: undefined,
        pausedAt: undefined,
        pausedRemainingSeconds: undefined,
        totalPausedSeconds: this.optionalInteger(row['totalPausedSeconds']) ?? 0,
        completedAt: status === 'completed' ? this.optionalIso(row['completedAt']) : undefined,
        deadlineNotifiedAt: undefined,
        deadlineAcknowledgedAt: undefined,
        nextReminderAt: undefined,
        reminderAttemptsShown: reminderEnabled
          ? (this.optionalInteger(row['reminderAttemptsShown']) ?? 0)
          : 0,
      };

      importedTasks.push(task);
    });

    // A single externally authored occurrence can seed its defaults. Our exports include
    // explicit template rows so occurrence-only changes never become future defaults.
    for (const seriesId of new Set(
      importedTasks.map((task) => task.recurrenceSeriesId).filter(Boolean),
    )) {
      if (
        importedTasks.some(
          (task) => task.recurrenceTemplate && task.recurrenceSeriesId === seriesId,
        )
      )
        continue;
      const first = importedTasks.find(
        (task) => task.recurrenceSeriesId === seriesId && task.recurrence,
      );
      if (first) {
        const dates = importedTasks
          .filter((task) => task.recurrenceSeriesId === seriesId)
          .map((task) => task.occurrenceDate ?? '')
          .sort();
        importedTasks.push({
          ...first,
          id: seriesId!,
          recurrenceTemplate: true,
          occurrenceDate: undefined,
          recurrenceCursor: dates.at(-1),
          status: 'pending',
          completedAt: undefined,
          totalPausedSeconds: 0,
          reminderAttemptsShown: 0,
        });
      }
    }

    return {
      tasks: importedTasks,
      errors,
      importedCount: importedTasks.filter((task) => !task.recurrenceTemplate).length,
      skippedCount: parsed.data.length - importedIds.size,
    };
  }

  private validateTaskRow(row: RawCsvRow, rowNumber: number): string[] {
    const errors: string[] = [];
    const rule = this.rowRecurrence(row);
    const series = this.text(row['recurrenceSeriesId']);
    const date = this.text(row['occurrenceDate']);
    const templateText = this.text(row['recurrenceTemplate']);
    if (templateText && !['true', 'false'].includes(templateText))
      errors.push(`Row ${rowNumber}: recurrenceTemplate must be true or false.`);
    const template = templateText === 'true';
    if (rule) errors.push(...recurrenceErrors(rule).map((error) => `Row ${rowNumber}: ${error}`));
    if ((rule || date || template) && !series)
      errors.push(`Row ${rowNumber}: recurrenceSeriesId is required.`);
    if (series && !template && !date) errors.push(`Row ${rowNumber}: occurrenceDate is required.`);
    if (date && !isCalendarDate(date))
      errors.push(`Row ${rowNumber}: occurrenceDate must be YYYY-MM-DD.`);
    if (template && date) errors.push(`Row ${rowNumber}: Templates cannot have an occurrenceDate.`);
    const cursor = this.text(row['recurrenceCursor']);
    if (cursor && (!template || !isCalendarDate(cursor)))
      errors.push(
        `Row ${rowNumber}: recurrenceCursor requires a template and a valid calendar date.`,
      );
    if (
      !rule &&
      ['recurrenceDays', 'recurrenceStartDate', 'recurrenceEndDate'].some((key) =>
        this.text(row[key]),
      )
    )
      errors.push(`Row ${rowNumber}: recurrenceType is required for repeat settings.`);
    const name = this.text(row['name']);
    const reminderAt = this.text(row['reminderAt']);
    const reminderCount = this.integer(row['reminderCount']);
    const reminderInterval = this.integer(row['reminderIntervalMinutes']);
    const statusText = this.text(row['status']);
    const concurrentStartText = this.text(row['allowConcurrentStart']).toLowerCase();
    const reminderEnabledText = this.text(row['reminderEnabled']).toLowerCase();
    const reminderEnabled = this.boolean(row['reminderEnabled']) !== false;
    const deadlineAt = this.text(row['deadlineAt']);
    const deadlineMessage = this.text(row['deadlineMessage']);

    if (!name) {
      errors.push(`Row ${rowNumber}: Task name is required.`);
    }

    if ((reminderEnabled || reminderAt) && !this.isIsoDate(reminderAt)) {
      errors.push(`Row ${rowNumber}: reminderAt must be a valid date/time.`);
    }

    if (
      reminderEnabled &&
      (!Number.isInteger(reminderCount) || reminderCount < 1 || reminderCount > 20)
    ) {
      errors.push(`Row ${rowNumber}: reminderCount must be between 1 and 20.`);
    }

    if (
      reminderEnabled &&
      (!Number.isInteger(reminderInterval) || reminderInterval < 1 || reminderInterval > 240)
    ) {
      errors.push(`Row ${rowNumber}: reminderIntervalMinutes must be between 1 and 240.`);
    }

    if (statusText && !VALID_STATUSES.includes(statusText as TaskStatus)) {
      errors.push(`Row ${rowNumber}: status must be pending, active, paused, or completed.`);
    }

    if (concurrentStartText && concurrentStartText !== 'true' && concurrentStartText !== 'false') {
      errors.push(`Row ${rowNumber}: allowConcurrentStart must be true or false.`);
    }

    if (reminderEnabledText && reminderEnabledText !== 'true' && reminderEnabledText !== 'false') {
      errors.push(`Row ${rowNumber}: reminderEnabled must be true or false.`);
    }

    if (deadlineAt) {
      if (!this.isIsoDate(deadlineAt)) {
        errors.push(`Row ${rowNumber}: deadlineAt must be a valid date/time.`);
      } else if (
        this.isIsoDate(reminderAt) &&
        new Date(deadlineAt).getTime() <= new Date(reminderAt).getTime()
      ) {
        errors.push(`Row ${rowNumber}: deadlineAt must be later than reminderAt.`);
      }

      if (!deadlineMessage) {
        errors.push(`Row ${rowNumber}: deadlineMessage is required when deadlineAt is present.`);
      }
    } else if (deadlineMessage) {
      errors.push(`Row ${rowNumber}: deadlineAt is required when deadlineMessage is present.`);
    }

    if (deadlineMessage.length > 240) {
      errors.push(`Row ${rowNumber}: deadlineMessage cannot be more than 240 characters.`);
    }

    return errors;
  }

  private text(value: string | undefined): string {
    return value?.trim() ?? '';
  }

  private rowRecurrence(row: RawCsvRow): RecurrenceRule | undefined {
    const type = this.text(row['recurrenceType']);
    if (!type) return undefined;
    const days = this.text(row['recurrenceDays']);
    return {
      type: type as RecurrenceRule['type'],
      daysOfWeek: days
        ? days.split(';').map((value) => (value.trim() ? Number(value) : NaN))
        : undefined,
      rangeStart: this.text(row['recurrenceStartDate']),
      rangeEnd: this.text(row['recurrenceEndDate']) || undefined,
    };
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

  private boolean(value: string | undefined): boolean | undefined {
    const normalized = this.text(value).toLowerCase();
    if (!normalized) {
      return undefined;
    }

    return normalized === 'true';
  }

  private optionalIso(value: string | undefined): string | undefined {
    const text = this.text(value);
    return this.isIsoDate(text) ? new Date(text).toISOString() : undefined;
  }

  private isIsoDate(value: string): boolean {
    return Boolean(value && !Number.isNaN(new Date(value).getTime()));
  }

  private formatDateTime(value: string | undefined, format: string): string {
    if (!value) {
      return '';
    }

    if (format !== 'yyyy-MM-dd HH:mm') {
      return value;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const year = date.getFullYear();
    const month = this.pad(date.getMonth() + 1);
    const day = this.pad(date.getDate());
    const hours = this.pad(date.getHours());
    const minutes = this.pad(date.getMinutes());
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
