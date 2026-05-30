export interface AssistantTimeApi {
  platform: string;
  focusMainWindow: () => Promise<boolean>;
  notify: (payload: { title: string; body: string }) => Promise<boolean>;
  setStickyWindow: (options: { enabled: boolean; alwaysOnTop: boolean }) => Promise<boolean>;
}

declare global {
  interface Window {
    assistantTime?: AssistantTimeApi;
  }
}

export {};
