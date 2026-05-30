const SECONDS_PER_MINUTE = 60;
const MILLIS_PER_SECOND = 1000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * SECONDS_PER_MINUTE * MILLIS_PER_SECOND);
}

export function addMinutesIso(isoDate: string, minutes: number): string {
  return addMinutes(new Date(isoDate), minutes).toISOString();
}

export function secondsBetween(startIso: string, end: Date): number {
  return Math.max(
    0,
    Math.floor((end.getTime() - new Date(startIso).getTime()) / MILLIS_PER_SECOND),
  );
}

export function secondsUntil(targetIso: string | undefined, now: Date): number {
  if (!targetIso) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((new Date(targetIso).getTime() - now.getTime()) / MILLIS_PER_SECOND),
  );
}

export function isDue(targetIso: string | undefined, now: Date): boolean {
  return Boolean(targetIso && new Date(targetIso).getTime() <= now.getTime());
}

export function toDatetimeLocalValue(date: Date): string {
  const offsetMillis = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMillis).toISOString().slice(0, 16);
}

export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
