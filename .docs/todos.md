# todos.md

# Implementation Todos

Historical phases are preserved below. Source reconciliation found that later-phase work exists while some earlier items remain incomplete, so the **Current Reconciliation / Stabilization** section now controls the next work. Verify historical checkboxes against source rather than assuming they are authoritative.

## Phase 0 — Repo and Tooling Setup

Goal: create a stable project foundation with pinned versions.

### Milestone 0.1 — Project Bootstrap

- [x] Create Angular `21.2.15` workspace using `@angular/cli` `21.2.13`.
- [x] Configure Node.js `26.2.0` and npm `11.16.0` in repo docs/tooling.
- [x] Pin exact package versions in `package.json`.
- [x] Remove all `latest`, `^`, and `~` version ranges.
- [x] Configure TypeScript `5.9.3` strict mode.
- [x] Add basic app routing.

### Milestone 0.2 — Electron Desktop Shell

- [x] Add Electron `44.4.5`.
- [x] Replace Electron Forge with Electron Builder as the sole packaging tool; remove Forge configuration and dependencies.
- [x] Add Electron Builder `26.8.1`.
- [x] Add Electron main process entry.
- [x] Add Electron preload script.
- [x] Configure Angular build output to load inside Electron.
- [x] Confirm app opens as a Windows desktop window.
- [x] Enable secure defaults: `contextIsolation: true`.
- [x] Disable renderer Node integration.
- [x] Expose only narrow preload APIs needed by the MVP.

### Milestone 0.3 — Quality Gates

- [x] Add formatting command.
- [x] Add lint command. Current command is a Prettier check, not semantic linting.
- [x] Add unit test command.
- [x] Add build command.
- [x] Add README setup instructions.
- [x] Verify app builds successfully.

## Phase 1 — Foundation and Core Flow

Goal: working local MVP with task CRUD, one active task, timer, and basic reminders.

### Milestone 1.1 — App Shell and Layout

- [x] Create main app layout.
- [x] Create navigation structure.
- [x] Intentionally remove light, dark, and system theme selection from MVP scope.
- [x] Add empty states for task list and active task.
- [x] Add shared button, card, input, and modal components if useful.

### Milestone 1.2 — Data Models

- [x] Create `Task` model.
- [x] Create `TaskRun` model.
- [x] Create `Reminder` model.
- [x] Create `HistoryEvent` model.
- [x] Create `AppSettings` model.
- [x] Add date/time utility helpers.

### Milestone 1.3 — Local Storage

- [x] Choose SQLite or IndexedDB for MVP storage.
- [x] Implement storage adapter interface.
- [x] Implement task repository.
- [x] Implement settings repository.
- [x] Implement history repository.
- [x] Add basic seed/default settings.

### Milestone 1.4 — Task CRUD

- [x] Create task list view.
- [x] Create task form.
- [x] Add task create.
- [x] Add task edit.
- [x] Add task delete.
- [x] Add task reorder if simple.
- [x] Validate task name.
- [x] Validate reminder deadline/time.
- [x] Validate reminder count and repeat interval.

### Milestone 1.5 — Active Task Flow

- [x] Start a task.
- [x] Show current active task.
- [x] Track elapsed time.
- [x] Track remaining time until reminder.
- [x] Complete active task.
- [x] Move to next task candidate after completion.
- [x] Prevent multiple active tasks.

### Milestone 1.6 — Basic Reminder Flow

- [x] Implement reminder scheduler service.
- [x] Trigger reminder when active task reaches reminder time.
- [x] Support reminder repeat interval.
- [x] Support maximum reminder count.
- [x] Show basic in-app reminder modal.
- [x] Add action: add more time.
- [x] Add action: complete task.
- [x] Log reminder events.

### Phase 1 Review Gate

- [x] User can create, start, extend, and complete a task.
- [x] Reminder timing works.
- [x] Data persists after app restart.
- [x] No Phase 2 work has started.
- [x] Human review completed before Phase 2.

## Phase 2 — Productivity UX

Goal: make the app pleasant, visible, and useful in daily work.

### Milestone 2.1 — Friendly Reminder Experience

- [x] Replace basic reminder modal with friendly reminder overlay.
- [x] Add random friendly reminder messages.
- [x] Add soft notification sound.
- [x] Add setting to enable/disable sound.
- [x] Add desktop notification by default.
- [x] Ensure repeated reminders are not spammy.

### Milestone 2.2 — Sticky Notes Mode

- [x] Create sticky-note window/view.
- [x] Show current task in compact mode.
- [x] Show remaining time.
- [x] Add quick action: add more time.
- [x] Add quick action: pause/resume.
- [x] Add quick action: complete.
- [x] Add always-on-top option.
- [x] Add sticky-note setting.

### Milestone 2.3 — Pause and Resume

- [x] Add pause active task action.
- [x] Stop timer countdown while paused.
- [x] Stop reminder countdown while paused.
- [x] Add resume active task action.
- [x] Record pause event.
- [x] Record resume event.
- [x] Show paused state clearly.

### Milestone 2.4 — Break Before Next Task

- [x] Ask user whether to take a break after task completion.
- [x] Default break duration to 10 minutes.
- [x] Allow user to change break duration.
- [x] Allow user to skip break.
- [x] Track break countdown.
- [x] Notify when break ends.
- [x] Ask whether to start next task after break.
- [x] Record break events.

### Milestone 2.5 — Theme and Visual Polish

- [x] Intentionally remove light theme selection from MVP scope.
- [x] Intentionally remove dark theme selection from MVP scope.
- [x] Intentionally remove system theme selection from MVP scope.
- [x] Intentionally remove theme persistence from MVP scope.
- [x] Apply subtle skeuomorphic design.
- [x] Improve empty states and microcopy.
- [ ] Verify accessible contrast.

### Phase 2 Review Gate

- [x] Reminder UX feels friendly.
- [x] Sticky-note mode is usable.
- [x] Pause/resume works correctly.
- [x] Break flow works correctly.
- [x] Theme selection is intentionally outside the MVP; preserve the existing visual design.
- [x] No Phase 3 work has started.
- [x] Human review completed before Phase 3.

## Phase 3 — Data, History, and Insights

Goal: make work history visible and exportable.

### Milestone 3.1 — Action History

- [x] Record task created event.
- [x] Record task edited event.
- [x] Record task started event.
- [x] Record reminder shown event.
- [x] Record extra time added event.
- [x] Record task paused event.
- [x] Record task resumed event.
- [x] Record task completed event.
- [x] Record break started event.
- [x] Record break skipped event.
- [x] Record break completed event.
- [x] Create history timeline view.

### Milestone 3.2 — CSV Export

- [x] Add Papa Parse `5.5.3`.
- [x] Export tasks CSV.
- [x] Export history CSV.
- [x] Include stable column headers.
- [x] Include ISO timestamps.
- [x] Add save-file dialog.
- [x] Show success/error result.

### Milestone 3.3 — CSV Import

- [x] Import tasks CSV.
- [x] Validate required columns.
- [x] Validate date/time values.
- [x] Validate reminder settings.
- [x] Show row-level import errors.
- [x] Avoid duplicate task IDs.
- [x] Add import summary.

### Milestone 3.4 — Charts

- [x] Add Chart.js `4.5.1`.
- [x] Add ng2-charts `8.0.0`.
- [x] Show completed tasks per day chart.
- [x] Show total focus time per day chart.
- [x] Show time by category chart if categories exist.
- [x] Show reminders/extensions summary.
- [x] Keep charts simple and readable.

### Phase 3 Review Gate

- [x] History captures important actions.
- [x] CSV export can be opened in a spreadsheet.
- [x] CSV import handles errors safely.
- [x] Charts are useful but not overbuilt.
- [x] No Phase 4 work has started.
- [x] Human review completed before Phase 4.

## Phase 4 — Integrations and Polish

Goal: add optional convenience features and polish after the core app is stable.

### Milestone 4.1 — Voice Input

- [x] Remove voice input from the current MVP after review.
- [x] Keep manual input fully supported.

### Milestone 4.2 — Calendar Integration

- [x] Remove calendar integration from the current MVP after review.
- [x] Keep the app local-first with CSV export only.
- [x] Mark the Google Calendar OAuth ADR as superseded.
- [x] Document that calendar integration is deferred.

### Milestone 4.3 — Settings Completion

- [x] Create full settings screen.
- [x] Configure default break duration.
- [x] Configure default reminder repeat interval.
- [x] Configure default reminder count.
- [x] Configure notification sound.
- [x] Configure sticky-note behavior.
- [x] Configure CSV date/time format.
- [x] Configure Start app with Windows using the native Windows login item.
- [x] Add reset-to-default settings action.

### Milestone 4.4 — Accessibility and UX Polish

- [ ] Complete keyboard navigation verification.
- [x] Check focus states.
- [x] Check screen-reader labels.
- [ ] Check and implement reduced-motion preference support.
- [x] Polish reminder microcopy.
- [x] Polish sticky-note visual design.
- [x] Review all error messages.

### Phase 4 Review Gate

- [x] Optional features do not complicate core flow.
- [x] App remains local-first.
- [x] Settings are understandable.
- [x] UI feels polished and calm.
- [ ] Ready for private beta review.

## Technical Debt

- [x] Review IndexedDB schema after Phase 4 stabilization.
- [x] Add schema versioning and migration strategy.
- [x] Refactor duplicate UI components shared by main and sticky views.
- [x] Improve error handling consistency across services and overlays.
- [x] Add performance checks for long task/history lists.
- [x] Review Electron IPC and window permissions surface.
- [x] Document known limitations and deferred features.

## Testing

- [x] Unit test timer calculations.
- [x] Unit test reminder scheduling.
- [x] Unit test pause/resume timing.
- [x] Unit test break countdown.
- [x] Unit test settings persistence.
- [x] Unit test CSV export.
- [x] Unit test CSV import validation.
- [x] E2E test create/start/complete task within the current break-conflict scenario.
- [ ] E2E test add more time.
- [ ] E2E test pause/resume.
- [x] E2E test break-before-next-task conflict behavior in the current Playwright scenario.
- [x] Remove theme-switching E2E coverage from MVP scope with the theme product decision.

## Documentation

- [x] Keep `plans.md` updated after product changes.
- [x] Keep `architecture.md` updated after architecture changes.
- [x] Add ADRs to `decisions.md` for major decisions.
- [x] Keep `todos.md` checkboxes accurate.
- [x] Add setup instructions to README.
- [x] Add CSV format documentation.
- [x] Add troubleshooting notes.

## Current Reconciliation / Stabilization

- [x] Reconcile the five canonical docs with the audited current local source state.
- [x] Reconcile the packaging migration: retain Electron Builder as the sole packaging tool, remove Electron Forge, and accept ADR-012.
- [x] Remove light/dark/system theme support and persistence from MVP scope through an explicit product decision and documentation update.
- [x] Add Start app with Windows setting.
  - [x] Add a compact Startup card after Sticky note and before the action buttons.
  - [x] Read actual Windows login-item state.
  - [x] Enable and disable startup through Electron main.
  - [x] Resolve the original Electron Builder portable executable path.
  - [x] Add focused renderer and Electron-main tests.
- [x] Complete Phase 1 of the desktop-window foundation product change.
  - [x] Add native main-window Maximize/Restore with Electron-authoritative state and title-bar
    double-click behavior.
  - [x] Add a native Windows Tray with Open Time Assistant, Show Sticky Note, and explicit Quit
    actions.
  - [x] Keep Main and Sticky lifecycles independent: Main X closes Main, Sticky X hides Sticky,
    Tray click restores Sticky, and Tray Quit performs complete shutdown.
  - [x] Make Sticky Note X temporarily hide the sticky window without changing
    `stickyNoteEnabled`.
  - [x] Preserve deterministic smoke-test shutdown and Windows startup-at-login behavior.
- [ ] Phase 2 — Automatic and concurrent task lifecycle.
  - [x] Establish one dedicated hidden Scheduler renderer as the sole owner for automatic
    task lifecycle scheduling.
  - [x] Automatically start tasks at their scheduled Start time.
  - [x] Coordinate break prompt/running state across visible renderers and reevaluate when breaks
    unblock scheduling.
  - [x] Support per-task concurrent start / multiple active tasks.
  - [x] Reschedule blocked automatic starts in repeated 30-minute increments.
  - [ ] Finish-by/deadline + custom message.
- [ ] Complete accessibility verification, including keyboard navigation, contrast, and reduced-motion behavior.
- [ ] Add the missing Playwright coverage for add-more-time and pause/resume.
- [ ] Decide whether to introduce semantic linting or rename the current Prettier-only `lint` command.
- [ ] Establish reliable multi-window reminder ownership/synchronization and eliminate the potential duplicate-processing race.
- [ ] Decide whether full live break-session UI must persist across renderer reload/exit. Scheduler
  already retains only the process-lifetime running-break block required for automatic scheduling.
- [ ] Record settings changes in history or remove the unused `settings_changed` event type through an explicit product decision.
- [ ] Decide how ignored `.docs` files are versioned or distributed so canonical documentation changes remain recoverable.
