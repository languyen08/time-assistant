import { Injectable, inject } from '@angular/core';
import { AppSettings, DEFAULT_APP_SETTINGS } from '../models/app-settings';
import { IndexedDbStorageAdapter } from '../storage/indexed-db-storage.adapter';

const SETTINGS_STORE = 'settings';

@Injectable({ providedIn: 'root' })
export class SettingsRepository {
  private readonly storage = inject(IndexedDbStorageAdapter);

  async get(): Promise<AppSettings> {
    const settings = await this.storage.get<AppSettings>(SETTINGS_STORE, DEFAULT_APP_SETTINGS.id);
    if (settings) {
      return settings;
    }

    await this.save(DEFAULT_APP_SETTINGS);
    return DEFAULT_APP_SETTINGS;
  }

  save(settings: AppSettings): Promise<void> {
    return this.storage.put(SETTINGS_STORE, settings);
  }
}
