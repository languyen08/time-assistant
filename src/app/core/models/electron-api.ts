import { StickyNoteColor } from './app-settings';

export type ReminderPresenter = 'main' | 'sticky' | 'none';

export interface AssistantTimeApi {
  platform: string;
  closeMainWindow?: () => Promise<boolean>;
  focusMainWindow: () => Promise<boolean>;
  getReminderPresenter?: () => Promise<ReminderPresenter>;
  getMainWindowMaximized?: () => Promise<boolean>;
  getStartAtLogin?: () => Promise<boolean>;
  hideStickyWindow?: () => Promise<boolean>;
  minimizeStickyWindow: () => Promise<boolean>;
  notify: (payload: { title: string; body: string }) => Promise<boolean>;
  openUserGuide?: () => Promise<boolean>;
  openTextFile: () => Promise<FileOpenResult>;
  setReminderOverlayState: (payload: {
    active: boolean;
    stickyAlwaysOnTop: boolean;
  }) => Promise<boolean>;
  saveTextFile: (payload: {
    defaultPath: string;
    content: string;
    filters?: FileDialogFilter[];
  }) => Promise<FileSaveResult>;
  resizeStickyWindow: (payload: { height: number; reason: StickyResizeReason }) => Promise<boolean>;
  setStartAtLogin?: (enabled: boolean) => Promise<boolean>;
  setStickyWindow: (options: {
    enabled: boolean;
    alwaysOnTop: boolean;
    color: StickyNoteColor;
  }) => Promise<boolean>;
  toggleMainWindowMaximized?: () => Promise<boolean>;
  onMainWindowMaximizedChanged?: (callback: (maximized: boolean) => void) => () => void;
  onReminderPresenterChanged?: (callback: (presenter: ReminderPresenter) => void) => () => void;
}

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export type StickyResizeReason =
  | 'content-change'
  | 'task-count-change'
  | 'active-task-change'
  | 'settings-note-count-change'
  | 'initial-open'
  | 'task-content-change'
  | 'reminder-opened'
  | 'reminder-closed'
  | 'color-change';

export interface FileOpenResult {
  ok: boolean;
  canceled: boolean;
  filePath?: string;
  content?: string;
  error?: string;
}

export interface FileSaveResult {
  ok: boolean;
  canceled: boolean;
  filePath?: string;
  error?: string;
}

declare global {
  interface Window {
    assistantTime?: AssistantTimeApi;
  }
}

export {};
