import { addMinutes, formatDuration, isDue, secondsBetween, secondsUntil } from './date-time.util';

describe('date-time utilities', () => {
  it('adds minutes without mutating the original date', () => {
    const start = new Date('2026-05-30T10:00:00.000Z');

    expect(addMinutes(start, 15).toISOString()).toBe('2026-05-30T10:15:00.000Z');
    expect(start.toISOString()).toBe('2026-05-30T10:00:00.000Z');
  });

  it('calculates elapsed and remaining seconds', () => {
    const now = new Date('2026-05-30T10:01:30.000Z');

    expect(secondsBetween('2026-05-30T10:00:00.000Z', now)).toBe(90);
    expect(secondsUntil('2026-05-30T10:03:00.000Z', now)).toBe(90);
  });

  it('detects due reminder times', () => {
    const now = new Date('2026-05-30T10:00:00.000Z');

    expect(isDue('2026-05-30T09:59:59.000Z', now)).toBe(true);
    expect(isDue('2026-05-30T10:00:01.000Z', now)).toBe(false);
  });

  it('formats durations consistently', () => {
    expect(formatDuration(5)).toBe('00:05');
    expect(formatDuration(3600)).toBe('1h 00m');
  });
});
