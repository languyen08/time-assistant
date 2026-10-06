import { RecurrenceRule, Task } from '../models/task';

export function localDate(date = new Date()): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(parseCalendarDate(value)) === value;
}

export function nextCalendarDay(value: string): string {
  const date = parseCalendarDate(value);
  date.setDate(date.getDate() + 1);
  return localDate(date);
}

export function recurrenceErrors(rule: RecurrenceRule): string[] {
  const errors: string[] = [];
  if (!['daily', 'weekdays', 'custom'].includes(rule.type)) errors.push('Invalid repeat mode.');
  if (!isCalendarDate(rule.rangeStart))
    errors.push('Repeat start date is required and must be valid.');
  if (rule.rangeEnd && (!isCalendarDate(rule.rangeEnd) || rule.rangeEnd < rule.rangeStart)) {
    errors.push('Repeat end date must be on or after the start date.');
  }
  if (
    rule.type === 'custom' &&
    (!rule.daysOfWeek?.length ||
      rule.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
  ) {
    errors.push('Select at least one valid weekday.');
  }
  return errors;
}

export function includesRecurrenceDate(rule: RecurrenceRule, value: string): boolean {
  if (!isCalendarDate(value) || value < rule.rangeStart || (rule.rangeEnd && value > rule.rangeEnd))
    return false;
  const day = parseCalendarDate(value).getDay();
  return (
    rule.type === 'daily' ||
    (rule.type === 'weekdays' ? day >= 1 && day <= 5 : Boolean(rule.daysOfWeek?.includes(day)))
  );
}

/** At most seven calendar steps; never walks missed dates or fixed 24-hour durations. */
export function nextOccurrenceDate(rule: RecurrenceRule, onOrAfter: string): string | undefined {
  if (recurrenceErrors(rule).length || !isCalendarDate(onOrAfter)) return undefined;
  let date = onOrAfter > rule.rangeStart ? onOrAfter : rule.rangeStart;
  for (let count = 0; count < 7; count++, date = nextCalendarDay(date)) {
    if (rule.rangeEnd && date > rule.rangeEnd) return undefined;
    if (includesRecurrenceDate(rule, date)) return date;
  }
  return undefined;
}

export function occurrenceId(seriesId: string, date: string): string {
  return `recurring:${seriesId}:${date}`;
}

/** Preserve local wall-clock time and calendar-day offset (including next-day Finish by). */
export function onOccurrenceDate(timestamp: string, date: string, anchorDate?: string): string {
  const source = new Date(timestamp);
  const target = parseCalendarDate(date);
  if (anchorDate) {
    const anchor = parseCalendarDate(anchorDate);
    const sourceDay = Date.UTC(source.getFullYear(), source.getMonth(), source.getDate());
    const anchorDay = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    target.setDate(target.getDate() + Math.round((sourceDay - anchorDay) / 86400000));
  }
  target.setHours(
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  );
  return target.toISOString();
}

export function makeOccurrence(template: Task, date: string, now = new Date()): Task {
  return {
    ...template,
    id: occurrenceId(template.recurrenceSeriesId!, date),
    recurrenceTemplate: undefined,
    recurrenceCursor: undefined,
    occurrenceDate: date,
    reminderAt: onOccurrenceDate(template.reminderAt, date),
    deadlineAt: template.deadlineAt
      ? onOccurrenceDate(template.deadlineAt, date, localDate(new Date(template.reminderAt)))
      : undefined,
    status: 'pending',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    activeStartedAt: undefined,
    pausedAt: undefined,
    pausedRemainingSeconds: undefined,
    completedAt: undefined,
    totalPausedSeconds: 0,
    reminderAttemptsShown: 0,
    nextReminderAt: undefined,
    pendingReminder: undefined,
    nextAutoStartAt: undefined,
    deadlineNotifiedAt: undefined,
    deadlineAcknowledgedAt: undefined,
  };
}
