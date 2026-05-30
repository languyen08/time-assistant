import { Injectable } from '@angular/core';
import { FileOpenResult, FileSaveResult } from '../models/electron-api';
import '../models/electron-api';

@Injectable({ providedIn: 'root' })
export class ElectronBridgeService {
  get isElectron(): boolean {
    return Boolean(window.assistantTime);
  }

  notify(title: string, body: string): Promise<boolean> {
    return window.assistantTime?.notify({ title, body }) ?? Promise.resolve(false);
  }

  openTextFile(): Promise<FileOpenResult> {
    return window.assistantTime?.openTextFile() ?? Promise.resolve({ ok: false, canceled: true });
  }

  saveTextFile(defaultPath: string, content: string): Promise<FileSaveResult> {
    return (
      window.assistantTime?.saveTextFile({ defaultPath, content }) ??
      Promise.resolve({ ok: false, canceled: true })
    );
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
