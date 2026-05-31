import { Injectable, inject, signal } from '@angular/core';
import { AppSettings, DEFAULT_APP_SETTINGS } from '../models/app-settings';
import { SettingsRepository } from '../repositories/settings.repository';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly repository = inject(SettingsRepository);
  readonly settings = signal<AppSettings>(DEFAULT_APP_SETTINGS);

  async load(): Promise<void> {
    this.settings.set(await this.repository.get());
  }

  async update(changes: Partial<AppSettings>): Promise<void> {
    const nextSettings: AppSettings = { ...this.settings(), ...changes };
    this.settings.set(nextSettings);
    await this.repository.save(nextSettings);
  }

  async reset(): Promise<void> {
    this.settings.set(DEFAULT_APP_SETTINGS);
    await this.repository.save(DEFAULT_APP_SETTINGS);
  }
}
