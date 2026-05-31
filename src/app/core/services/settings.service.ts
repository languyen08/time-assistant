import { Injectable, inject, signal } from '@angular/core';
import { AppSettings, DEFAULT_APP_SETTINGS } from '../models/app-settings';
import { SettingsRepository } from '../repositories/settings.repository';
import { toFriendlyErrorMessage } from '../utils/error-message.util';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly repository = inject(SettingsRepository);
  readonly settings = signal<AppSettings>(DEFAULT_APP_SETTINGS);
  readonly errorMessage = signal('');

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
      this.settings.set(nextSettings);
      await this.repository.save(nextSettings);
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'Settings could not be saved.'));
      throw error;
    }
  }

  async reset(): Promise<void> {
    try {
      this.settings.set(DEFAULT_APP_SETTINGS);
      await this.repository.save(DEFAULT_APP_SETTINGS);
      this.errorMessage.set('');
    } catch (error) {
      this.errorMessage.set(toFriendlyErrorMessage(error, 'Settings could not be reset.'));
      throw error;
    }
  }
}
