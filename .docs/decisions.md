# decisions.md

# Decision Log

This file records architecture decisions in ADR style.

---

## ADR-001: Local-First MVP

Status: Accepted

Context:
The app should be useful without accounts, servers, or internet access. The first version should focus on proving the task transition workflow.

Decision:
Build the MVP as a local-first desktop application. Store tasks, settings, reminders, task runs, break sessions, and history events locally.

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
- Windows startup-at-login configuration is implemented through narrow preload/IPC APIs; Windows login-item state is authoritative and portable builds resolve the original portable executable path.
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

## ADR-012: Consolidate Packaging on Electron Builder

Status: Accepted

Context:
The repository previously used Electron Forge alongside Electron Builder, creating two packaging paths to maintain. Electron Builder already provides the directory, portable Windows, and NSIS installer outputs used by the project and its release automation.

Decision:
Use Electron Builder as the sole packaging tool. Remove `forge.config.cjs`, Electron Forge dependencies, and Forge commands or documentation.

Consequences:
- One packaging path is easier to maintain and document.
- The canonical packaging commands are the Electron Builder-backed `package:dir`, `package:win`, and `package:installer` scripts.
- Windows release automation uses `package:win` and publishes the resulting portable executable.
- Electron Forge is no longer installed or configured.

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
- Main and Sticky still each own the existing reminder scheduler, so the duplicate reminder race
  remains technical debt.
- This ADR establishes ownership only; automatic starts, retries, concurrent tasks, and deadlines
  are not implemented.
