import { Injectable, computed, signal } from '@angular/core';
import type { BreakState } from './break.service';
import { createId } from '../utils/date-time.util';

const BREAK_CHANNEL_NAME = 'friendly-task-reminder-break';

type BreakCoordinationMessage =
  | { type: 'request-state'; requesterId: string }
  | {
      type: 'state';
      sourceId: string;
      sessionId: string;
      state: BreakState;
      endsAt?: string;
    }
  | { type: 'release'; sourceId: string };

export interface BreakCoordinationSession {
  sessionId: string;
  endsAt?: string;
}

interface CoordinatedSourceState {
  sessionId: string;
  state: BreakState;
}

interface RetainedRunningBreak {
  sessionId: string;
  endsAt: string;
}

function isBreakState(value: unknown): value is BreakState {
  return value === 'idle' || value === 'prompt' || value === 'running' || value === 'complete';
}

function isMessage(value: unknown): value is BreakCoordinationMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<BreakCoordinationMessage>;
  if (candidate.type === 'request-state') {
    return typeof candidate.requesterId === 'string';
  }

  if (candidate.type === 'release') {
    return typeof candidate.sourceId === 'string';
  }

  return (
    candidate.type === 'state' &&
    typeof candidate.sourceId === 'string' &&
    typeof candidate.sessionId === 'string' &&
    (candidate.endsAt === undefined || typeof candidate.endsAt === 'string') &&
    isBreakState(candidate.state)
  );
}

@Injectable({ providedIn: 'root' })
export class BreakCoordinationService {
  private readonly sourceStates = signal<Record<string, CoordinatedSourceState>>({});
  private readonly retainedRunningBreaks = signal<Record<string, RetainedRunningBreak>>({});
  private readonly listeners = new Set<() => void>();
  private channel: BroadcastChannel | undefined;
  private role: 'visible' | 'scheduler' | undefined;
  private sourceId: string | undefined;
  private localState: BreakState = 'idle';
  private localSession: BreakCoordinationSession = { sessionId: '' };
  private expiryTimerId: number | undefined;

  readonly blocked = computed(
    () =>
      Object.values(this.sourceStates()).some(
        ({ state }) => state === 'prompt' || state === 'running',
      ) || Object.keys(this.retainedRunningBreaks()).length > 0,
  );

  startVisible(initialState: BreakState, session: BreakCoordinationSession): void {
    if (this.role) {
      return;
    }

    this.role = 'visible';
    this.sourceId = createId('break-source');
    this.localState = initialState;
    this.localSession = session;
    this.openChannel();
    this.publish(initialState, session);
  }

  startScheduler(): void {
    if (this.role) {
      return;
    }

    this.role = 'scheduler';
    this.sourceId = createId('break-scheduler');
    this.openChannel();
    this.channel?.postMessage({
      type: 'request-state',
      requesterId: this.sourceId,
    } satisfies BreakCoordinationMessage);
  }

  publish(state: BreakState, session: BreakCoordinationSession): void {
    this.localState = state;
    this.localSession = session;
    if (this.role !== 'visible' || !this.sourceId) {
      return;
    }

    this.channel?.postMessage({
      type: 'state',
      sourceId: this.sourceId,
      sessionId: session.sessionId,
      state,
      endsAt: session.endsAt,
    } satisfies BreakCoordinationMessage);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stop(): void {
    if (this.role === 'visible' && this.sourceId) {
      this.channel?.postMessage({
        type: 'release',
        sourceId: this.sourceId,
      } satisfies BreakCoordinationMessage);
    }

    this.channel?.close();
    if (this.expiryTimerId !== undefined) {
      window.clearTimeout(this.expiryTimerId);
      this.expiryTimerId = undefined;
    }
    this.channel = undefined;
    this.role = undefined;
    this.sourceId = undefined;
    this.sourceStates.set({});
    this.retainedRunningBreaks.set({});
    this.listeners.clear();
  }

  private openChannel(): void {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }

    this.channel = new BroadcastChannel(BREAK_CHANNEL_NAME);
    this.channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      this.handleMessage(event.data);
    });
  }

  private handleMessage(message: unknown): void {
    if (!isMessage(message)) {
      return;
    }

    if (message.type === 'request-state') {
      if (this.role === 'visible') {
        this.publish(this.localState, this.localSession);
      }
      return;
    }

    if (this.role !== 'scheduler') {
      return;
    }

    const wasBlocked = this.blocked();
    if (message.type === 'state') {
      const endsAt = message.endsAt ? new Date(message.endsAt).getTime() : Number.NaN;
      if (message.state === 'running' && Number.isFinite(endsAt) && endsAt > Date.now()) {
        this.retainedRunningBreaks.update((breaks) => ({
          ...breaks,
          [message.sessionId]: {
            sessionId: message.sessionId,
            endsAt: message.endsAt as string,
          },
        }));
        this.sourceStates.update((states) => ({
          ...states,
          [message.sourceId]: { sessionId: message.sessionId, state: message.state },
        }));
        this.scheduleNextExpiry();
      } else {
        if (message.state !== 'prompt') {
          this.clearRetainedSession(message.sessionId);
        }
        const normalizedState = message.state === 'running' ? 'complete' : message.state;
        this.sourceStates.update((states) => {
          const updated = Object.fromEntries(
            Object.entries(states).map(([sourceId, sourceState]) => [
              sourceId,
              message.state !== 'prompt' && sourceState.sessionId === message.sessionId
                ? { ...sourceState, state: normalizedState }
                : sourceState,
            ]),
          );
          return {
            ...updated,
            [message.sourceId]: {
              sessionId: message.sessionId,
              state: normalizedState,
            },
          };
        });
      }
    } else {
      this.sourceStates.update((states) => {
        const updated = { ...states };
        delete updated[message.sourceId];
        return updated;
      });
    }

    if (wasBlocked !== this.blocked()) {
      this.notifyListeners();
    }
  }

  private clearRetainedSession(sessionId: string): void {
    if (!this.retainedRunningBreaks()[sessionId]) {
      return;
    }

    this.retainedRunningBreaks.update((breaks) => {
      const updated = { ...breaks };
      delete updated[sessionId];
      return updated;
    });
    this.scheduleNextExpiry();
  }

  private scheduleNextExpiry(): void {
    if (this.expiryTimerId !== undefined) {
      window.clearTimeout(this.expiryTimerId);
      this.expiryTimerId = undefined;
    }

    const nextExpiry = Object.values(this.retainedRunningBreaks()).reduce(
      (earliest, retainedBreak) => Math.min(earliest, new Date(retainedBreak.endsAt).getTime()),
      Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(nextExpiry)) {
      return;
    }

    this.expiryTimerId = window.setTimeout(
      () => this.expireRunningBreaks(),
      Math.max(0, nextExpiry - Date.now()),
    );
  }

  private expireRunningBreaks(): void {
    this.expiryTimerId = undefined;
    const now = Date.now();
    const expiredSessionIds = new Set(
      Object.values(this.retainedRunningBreaks())
        .filter((retainedBreak) => new Date(retainedBreak.endsAt).getTime() <= now)
        .map((retainedBreak) => retainedBreak.sessionId),
    );
    if (expiredSessionIds.size === 0) {
      this.scheduleNextExpiry();
      return;
    }

    const wasBlocked = this.blocked();
    this.retainedRunningBreaks.update((breaks) =>
      Object.fromEntries(
        Object.entries(breaks).filter(([sessionId]) => !expiredSessionIds.has(sessionId)),
      ),
    );
    this.sourceStates.update((states) =>
      Object.fromEntries(
        Object.entries(states).map(([sourceId, sourceState]) => [
          sourceId,
          expiredSessionIds.has(sourceState.sessionId) && sourceState.state === 'running'
            ? { ...sourceState, state: 'complete' as const }
            : sourceState,
        ]),
      ),
    );
    this.scheduleNextExpiry();
    if (wasBlocked !== this.blocked()) {
      this.notifyListeners();
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
