# plans.md

# Friendly Task Transition Reminder App Plan

## Product Goal

Build a local-first Windows desktop application that helps the user manage tasks, study sessions, breaks, and transitions in a calm, friendly way.

The app should make it easy to see current tasks, receive visible but non-annoying reminders,
pause/resume work, extend time when needed, complete a specific task, take a break after the final
current task, and move to the next task.

## Target Platform

- Primary MVP: Windows desktop.
- Desktop shell: Electron `44.4.5`.
- Frontend: Angular `21.2.15`.
- Language: TypeScript `5.9.3`.
- Runtime/tooling: Node.js `26.2.0`, npm `11.16.0`.
- Storage: local-first IndexedDB for the MVP.
- Sync: manual CSV import/export for MVP.
- Distribution: Electron Builder portable Windows executable only. Unpacked directory output is
  retained for development/debugging/profiling diagnostics; no installable setup is shipped.

Angular is the UI framework. Electron packages the Angular UI as a real Windows desktop app with native windows, notifications, file dialogs, sticky-note mode, and a Windows system tray. A hidden Scheduler renderer owns automatic starts, Finish-by processing, and normal reminder timing. The MVP should not be implemented as a browser-only web app.

## Core User Flow

1. User creates tasks with:
   - task name
   - Start time
   - Enable reminder (enabled by default); disable it for a focus task that ends manually
   - number of reminder attempts
   - repeat interval between reminders
   - optional category/note
   - optional custom reminder messages as target behavior; the current implementation uses a built-in friendly message pool
   - optional Finish by time with a required user-authored deadline message

2. The task starts automatically when its Start time arrives. The user may choose **Start now** to
   begin it early.

3. App shows all active/paused tasks in Main. Sticky shows up to the configured visible-note maximum, prioritizing current tasks over queued tasks.

4. For reminder-enabled tasks, when reminder time arrives, app shows a friendly visible notification with sound. Tasks without reminders continue until manually completed.

5. User chooses one action:
   - **I know, give me more time**: enter extra time for the reminder's task.
   - **Pause task**: temporarily stop the reminder's task because the user is away.
   - **Task completed**: finish the reminder's task and preserve any other current tasks.

6. After the final active/paused task is completed, the app asks:
   - "Do you want a break before the next task?"
   - Default break duration: 10 minutes.
   - User can change duration or skip the break.
   - A break prompt or running break blocks automatic task starts.
   - Closing the window that started a running break does not cancel its automatic-scheduling
     block; Scheduler retains it until its end time or an explicit stop/completion transition.
   - Full application Quit ends prompt, running, and complete BreakSession state. The next launch
     starts without a restored break or a retained Scheduler break block.
   - When the break ends or is skipped, overdue work is reevaluated automatically.

7. App logs every important action for history and charts.

## MVP Features

### Task Management

Recurring tasks support Every day, Weekdays (Monday–Friday), and Custom weekdays. Repeat has its
own toggle, independent of Enable reminder, and a required inclusive start date plus an optional
inclusive end date. Custom requires at least one weekday. Start time supplies the local clock time;
for no-reminder tasks it remains optional.

Each generated occurrence is independently executable and retains normal timer, pause/resume,
completion, reminder, history, chart, and final-current-task Break behavior. Keep one unfinished
occurrence per series; generate lazily at startup, calendar rollover, completion, deletion, and
series edits. Skip missed unallocated dates on reopening and retain already-created unfinished work.
Main/Sticky do not show the internal defaults record or recurrence controls inside compact cards.

Editing supports This occurrence only and This and future occurrences. Future editing loads the
series defaults rather than an occurrence-only override. Reconcile only unstarted future records;
preserve completed/past and history-bearing future work. Delete on any recurring occurrence removes
the complete recurring task: its hidden defaults record and every unfinished occurrence. Completed
past occurrences and their existing history remain, and no future occurrence can be generated.
Disable Repeat under the future scope also stops later generation without deleting current/past work.
Reminder-enabled occurrences and optional Finish by receive concrete local timestamps, preserving
clock time and any calendar-day deadline offset. Existing absolute deadline semantics then apply.
No monthly/yearly recurrence, holiday exceptions, or bulk series-management screen is included.

- Create, edit, delete, and reorder tasks.
- Creation/editing supports optional reminders. Disabling **Enable reminder** hides attempts and
  repeat interval and skips their validation. Start time is still the automatic-start schedule;
  for a no-reminder task it may be left empty to make the task ready now.
- No-reminder tasks retain elapsed timing, pause/resume, normal history, next-task candidates,
  completion and the existing final-task Break flow. They have no countdown, Add time action,
  reminder notification/repeats, reminder attempts, or reminder/extension history events.
- Tasks default to non-concurrent starts; optionally allow an incoming task to start while other
  tasks are active or paused.
- Complete, pause, resume, extend, or delete a specific current task without affecting others.
- Move to next task after completion.
- Support task notes and categories if simple to implement.

### Reminder System

- Schedule reminders only for reminder-enabled tasks in the process-lifetime Scheduler renderer.
- Support repeat reminders.
- Support configurable repeat interval.
- Support maximum reminder count.
- Randomly choose reminder text from a friendly message pool.
- Avoid aggressive or stressful wording.
- Persist the active occurrence on its task so its attempt, message, and shown time survive renderer
  recreation and application restart.
- Permit exactly one pending reminder interaction globally; after it is handled, the next due task
  is selected in deterministic task order.

### Friendly Notification UX

- Use desktop notification by default.
- Also show an in-app modal or overlay when the app is open.
- Include soft notification sound.
- Keep reminder actions clear:
  - Add more time
  - Pause
  - Complete
  - Dismiss for now, if useful
- Avoid loud, spammy, or guilt-based interactions.
- Send normal reminder notification/sound once from Scheduler after persisting the occurrence.
- Present the in-app occurrence only in Main when Main exists, otherwise in Sticky when Sticky
  exists. Do not create/show a window solely because a reminder is due.
- Persist Dismiss for now. Add time, Pause, and Complete clear only the targeted occurrence.
  Deleting a recurring occurrence removes that series' template and all unfinished occurrences;
  deleting a non-recurring task remains targeted.

### Sticky Notes Mode

- Provide a compact always-on-top window similar to Windows sticky notes.
- Show current tasks, remaining time, and task-specific quick actions before queued tasks.
- No-reminder cards in both Main and Sticky show the title, Elapsed, Pause/Resume and Complete task.
  Remove the reminder panel and Add time/+10m entirely; Elapsed fills the available panel width.
- Sticky notes shown (`stickyVisibleNotes`, 1–5) is a maximum, not a fixed card count. Three current tasks with limit 5 show three current cards; with limit 2 they show two. Changing this setting updates an already-open Sticky window without restart. Paused tasks remain current cards.
- Quick actions:
  - pause
  - resume
  - add time
  - complete
  - open full app
- Keep it readable, calm, and visually friendly.
- Closing the Sticky Note with its X temporarily hides it without disabling the sticky-note
  preference; the tray can show it again.

### Desktop Window Foundation

- Preserve the existing page scrolling and three-column workspace layout, with Insights spanning
  the full width below the top workspace row.
- Support native Windows Maximize and Restore from the custom main title bar and by
  double-clicking a non-interactive title-bar area.
- Keep Time Assistant available through a Windows system tray while the Sticky Note is
  temporarily hidden. Sticky Note X hides only Sticky, Main application X closes only Main,
  Tray icon click restores Sticky only, and Tray Quit is the explicit full shutdown action.

### Automatic Task Lifecycle Architecture Foundation

- Keep one hidden, process-lifetime Scheduler Angular renderer as the sole owner for automatic task
  lifecycle scheduling.
- Reuse the current local IndexedDB task repository from that renderer without changing storage
  technology or adding a backend.
- Automatically start the first due pending task by queue order when no task or break blocks it.
- Reattempt blocked starts in 30-minute increments while an active or paused task exists, while
  starting overdue work immediately if that blocker disappears early.
- Coordinate renderer-local break state through BroadcastChannel; prompt and running states block
  without advancing retry time.
- Process due tasks in queue order. A task with **Allow concurrent start** may bypass any
  active/paused blocker, while a non-concurrent task is deferred in 30-minute increments.
- Break prompt/running state blocks every automatic start without advancing retry state.
- Keep Main and Sticky as presentation/action clients. Scheduler owns one-time Finish-by deadline
  triggering and normal reminder timing/notification. Visible renderers present persisted state;
  Main has reminder priority and Sticky presents only while Main does not exist.

### Finish-By Deadlines

- Finish by is optional and, when enabled, requires a custom message of at most 240 characters.
- Finish by must be later than Start time and is an absolute wall-clock target for pending, active,
  and paused tasks.
- Pause, Break, automatic +30 retry, Start now, and Add more time do not move Finish by.
- Scheduler persists one trigger per configured deadline and sends the custom message through the
  native Windows notification bridge. Changing the Finish-by time re-arms it; changing only the
  message does not.
- Main and Sticky show one persisted unacknowledged alert at a time. Got it acknowledges that exact
  task. A completed task no longer presents an alert, while its trigger/history remains stored.
- A fully exited Electron process cannot notify at the target time. On the next launch, Scheduler
  processes an overdue unprocessed deadline once.

### Pause / Resume

- User can pause any current task when going away.
- Timer and reminder countdown stop while paused.
- User can resume when back.
- History records pause and resume events.
- Optional pause reason can be added later.

### Break Before Next Task

- After completing the final active/paused task, ask whether the user wants a break. Completing one
  of several current tasks does not prompt, and deletion never prompts.
- Default break duration: 10 minutes.
- User can change the duration.
- Break screen should be calm and lightweight.
- After break ends, acknowledge completion and automatically reevaluate overdue scheduled tasks.
- BreakSession persistence across application exit is intentionally not supported. Closing or
  reloading a visible window within the same Electron process may leave Scheduler's running-break
  block active until expiry, but full application Quit discards prompt, running, and complete state.

### Visual Theme

- Preserve the existing calm visual design.
- Light, dark, and system theme selection and theme persistence are intentionally outside the MVP.

### Voice Input

- Deferred after review.
- Keep task creation focused on normal text input for now.

### Calendar Integration

- Deferred after review.
- Keep the current MVP local-first with CSV transfer and no calendar OAuth.
- Future calendar integration requires a new ADR.

### CSV Import / Export

- Recurrence CSV uses explicit type/days/start/end/series/date/template/cursor columns. Days use
  semicolon-separated Sunday=0 through Saturday=6; calendar dates use YYYY-MM-DD. Export hidden
  defaults rows so occurrence-only overrides and deleted-date allocation survive a round-trip.
- Validate recurrence types, custom weekdays, real calendar dates, ordered ranges, and occurrence
  identity. Importing an existing series remaps it as a coherent new series. Old files without
  recurrence columns remain ordinary tasks. Existing reminderEnabled compatibility remains intact.

- Export tasks to CSV.
- Import tasks from CSV.
- Export `reminderEnabled` as true/false. Missing or blank values in old CSV default to true.
  Disabled rows do not need reminder count/interval values or columns; an omitted Start time
  makes them ready now. Enabled rows retain the existing required-column/value validation.
- Export history/action log to CSV.
- CSV output should be easy to use in spreadsheets and charting tools.
- Validate imported rows and show errors clearly.

### History and Charts

- Record actions:
  - task created
  - task started
  - reminder shown
  - extra time added
  - task paused
  - task resumed
  - task completed
  - break started
  - break skipped
  - break completed
  - settings changed
- Show basic history timeline.
- Show simple charts:
  - total time spent per day
  - completed tasks per day
  - time spent by category, if categories exist
  - reminders/extensions per task

### Settings

Settings should include:

- default break duration
- default reminder repeat interval
- default reminder count
- notification sound on/off
- notification sound choice, if available
- sticky-note mode on/off
- always-on-top sticky window on/off
- CSV date/time format
- Start app with Windows
- privacy/local data options

The Windows startup option controls the native Windows login item through Electron main. Windows is the source of truth; the value is not stored in IndexedDB. Settings queries Windows every time it opens and updates the checkbox only from confirmed read-back. Development/smoke runs explicitly disable this capability. Portable uses the original portable launcher and requires it to stay at that path. Moving/removing a portable executable invalidates its startup target; enable startup again from its new location. An unresolved portable launcher is unsupported rather than registering a temporary executable.

Current implementation: reminder, break, sound, sticky-note, CSV, and Windows startup settings are present. Privacy/local-data settings are not present, and the declared `settings_changed` history event is not currently recorded.

## Implementation Strategy

Development should produce small, reviewable milestones. Historical implementation did not remain strictly sequential, and theme selection was later removed from MVP scope by product decision. Future work must follow the corrected **Current Reconciliation / Stabilization** section in `todos.md` rather than assuming every historical checkbox is authoritative.

### Phase 1 — Foundation and Core Flow

Goal: working local MVP with Angular, Electron, local storage, task CRUD, current active/paused tasks (with per-task concurrent start), timer, and basic reminders.

Review target:

- Can the user create a task?
- Can the user start and complete a task?
- Does the timer/reminder flow work?
- Is the app structure clean enough to continue?

### Phase 2 — Productivity UX

Goal: make the core app pleasant for daily use.

Includes:

- sticky-note mode
- pause/resume
- break prompt before next task
- friendly notification overlay
- soft sound
- visual polish using the existing theme

Review target:

- Is the reminder experience friendly?
- Is sticky-note mode useful?
- Does pause/resume behave naturally?
- Does the break flow feel right?

### Phase 3 — Data, History, and Insights

Goal: make the app useful for reflection and cross-device manual sharing.

Includes:

- action history
- CSV import/export
- basic charts
- settings export/import if useful

Review target:

- Is history complete enough?
- Are CSV files understandable?
- Are charts useful without being overbuilt?

### Phase 4 — Integrations and Polish

Goal: add optional convenience features without increasing MVP complexity too much.

Includes:

- voice input: deferred and not part of the current MVP
- calendar integration: deferred and requires a new ADR before reconsideration
- better settings
- accessibility polish
- UI polish using available design guidance

Current scope note: voice input and calendar integration were reviewed and deferred. Accessibility and settings polish are partial; reduced-motion support remains incomplete.

Review target:

- Are optional features worth keeping?
- Does the app remain simple?
- Is it ready for a private beta?

## Non-Goals for MVP

- No required account system.
- No paid backend service.
- No mobile app required for MVP.
- No real-time multi-device sync required for MVP.
- No AI scheduling required for MVP.
- No complex team collaboration.
- No cloud database unless manually approved later.

## Design Direction

Use a calm, friendly, productivity-focused interface.

Use available design guidance when present, but do not assume repo-local `.codex/skills` exist. They are absent from the current working tree.

Prefer subtle skeuomorphic touches:

- soft cards
- tactile buttons
- warm surfaces
- sticky-note-like active task widget
- clear depth and shadows
- readable contrast
- no clutter

## Success Criteria

The MVP is successful when the user can:

- create a task
- start a task
- receive a friendly reminder
- add more time
- pause/resume
- complete the task
- choose a break before next task
- view current tasks in sticky-note mode
- export task/history CSV
- review basic history and charts
