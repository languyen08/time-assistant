# architecture.md

# Architecture

## Goal

Build a practical local-first Windows desktop app for friendly task transition reminders. The architecture should stay simple enough for an MVP while still allowing later sync, mobile companion, and calendar integration.

## Pinned Tech Stack

Verified for this repo. Do not use `latest`, `^`, or `~` in package files.

| Area | Choice | Version |
|---|---:|---:|
| Runtime | Node.js Current | 26.2.0 |
| Package manager | npm | 11.16.0 |
| Frontend | Angular | 21.2.15 |
| Angular CLI | `@angular/cli` | 21.2.13 |
| Language | TypeScript | 5.9.3 |
| Desktop shell | Electron | 42.3.0 |
| Electron Builder | `electron-builder` | 26.8.1 |
| Charts | Chart.js | 4.5.1 |
| Angular charts wrapper | ng2-charts | 8.0.0 |
| CSV parsing | Papa Parse | 5.5.3 |
| Testing | Vitest | 4.1.7 |
| E2E testing | Playwright | 1.60.0 |

Packaging and release use Electron Builder exclusively; see accepted ADR-012. The canonical commands are `npm run package:dir` for an unpacked application, `npm run package:win` for the portable Windows executable used by the release workflow, and `npm run package:installer` for an NSIS installer. Electron Forge configuration and dependencies have been removed.

## High-Level Architecture

```txt
Angular renderer(s)
  |- standalone root UI and Angular services
  |- TimerService and ReminderSchedulerService per renderer
  |- repositories -> IndexedDB v2
  `- BroadcastChannel for task-change synchronization only

Electron preload
  `- narrow window.assistantTime IPC bridge

Electron main
  |- main, sticky-note, and user-guide windows
  |- native desktop notifications
  |- open/save file dialogs
  `- sticky-window controls
```

Electron main does not currently own timer or reminder scheduling.


## Angular + Electron Desktop Model

This is not a browser-only web app.

Angular is the UI layer. It renders the screens, forms, sticky-note view, charts, settings, and reminder overlays.

Electron is the desktop shell. It loads the Angular build into desktop windows and provides native notifications, file dialogs, and window controls.

```txt
Angular UI
  -> built static assets
  -> loaded by Electron BrowserWindow
  -> packaged as Windows desktop app
```

The user should launch the app as a normal desktop executable, not by opening a browser or visiting a localhost URL.

Why Electron fits this MVP:

- Mature support for desktop windows and multiple `BrowserWindow` instances.
- Simple always-on-top sticky-note window.
- Allows tray and background behavior as a future capability, but neither is implemented now.
- Straightforward desktop notifications and sound playback.
- Easy CSV file import/export through native file dialogs.
- Allows Angular to stay focused on UI while Electron handles desktop behavior.

Security defaults:

- Keep `contextIsolation: true`.
- Keep `nodeIntegration: false` in Angular renderer windows.
- Expose only narrow APIs through preload scripts.
- Validate IPC inputs in the main process.
- Do not expose unrestricted filesystem access to the renderer.

Current IPC surface:

- Preload exposes a narrow, named API under `window.assistantTime`.
- Main-process IPC handlers validate payload shape before use.
- Renderer keeps `contextIsolation: true` and `nodeIntegration: false`.
- Main, sticky, and user-guide renderers are sandboxed.
- File system access is limited to explicit open/save dialog flows.
- Exposed operations cover closing/focusing windows, sticky-window state and size, notifications, the user guide, and CSV-oriented text file dialogs.

## Frontend

Use Angular `21.2.15`.

Current implementation:

- A large standalone root component/template implements most screens and flows.
- `core/` contains models, repositories, storage, utilities, and business services.
- `shared/` contains a small shared task-action component.
- `app.routes.ts` exists but contains no meaningful routes.

The following remains a possible future organizational direction, not a description of the current tree:

```txt
src/app/
  core/
    models/
    services/
    storage/
  features/
    tasks/
    reminders/
    sticky-note/
    history/
    charts/
    settings/
    import-export/
  shared/
    components/
    pipes/
    utils/
```

Frontend responsibilities:

- Render task list, active task, forms, reminders, settings, and charts.
- Keep UI state predictable and simple.
- Use Angular services for business logic.
- Avoid global state libraries unless complexity clearly requires them.
- Keep components focused and small.

## Desktop Shell

Use Electron `42.3.0`.

Electron responsibilities:

- Package the Windows desktop app.
- Provide native desktop notifications.
- Provide file picker and save dialog for CSV import/export.
- Support sticky-note window.
- Support always-on-top for sticky-note mode.
- Provide local filesystem access only where needed.
- Keep native commands minimal.

Current windows:

1. Sticky-note window: created at Electron startup; compact and optionally always-on-top.
2. Main application window: created on demand through the focus-main-window IPC flow.
3. User-guide window: created on demand and loads the local HTML guide.

Current background behavior:

- No tray is implemented.
- No independent main-process timer or reminder scheduler is implemented.
- Closing all windows exits the app on Windows.

## Local Storage

Local-first MVP.

Current storage:

- IndexedDB through a local storage adapter in Angular repositories.

Deferred option:

- SQLite can be reconsidered later if IndexedDB constraints become a blocker.

Actual IndexedDB stores:

```txt
tasks
settings
history
```

Persisted state:

- Task records include active/paused timing fields, next-reminder state, and reminder attempt count.
- Settings and history events are stored in their own stores.

Runtime-only or conceptual state:

- `TaskRun` and `Reminder` models exist as domain concepts but do not have dedicated stores.
- Break sessions are held in Angular memory and are lost when their renderer exits or reloads.
- Friendly message templates are constants, not persisted entities.

Storage rules:

- All user data is local by default.
- No account required.
- No server required.
- Keep schema simple.
- Add migrations only when schema changes are needed.

Current schema status:

- IndexedDB database version is `2`.
- `v1` creates `tasks`, `settings`, and `history` stores.
- `v2` adds non-destructive indexes for common reads (`tasks_by_order`, `tasks_by_status`, `tasks_by_next_reminder_at`, `history_by_occurred_at`, `history_by_type`).

## Notification Flow

Reminder flow:

```txt
Task started
  -> TimerService tracks active task
  -> ReminderService schedules reminder
  -> Reminder time reached
  -> NotificationService shows desktop notification
  -> App shows friendly in-app overlay if open
  -> User chooses action
      -> add more time
      -> pause task
      -> complete task
      -> dismiss if supported
  -> HistoryService records action
```

Notification design:

- Desktop notification is default.
- In-app overlay improves visibility.
- Sound should be soft and configurable.
- Do not spam notifications.
- Respect reminder repeat count and interval.

## Multi-Window Synchronization

Current implementation:

- Every Angular renderer initializes its own `TimerService` and `ReminderSchedulerService`.
- Task mutations broadcast `tasks-changed` through `BroadcastChannel`, causing other renderers to reload tasks from IndexedDB.
- Settings, loaded history, break state, and active reminder-overlay state do not have comprehensive cross-window synchronization.

Known limitation / technical debt:

- Main and sticky renderers can observe the same due reminder and independently process it. This creates a potential duplicate reminder/history/notification race.
- Reminder ownership must be decided before the architecture can claim reliable multi-window scheduling.
- This document records the current limitation; it does not prescribe the eventual fix.

## Break Flow

```txt
Task completed
  -> History event saved
  -> App asks whether to take a break
  -> Default break duration is loaded from settings
  -> User starts, changes, or skips break
  -> Break session is logged
  -> After break, ask whether to start next task
```

Default break duration: 10 minutes.

Break history events are persisted, but the live break countdown/session is memory-only and does not survive renderer shutdown or reload.

## Settings

Settings are stored locally.

Current persisted settings model:

```ts
type AppSettings = {
  id: 'app';
  defaultBreakMinutes: number;
  defaultReminderRepeatMinutes: number;
  defaultReminderCount: number;
  notificationSoundEnabled: boolean;
  notificationSoundId: string;
  stickyNoteEnabled: boolean;
  stickyNoteAlwaysOnTop: boolean;
  stickyNoteColor: 'yellow' | 'green' | 'pink' | 'purple' | 'blue' | 'gray';
  stickyVisibleNotes: number;
  csvDateTimeFormat: string;
};
```

Settings should be loaded at startup and cached by `SettingsService`.

Theme selection and persistence are target behavior but are not fields in the current settings model. Privacy/local-data controls are also not implemented.

## Calendar Integration

Calendar integration is Phase 4, not required for the first MVP.

Current approach:

- Calendar integration is deferred after review.
- Do not expose calendar OAuth or token APIs in the current MVP.
- Revisit calendar only after the core desktop workflow is comfortable.
- Any future OAuth or cloud calendar work requires a fresh ADR.

## Sync Strategy

MVP sync strategy:

- Manual CSV export/import.
- Optional settings export/import later.
- User controls files.

Later strategy:

- Local encrypted backup folder.
- WebDAV or iCloud/OneDrive/Google Drive folder sync.
- Mobile push notifications only after desktop MVP works well.
- Cloud sync requires explicit approval and a new ADR.

## Phase-Based Implementation

Historical phases remain documented in `todos.md`, but implementation did not remain strictly sequential.

Rules:

- Use source reality, accepted ADRs, and the corrected **Current Reconciliation / Stabilization** section to select the next task.
- Verify historical checkboxes before relying on them.
- Keep changes small and reviewable.
- Update checkboxes only when implementation and required validation support them.
- Keep architecture changes small.
- Add ADR entries for major architecture changes.

## Why This Is Simple Enough for MVP

This architecture is simple because:

- One desktop app.
- One Angular frontend.
- One local storage layer.
- No required backend.
- No account system.
- No real-time sync.
- Native functionality is limited to notifications, file access, and window controls.
- CSV handles early cross-device sharing without server complexity.

The app can become more advanced later, but the MVP should prove the task transition workflow first.
