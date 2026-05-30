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
}
