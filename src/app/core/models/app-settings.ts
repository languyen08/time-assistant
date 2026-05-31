export type AppTheme = 'light' | 'dark' | 'system';
export type StickyNoteColor = 'yellow' | 'green' | 'pink' | 'purple' | 'blue' | 'gray';

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
  stickyNoteColor: StickyNoteColor;
  stickyVisibleNotes: number;
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
  stickyNoteColor: 'yellow',
  stickyVisibleNotes: 2,
  csvDateTimeFormat: "yyyy-MM-dd'T'HH:mm:ssxxx",
};
