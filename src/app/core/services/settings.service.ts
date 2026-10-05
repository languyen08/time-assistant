import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { AppSettings, DEFAULT_APP_SETTINGS } from '../models/app-settings';
import { SettingsRepository } from '../repositories/settings.repository';
import { toFriendlyErrorMessage } from '../utils/error-message.util';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly repository = inject(SettingsRepository);
  readonly settings = signal<AppSettings>(DEFAULT_APP_SETTINGS);
  readonly errorMessage = signal('');

  // Reuse task synchronization's invalidation channel; IndexedDB remains authoritative.
  private readonly channel =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel('friendly-task-reminder');

  constructor() {
    this.channel?.addEventListener('message', (event: MessageEvent<string>) => {
      if (event.data === 'settings-changed') {
        void this.load().catch(() => undefined); // load exposes the friendly storage error.
      }
    });
    inject(DestroyRef).onDestroy(() => this.channel?.close());
  }

  async load(): Promise<void> {
    try {
      this.settings.set(await this.repository.get());
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(
        toFriendlyErrorMessage(error, 'Settings could not be loaded from local storage.'),
      );
      throw error;
    }
  }

  async update(changes: Partial<AppSettings>): Promise<void> {
    const nextSettings: AppSettings = { ...this.settings(), ...changes };
    try {
      await this.repository.save(nextSettings);
      this.settings.set(nextSettings);
      this.channel?.postMessage('settings-changed');
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'Settings could not be saved.'));
      throw error;
    }
  }

  async reset(): Promise<void> {
    try {
      await this.repository.save(DEFAULT_APP_SETTINGS);
      this.settings.set(DEFAULT_APP_SETTINGS);
      this.channel?.postMessage('settings-changed');
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'Settings could not be reset.'));
      throw error;
    }
  }
}
