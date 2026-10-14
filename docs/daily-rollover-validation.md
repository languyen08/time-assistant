# Daily recurring rollover validation

Validated on 2026-10-14 for PR #1, branch `fix/daily-recurring-task-rollover`, against
`main` at `c8c9abe`. All 11 original PR files were reviewed. Canonical guidance was read from
`.docs/AGENTS.md`, `.docs/plans.md`, `.docs/architecture.md`, `.docs/decisions.md`, and `.docs/todos.md`.
Work used an isolated checkout to preserve unrelated changes in the main workspace.

## Findings and fixes

- The repository return type changed without updating existing tests. Update those assertions and
  replace the obsolete expectation that yesterday's unfinished work stays active.
- Break caused the automatic scheduler to skip reconciliation. Reconcile independently of Break;
  preserve Break, concurrency, due-time, and retry rules when deciding automatic starts.
- Reminder/deadline loops could act on yesterday's state before rollover finished. All three
  Scheduler loops await reconciliation; concurrent local checks serialize.
- Stale renderer actions could resurrect interrupted work, and future edits could overwrite series
  defaults. Guard recurring writes and future edits inside the task-store transaction.
- Interruption cleared pause evidence. Preserve historical start/pause fields, clear scheduling
  state, and explicitly reset all runtime fields (including interruptedAt) on new occurrences.
- Disabling future repetition could leave an allocated past occurrence active. Reconcile existing
  series occurrences even when the template's recurrence rule has been disabled or removed.
- History failure prevented refreshed state from reaching the UI. Publish committed tasks first;
  append interruption and creation events in one existing history batch.
- CSV rejected interrupted status and dropped completed start evidence. Preserve terminal statuses
  and timing evidence; append an optional interruptedAt column without breaking legacy headers.
- The new ADR reused ADR-013 and docs incorrectly tied automatic starts to reminder settings.
  Renumber to ADR-018 and clarify no-reminder automatic starts and calendar rollover during Break.

## Business-rule verification

| Rule                                                                             | Evidence                                                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Past Pending/Active/Paused becomes Interrupted, never Completed                  | Parameterized service tests at local midnight                                                                                 |
| Fresh occurrence is Pending with zero elapsed and clean runtime fields           | Service/repository tests and browser/Electron persistence assertions                                                          |
| Yesterday's pause does not carry forward                                         | Service midnight tests and paused restart browser tests                                                                       |
| Completed records/statistics remain intact; interrupted offline time is excluded | Three chart aggregations compared with the completed-only baseline; CSV terminal round trips                                  |
| Non-recurring tasks remain unchanged                                             | Next-day one-time active regression and existing lifecycle suite                                                              |
| Long downtime creates no missed-day backlog                                      | December service restart and week-long browser restart; repository date selection                                             |
| Repeated initialization creates no duplicate occurrences or events               | Concurrent repository/service tests and simultaneous Main/Sticky/Scheduler startup/reload with real IndexedDB                 |
| Automatic starts preserve due-time and Break behavior                            | Real TaskService with automatic scheduler: fresh pending before due, Break blocks, due and unblocked starts with zero elapsed |
| Reminder/deadline processing cannot notify yesterday's work                      | Real TaskService reconciliation before each notification scheduler                                                            |
| Local calendar boundaries, weekdays/custom/end dates and DST remain correct      | Explicit Vietnam browser timezone; New York spring/fall DST, year boundary, eligible-day and ended-series repository tests    |
| Main and Sticky converge at midnight in Electron                                 | Production Angular assets loaded by actual Electron, both visible windows open, isolated user-data profile                    |

## Validation commands and results

- `npm ci --cache ../../tmp/npm-cache --no-audit --no-fund`: installed 743 packages from the
  existing lockfile; package.json and package-lock.json remain unchanged.
- Focused `npm test -- --include ...` checks covered recurrence, repository, CSV, all three
  schedulers, and the recurrence utility. Initial failures were obsolete assertions; corrected.
- `npm test`: **258 tests passed across 18 files**, including final stale-future-edit protection.
- `npm run test:electron`: **50 tests passed across four files**.
- `npm run e2e:break-conflict`: **15 scenarios passed**, including three new rollover scenarios.
- `npx playwright test -c e2e/playwright.sticky.config.mjs`: the existing actual Electron Sticky
  scrolling/resizing scenario passed. After adding the midnight scenario,
  `npx playwright test -c e2e/playwright.sticky.config.mjs e2e/electron-daily-rollover.spec.mjs`
  passed with the final production assets. Both scenarios are included in `npm run e2e:sticky`.
- With PowerShell `$env:TZ = 'America/New_York'`, `npm test` including
  `task-recurrence.service.spec.ts`, `task.repository.spec.ts`, and `recurrence.util.spec.ts`:
  **44 tests passed**. Tests use local calendar constructors, not fixed 24-hour increments.
- `npm run build`: production build passed. Initial bundle **773.81 kB**, component CSS **38.94 kB**;
  existing 650 kB/38 kB warning budgets remain below their error thresholds.
- Changed TypeScript and E2E files passed Prettier; `git diff --check` passed.

## Tradeoffs and limits

Angular 21.2.15, Electron 44.4.5, exact dependencies, notify-only Scheduler preload, and IndexedDB
v2's existing tasks/settings/history stores remain unchanged. No new scheduler, storage migration,
or dependency is introduced. Reconciliation stays lazy, allocating one current or next eligible
occurrence, including on non-eligible weekends; it does not backfill missed dates.

Task persistence and history append remain separate transactions, as required by the existing
architecture. A crash or history-store failure after rollover commits can omit new history events;
it cannot duplicate occurrences or leave persisted work active. Existing history remains intact,
and task state still refreshes. Interrupted timing evidence is retained for audit and excluded
from completion/focus statistics because offline activity cannot be inferred. Live history lists
in other renderers retain the existing limited synchronization.

Validation used available Node **25.6.0** and npm **11.8.0**; the repository pins Node 26.2.0/npm
11.16.0. The sandboxed install first failed DNS resolution, and sandboxed Vitest failed a temporary
file rename; approved execution outside the sandbox completed installation and tests. The first
Electron midnight test attempted to reload Angular's normalized file URL; removing that unnecessary
test navigation made the scenario pass. Application routing was not changed.

No Windows portable release package was rebuilt. The desktop test uses the production Angular build
inside the repository's actual Electron runtime. No real user profile or Windows startup settings
were modified. The next step is PR review; no unrelated product phase is started.
