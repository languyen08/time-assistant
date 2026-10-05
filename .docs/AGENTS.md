# AGENTS.md

## Project Overview
Local-first Windows desktop productivity app for friendly task transition reminders. The app helps users start, pause, resume, extend, complete, break between, and review tasks without stressful interruptions.

## Required Reading Order
1. Read `AGENTS.md` completely.
2. Read `plans.md` for product behavior.
3. Read `architecture.md` for system constraints.
4. Read `decisions.md` before changing architecture.
5. Read `todos.md` and implement only the current phase/task.

## Current Verified Stack
- Angular `21.2.15`
- Angular CLI/build `21.2.13`
- TypeScript `5.9.3`
- Node.js `26.2.0`
- npm `11.16.0`
- Electron `44.4.5`
- Electron Builder `26.8.1`
- Chart.js `4.5.1`
- ng2-charts `8.0.0`
- Papa Parse `5.5.3`
- Vitest `4.1.7`
- Playwright `1.60.0`

Electron Builder `26.8.1` is the canonical and sole packaging tool. Electron Forge configuration and dependencies have been removed. `date-fns` and repo-local `.codex/skills` are not present in the current working tree.

## Package Rules
- Do not use `latest`.
- Do not use `^` or `~` version ranges.
- Pin exact versions.
- Do not replace Angular with React, Vue, Svelte, or another framework.
- Do not add a backend unless a new ADR approves it.

## Source-of-Truth and Implementation Strategy

When implementation, docs, and historical checkboxes disagree, use this order:

1. Current source and working-tree reality for what exists.
2. Accepted ADRs for intentional architecture and product constraints.
3. The corrected current milestone in `todos.md` for next work.

Do not assume a historical `[x]` is still supported, and do not silently convert an uncommitted experiment into an accepted decision.

- Work only on the explicitly requested task or the first unresolved item in **Current Reconciliation / Stabilization**.
- Keep each change small and reviewable.
- Add or amend an ADR before making a material architecture decision.
- Keep all five canonical docs synchronized when architecture or product scope changes.
- Prefer boring, maintainable code over clever abstractions.

## Electron Rules
- Angular runs in Electron renderer windows.
- Electron main process owns native desktop features.
- Use preload scripts for safe IPC bridges.
- Keep `contextIsolation: true`.
- Keep `nodeIntegration: false` in renderer windows.
- Keep renderer sandboxing enabled where currently configured.
- Do not expose broad filesystem or shell APIs to Angular.
- Current BrowserWindow types are main, sticky-note, scheduler, and user-guide windows.
- Electron main owns Windows startup-at-login configuration through narrow preload/IPC methods.
- Windows login-item state is authoritative; do not persist a duplicate startup boolean in IndexedDB.
- Electron main owns the native Tray and BrowserWindow lifecycle. The Tray keeps the process
  available while the Sticky Note is temporarily hidden.
- Main application X closes only the Main window. Sticky Note and Tray continue independently.
- Tray icon click restores/focuses Sticky Note only. Tray Open Time Assistant opens/focuses Main.
- Tray Quit destroys all windows and the Tray, then quits the process.
- Sticky Note X temporarily hides its BrowserWindow without changing the persisted
  `stickyNoteEnabled` setting.
- There is no independent main-process reminder scheduler.
- Only the dedicated Scheduler renderer starts `ReminderSchedulerService`. Main and Sticky derive
  reminder UI from persisted task state and never run reminder timing loops or dispatch normal
  reminder notifications/sounds.
- Only the dedicated Scheduler renderer may own automatic task lifecycle scheduling. Main
  and Sticky renderers must not independently start automatic-task scheduling loops.
- The dedicated Scheduler renderer is the sole owner of automatic task starts and blocked retry
  scheduling. `reminderAt` remains the persisted, user-authored Start time for backward
  compatibility; `nextAutoStartAt` is optional system-managed retry state.
- Break `prompt` and `running` states block automatic starts. Main and Sticky publish their local
  break state with unique source IDs over the `friendly-task-reminder-break` BroadcastChannel so
  Scheduler can coordinate without persisting live break sessions.
- Scheduler retains a confirmed running break's session ID and absolute end time for the Electron
  process lifetime. Closing the originating BrowserWindow releases only its source, not the
  running-break block. Full application Quit discards this process memory and all prompt, running,
  or complete BreakSession UI; the next launch starts with no restored break. Do not persist live
  BreakSession state or confuse visible-window close/hide with full process exit.
- Tasks default to `allowConcurrentStart: false`. The incoming task's flag alone decides whether
  it may bypass existing active/paused tasks; break prompt/running state still blocks every
  automatic start.
- Multiple active/paused tasks may coexist. Business logic uses ordered `activeTasks` and
  `currentTasks` collections, and every mutation targets an explicit task ID.
- Completing one of several current tasks does not open a Break prompt. The prompt is published
  before completing the final current task; deleting a current task never opens Break.
- Scheduler scans active tasks in deterministic order, persists one `pendingReminder` occurrence,
  records `reminder_shown`, and dispatches native notification/sound after persistence. Any pending
  occurrence globally blocks a later one until the user responds or dismisses it.
- Electron main selects the sole in-app reminder presenter by BrowserWindow existence: Main has
  priority, Sticky is the fallback, and neither window means no in-app presenter. Presenter changes
  do not create a new occurrence, history event, notification, sound, or attempt.
- Reminder dismissals are persisted. Add time, pause, and complete clear only their target task's
  `pendingReminder`; deletion removes it with the task. The optional field uses existing IndexedDB
  v2 task records with no new store or version.
- Finish by is optional task data. When configured, it requires a user-authored message of at most
  240 characters and must be later than Start time. It is an absolute wall-clock target unaffected
  by pause, break, automatic +30 retries, or Add more time.
- Only the Scheduler renderer runs `DeadlineSchedulerService`. It persists `deadlineNotifiedAt`
  before invoking the existing native notification IPC and processes at most one new deadline per
  check. Main and Sticky only present persisted, unacknowledged deadline alerts.
- Scheduler uses the dedicated notify-only `scheduler-preload.cjs`; do not replace it with the full
  renderer preload. Changing Finish-by time re-arms the deadline, while changing only its message
  preserves processing state.

## Coding Rules
- Use Angular standalone components where appropriate.
- Keep components small and focused.
- Put business logic in services, not templates.
- Use strict TypeScript.
- Prefer explicit types for models, service APIs, and persistence DTOs.
- Validate user input.
- Handle errors with friendly messages.
- Keep file names consistent and predictable.
- Avoid hidden global state.
- Do not introduce NgRx or another global state library unless an ADR approves it.

## Local-First Constraints
- App must work offline.
- Store user data locally.
- No login required.
- No paid service required.
- CSV import/export is the MVP sync strategy.
- Mobile push notification is optional and not part of MVP.

## UI/UX Rules
- Preserve the existing calm, subtle skeuomorphic direction without assuming repo-local design skills are installed.
- Keep skeuomorphism subtle, calm, and usable.
- Use tactile cards, soft shadows, sticky-note-like surfaces, and clear controls.
- Do not make the UI cluttered or cartoonish.
- Reminder UI must be friendly, visible, and non-annoying.
- Preserve the existing visual design. Light, dark, and system theme selection and persistence are intentionally outside the MVP.

## Testing Expectations
- Add unit tests for services that contain business logic.
- Add tests for timer/reminder calculations.
- Add tests for CSV import/export validation.
- Add tests for settings persistence.
- Add E2E tests for core flows when UI is stable.
- Do not skip tests for critical reminder behavior.
- The current `lint` command is a Prettier check, not semantic linting; do not describe it otherwise.

## Forbidden Overengineering
- No backend in MVP.
- No authentication in MVP.
- No real-time sync in MVP.
- No AI planner in MVP.
- No complex plugin system.
- No premature global state library.
- No large refactor unrelated to the current task.
- No implementing future phases while working on the current phase.

## How To Use The Docs
- `plans.md`: product requirements and UX behavior.
- `architecture.md`: technical design and boundaries.
- `decisions.md`: accepted architecture decisions.
- `todos.md`: corrected current work state and next milestone; historical checkboxes must still be verified against source.

## End-of-Phase Report
At the end of every phase, report:
1. What changed.
2. Completed checkboxes.
3. Tradeoffs.
4. Risks or known gaps.
5. Recommended next phase.
