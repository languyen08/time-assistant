# Time Assistant

Local-first Windows desktop task reminder app built with Angular and Electron.

Time Assistant helps you queue tasks, focus on one active task, receive gentle reminder prompts, take breaks between sessions, and review your recent work history without needing an account, backend, or cloud sync.

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
```

`npm.cmd run package:win` builds a portable [Time Assistant.exe](</c:/Where I improve myself/time assistant/release/Time Assistant.exe>) that you can launch immediately. `npm.cmd run package:dir` builds the unpacked app folder, and `npm.cmd run package:installer` creates the Windows installer.

Guide asset helpers:

```powershell
npm.cmd run guide:screens
npm.cmd run guide:preview
npm.cmd run guide:refresh
```

The guide preview scripts use [docs/user-guide.html](/c:/Where%20I%20improve%20myself/time%20assistant/docs/user-guide.html) and write image artifacts into `artifacts/`.

## Data and CSV Behavior

The app stores all data locally in IndexedDB. Core workflows work offline and do not require login, calendar integration, or cloud services.

- Task CSV import validates required columns and reminder values before saving.
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
