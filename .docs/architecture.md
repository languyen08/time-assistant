# architecture.md

# Architecture

## Goal

Build a practical local-first Windows desktop app for friendly task transition reminders. The architecture should stay simple enough for an MVP while still allowing later sync, mobile companion, and calendar integration.

## Pinned Tech Stack

Verified for this repo. Do not use `latest`, `^`, or `~` in package files.

| Area                   |             Choice | Version |
| ---------------------- | -----------------: | ------: |
| Runtime                |    Node.js Current |  26.2.0 |
| Package manager        |                npm | 11.16.0 |
| Frontend               |            Angular | 21.2.15 |
| Angular CLI            |     `@angular/cli` | 21.2.13 |
| Language               |         TypeScript |   5.9.3 |
| Desktop shell          |           Electron |  44.4.5 |
| Electron Builder       | `electron-builder` |  26.8.1 |
| Charts                 |           Chart.js |   4.5.1 |
| Angular charts wrapper |         ng2-charts |   8.0.0 |
| CSV parsing            |         Papa Parse |   5.5.3 |
| Testing                |             Vitest |   4.1.7 |
| E2E testing            |         Playwright |  1.60.0 |

Packaging and release use Electron Builder exclusively; see accepted ADR-012. `npm run package:win`
produces `release/Time Assistant.exe`, the sole user-facing Windows distribution artifact. The
unpacked `npm run package:dir` output is retained only for development, debugging, profiling, and
packaging diagnostics. No installable setup target or artifact is maintained. The portable target
still uses Electron Builder's internal NSIS compiler, templates, and resources; these are build
implementation dependencies, not an installable product. Electron Forge remains removed.

## High-Level Architecture

```txt
Angular renderers
  |- Main: full user interface
  |- Sticky: compact user interface
  |- Scheduler: hidden, authoritative owner for automatic task lifecycle scheduling
  |    |- AutomaticTaskSchedulerService -> TaskService -> IndexedDB
  |    |- DeadlineSchedulerService -> TaskService -> notify-only preload
  |    `- ReminderSchedulerService -> TaskService -> notify-only preload
  |- TimerService and persisted reminder presentation in Main and Sticky
  |- repositories -> shared IndexedDB v2 environment
  |- task-change BroadcastChannel
  `- break BroadcastChannel with source-qualified Main/Sticky state

Electron preload
  |- full narrow window.assistantTime bridge for Main and Sticky
  `- notify-only window.assistantTime bridge for Scheduler

Electron main
  |- main, sticky-note, hidden scheduler, and user-guide windows
  |- BrowserWindow maximize/restore and hide/show lifecycle
  |- native Tray lifecycle and context menu
  |- reminder presenter selection by Main/Sticky BrowserWindow existence
  |- native desktop notifications
  |- open/save file dialogs
  |- sticky-window controls
  `- Windows startup login-item control
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
- Provides an implemented native Tray so the process can remain available while windows are
  hidden or closed.
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
- Exposed operations cover closing/focusing windows, main-window maximize state and toggling,
  hiding and configuring the sticky window, sticky-window size, notifications, the user guide,
  CSV-oriented text file dialogs, reminder presenter query/change events, and get/set access to the
  Windows startup login item. Scheduler preload remains notify-only.

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

- Render task lists, active/paused task cards, forms, reminders, settings, and charts.
- Keep UI state predictable and simple.
- Use Angular services for business logic.
- Avoid global state libraries unless complexity clearly requires them.
- Keep components focused and small.

## Desktop Shell

Use Electron `44.4.5`.

Electron responsibilities:

- Package the Windows desktop app.
- Provide native desktop notifications.
- Provide file picker and save dialog for CSV import/export.
- Support sticky-note window.
- Support always-on-top for sticky-note mode.
- Own the native Tray, window show/hide/close behavior, and main-window maximize state.
- Own native Windows startup-at-login behavior.
- Provide local filesystem access only where needed.
- Keep native commands minimal.

Current windows:

1. Sticky-note window: created at Electron startup; compact and optionally always-on-top.
2. Main application window: created on demand through the focus-main-window IPC flow.
3. Scheduler window: created at Electron startup; hidden, non-focusable, absent from the taskbar,
   and retained for the Electron process lifetime. It uses the same Angular application, browser
   session, and IndexedDB environment with `window=scheduler`. It has a dedicated notify-only
   preload bridge and no user-facing UI.
4. User-guide window: created on demand and loads the local HTML guide.

Current background behavior:

- Electron main creates and retains a native Tray with Open Time Assistant, Show Sticky Note,
  and Quit actions.
- Sticky Note X hides the existing sticky BrowserWindow. Disabling Sticky Note in Settings
  remains the separate persistent action and destroys/closes that window.
- Main application X closes only that BrowserWindow; Sticky Note, Tray, and process state remain
  unchanged. Tray icon click restores/focuses Sticky Note only, while the explicit Open Time
  Assistant menu action opens/focuses Main without duplicating it. Tray Quit is the sole normal
  full shutdown path: it destroys Main, Sticky, Guide, Scheduler, and the Tray, then calls
  `app.quit()`.
- The Scheduler remains alive when Main closes, Sticky hides, or only the Tray remains. If it is
  lost unexpectedly, Electron recreates one owner through a guarded singleton recovery path;
  explicit shutdown suppresses recovery.
- Main-window Maximize/Restore flows through narrow preload IPC. Electron sends maximize and
  unmaximize state changes back to the main renderer so Angular does not infer native state.
- No independent main-process timer or reminder scheduler is implemented.
- Scheduler mode loads task and settings state. It does not start `TimerService`, presenter/window
  synchronization, or UI measurement observers. It starts `AutomaticTaskSchedulerService`,
  `DeadlineSchedulerService`, `ReminderSchedulerService`, and break-state coordination.

## Local Storage

### Recurring task records

Recurrence remains in the existing `tasks` store. An optional `recurrence` object contains
`type: daily | weekdays | custom`, optional `daysOfWeek` (Sunday=0), `rangeStart`, and optional
`rangeEnd`, with local YYYY-MM-DD dates. Executable records add `recurrenceSeriesId` and
`occurrenceDate`. One hidden Task record per series has `recurrenceTemplate=true` and holds
independent future defaults plus a `recurrenceCursor` allocation watermark. TaskService filters
templates out of all lists, schedulers, timers, and charts; CSV alone exports them explicitly.
This avoids an extra executable template and prevents occurrence-only overrides from propagating.
The cursor retains deleted allocations. No store, index, migration, or database version changes.

The independently tested recurrence utility uses local calendar constructors/setDate, never
24-hour timestamp increments. It searches at most seven days from max(today, start, allocation
cursor + one calendar day). Each series has at most one lazily generated unfinished occurrence;
unfinished past tasks remain. Creation/checks happen on load, completion, deletion, series editing,
and calendar rollover in the existing Scheduler's automatic task loop. Visible renderers may also
check on load/lifecycle actions. A synchronous plan in one IndexedDB readwrite transaction reads
the latest series state, creates `recurring:<seriesId>:<YYYY-MM-DD>`, and advances the cursor.
Transactions serialize competing renderer checks. Only the committed creator records task_created.
History is recorded after task persistence, following the existing convention; a crash between
commit and history can omit an event but cannot create a duplicate occurrence.

Future-scope edits transact against fresh persisted records: replace the template, update selected
current/future work, and reconcile only pending unstarted future rows with no timing/reminder/deadline
activity. Past and completed records remain unchanged. Excluded unstarted future rows use normal
deletion events, and removed allocations release the cursor for the changed schedule. Occurrence-only
edits retain the independent template. Deleting a recurring task transactionally removes the
template and all non-completed records with its series ID. Completed records and history events
remain, but no recurrence source or allocation cursor remains for any renderer to use. Stopping
Repeat under future scope disables generation without deleting past history.
The effective start for a future edit cannot precede the selected occurrence date, even if that
selected date is removed by the new weekday rule. A stale selected task is rejected for reopening
before a future-scope write rather than overwriting newer task lifecycle state.

New occurrences reset runtime fields and derive reminder/start timestamps from local clock time.
Finish-by derivation preserves the calendar-day offset from Start time (including next-day targets).
Once created, existing reminder and deadline schedulers see only concrete Task timestamps and need
no recurrence knowledge. Existing concurrent-start eligibility and final-task Break rules remain.

CSV has explicit recurrenceType, recurrenceDays, recurrenceStartDate, recurrenceEndDate,
recurrenceSeriesId, occurrenceDate, recurrenceTemplate, and recurrenceCursor columns, with no opaque
recurrence JSON. Export defaults independently of overrides. Existing-series imports remap all IDs
together; standalone valid recurrence occurrence rows can seed a template. Missing recurrence data
leaves old tasks unchanged and missing reminderEnabled still normalizes to true.

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

- Task records include active/paused timing fields, next-reminder state, reminder attempt count,
  and `reminderEnabled: boolean`. Missing legacy values normalize to true in TaskService; new
  drafts default to true. Only explicit false disables reminders. This is a normal object property
  in IndexedDB v2; no store, index, migration, or version change is needed.
  Tasks also include the user-authored scheduled Start time in `reminderAt` and optional internal automatic retry
  state in `nextAutoStartAt`. User-owned `allowConcurrentStart` defaults/normalizes to `false`
  without an IndexedDB version bump. Optional `deadlineAt` and `deadlineMessage` are user data;
  `deadlineNotifiedAt` and `deadlineAcknowledgedAt` persist one-time processing/presentation state.
  Optional `pendingReminder` persists the current normal reminder occurrence as attempt number,
  maximum attempts, shown timestamp, and stable friendly message.
- Settings and history events are stored in their own stores.

Runtime-only or conceptual state:

- `TaskRun` and `Reminder` models exist as domain concepts but do not have dedicated stores.
- Full BreakSession prompt, running, and complete UI state is held only in visible-renderer memory
  and is never stored. Scheduler separately retains only a running session ID and absolute end time
  in process memory so a visible-window close or reload does not unblock automatic starts. Full
  application Quit discards both forms of runtime state, and the next launch starts with no break.
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
- `pendingReminder` is an optional field in existing task records. It requires no new store, index,
  or IndexedDB version and is excluded from normal CSV import/export.

## Notification Flow

Reminder flow:

Only reminder-enabled tasks participate. ReminderSchedulerService skips explicit false for both
pending-occurrence presentation/blocking and due-task selection. TaskService rereads the persisted
flag before triggering and rejects disabled-task extensions, so UI controls are not the only guard.
Disabling an existing task clears pending/next reminder and paused countdown state. Start/resume
never schedules a disabled reminder; elapsed timing still uses TimerService and existing paused time.
`reminderAt` remains Start time for all tasks; a disabled draft without it receives the current time.
Completion and Break use the same existing flow. Independently opted-in Finish-by deadlines retain
their absolute-time behavior.

```txt
Scheduler checks ordered active tasks once per second
  -> any persisted pendingReminder globally: stop
  -> first due task below its attempt limit
     (reminderEnabled !== false)
  -> fresh repository read verifies active/due/eligible state
  -> persist pendingReminder, increment attempts, and schedule/clear nextReminderAt
  -> record reminder_shown once
  -> NotificationService sends desktop notification/configured sound once
  -> Electron main selects Main, Sticky, or no in-app presenter from window existence
  -> selected renderer derives the stable overlay from Task.pendingReminder
  -> User chooses action
      -> add more time
      -> pause task
      -> complete task
      -> delete task
      -> persisted dismiss
  -> HistoryService records action
```

Notification design:

- Desktop notification is default.
- In-app overlay improves visibility.
- Sound should be soft and configurable.
- Do not spam notifications.
- Respect reminder repeat count and interval.

Persistence-before-notification provides restart-safe deduplication. A native notification failure
does not clear the occurrence, decrement attempts, or create a retry loop; the persisted in-app
reminder remains available. Scheduler WebAudio remains best effort in the hidden renderer. A fresh
repository read narrows stale visible-renderer overwrite risk, but IndexedDB writes across renderers
are not a distributed compare-and-set transaction.

Finish-by deadline flow:

```txt
Scheduler checks ordered tasks once per second
  -> first due pending/active/paused task without deadlineNotifiedAt
  -> persist deadlineNotifiedAt
  -> record deadline_reached history
  -> invoke existing validated assistant-time:notify IPC with the custom message
  -> Main/Sticky derive one unacknowledged in-app alert from persisted task state
  -> Got it persists deadlineAcknowledgedAt for that task
```

The persisted-before-notify ordering favors restart-safe deduplication. Native notification failure
does not clear the trigger or create a retry loop; the in-app alert remains available. Pause,
Break, +30 automatic-start retry, and Add more time neither block nor move the absolute deadline.
If Electron is fully exited, an overdue unprocessed deadline is handled on the next launch.

## Multi-Window Synchronization

Current implementation:

- Only Scheduler starts `ReminderSchedulerService`; Main and Sticky may inject it only to derive the
  persisted active reminder and persist dismissal.
- The hidden Scheduler renderer is the sole owner of `AutomaticTaskSchedulerService`. It processes
  pending tasks in queue order. An incoming concurrent task may start beside current tasks; an
  incoming non-concurrent task starts only when `currentTasks` is empty or advances a due retry by
  30-minute increments.
- `TaskService` exposes ordered `activeTasks` and `currentTasks` collections. Lifecycle mutations
  require task IDs so one current task cannot accidentally mutate another.
- Task mutations broadcast `tasks-changed` through `BroadcastChannel`, causing other renderers to reload tasks from IndexedDB.
- Main and Sticky publish their renderer-local break state with unique source IDs over
  `friendly-task-reminder-break`; Scheduler blocks while any live source reports `prompt` or
  `running`, requests state when it starts, and reevaluates when blocking ends. For a confirmed
  running break, Scheduler also retains the session ID and absolute end time independently of the
  source so closing Main or Sticky does not unblock scheduling. Prompt remains live-source scoped.
- Retained running-break state is process-memory coordination only. It expires at its calculated
  end or clears on an explicit terminal transition. BreakSession persistence across application
  exit is intentionally not supported: full Quit discards Scheduler retention plus prompt,
  running, and complete UI state, while a visible-window close/reload in the same process does not
  discard Scheduler's retained running-break block.
- Settings saves and resets broadcast `settings-changed` on the existing `friendly-task-reminder` channel only after IndexedDB persistence succeeds. Other SettingsService instances reload without rebroadcasting. This updates an open Sticky renderer (including its count, color, and always-on-top preference) and Scheduler settings without polling. Loaded history still lacks comprehensive cross-window synchronization.
- `Task.pendingReminder` is the authoritative normal-reminder occurrence. At most one task may have
  it. Task changes broadcast through the existing channel so renderer recreation and restart retain
  the occurrence without another attempt, history record, notification, or sound.
- Electron main owns the narrow `main | sticky | none` presenter selection based on usable
  BrowserWindow existence. Main wins whenever it exists; otherwise Sticky wins. Hide/minimize does
  not change ownership. Creation/close events publish changes through the normal preload only.
- Presenter transitions change rendering only. Sticky interaction state is restored when Main
  closes so Sticky can become the action surface for the same occurrence.
- Scheduler alone triggers deadlines and processes at most one new deadline per check. Main and
  Sticky may both temporarily display the same persisted unacknowledged alert, but acknowledging in
  either saves and broadcasts the task change so both reload. Deadline alert rendering yields to an
  active normal reminder or break decision/completion modal.

Reminder actions target the occurrence's `taskId`. Add time, pause, and complete clear that task's
pending occurrence in `TaskService`; a recurring-task delete atomically removes its template plus
all unfinished series occurrences, while a non-recurring delete removes just its task. Dismiss
clears only `pendingReminder` and leaves the already-calculated `nextReminderAt` intact. Resume
never restores an old occurrence.

## Break Flow

```txt
Final current task completed
  -> Break prompt is published before that task is removed from storage
  -> Task and history event are saved
  -> App asks whether to take a break while Scheduler remains blocked
  -> Default break duration is loaded from settings
  -> User starts, changes, or skips break
  -> Break session is logged
  -> After break, Scheduler reevaluates overdue tasks and the modal is informational
```

Completing one of several active/paused tasks does not prompt because other current work remains.
Deleting an active or paused task removes only that task and never opens Break.

Default break duration: 10 minutes.

Break history events are persisted. Scheduler retains only the minimum running-break block needed
across visible renderer shutdown: session ID and end time. The full live countdown/session UI is
renderer-local and is not restored after renderer reload. Full application Quit discards the
Scheduler block and every live BreakSession UI state; the next launch starts unblocked unless a
current-process renderer reports a break.

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

Settings load at startup, are cached by `SettingsService`, and reload on cross-window invalidation. Main and Sticky both derive current tasks from the ordered `TaskService.currentTasks` (status active or paused); `activeTasks` means active only. No extra paused/start-time filter is applied to Sticky. `stickyVisibleNotes` caps current cards after ordering; pending cards fill remaining slots only.

Light, dark, and system theme selection and persistence are intentionally outside the MVP. Privacy/local-data controls are also not implemented.

Windows startup state is runtime OS state, not an `AppSettings` field and not IndexedDB data. The flow is:

```txt
Settings UI
  -> narrow preload IPC
  -> Electron main
  -> packaged executable resolver
  -> Electron login-item API
  -> Windows Startup Apps
```

Windows is authoritative. Reads and writes use the same quoted executable identity and empty argument list. Electron 44.4.5 parses its lookup path as a command line, so an unquoted path with spaces can produce a false `executableWillLaunchAtLogin`; quoting avoids that defect without an Electron upgrade or native dependency. Explicit `enabled` updates Windows Startup Apps approval. Main returns a structured result with support, confirmed enabled state (null on unreadable state), success, and a short reason/message, and logs native errors/read-back mismatches. Settings re-queries on opening and retains the last confirmed value if state cannot be read.

Packaged portable builds use Electron Builder's `PORTABLE_EXECUTABLE_FILE` so the login item points to the original portable executable rather than the temporary extracted Electron process. A portable environment without a valid original executable is explicitly unsupported. Portable startup requires retaining the launcher at its registered path; after moving it, re-enable from the new location. The existing `process.execPath` fallback remains for unpacked packaging diagnostics; it is not an installer distribution path. No Squirrel updater stub is involved. Development and automated smoke execution never register a startup item.

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
