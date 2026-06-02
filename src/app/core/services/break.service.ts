import { Injectable, computed, inject, signal } from '@angular/core';
import { toFriendlyErrorMessage } from '../utils/error-message.util';
import { createId, nowIso } from '../utils/date-time.util';
import { HistoryService } from './history.service';
import { NotificationService } from './notification.service';
import { SettingsService } from './settings.service';

export type BreakState = 'idle' | 'prompt' | 'running' | 'complete';

export interface BreakSession {
  id: string;
  startedAt?: string;
  durationMinutes: number;
  remainingSeconds: number;
  state: BreakState;
}

@Injectable({ providedIn: 'root' })
export class BreakService {
  private readonly history = inject(HistoryService);
  private readonly notifications = inject(NotificationService);
  private readonly settings = inject(SettingsService);
  readonly session = signal<BreakSession>({
    id: createId('break'),
    durationMinutes: 10,
    remainingSeconds: 600,
    state: 'idle',
  });
  readonly state = computed(() => this.session().state);
  readonly errorMessage = signal('');
  private intervalId: number | undefined;

  prompt(defaultMinutes: number): void {
    this.stopTimer();
    this.session.set({
      id: createId('break'),
      durationMinutes: defaultMinutes,
      remainingSeconds: defaultMinutes * 60,
      state: 'prompt',
    });
  }

  async start(durationMinutes: number): Promise<void> {
    const safeMinutes = Math.max(1, Math.floor(durationMinutes));
    this.stopTimer();
    this.session.set({
      id: this.session().id,
      startedAt: nowIso(),
      durationMinutes: safeMinutes,
      remainingSeconds: safeMinutes * 60,
      state: 'running',
    });
    try {
      await this.history.record(
        'break_started',
        `Started a ${safeMinutes} minute break.`,
        undefined,
        {
          minutes: safeMinutes,
        },
      );
      this.intervalId = window.setInterval(() => this.tick(), 1000);
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'Break could not be started.'));
    }
  }

  async skip(): Promise<void> {
    this.stopTimer();
    this.session.update((session) => ({ ...session, state: 'idle', remainingSeconds: 0 }));
    try {
      await this.history.record('break_skipped', 'Skipped the break.');
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'Break skip could not be saved.'));
    }
  }

  async stopEarly(): Promise<void> {
    this.stopTimer();
    this.session.update((session) => ({ ...session, state: 'idle', remainingSeconds: 0 }));
    try {
      await this.history.record('break_skipped', 'Break stopped early.');
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(
        toFriendlyErrorMessage(error, 'Break stop could not be saved.'),
      );
    }
  }

  async complete(): Promise<void> {
    this.stopTimer();
    this.session.update((session) => ({ ...session, state: 'complete', remainingSeconds: 0 }));
    try {
      await this.history.record('break_completed', 'Completed the break.');
      await this.notifications.showBreakComplete(this.settings.settings());
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'Break completion could not be saved.'));
    }
  }

  reset(): void {
    this.stopTimer();
    this.session.set({
      id: createId('break'),
      durationMinutes: 10,
      remainingSeconds: 600,
      state: 'idle',
    });
  }

  private tick(): void {
    const nextRemaining = Math.max(0, this.session().remainingSeconds - 1);
    this.session.update((session) => ({ ...session, remainingSeconds: nextRemaining }));
    if (nextRemaining === 0) {
      void this.complete();
    }
  }

  private stopTimer(): void {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
