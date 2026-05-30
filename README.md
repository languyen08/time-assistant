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

```powershell
npm.cmd start
```

To run the Electron shell against a built Angular app:

```powershell
npm.cmd run build
npm.cmd run electron
```

## Quality Gates

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run electron:smoke
```

## Scope

Phase 0 creates only the project foundation, desktop shell, pinned tooling, and quality commands. Product flows start in Phase 1.
