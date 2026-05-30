import { Injectable } from '@angular/core';
import '../models/electron-api';

@Injectable({ providedIn: 'root' })
export class ElectronBridgeService {
  get isElectron(): boolean {
    return Boolean(window.assistantTime);
  }

  notify(title: string, body: string): Promise<boolean> {
    return window.assistantTime?.notify({ title, body }) ?? Promise.resolve(false);
  }

  setStickyWindow(enabled: boolean, alwaysOnTop: boolean): Promise<boolean> {
    return (
      window.assistantTime?.setStickyWindow({ enabled, alwaysOnTop }) ?? Promise.resolve(false)
    );
  }

  focusMainWindow(): Promise<boolean> {
    return window.assistantTime?.focusMainWindow() ?? Promise.resolve(false);
  }
}
