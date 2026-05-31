# Friendly Task Reminder

Local-first Windows desktop productivity app for calm task transition reminders.

## Required Tooling

- Node.js `26.2.0`
- npm `11.16.0`

The repo includes `.node-version`, `.nvmrc`, `.npmrc`, and `packageManager` metadata so contributors use the pinned runtime and exact package versions.

## Setup

```powershell
npm.cmd install
```

PowerShell may block `npm.ps1` on some Windows machines. Use `npm.cmd` if that happens.

## Development

Run the Windows desktop app:

```powershell
npm.cmd start
```

Preview the Angular web UI in a browser:

```powershell
npm.cmd run web
```

Run the Electron shell against an existing Angular build:

```powershell
npm.cmd run build
npm.cmd run electron
```

`npm.cmd start` and `npm.cmd run electron` both launch the Electron desktop shell. `npm.cmd run web` is only for browser preview and uses the browser's own IndexedDB data.

## Quality Gates

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run electron:smoke
```

## Local Data and Export

The app stores tasks, settings, and history locally in IndexedDB. Core task reminders work without login, backend, calendar connection, or cloud sync.

CSV export includes stable headers for tasks and history. The CSV date/time format setting controls whether exports use ISO timestamps or a spreadsheet-friendly local `yyyy-MM-dd HH:mm` format.

## Troubleshooting

- If PowerShell blocks `npm.ps1`, use `npm.cmd`.
- If Electron and browser preview show different data, that is expected: each runtime has its own local IndexedDB storage.

## Scope

Current MVP scope is local-first desktop use with manual CSV export. Calendar integration, general cloud sync, required accounts, background sync, and mobile push are outside the MVP.
