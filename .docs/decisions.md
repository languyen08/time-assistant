# decisions.md

# Decision Log

This file records architecture decisions in ADR style.

---

## ADR-001: Local-First MVP

Status: Accepted

Context:
The app should be useful without accounts, servers, or internet access. The first version should focus on proving the task transition workflow.

Decision:
Build the MVP as a local-first desktop application. Store tasks, settings, reminder processing
state, and history events locally. Keep live BreakSession state process-lifetime only as formalized
by ADR-017.

Consequences:

- Works offline.
- Faster to build and test.
- No backend, authentication, billing, or hosting required.
- Cross-device usage starts with manual import/export.
- Real sync can be added later only after a new ADR.

Current implementation note:

- IndexedDB v2 currently persists `tasks`, `settings`, and `history` stores.
- Task timing/reminder state is embedded in task records rather than separate task-run or reminder stores.
- Live break-session state is runtime-only; only break history events are persisted.

---

## ADR-002: Desktop Notification by Default

Status: Accepted

Context:
The app must remind the user in a visible way while staying friendly and not annoying.

Decision:
Use desktop notifications by default. When the app is open, also show an in-app friendly reminder overlay with clear actions.

Consequences:

- Reminders are visible even when the main app is not focused.
- In-app overlay allows richer actions than native notifications alone.
- Notification sound must be soft and configurable.
- Reminder repeat count and interval must be respected.

Accepted product behavior update (2026-10-05): tasks may explicitly disable reminders through
`reminderEnabled: false`. New and legacy tasks default to enabled. No-reminder tasks retain the
existing timer, manual completion and Break flow; they never participate in normal reminder or
extension processing. This adds a backward-compatible task property without changing ADR-016
ownership or IndexedDB v2. Separately configured Finish-by deadlines remain governed by ADR-015.

---

## ADR-003: Mobile Push Notification Optional

Status: Accepted

Context:
Mobile push notifications can be useful, but they require more infrastructure and platform-specific work.

Decision:
Do not include mobile push notifications in the MVP. Treat mobile push as optional future work.

Consequences:

- MVP remains simpler.
- No mobile app required.
- No push provider required.
- Future mobile support requires a separate plan and ADR.

---

## ADR-004: Free Third-Party Services Only

Status: Accepted

Context:
The user wants a practical app without paid infrastructure during the MVP stage.

Decision:
Do not require paid third-party services. Free local tools and optional free APIs are acceptable only if they do not block offline usage.

Consequences:

- Lower cost.
- Better privacy.
- Fewer external dependencies.
- Some advanced sync and calendar features may be delayed.

---

## ADR-005: Simple Architecture Before Scaling

Status: Accepted

Context:
The app has many possible features, but the first priority is a usable task transition experience.

Decision:
Use a simple Angular + Electron + local storage architecture. Avoid complex backend, distributed sync, global state libraries, and plugin systems until needed.

Consequences:

- Easier implementation.
- Easier debugging.
- Lower risk of overengineering.
- Some abstractions may need to be improved later.

---

## ADR-006: Angular Frontend

Status: Accepted

Context:
The preferred frontend framework is Angular.

Decision:
Use Angular `21.2.15` for the frontend. Do not use React for this project.

Consequences:

- Angular services, routing, components, forms, and testing patterns are the default.
- Documentation and examples should use Angular.
- Codex/agents must not generate React components.

---

## ADR-007: Electron Desktop Shell

Status: Accepted

Context:
The app needs desktop notifications, local storage, CSV file dialogs, sound playback, tray behavior, and sticky-note-like always-on-top windows. Angular provides the UI but cannot behave like a native desktop app by itself.

Decision:
Use Electron `44.4.5` as the desktop shell. Angular remains the frontend UI. Electron owns native desktop behavior through main process code, BrowserWindow configuration, preload scripts, and safe IPC.

Consequences:

- The app runs as a real Windows desktop executable instead of a browser-only web app.
- Sticky-note mode can use a small always-on-top BrowserWindow.
- Electron makes desktop notifications, tray behavior, background scheduler support, and file dialogs possible; this consequence describes capability, not completed implementation.
- Electron uses more memory than lighter native shells, but it is simpler and more mature for this app's desktop UX needs.
- Renderer security must be enforced with `contextIsolation: true`, `nodeIntegration: false`, narrow preload APIs, and validated IPC inputs.
- A future desktop-shell migration can be considered only after MVP stability and with a new ADR.

Current implementation note:

- Main, sticky-note, and user-guide BrowserWindows are implemented.
- A native Tray owns background availability and explicit Quit; it can open the main window or
  show an existing hidden Sticky Note.
- Sticky Note X hides its BrowserWindow without changing the persisted enabled preference.
- Main application X closes only Main and leaves Sticky Note, Tray, and the process unchanged.
- Tray icon click restores/focuses Sticky Note only; Open Time Assistant explicitly opens Main.
- Tray Quit destroys every application window and the Tray before quitting completely.
- Desktop notifications, sticky-window controls, and explicit text-file dialogs are implemented through narrow preload/IPC APIs.
- Windows startup-at-login configuration uses narrow preload/IPC APIs with structured confirmed OS results. The distributed portable build targets its original launcher kept at the registered path; the existing executable fallback remains for unpacked diagnostics. Quoted executable identity avoids the pinned Electron path-with-spaces read-back defect. Development/smoke execution and unresolved portable launchers are explicitly unsupported.
- No independent Electron main-process reminder scheduler is implemented.
- Timer/reminder scheduling currently starts inside each Angular renderer, creating unresolved multi-window ownership risk.

---

## ADR-008: Phase-Based Implementation With Review Gates

Status: Accepted

Context:
The product has many UX-sensitive features. Building everything at once risks bad UX, overengineering, and hard-to-review code.

Decision:
Implement the app phase-by-phase. Stop after each phase for human review before continuing.

Consequences:

- Better review control.
- Less scope creep.
- Easier to catch UX problems early.
- Codex/AI agents must not implement future phases early.
- `todos.md` becomes the source of truth for phase order.

Reconciliation note:
Historical work did not remain strictly sequential, and some completed checkboxes became unsupported by current source. Until the checklist is fully stabilized, future work must use current source reality first, accepted ADRs second, and the corrected **Current Reconciliation / Stabilization** section of `todos.md` third.

---

## ADR-009: CSV as MVP Sync and Sharing Strategy

Status: Accepted

Context:
The user wants to share data across devices and inspect history in charts, but full sync is too much for MVP.

Decision:
Use CSV import/export for tasks and history in the MVP.

Consequences:

- Simple and transparent.
- Works with spreadsheet tools.
- Easy backup/sharing.
- Conflict handling is basic at first.
- Real sync can be considered later.

---

## ADR-010: Subtle Skeuomorphic UI Direction

Status: Accepted

Context:
The app should feel friendly, visible, and comfortable rather than cold or stressful.

Decision:
Use the configured UI/UX and skeuomorphism skills from `.codex/skills` when designing the interface.

Consequences:

- UI should use tactile cards, soft depth, sticky-note-like surfaces, and warm interactions.
- Design must remain accessible and not decorative at the cost of usability.
- Reminder UX should be calm and encouraging.

Current implementation note:
The repository currently has no `.codex/` directory. The visual principles remain accepted, but future agents must not assume repo-local skills are installed.

---

## ADR-011: Optional Google Calendar OAuth

Status: Superseded

Context:
The `.ics` export flow is local-first but not clear enough for daily use. The user wants to connect a Google account and send reminder tasks directly to Google Calendar.

Decision:
Add optional Google Calendar OAuth for the desktop app. Use the system browser, desktop OAuth with PKCE, and a loopback callback handled by Electron main. Store OAuth tokens locally in Electron `userData`. Keep Google Calendar sync user-triggered and scoped to calendar event creation/update. Do not add a backend.

Consequences:

- Calendar sync is easier to use than `.ics` files.
- The core task flow still works offline without Google Calendar.
- A Google Cloud OAuth desktop client ID is required.
- OAuth tokens become sensitive local data and must stay out of Angular renderer state.
- This is no longer a purely no-login feature, but login remains optional.

Superseded:
Calendar integration was removed from the current MVP after review. Future calendar work requires a new ADR before implementation.

---

## ADR-012: Electron Builder With Portable-Only Windows Distribution

Status: Accepted

Context:
The repository previously used Electron Forge alongside Electron Builder, creating two packaging
paths to maintain. Consolidation removed Forge. The accepted product decision on 2026-10-07 removes
installable Windows distribution as well. GitHub release automation already publishes only the
portable executable. Electron Builder's portable implementation still relies on NSIS internally.

Decision:

- Electron Builder remains the sole packaging tool; Electron Forge stays removed.
- The portable Windows executable is the sole user-facing distribution artifact.
- `npm run package:win` produces `release/Time Assistant.exe` with the existing artifact naming.
- `npm run package:dir` retains unpacked output only for development, debugging, profiling, and
  packaging diagnostics.
- Remove the installable/NSIS installer product, its script, and installer-only release artifacts.
  No installer artifact should be produced or maintained.
- Preserve NSIS/compiler/template/resource dependencies used internally by Builder's portable
  target. This decision does not claim NSIS is completely removed.

Consequences:

- One packaging path is easier to maintain and document.
- The only canonical packaging scripts are `package:dir` (diagnostics) and `package:win` (distribution).
- Windows release automation uses `package:win` and publishes the resulting portable executable.
- Electron Forge is no longer installed or configured.
- No install/uninstall flow, install directory policy, or installed shortcuts are shipped.
- Shared icons, app identity, signing behavior, compression, ASAR, and portable extraction behavior
  are unchanged. Startup-performance optimization is a separate task.

---

## ADR-013: Dedicated Hidden Renderer for Automatic Task Scheduling

Status: Accepted

Context:
Task persistence currently lives in Angular/Chromium IndexedDB. The Electron process can remain
alive while Main is closed and Sticky is hidden, so neither visible renderer is a reliable
process-lifetime owner. Main and Sticky also cannot both safely own future automatic task
scheduling because duplicate owners could start or defer the same task and write conflicting
history. Moving task persistence into Electron main would require a disproportionate storage and
service migration.

Decision:
Create exactly one hidden, long-lived Scheduler Angular renderer using `window=scheduler`. It
shares the existing browser session and local IndexedDB environment and is the sole owner for
future automatic task lifecycle scheduling. Main and Sticky remain presentation/action clients
for that future behavior. The Scheduler has no user-facing UI or preload bridge and does not run
normal window synchronization. Existing `ReminderSchedulerService` ownership is not migrated by
this ADR.

Consequences:

- Future automatic task starts have one authoritative owner that survives visible-window
  lifecycle changes.
- The current IndexedDB repositories remain usable without a storage technology migration.
- Duplicate future automatic scheduling risk is reduced.
- The application retains one additional hidden renderer/process.
- At the time of this ADR, Main and Sticky still each owned the existing reminder scheduler. ADR-016
  later moved normal reminder ownership to Scheduler.
- The ADR originally established ownership only; the Phase 2.2 implementation below adds automatic
  starts and retries without changing that ownership decision.

Phase 2.2 implementation note:

- The Scheduler now runs `AutomaticTaskSchedulerService` as the sole automatic-start owner.
- `reminderAt` remains the user-authored scheduled Start time, while optional `nextAutoStartAt`
  stores system-managed 30-minute retry state.
- Main and Sticky publish source-qualified break state through
  `friendly-task-reminder-break`; `prompt` and `running` block automatic starts without advancing
  retry state.
- Scheduler retains a running session's ID and absolute end time after its source closes, until
  expiry or an explicit terminal transition. This is process-memory coordination, not general
  BreakSession persistence.
- Concurrent tasks were not implemented by Phase 2.2 and are added by ADR-014 below. Deadlines
  remain unimplemented, and reminder scheduling remains owned by the visible renderers.

---

## ADR-014: Per-Task Concurrent Start and Multiple Current Tasks

Implementation consistency note (recurring tasks, 2026-10-06): normal task occurrences use the
same incoming allowConcurrentStart eligibility and final-current-task Break rules. Recurrence
adds optional task metadata and hidden defaults records to the existing IndexedDB v2 tasks store;
it does not introduce another scheduler/store or change the accepted ownership boundary. Deleting
a recurring task transactionally removes its defaults record and all unfinished series records,
while completed occurrences and their historical evidence remain.

Status: Accepted

Context:
The original task service, Main/Sticky interfaces, and reminder actions assumed one active or
paused task. The product now requires selected incoming tasks to run concurrently while retaining
the existing deterministic queue, automatic retry, reminder, and break behavior.

Decision:

- Add user-owned `allowConcurrentStart`, defaulting and normalizing to `false` without an IndexedDB
  version change.
- Expose ordered `activeTasks` and `currentTasks` collections from `TaskService` and require an
  explicit task ID for lifecycle mutations.
- Decide start eligibility from the incoming task's flag. Concurrent incoming tasks may bypass
  active/paused blockers; non-concurrent incoming tasks may not.
- Keep Break global: prompt/running state blocks every automatic start, including concurrent tasks.
- Scan all active tasks in deterministic order for reminders while showing only one reminder
  overlay at a time and targeting its task ID.
- Prompt for Break only when completing the last active/paused task. Deletion never prompts.

Consequences:

- Multiple active/paused records may coexist and Main/Sticky render task-specific cards. Main shows all current tasks; Sticky caps these at `stickyVisibleNotes` (1–5), prioritizes them over queued tasks, and reloads settings via invalidation on the existing task channel when another window saves/resets settings.
- Singular mutation APIs are no longer valid business interfaces.
- Several overdue concurrent tasks may start during one Scheduler evaluation in queue order.
- Old IndexedDB records and old CSV files remain compatible through `false` normalization/defaults.
- At the time of this ADR, reminder overlay serialization worked only within each renderer. ADR-016
  later removed the separate Main/Sticky duplicate reminder-owner race.

---

## ADR-015: Scheduler-Owned One-Time Finish-By Deadline Alerts

Status: Accepted

Context:
Finish-by deadlines must fire for pending, active, and paused tasks, including while work is blocked
by another task or a Break. They must remain reliable while Main is closed or Sticky is hidden,
without allowing Main and Sticky to independently send duplicate native notifications. The hidden
Scheduler previously had no native-notification bridge.

Decision:

- The dedicated Scheduler renderer is the sole owner of deadline triggering through
  `DeadlineSchedulerService`.
- One-time trigger and acknowledgement state are persisted on Task as `deadlineNotifiedAt` and
  `deadlineAcknowledgedAt` without changing IndexedDB version 2.
- Scheduler receives a dedicated `scheduler-preload.cjs` that exposes only
  `window.assistantTime.notify(...)` and reuses the validated `assistant-time:notify` IPC handler.
- Scheduler persists the trigger, records `deadline_reached`, and then sends one native notification
  containing the user-authored custom message.
- Main and Sticky only display persisted unacknowledged deadline alerts. Got it acknowledges the
  exact task and normal task broadcasting synchronizes the change.
- Finish by is absolute: pause, Break, automatic-start retry, and reminder Add more time do not
  pause or move it. Changing Finish-by time re-arms it; changing only the message does not.

Consequences:

Positive:

- One authoritative deadline trigger owner prevents Main/Sticky native-notification duplication.
- Persistent processing state deduplicates notifications across renderer or application restart.
- Deadline triggering continues while only Tray/Scheduler remain, with no storage technology or
  IndexedDB version migration.

Tradeoffs:

- Scheduler gains one narrow native capability.
- A native notification failure after the trigger is persisted is not retried; the persisted in-app
  alert remains available.
- Main and Sticky may both temporarily show the same unacknowledged in-app alert until one
  acknowledges it.
- A fully exited Electron process cannot trigger at the wall-clock instant; overdue unprocessed
  deadlines are handled on the next launch.
- The general Main/Sticky normal-reminder ownership race remains separate technical debt.

---

## ADR-016: Scheduler-Owned Reminder Processing and Single In-App Presenter

Status: Accepted

Context:
Main and Sticky previously ran independent reminder schedulers. Because task synchronization over
`BroadcastChannel` is eventual, both renderers could observe and process the same due occurrence,
duplicating history, native notification, sound, and renderer-memory overlay state even when the
final stored task looked valid. The hidden Scheduler already owns automatic starts and Finish-by
deadlines, while the active normal reminder previously existed only in renderer memory.

Decision:

- Scheduler is the sole normal-reminder timing and notification owner. Main and Sticky never start
  reminder loops.
- Persist the pending occurrence on Task as optional `pendingReminder` containing `attemptNumber`,
  `maxAttempts`, `shownAt`, and the generated `message`, without changing IndexedDB v2 or adding a
  store/index.
- Permit at most one pending reminder globally. Scheduler selects the first eligible active due task
  in deterministic order and creates at most one occurrence per check.
- Persist the occurrence, attempt increment, and next-attempt timing before recording one
  `reminder_shown` event and dispatching native notification/configured sound.
- Electron main selects one in-app presenter from BrowserWindow existence through a narrow normal
  preload query/change-event API: Main has priority, Sticky is fallback, and neither means no
  in-app presentation. Scheduler preload remains notify-only.
- Presenter transitions render the same persisted occurrence and never create another attempt,
  history event, native notification, or sound.
- Dismiss is persisted. Add time, pause, and complete clear only the target task's pending
  occurrence; delete removes it with the task. Resume does not restore a prior occurrence.
- Before triggering, TaskService rereads persisted task state and verifies active, due, below-limit,
  and no-pending eligibility.

Consequences:

Positive:

- Removes the Main/Sticky duplicate-processing race.
- Pending reminder UI survives renderer recreation and application restart.
- Friendly message, shown time, and attempt identity remain stable across presenter transitions.
- Multiple active tasks remain deterministically serialized behind one reminder interaction.
- Reminder timing, native notification, and sound have a clear process-lifetime owner.

Tradeoffs:

- Task gains optional runtime reminder processing state.
- One pending reminder blocks later due reminders until it is acted on or dismissed.
- Persistence-before-notification means native notification failure is not automatically retried;
  the persisted in-app reminder remains available.
- Presenter lifecycle adds a narrow Electron IPC/event surface and a Sticky interaction reset.
- The fresh repository read materially reduces stale-renderer overwrite risk but is not a
  distributed transaction or mathematical compare-and-set across renderer processes.

---

## ADR-017: Break Sessions Are Process-Lifetime Only

Status: Accepted

Context:
Scheduler retains a confirmed running break's session ID and absolute end time in process memory so
closing or reloading a visible Main or Sticky window does not unblock automatic scheduling. The
full BreakSession UI is not persisted. The product boundary for full application Quit was not
previously explicit.

Decision:

- Live BreakSession state is process-lifetime only.
- Same-process Scheduler retention of a running break remains in place until expiry or an explicit
  terminal transition.
- Full application exit discards prompt, running, and complete BreakSession state, including the
  Scheduler's retained running-break block.
- The next application launch starts with no restored break and is unblocked unless a
  current-process renderer reports a break.
- Do not add BreakSession persistence, a storage model/store, an Electron-main persisted copy, or
  an IndexedDB version change.

Consequences:

- Window close or reload and full application Quit have intentionally different behavior.
- Break behavior is simple and predictable without migration or storage complexity.
- An accidental application restart ends the current break.
- A user who wants to continue a break after restart must start a new break manually.
