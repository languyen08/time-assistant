export type AppTheme = 'light' | 'dark' | 'system';

export interface AppSettings {
  id: 'app';
  theme: AppTheme;
  defaultBreakMinutes: number;
  defaultReminderRepeatMinutes: number;
  defaultReminderCount: number;
  notificationSoundEnabled: boolean;
  notificationSoundId: string;
  stickyNoteEnabled: boolean;
  stickyNoteAlwaysOnTop: boolean;
  calendarIntegrationEnabled: boolean;
  csvDateTimeFormat: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'app',
  theme: 'system',
  defaultBreakMinutes: 10,
  defaultReminderRepeatMinutes: 5,
  defaultReminderCount: 3,
  notificationSoundEnabled: true,
  notificationSoundId: 'soft-chime',
  stickyNoteEnabled: false,
  stickyNoteAlwaysOnTop: true,
  calendarIntegrationEnabled: false,
  csvDateTimeFormat: "yyyy-MM-dd'T'HH:mm:ssxxx",
};
