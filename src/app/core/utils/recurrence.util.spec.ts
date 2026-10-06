import { RecurrenceRule } from '../models/task';
import {
  includesRecurrenceDate,
  isCalendarDate,
  localDate,
  nextCalendarDay,
  nextOccurrenceDate,
  occurrenceId,
  onOccurrenceDate,
  recurrenceErrors,
} from './recurrence.util';

describe('calendar recurrence', () => {
  const daily: RecurrenceRule = { type: 'daily', rangeStart: '2026-10-06', rangeEnd: '2026-10-09' };
  it('includes the start and end and stops afterward', () => {
    expect(nextOccurrenceDate(daily, '2026-10-01')).toBe('2026-10-06');
    expect(nextOccurrenceDate(daily, '2026-10-07')).toBe('2026-10-07');
    expect(nextOccurrenceDate(daily, '2026-10-09')).toBe('2026-10-09');
    expect(nextOccurrenceDate(daily, '2026-10-10')).toBeUndefined();
  });
  it('skips both weekend days', () => {
    const rule: RecurrenceRule = { type: 'weekdays', rangeStart: '2026-10-01' };
    expect(nextOccurrenceDate(rule, '2026-10-10')).toBe('2026-10-12');
    expect(nextOccurrenceDate(rule, '2026-10-11')).toBe('2026-10-12');
  });
  it('selects custom Monday, Wednesday, Friday', () => {
    const rule: RecurrenceRule = {
      type: 'custom',
      daysOfWeek: [1, 3, 5],
      rangeStart: '2026-10-06',
    };
    expect(nextOccurrenceDate(rule, '2026-10-06')).toBe('2026-10-07');
    expect(nextOccurrenceDate(rule, '2026-10-08')).toBe('2026-10-09');
    expect(nextOccurrenceDate(rule, '2026-10-10')).toBe('2026-10-12');
  });
  it('rejects empty/invalid weekdays and invalid ranges/dates', () => {
    expect(recurrenceErrors({ ...daily, type: 'custom', daysOfWeek: [] })).toHaveLength(1);
    expect(recurrenceErrors({ ...daily, type: 'custom', daysOfWeek: [7] })).toHaveLength(1);
    expect(recurrenceErrors({ ...daily, rangeEnd: '2026-10-05' })).toHaveLength(1);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-2-03')).toBe(false);
    expect(includesRecurrenceDate(daily, '2026-10-10')).toBe(false);
  });
  it('advances calendar dates through month/year and DST boundaries using setDate', () => {
    const setter = vi.spyOn(Date.prototype, 'setDate');
    expect(nextCalendarDay('2026-03-08')).toBe('2026-03-09');
    expect(nextCalendarDay('2026-12-31')).toBe('2027-01-01');
    expect(nextCalendarDay('2028-02-28')).toBe('2028-02-29');
    expect(setter).toHaveBeenCalled();
    setter.mockRestore();
  });
  it('uses deterministic series/date identity', () => {
    expect(occurrenceId('series_1', '2026-10-06')).toBe('recurring:series_1:2026-10-06');
  });
  it('preserves reminder wall clock and next-day Finish by', () => {
    const source = new Date(2026, 2, 7, 9, 30);
    const result = new Date(onOccurrenceDate(source.toISOString(), '2026-03-09'));
    expect(localDate(result)).toBe('2026-03-09');
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(30);
    const deadline = new Date(
      onOccurrenceDate(new Date(2026, 2, 8, 1, 15).toISOString(), '2026-03-09', '2026-03-07'),
    );
    expect(localDate(deadline)).toBe('2026-03-10');
    expect(deadline.getHours()).toBe(1);
  });
});
