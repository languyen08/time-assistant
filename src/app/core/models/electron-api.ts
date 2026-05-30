export interface AssistantTimeApi {
  platform: string;
  focusMainWindow: () => Promise<boolean>;
  notify: (payload: { title: string; body: string }) => Promise<boolean>;
  openTextFile: () => Promise<FileOpenResult>;
  saveTextFile: (payload: { defaultPath: string; content: string }) => Promise<FileSaveResult>;
  setStickyWindow: (options: { enabled: boolean; alwaysOnTop: boolean }) => Promise<boolean>;
}

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
