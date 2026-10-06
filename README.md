# Time Assistant

Local-first Windows desktop task reminder app built with Angular and Electron.

Time Assistant helps you queue tasks, focus on current tasks with optional per-task concurrent start, receive gentle reminder prompts, take breaks between sessions, and review your recent work history without needing an account, backend, or cloud sync.

## Current Scope

- Windows-first desktop experience packaged with Electron
- Local IndexedDB storage for tasks, settings, and history
- One active task at a time with start, pause, resume, extend, and complete actions
- Repeated reminder prompts with configurable attempt count and repeat interval
- Break flow that can start after completion and resume into the next queued task
- Sticky-note companion window with theme/color and always-on-top settings
- History timeline plus summary charts for completed tasks, focus time, categories, and reminders
- CSV task import plus CSV export for tasks and history

## Tech Stack

- Node.js `26.2.0`
- npm `11.16.0`
- Angular `21.2.15`
- Electron `42.3.0`
- Chart.js `4.5.1`
- ng2-charts `8.0.0`
- Papa Parse `5.5.3`

The repo pins runtime and package manager versions through `.node-version`, `.nvmrc`, `.npmrc`, and `packageManager`.

## Setup

```powershell
npm.cmd install
```

PowerShell may block `npm.ps1` on some Windows machines. Use `npm.cmd` if that happens.

## Development

Run the desktop app:

```powershell
npm.cmd start
```

Preview the Angular UI in a browser:

```powershell
npm.cmd run web
```

Run Electron against a fresh Angular build:

```powershell
npm.cmd run build
npm.cmd run electron
```

`npm.cmd start` and `npm.cmd run electron` both launch Electron. `npm.cmd run web` is only a browser preview and uses a separate IndexedDB profile from the desktop app.

## Useful Scripts

```powershell
npm.cmd test
npm.cmd run e2e:break-conflict
npm.cmd run format
npm.cmd run format:check
npm.cmd run lint
npm.cmd run electron:smoke
npm.cmd run package:dir
npm.cmd run package:win
npm.cmd run package:installer
npm.cmd run release:patch
npm.cmd run release:minor
npm.cmd run release:major
```

`npm.cmd run package:win` builds a portable [Time Assistant.exe](</c:/Where I improve myself/time assistant/release/Time Assistant.exe>) that you can launch immediately. `npm.cmd run package:dir` builds the unpacked app folder, and `npm.cmd run package:installer` creates the Windows installer.

This repository includes [.github/workflows/release-windows.yml](/c:/Where%20I%20improve%20myself/time%20assistant/.github/workflows/release-windows.yml),
which builds and publishes `Time Assistant.exe` to a GitHub Release.

This repository also includes [.github/workflows/deploy-pages.yml](/c:/Where%20I%20improve%20myself/time%20assistant/.github/workflows/deploy-pages.yml),
which deploys the `docs/` folder to GitHub Pages with GitHub Actions.

Release triggers:

- Push a tag like `v1.0.0`
- Or run the `Release Windows App` workflow manually and provide a tag

Release helpers:

- `npm.cmd run release:patch` creates and pushes the next patch tag like `v1.0.1`
- `npm.cmd run release:minor` creates and pushes the next minor tag like `v1.1.0`
- `npm.cmd run release:major` creates and pushes the next major tag like `v2.0.0`

These helpers require a clean git working tree before tagging.

When to run them:

- Run a release helper only when you want to publish a new app version to GitHub Releases.
- Use them after your code changes are committed and pushed to `main`.
- Do not run them for every ordinary commit or for docs-only updates unless you also want a new `.exe` release.

Typical release flow:

```powershell
git add .
git commit -m "Describe the release changes"
git push origin main
npm.cmd run release:patch
```

Versioning guide:

- Use `release:patch` for bug fixes or small improvements.
- Use `release:minor` for new features that do not break existing usage.
- Use `release:major` for large or breaking changes.

GitHub Pages trigger:

- Push changes to `main` that touch `docs/**`
- Or run the `Deploy Pages` workflow manually

Notes:

- Unsigned `.exe` files downloaded from the internet will usually trigger Microsoft Defender SmartScreen.
- GitHub Releases are a better place to publish the `.exe` than GitHub Pages.

Guide asset helpers:

```powershell
npm.cmd run guide:screens
npm.cmd run guide:preview
npm.cmd run guide:refresh
```

The guide preview scripts use [docs/user-guide.html](/c:/Where%20I%20improve%20myself/time%20assistant/docs/user-guide.html) and write image artifacts into `artifacts/`.

## Data and CSV Behavior

### Recurring tasks

Enable **Repeat** when creating a task, choose Every day, Weekdays, or Custom weekdays, and set
the Repeat period. The start date is required; the optional end date is inclusive. Custom needs
at least one selected weekday. Start time supplies the local time of day for each occurrence.
An empty Start time is still allowed when reminders are disabled. Repeat and reminders are
independent.

Each occurrence is a normal task with its own elapsed time, pauses, completion, reminder attempts,
history, and chart contribution. The app keeps one unfinished occurrence per series and creates
the next applicable date after completion. On reopening it skips dates that were never created,
retains existing unfinished tasks, and never builds a missed-date backlog.

When editing, **This occurrence only** leaves future defaults intact. **This and future occurrences**
loads the series defaults, updates the selected current/future task, and reconciles future tasks
that have not started. Completed and past tasks, and future tasks with timing or alert activity,
are preserved. Disable Repeat in this scope to stop the series after the selected task. Delete on
any recurring occurrence removes the recurring task: its hidden defaults and all unfinished
occurrences are removed, so future tasks cannot be generated. Completed occurrences and their
existing history remain available for charts and review.

Sticky cards remain compact, with no Reminder or +10m controls when reminders are disabled.
Finish by keeps its time of day and calendar-day offset from Start time on each new occurrence;
pause, extensions, and Break still do not move an occurrence's concrete deadline.

Task CSV adds `recurrenceType`, `recurrenceDays` (semicolon-separated JavaScript weekdays:
Sunday 0 through Saturday 6), `recurrenceStartDate`, `recurrenceEndDate`, `recurrenceSeriesId`,
`occurrenceDate`, `recurrenceTemplate`, and `recurrenceCursor`. Calendar dates are `YYYY-MM-DD`.
Exports include hidden defaults rows (`recurrenceTemplate=true`) so occurrence-only overrides and
deleted-date allocation state survive transfer. Keep those rows when editing a CSV. Reimporting
an existing series clones it with a new series ID. Files without recurrence columns remain ordinary
tasks; files without `reminderEnabled` still enable reminders. Import retains the existing behavior
of restoring unfinished tasks as pending. IndexedDB stays at version 2 with the same three stores.

The app stores all data locally in IndexedDB. Core workflows work offline and do not require login, calendar integration, or cloud services.

- Task CSV import validates required columns and reminder values before saving.
- Task CSV includes `reminderEnabled` (`true`/`false`). Older CSV files without it default to
  enabled. Disabled rows can omit reminder count/interval and Start time; an empty Start time makes
  the task ready now. Reminder-enabled rows keep the existing validation.
- Task CSV export includes reminder/timer state fields useful for moving local data between machines.
- History CSV export includes event type, timestamp, summary, and metadata JSON.
- CSV date/time output can use ISO timestamps or a spreadsheet-friendly local `yyyy-MM-dd HH:mm` format.

## Quality Gates

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run electron:smoke
```

## Known Limitations

- Data is local to each runtime profile. Electron and browser preview do not automatically share IndexedDB data.
- Sync is still manual. There is no cloud sync or real-time multi-device storage.
- CSV import currently covers tasks only. History is export-only.
- Calendar integration, required accounts, and mobile push notifications are outside the current MVP.

## Windows desktop settings

Sticky notes shown is the maximum number of current active/paused cards (1–5). Main shows all current tasks; Sticky gives those cards priority over pending tasks. Changes propagate to open windows through the existing local BroadcastChannel.

Start app with Windows reads Windows state each time Settings opens and confirms changes after writing. NSIS starts the installed executable; portable starts the original launcher, which must remain at its registered path. Re-enable startup after moving that launcher. Development and smoke runs cannot enable startup. The pinned Electron Windows API requires a quoted executable identity for accurate read-back of paths containing spaces.
