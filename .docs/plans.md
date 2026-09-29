# plans.md

# Friendly Task Transition Reminder App Plan

## Product Goal

Build a local-first Windows desktop application that helps the user manage tasks, study sessions, breaks, and transitions in a calm, friendly way.

The app should make it easy to see the current task, receive visible but non-annoying reminders, pause/resume work, extend time when needed, complete a task, take a break, and move to the next task.

## Target Platform

- Primary MVP: Windows desktop.
- Desktop shell: Electron `44.4.5`.
- Frontend: Angular `21.2.15`.
- Language: TypeScript `5.9.3`.
- Runtime/tooling: Node.js `26.2.0`, npm `11.16.0`.
- Storage: local-first IndexedDB for the MVP.
- Sync: manual CSV import/export for MVP.

Angular is the UI framework. Electron packages the Angular UI as a real Windows desktop app with native windows, notifications, file dialogs, sticky-note mode, and a Windows system tray. The current implementation has no independent background reminder scheduler. The MVP should not be implemented as a browser-only web app.

## Core User Flow

1. User creates tasks with:
   - task name
   - reminder deadline/time
   - number of reminder attempts
   - repeat interval between reminders
   - optional category/note
   - optional custom reminder messages as target behavior; the current implementation uses a built-in friendly message pool

2. User starts a task.

3. App shows the active task in the main window and optional sticky-note mode.

4. When reminder time arrives, app shows a friendly visible notification with sound.

5. User chooses one action:
   - **I know, give me more time**: enter extra time and continue current task.
   - **Pause task**: temporarily stop the task because the user is away.
   - **Task completed**: finish current task and prepare the next task.

6. Before starting the next task, the app asks:
   - "Do you want a break before the next task?"
   - Default break duration: 10 minutes.
   - User can change duration, skip break, or start immediately.

7. App logs every important action for history and charts.

## MVP Features

### Task Management

- Create, edit, delete, and reorder tasks.
- Start one active task at a time.
- Complete active task.
- Move to next task after completion.
- Support task notes and categories if simple to implement.

### Reminder System

- Schedule reminders based on task deadline/time.
- Support repeat reminders.
- Support configurable repeat interval.
- Support maximum reminder count.
- Randomly choose reminder text from a friendly message pool.
- Avoid aggressive or stressful wording.

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

### Sticky Notes Mode

- Provide a compact always-on-top window similar to Windows sticky notes.
- Show current task, remaining time, and quick actions.
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

### Pause / Resume

- User can pause the current task when going away.
- Timer and reminder countdown stop while paused.
- User can resume when back.
- History records pause and resume events.
- Optional pause reason can be added later.

### Break Before Next Task

- After completing a task, ask whether the user wants a break.
- Default break duration: 10 minutes.
- User can change the duration.
- Break screen should be calm and lightweight.
- After break ends, ask whether to start the next task.

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

- Export tasks to CSV.
- Import tasks from CSV.
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

The Windows startup option controls the native Windows login item through Electron main. Windows is the source of truth; the value is not stored in IndexedDB.

Current implementation: reminder, break, sound, sticky-note, CSV, and Windows startup settings are present. Privacy/local-data settings are not present, and the declared `settings_changed` history event is not currently recorded.

## Implementation Strategy

Development should produce small, reviewable milestones. Historical implementation did not remain strictly sequential, and theme selection was later removed from MVP scope by product decision. Future work must follow the corrected **Current Reconciliation / Stabilization** section in `todos.md` rather than assuming every historical checkbox is authoritative.

### Phase 1 — Foundation and Core Flow

Goal: working local MVP with Angular, Electron, local storage, task CRUD, one active task, timer, and basic reminders.

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
- view current task in sticky-note mode
- export task/history CSV
- review basic history and charts
