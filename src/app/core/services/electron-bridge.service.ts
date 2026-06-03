import { Injectable } from '@angular/core';
import { StickyNoteColor } from '../models/app-settings';
import {
  FileDialogFilter,
  FileOpenResult,
  FileSaveResult,
  StickyResizeReason,
} from '../models/electron-api';
import '../models/electron-api';

@Injectable({ providedIn: 'root' })
export class ElectronBridgeService {
  get isElectron(): boolean {
    return Boolean(window.assistantTime);
  }

  closeApp(): Promise<boolean> {
    return window.assistantTime?.closeApp() ?? Promise.resolve(false);
  }

  closeMainWindow(): Promise<boolean> {
    return window.assistantTime?.closeMainWindow?.() ?? Promise.resolve(false);
  }

  minimizeStickyWindow(): Promise<boolean> {
    return window.assistantTime?.minimizeStickyWindow() ?? Promise.resolve(false);
  }

  notify(title: string, body: string): Promise<boolean> {
    return window.assistantTime?.notify({ title, body }) ?? Promise.resolve(false);
  }

  openTextFile(): Promise<FileOpenResult> {
    return window.assistantTime?.openTextFile() ?? Promise.resolve({ ok: false, canceled: true });
  }

  setReminderOverlayState(active: boolean, stickyAlwaysOnTop: boolean): Promise<boolean> {
    return (
      window.assistantTime?.setReminderOverlayState({ active, stickyAlwaysOnTop }) ??
      Promise.resolve(false)
    );
  }

  saveTextFile(
    defaultPath: string,
    content: string,
    filters?: FileDialogFilter[],
  ): Promise<FileSaveResult> {
    return (
      window.assistantTime?.saveTextFile({ defaultPath, content, filters }) ??
      Promise.resolve({ ok: false, canceled: true })
    );
  }

  resizeStickyWindow(height: number, reason: StickyResizeReason): Promise<boolean> {
    return window.assistantTime?.resizeStickyWindow({ height, reason }) ?? Promise.resolve(false);
  }

  setStickyWindow(
    enabled: boolean,
    alwaysOnTop: boolean,
    color: StickyNoteColor,
  ): Promise<boolean> {
    return (
      window.assistantTime?.setStickyWindow({ enabled, alwaysOnTop, color }) ??
      Promise.resolve(false)
    );
  }

  focusMainWindow(): Promise<boolean> {
    return window.assistantTime?.focusMainWindow() ?? Promise.resolve(false);
  }
}
