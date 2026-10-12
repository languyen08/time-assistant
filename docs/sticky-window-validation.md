# Sticky Note scrolling and resizing fix

Validated on Windows, 2026-10-12. No dependencies added.

## Root causes

- `html`, `body`, the Angular host, shell, and Sticky window grew with content while outer
  overflow was hidden. The task stack had no constrained scroll viewport. Electron capped
  automatic height to the screen, leaving overflowing cards clipped with no way to reach them.
- The measurement root and all descendants were explicitly draggable. Only controls were
  excluded, so the task surface could not receive normal scrolling interaction. Electron's
  [draggable-region documentation](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)
  explains why interactive content needs `no-drag`.
- BrowserWindow used `resizable: false` and both minimum and maximum width were 460.
  Automatic resize IPC also reset width to 460 on every content change.
- Renderer measurement removed queued cards when screen height was exceeded, rather than
  making them reachable through scrolling.

## Resulting behavior

The Sticky layout fills the native content viewport. A fixed toolbar sits above a vertically
scrollable, keyboard-focusable task region. The scroll viewport has `min-height: 0` and
`min-width: 0`; cards retain their natural height. Only toolbar space is draggable, with a
six-pixel strip left clear for native resizing. Toolbar controls and task content are `no-drag`.
Buttons wrap at narrow sizes with enough width for their labels. Existing colors, card padding,
gaps, task actions, and the configured maximum of 1–5 visible cards are preserved.

Native resizing is enabled with a 360 × 240 minimum and no fixed maximum width. Until the user
resizes, automatic height follows content within the matching display's work area. Once the
user resizes, automatic sizing yields to that preference. Main stores content dimensions in
`userData/sticky-window-size.json`, debounces writes, and flushes on close or Quit. Restore
validates dimensions and bounds them to the primary display. Missing or invalid dimensions
fall back to 460 × 360. Persistence failures are logged without blocking window use.

The existing application settings service is renderer-owned IndexedDB and unavailable before
BrowserWindow creation. A small main-owned geometry file avoids new dependencies, additional
IPC, or cross-window settings overwrite races. The same content-size API is used for live resize
and restoration to avoid a Windows frame/DPI-related height drift found by the restart test.

## Files modified or added

| Files                                                                                                | Purpose                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/styles.css`                                                                                     | Constrain Sticky document to viewport height.                                                   |
| `src/app/app.html`, `src/app/app.css`                                                                | Fixed toolbar, scroll region, flex sizing, drag regions, accessible card layout.                |
| `src/app/app.ts`, `src/app/app.spec.ts`                                                              | Measure toolbar plus natural task height; stop removing queued cards; regression coverage.      |
| `src/app/shared/components/task-action-buttons.component.ts`                                         | Preserve button proportions and allow readable wrapping in narrow windows.                      |
| `electron/main.cjs`                                                                                  | Enable native geometry controller and restore/save integration; preserve chosen dimensions.     |
| `electron/sticky-window-size.cjs`, `electron/sticky-window-size.spec.mjs`                            | Minimal persistence, validation, display bounds, native resize handling, focused unit coverage. |
| `e2e/sticky-window.spec.mjs`, `e2e/playwright.sticky.config.mjs`                                     | Actual Electron renderer regression with isolated profiles and screenshots.                     |
| `package.json`                                                                                       | Include geometry tests in `test:electron`; add `e2e:sticky`.                                    |
| `.docs/AGENTS.md`, `.docs/architecture.md`, `.docs/decisions.md`, `.docs/plans.md`, `.docs/todos.md` | Synchronize the five canonical documents.                                                       |
| `docs/sticky-window-validation.md`                                                                   | Record causes, behavior, files, validation, and limitations.                                    |

## Validation

- Angular: **237 tests passed** across 18 suites, including queued-card retention on short screens
  and toolbar-aware measurement. Existing reminder, task lifecycle, settings, and scheduling tests pass.
- Electron: **50 tests passed** across four suites, including user-size priority, debounce/close
  flush, restoration, corrupt geometry, small/oversized saved dimensions, and storage failures.
- Real Electron: **one scenario passed** with **1, 3, and 10 stored tasks**, each at
  **360 × 240, 460 × 360, and 720 × 600** (Windows physical-pixel rounding allows up to two DIP).
  Verified native resizability/minimum constraints, large and fractional wheel input when content
  overflows, fixed toolbar position, last visible card/action access, readable buttons without
  horizontal overflow, pause/resume, exact saved-size restoration across process restart, and
  color changes retaining the chosen size. Ten stored tasks render five cards under the existing
  maximum setting; scrolling does not change this product limit.
- Production build passed. Existing initial-bundle and component-CSS budget warnings remain.
- Changed implementation/test file Prettier checks and `git diff --check` passed.
- Small-window screenshots were inspected; saved in `artifacts/sticky-window-{1,3,10}-tasks-small.png`.

Reproduce with `npm test`, `npm run test:electron`, and `npm run e2e:sticky`.

Physical trackpad hardware and manual edge/corner dragging were not exercised. Automated tests
use fractional wheel input, actual BrowserWindow sizing/constraints, and a simulated `will-resize`
event to exercise the user preference path. No packaged release was built for this focused fix.
The available runtime was Node 25.6.0, rather than the repository's canonical Node 26.2.0.
Windows sandbox cache-renaming restrictions required the test runners to run outside the sandbox.
