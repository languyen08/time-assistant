# Windows startup investigation — 2026-10-06

## Optimization experiments — 2026-10-07

The earlier investigation below is preserved. This follow-up uses the portable-only configuration,
Electron Builder 26.8.1, and the existing opt-in profiler. Local tooling remains Node 25.6.0 /
npm 11.8.0; the canonical 26.2.0 / 11.16.0 is unavailable. Each comparison uses one new isolated
userData profile and three sequential repetitions, normal security settings, the same SSD/TEMP
root, and no DevTools. Fresh-profile measurements are **not OS cold-cache measurements**.
`scripts/benchmark-startup.cjs` runs these comparisons and records inventory and all readiness
checkpoints in ignored `artifacts/startup-optimization/`; original raw profiling output stays in
`artifacts/startup-profile/`. Builds and measurements never overlap.

| Experiment                                      | Artifact MiB | Runtime MiB | Fresh s | Repeat 1 s | Repeat 2 s | Repeat 3 s | Decision                   |
| ----------------------------------------------- | -----------: | ----------: | ------: | ---------: | ---------: | ---------: | -------------------------- |
| Current portable-only baseline                  |       98.647 |     368.192 |   73.51 |      63.34 |      55.95 |      45.46 | baseline                   |
| Unpacked diagnostic baseline                    |  234.643 exe |     368.192 |   25.26 |       8.09 |       9.19 |       5.71 | diagnostic                 |
| Exclude only Electron test files                |       98.642 |     368.169 |   65.80 |      33.17 |      34.36 |      33.48 | KEEP: hygiene only         |
| 7z path, compression store                      |      368.777 |     368.169 |   94.82 |      40.26 |      40.36 |      40.00 | REVERT                     |
| Direct NSIS extraction, normal                  |      150.643 |     368.067 |   74.44 |      34.84 |      35.13 |      34.45 | KEEP: lower TEMP only      |
| Direct NSIS extraction, store                   |      368.253 |     368.067 |   86.43 |      36.93 |      40.27 |      38.37 | REVERT                     |
| Direct normal, per-launch plugin directory      |      150.643 |     368.067 |   76.85 |      39.64 |      28.80 |      29.56 | KEEP: modest observed gain |
| Final rebuilt portable, including renderer work |      150.665 |     368.129 |   72.78 |      52.62 |      26.26 |      25.69 | KEEP, target unmet         |
| Final portable after full launch/restart smoke  |      150.665 |     368.129 |   22.64 |      32.48 |      25.75 |      23.15 | final validation           |
| Final unpacked diagnostic                       |  234.643 exe |     368.129 |   26.49 |       6.47 |       6.60 |       4.90 | diagnostic                 |

The requested final **post-smoke** benchmark repeats average **27.128 s**, an observed
**27.790 s / 50.6%** reduction against the 54.918 s baseline. This is the same already-warmed
final artifact, with a new userData profile; its 22.64 s first-profile launch is **not** a
first-after-rebuild result. Repeats range 23.15–32.48 s. Preserve the immediately-after-rebuild
set below alongside it to expose native/cache variability rather than selecting only faster runs.
Post-smoke native creation: 10.091 / 14.321 / 12.677 / 10.949 s; main entry:
15.853 / 24.650 / 19.647 / 17.145 s; ready-to-show: 22.368 / 32.365 / 25.705 / 23.098 s;
show: 22.414 / 32.452 / 25.714 / 23.108 s; Angular/data complete:
22.417 / 32.458 / 25.718 / 23.113 s. All four launches exited 0 with no load errors and zero
sampled TEMP bytes remaining. No builds or tests overlapped either final timing sequence.

The rebuilt final portable repeat mean is **34.859 s**, an observed **20.060 s / 36.5%**
reduction from the re-established 54.918 s mean. Fresh-profile readiness is effectively unchanged:
73.51 to 72.78 s. The 25.69–52.62 s repeat range and the exclusion experiment's disproportionate
timing drop prevent assigning the full improvement to implementation changes. The preferred
**sub-15-second target is not achieved**. These experiments do not prove a universal Builder floor.
The final unpacked repeat mean is 5.990 s and remains diagnostic output only.

Final portable/native creation: 59.212 / 38.602 / 11.451 / 10.717 s; main entry:
65.062 / 45.083 / 18.702 / 17.854 s; ready-to-show: 72.556 / 52.595 / 26.209 / 25.645 s;
show: 72.567 / 52.604 / 26.227 / 25.656 s; Angular/data complete:
72.570 / 52.607 / 26.231 / 25.660 s. UI proxy values are in the matrix.
Every diagnostic launch exited 0 with Sticky/Scheduler reports and no load errors.

Artifact: **103,438,513 → 157,984,196 bytes** (98.647 → 150.665 MiB, +52.018 MiB).
Runtime: **386,076,856 → 386,011,140 bytes** (368.192 → 368.129 MiB, −65,716 bytes).
Final ASAR: **870,931 bytes / 18 files**, enabled, no unpacked files; 72 external runtime files.
Peak sampled TEMP: **835.231 → 368.247 MiB**, approximately 467 MiB / 55.9% less.
TEMP sampling every 200 ms records a logical footprint, not total physical writes. Cleanup
leaves zero sampled bytes after exit. The main footprint benefit is removal of staging/copy,
not the small test-content exclusion. Electron runtime files and normal security remain intact.

Portable baseline repeat mean: **54.918 s**. Unpacked repeat mean: **7.663 s**.
The historical portable repeat range was 51.60–59.48 s, fresh 70.17 s; the new portable
baseline remains close in average, with substantial run-to-run variability (45.46–63.34 s).
Portable native creation: 57.526 / 49.447 / 42.790 / 28.780 s; main JS entry:
63.853 / 55.204 / 48.664 / 36.840 s. Ready-to-show: 73.079 / 63.312 / 55.910 / 45.427 s;
show: 73.071 / 63.305 / 55.906 / 45.419 s; Angular/data initialization complete:
73.076 / 63.309 / 55.909 / 45.424 s. UI proxy values appear in the matrix.
Peak TEMP: 835.231 MiB / 152 sampled files; residual files consume zero bytes after exit.
All four normal diagnostic launches exited 0 with Sticky and Scheduler reports and no load errors.

The narrow test exclusion removed 22,485 bytes of file content (23,285 ASAR/runtime bytes including
header changes); executable size fell only 5,158 bytes. Its repeat mean is 33.670 s, native repeat
creation 19.039 / 20.484 / 19.072 s, with the same staging/copy path and 835.182 MiB TEMP peak.
**The large observed timing drop cannot confidently be attributed to 22 KB of exclusions.**
OS/security caching and native launch variability are uncontrolled; this is packaging hygiene,
not evidence that packaged test code caused the primary bottleneck. The subsequent compression
comparison uses this measured configuration as its immediate baseline.
The complete portable first-launch/restart smoke passed (`exclude-tests-smoke-3/result.json`):
Sticky/Main, task creation, no-reminder recurrence allocation, pause/resume, completion,
series deletion preserving completed history, reminder-enabled task timing, settings persistence,
and IndexedDB restart persistence. Two earlier harness attempts exposed raw file-URL reload
failure and destroyed-window polling; verification uses normal full application restart and
filters destroyed native windows. Neither issue was masked by application changes.

7z store repeat mean: **40.208 s**, 6.538 s / 19.4% worse than its immediate 33.670 s baseline.
Fresh profile: 94.824 s versus 65.804 s. TEMP peak: **1,105.041 MiB**, unchanged staged/copy
algorithm and file count. The runtime is identical in size; the archive is much larger. Reverted
`build.compression=store` before the next experiment. No retained-change smoke is required for
this rejected variant; all four diagnostic launches themselves exited 0 without load errors.

Direct extraction with normal compression: repeat mean **34.806 s**, versus 33.670 s before it.
Native repeat creation falls to 14.312 / 14.782 / 14.983 s, but main entry is 25.126 / 25.648 /
25.919 s and renderer readiness remains delayed. **No UI startup improvement is established.**
TEMP peak falls to **368.185 MiB / 76 files**, a 467 MiB reduction, with zero residual bytes.
There is one direct runtime extraction rather than archive + staging + destination. Builder also
omits its 107,520-byte `elevate.exe` helper on this branch (72 external files); the application
runtime/ASAR content is otherwise unchanged. Portable execution level remains `user`.
The artifact grows to 157,961,067 bytes; ASAR remains 805,842 bytes / 16 files, with no unpacking.
Full first-launch/restart functional smoke passed (`direct-smoke/result.json`), with no renderer
errors. Retain the branch for its substantial TEMP reduction, without claiming a startup gain;
now change **only compression** to store on this measured direct-extraction baseline. The final
choice still prioritizes measured UI startup over executable size or an early native checkpoint.
Direct store repeat mean: **38.523 s**, 3.717 s / 10.7% worse than direct normal; fresh 86.426 s
versus 74.436 s. TEMP remains 368.185 MiB, so removing decompression provides no measured win.
All four diagnostic launches exited 0 without load errors. Reverted store before changing the
single remaining directory option: `portable.unpackDirName=false`, using the unique per-launch
plugin directory. This tests directory identity/cleanup only; it does not add a cache or retain files.
Per-launch directory mean: **32.667 s**, 2.139 s / 6.1% below direct normal, with a broad
28.80–39.64 s repeat range. Its footprint is unchanged. Directory identity changes on every run,
so retention required a restart/persistence smoke.
The full first-launch/restart smoke passed (`plugin-dir-smoke/result.json`), including identical
persisted tasks/settings/history across different extracted executable paths. Retain the option,
but do not claim the modest difference is immune to the observed native timing variability.

An environmental cross-check before renderer changes: previous comparisons redirect
TEMP into the project workspace. `TIME_ASSISTANT_PROFILE_TEMP` now permits the same profiler to
use an isolated namespace under normal Windows TEMP, without changing the packaged application
or Windows security. These diagnostic results will be reported separately, not mixed with the
workspace-TEMP comparison or described as cold-cache launches.

Normal Windows TEMP diagnostic (same already-warmed plugin-directory artifact): fresh data
25.987 s; repeats 27.816 / 30.980 / 30.858 s, mean **29.885 s**. Native creation in repetitions:
12.227 / 13.050 / 13.311 s; main JS entry 19.713 / 22.093 / 22.539 s. Peak TEMP remains
368.185 MiB. The much faster first-profile value is **not** a first-after-rebuild or OS cold-cache
result; the executable was already benchmarked. Directory placement alone does not reach 15 s.
No Windows security setting or antivirus exclusion was changed. Native waits and physical disk/
security attribution remain unquantified; footprint sampling is not an ETW disk-I/O trace.

### Renderer baseline and retained work

The pre-change synthetic Main baseline reproduced 107 root render callbacks and 200 individual
history write transactions when allocating 100 occurrences against 10,000 existing events.
Task load took 225.2 ms; the initial workspace long task was 119 ms. The passive populated restart
had four render callbacks and a 103 ms initial workspace long task. Seed interaction has additional
Settings/geometry frame gaps, so passive and allocation cases remain separate.

Retained changes:

- Nested Angular idle defer blocks mount one chart at a time after the useful task workspace.
  The charts and their data remain available; no artificial timer delay or chart redesign.
- Bulk recurrence keeps one `task_created` row per committed occurrence, appends/prunes in one
  serialized IndexedDB history transaction, and publishes the complete history state once.
  Retention remains 10,000, newest first. Local history loads/writes/clear are ordered so a late
  read cannot overwrite a committed batch or resurrect cleared events.
- Single-occurrence recording retains the existing path. Task allocation/cursor serialization,
  deterministic occurrence IDs, recurrence semantics and reminder ownership remain unchanged.
  Task and history commits remain separate as before; the existing crash-between-commits gap
  is not solved by this task. Batch failure rolls back history additions and retention deletions.
- Successful startup reconciliation records its checked local day, avoiding Scheduler's redundant
  first calendar check. Calendar rollover still reconciles normally.
- Settings still reads Windows login state whenever opened; the unnecessary startup read is removed.
  Sticky avoids rewriting an already-true preference and skips Main-only history geometry work.
  Its full history read remains to preserve existing action/retention behavior.

Validation: **236 Angular tests / 38 Electron tests / 12 Playwright scenarios passed**. Added tests cover every batch
row, no publication before commit, failed-write state/queue recovery, load/batch/clear ordering,
100-series publication, rollover, and progressive chart availability. Real browser batch retention,
cross-renderer deduplication and rollback scenarios passed against real IndexedDB.

With the same synthetic fixture (1,000 completed tasks, 100 recurrence templates, 10,000 history
rows), the actual packaged Main allocation run changes **200 individual history transactions →
one batch transaction**, and **107 → 12 root render callbacks**. Its largest JavaScript task
falls **119 → 58 ms**. Task load increases **225.2 → 371.0 ms**, including a 170.1 ms awaited
batch transaction; there is no claim of faster total data load. The seed script's Settings/
geometry interactions still produce frame gaps (maximum 166.8 → 183.3 ms).

On passive populated restart, task load is **147.5 → 103.3 ms**; the **103 ms JavaScript long
task disappears** in this sample. There are no recorded long tasks/long frames in the first five
seconds after paint, and maximum frame gap is **100 → 33.4 ms**. Root callbacks rise 4 → 10,
the expected cost of mounting chart sections progressively. The renderers report no errors,
the real-browser test verifies all four charts become available, and packaged Main/Sticky
screenshots verify task/history UI. These are local samples, not a promise of no stalls on all
hardware. No observed post-paint JavaScript freeze lasts multiple seconds.

Deferral improves mounting smoothness rather than shrinking the bundle. Initial Angular output
grows **707.44 → 771.75 kB** (estimated transfer 171.47 → 191.08 kB): the existing eager chart
provider keeps chart code in the initial shared chunk, while the lazy directive chunk is only
202 bytes. Retained for the measured smoother passive workspace, with this explicit cost.
Production build still warns about its 650 kB initial budget and the unchanged 38.89 kB CSS
against a 38 kB budget; budgets were not relaxed.

The final full portable first-launch/restart smoke passed (`final-smoke/result.json`): launcher
identity, Sticky/Main/Scheduler lifecycle, task creation, reminder-enabled timing, daily recurrence,
pause/resume/completion, next occurrence, series deletion preserving completed work, Sticky
hide/restore, Settings, and identical IndexedDB v2 contents after restart. The original user's
profile and Windows startup/security configuration were never changed.

Final production build, `package:dir`, and `package:win` passed using canonical commands and
the existing workspace-local Builder resource-tool cache. No signing/editing bypass was added.
Changed-file Prettier and whitespace checks passed after report completion. Canonical
docs are synchronized through an ADR-012 implementation note; no new ADR is needed.

### Reproduction and remaining bottleneck

From the repository root, use new labels (benchmark/smoke tools refuse reused profile directories):

```powershell
npm.cmd run build
npm.cmd run package:dir
npm.cmd run package:win
node scripts/smoke-portable.cjs my-smoke
node scripts/benchmark-startup.cjs my-baseline portable
node scripts/benchmark-startup.cjs my-baseline dir
node scripts/summarize-startup.cjs my-baseline-portable my-baseline-dir
node scripts/profile-startup.cjs 'release/win-unpacked/Time Assistant.exe' my-seed 'artifacts/my-main-profile' seed
node scripts/profile-startup.cjs 'release/win-unpacked/Time Assistant.exe' my-passive 'artifacts/my-main-profile' passive
node scripts/summarize-renderer-startup.cjs my-seed my-passive
```

Run builds/tests before, not during, timings. `TIME_ASSISTANT_PROFILE_TEMP` may point to an
isolated directory under ordinary Windows TEMP for a separately labeled environmental check.
Never use a directory containing unrelated data. No security changes are needed. Evidence,
profiles, screenshots, JSON, traces, logs, and generated binaries remain ignored; only reusable
scripts and concise reports are source changes. The previous profiling evidence/report is retained.

Native launch and pre-JavaScript waits remain the meaningful bottleneck. Store was worse on
both extraction paths; maximum uses the same relevant implementation as normal; ASAR is small
and has no unpacked application content. No evidence justifies removing runtime DLLs/locales or
changing packager/storage/ownership. The next meaningful investigation is an authorized Windows
ETW/WPR process and file-I/O trace under normal security to attribute extraction, image-loading,
disk waits and scanning. The earlier WPR policy restriction remains; no physical-I/O attribution
was established, and these samples do not identify Defender as the cause. No further unrelated
work is included.

Experiments are measured and decided individually: confirmed test-file exclusion, supported
compression modes, then the direct NSIS file extraction branch (`portable.useZip`). ASAR stays
enabled: the existing archive is small, no app native modules or `app.asar.unpacked` exist, and
there is no evidence supporting an unpack-boundary change. Runtime DLLs, locales, licenses,
snapshots, and PAKs remain intact. Renderer optimization follows the packaging experiments.

### Current contents audit and supported experiments

Baseline runtime: 386,076,856 bytes, 73 external files; ASAR: 829,127 bytes, 19 files;
no ASAR-unpacked directory. Renderer dependencies are bundled; no production node_modules.
The generated package metadata is 340 bytes. No maps, test-results, screenshots, Playwright
artifacts, benchmark JSON, canonical docs, development scripts, or TypeScript sources are shipped.
The local HTML guide and three icons are referenced by `electron/main.cjs` and remain included.

Ranked verified removable weight:

1. Three `electron/*.spec.mjs` files: 22,485 bytes. Runtime imports are explicit `.cjs` paths;
   none references these specs. Safe narrow exclusion; negligible primary performance impact.
2. No other application bloat is proven. The 246,040,576-byte executable, 25,745,408-byte
   dxcompiler.dll, 20,472,830-byte Chromium licenses, 12,435,875-byte resources.pak, ICU, snapshots,
   Vulkan/GPU DLLs and locales are Electron runtime inputs. Size alone does not justify removal.

Installed `app-builder-lib/scheme.json` supports `store`, `normal`, `maximum`. For the actual 7z
portable branch, `out/targets/archive.js:compute7zCompressArgs` selects `-mx=9` for both normal
and maximum; `NsisTarget.js` selects the same non-solid zlib wrapper. Maximum therefore has no
distinct implementation to benchmark. Store selects Copy/no compression and NSIS `SetCompress off`.
`portable.useZip` exists in the installed schema/types; despite its name, `NsisTarget.js` supplies
APP_DIR_64 and `portable.nsi` embeds `File /r` directly, bypassing the embedded 7z archive and
staging `CopyFiles`. This private option is pinned-version-specific and must be rechecked on upgrades.
`portable.unpackDirName=false` only selects a unique per-launch plugin directory; the template
still deletes, extracts, waits for the child, and deletes on exit. No setting here reuses extraction.

## Preserved investigation — 2026-10-06

The reported one-minute portable startup is reproduced. The first measured portable launch took **70.17 seconds to content/data/frame readiness**; the comparable first unpacked launch took **23.25 seconds**. Subsequent unpacked launches took **8.83–10.43 seconds**. Portable repetitions took **51.60–59.48 seconds**, including two launches using the same TEMP path. A later populated portable run took 38.99 seconds, demonstrating substantial native launch variability. After final rebuilding, portable again took **69.19 seconds**; the populated unpacked passive run took **24.18 seconds**.

Most delay occurs **before application JavaScript executes**, followed by several seconds before renderer script entry. Angular bootstrap, settings, ordinary task/history reads, and recurrence reconciliation do not explain the one-minute delay. Main's initial workspace rendering produces a measurable **109–166 ms JavaScript stall**, including a 109 ms stall in the final passive run. No optimization phase was implemented.

## Measurement conditions

- Windows 10.0.26200; Intel Core i7-1185G7, 8 logical processors; approximately 32 GiB RAM; NVMe SSD.
- Electron 44.4.5 / Chromium 152.0.7977.130; Electron Builder 26.8.1. Build tooling available locally: Node 25.6.0 / npm 11.8.0, rather than the repository's specified 26.2.0 / 11.16.0. Packaged Electron uses its own Node 24.21.0.
- Actual executables generated by `npm run package:dir` and `npm run package:win`; no packaging configuration overrides. Only a workspace-local `ELECTRON_BUILDER_CACHE` was supplied to work around a Windows tool-cache extraction failure.
- Normal GPU acceleration, sandboxing, context isolation, and disabled renderer Node integration were preserved. These are normal packaged launches, **not smoke-test launches**.
- Isolated `--user-data-dir` profiles; no user task data or Windows login-item state was modified. TEMP/TMP were redirected to workspace-local profiling directories on the same SSD. Initial repetitions used separate TEMP directories; the `portable-shared-*` pair used the same TEMP directory and user-data profile.
- First-profile and repeated launches are distinguished. These are **not proven disk-cache-cold launches**: there was no reboot or cache flush. Builds/tests finished before the timed launch sequences. The exploratory `dir-first` run overlapped packaging and is excluded.
- The empty-profile comparisons attach no DevTools. Populated Main investigations use a local CDP connection; they are reported separately. A final passive Main run isolates startup from Settings interaction.

The parent timestamps immediately before `spawn()` with `process.hrtime.bigint()`. The first main-module checkpoint uses the same Windows monotonic clock. Native process creation comes from Electron `process.getCreationTime()`. Renderer measurements use `performance.now()` and `performance.timeOrigin`; epoch alignment has approximately millisecond precision. Awaited durations include asynchronous waiting and cannot be summed as CPU time.

Readiness is a conservative proxy: the later of first contentful paint, completion of application initialization, and the second continuously sampled animation frame after data readiness. Native `isVisible()` / `show`, first contentful paint, and useful data readiness are separate measurements. An early paint can contain the loading shell rather than the finished workspace. Actual Settings open/close actions and screenshots additionally validated the populated Main windows.

## 1–2. Portable and unpacked launch times

All values below are seconds from executable launch to the content/data/frame readiness proxy.

| Run                      | Unpacked | Portable | Conditions                                            |
| ------------------------ | -------: | -------: | ----------------------------------------------------- |
| First fresh data profile |    23.25 |    70.17 | OS caches not flushed                                 |
| Repeat 2                 |    10.43 |    55.85 | Same data profile; separate TEMP roots                |
| Repeat 3                 |     8.83 |    59.48 | Same data profile; separate TEMP roots                |
| Shared TEMP pair, first  |        — |    51.60 | Same data profile as previous portable runs           |
| Shared TEMP pair, second |        — |    58.73 | Same TEMP and data profile as preceding row           |
| Populated diagnostic     |     8.44 |    38.99 | CDP; synthetic data; separate from empty comparisons  |
| Final rebuilt artifacts  |    24.18 |    69.19 | Unpacked populated/passive CDP; portable empty/no CDP |

The last row validates each final artifact separately; its differing data and diagnostic conditions are not a controlled pair. Rebuilding changes the portable extraction directory identity, so this final launch is classified as first-after-rebuild rather than an ordinary warm repetition.

Neither the unpacked <3 s first-start target nor <2 s warm target is met on this machine. The variation prevents claiming a precise universal cold-start number or extrapolating to another Windows machine.

## 3. Startup timing table

The first fresh-data-profile pair is shown here. These are cumulative timestamps, not additive phase durations.

| Checkpoint                                        |     Unpacked, s | Portable, s |
| ------------------------------------------------- | --------------: | ----------: |
| Native Electron process creation                  |           8.979 |      56.230 |
| First main JavaScript checkpoint                  |          17.105 |      62.868 |
| `app.whenReady()` call                            |          17.106 |      62.869 |
| `app.whenReady()` resolved                        |          17.169 |      62.960 |
| Scheduler BrowserWindow constructed               |          17.222 |      63.015 |
| Sticky BrowserWindow constructed / load starts    |          17.322 |      63.126 |
| Sticky native visible state at constructor return | not yet visible |      63.126 |
| Sticky renderer module entry                      |          22.721 |      69.781 |
| Sticky `dom-ready`                                |          22.769 |      69.825 |
| Sticky `ready-to-show`                            |          22.817 |      69.844 |
| Sticky `did-finish-load`                          |          22.817 |      69.845 |
| Sticky `show` event                               |          22.838 |      69.901 |
| Sticky application initialization complete        |          22.843 |      69.905 |
| First sampled rAF after data readiness            |          23.231 |      70.150 |
| Second sampled rAF after data readiness           |          23.248 |      70.167 |
| First contentful paint                            |          23.251 |      70.168 |
| Main BrowserWindow at application launch          |     not created | not created |

Empty Sticky can finish initialization without another Angular render callback: its template does not consume the loading flag. For these cases, the two rAF checkpoints are reconstructed from the continuous frame sampler, rather than pretending that `afterEveryRender` fired. Raw native and renderer checkpoints are retained in the JSON reports.

| Phase / elapsed measurement                               |       Unpacked |       Portable | Interpretation                                                          |
| --------------------------------------------------------- | -------------: | -------------: | ----------------------------------------------------------------------- |
| A: launch until native Electron child creation            |        8.979 s |       56.230 s | Portable wrapper/extraction/copy/child-launch path plus OS launch costs |
| Native/runtime/module loading until first main checkpoint |        8.126 s |        6.638 s | Before application main logic is instrumentable                         |
| B: `whenReady()` await                                    |          62 ms |          91 ms | Main readiness itself is small                                          |
| B/C: first main checkpoint → Sticky constructed           |         218 ms |         259 ms | Scheduler, Tray, Sticky setup                                           |
| C: Sticky load start → renderer module entry              |        5.399 s |        6.655 s | Renderer process/loading/parsing before the profiler module runs        |
| D: Sticky Angular bootstrap                               |          40 ms |          34 ms | Root construction/view/bootstrap resolution                             |
| E: Sticky initial task load                               |         4.4 ms |        44.2 ms | Empty tasks                                                             |
| E: Sticky settings load                                   |         4.4 ms |        46.4 ms | Reads overlap task/history loads                                        |
| E: Sticky history load                                    |         4.6 ms |        44.2 ms | Empty history                                                           |
| E: Sticky IndexedDB open                                  |         2.7 ms |        43.4 ms | Separate database-open checkpoint                                       |
| E: Windows login-item read                                |         5.3 ms |         1.7 ms | Read only                                                               |
| E: startup settings save                                  |         1.0 ms |         1.0 ms | Broadcasts one settings invalidation                                    |
| E: Sticky synchronization IPC                             |         9.4 ms |         7.0 ms | Awaited native window synchronization                                   |
| F: recurrence reconciliation                              |     not needed |     not needed | No templates in empty profiles                                          |
| F: ReminderScheduler initialization                       | Scheduler only | Scheduler only | Immediately after Scheduler data loads                                  |
| G: data completion → contentful paint                     |         409 ms |         263 ms | Initial presentation delay; not a long JavaScript task                  |

Scheduler also records bootstrap, task/settings load, recurrence checks, and automatic/deadline/reminder service initialization. It has no useful visible paint. Initial Angular stability often precedes completion of asynchronous service loading and is not treated as application readiness.

Main is opened on demand. In the populated diagnostic runs, constructor-to-data/frame readiness was **5.43 s unpacked** and **4.96 s portable**. Main bootstrap itself took 27 / 23 ms. The full Main window lifecycle appears in the respective raw reports.

## 4. Largest pre-window bottleneck

The portable path before native Electron child creation is the largest measured delay: **56.23 s** in the first run, against **8.98 s** for unpacked. In unpacked warm runs, native creation happens within roughly 9 ms, but the first main JavaScript checkpoint still arrives around **5.5–5.8 s** later. Application main code does not execute during that interval.

The portable filesystem samples provide a narrower conclusion than "all of it is extraction":

| First portable sample                                                    |    Since launch |
| ------------------------------------------------------------------------ | --------------: |
| First observed embedded archive write, already 75.6 MB                   |        10.153 s |
| Embedded archive approximately 103.5 MB                                  |        10.358 s |
| Extraction staging expands toward a full app                             | 11.828–20.760 s |
| Staging plus destination copy reaches approximately 875.8 MB / 150 files |        22.190 s |
| Native Electron child created                                            |        56.230 s |
| Main JavaScript entry                                                    |        62.868 s |

There is approximately **34 s between the final sampled file-size change and child process creation**. Polling is not a trace of every file operation; it does not prove the launcher was idle throughout that gap. It proves that decompression time alone is an insufficient explanation. Launcher work, file finalization/copying, native process creation, image loading, and security scanning must be distinguished with a native trace.

Windows Performance Recorder was present and idle, but `wpr -start GeneralProfile -filemode` failed with **0xc5585011**, "Failed to enable the policy to profile system performance." No security setting was changed. Antivirus contribution, precise image-loader waits, and process-launch stalls remain unquantified. **Windows Defender is not established as the root cause.**

## 5. Largest post-window bottleneck

With 1,000 completed tasks, 100 daily recurring series, 100 concrete pending occurrences, and 10,000 history events, Main's first workspace render produced a **121 ms long JavaScript task** in unpacked and **114 ms** in portable. The four synchronous chart aggregations totaled approximately **9.2 / 7.6 ms**. The remaining task includes Angular workspace construction and creation/layout of four Chart.js canvases; this investigation does not separately assign all remaining milliseconds to Chart.js.

A separate first Main initialization with 100 series needing allocation took **421 ms** in `TaskService.load()`. Reconciliation itself took 70 ms, then creation history and retention pruning performed 200 history write/delete operations. That Main recorded **108 root render callbacks** and a **166 ms initial-render long task**. This is a measured initialization burst, not an infinite BroadcastChannel loop. The fixture-seeding operation's own 597 ms Sticky task is excluded from application findings.

No multi-second JavaScript freeze after useful paint was reproduced. These pauses are still above a 16.7 ms frame budget and can explain a brief rough transition into Main. They cannot explain the portable launch's minute of silence.

## 6. Portable packaging findings

The final artifact audit is saved in `artifacts/startup-profile/package-audit.json`: portable **103,435,455 bytes**, unpacked **386,076,821 bytes**, 73 filesystem files, and an **829,092-byte ASAR containing 19 files**.

| Item                                | Finding                                                                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portable artifact                   | approximately 103.44 MB / 98.64 MiB                                                                                                                                     |
| Unpacked application                | approximately 386.08 MB / 368.19 MiB                                                                                                                                    |
| Unpacked file count                 | 73 filesystem files                                                                                                                                                     |
| Application ASAR                    | enabled; approximately 0.83 MB; 19 files inside                                                                                                                         |
| Largest file                        | Electron application executable, 246.04 MB                                                                                                                              |
| Other large runtime files           | `dxcompiler.dll` 25.75 MB; Chromium licenses 20.47 MB; `resources.pak` 12.44 MB; `icudtl.dat` 10.88 MB                                                                  |
| App native modules / ASAR unpacking | no `app.asar.unpacked`, no app native addons                                                                                                                            |
| Outside ASAR                        | Electron/Chromium executable, DLLs, locales, PAKs, snapshots, licenses and Builder's `elevate.exe`                                                                      |
| Source maps                         | none packaged                                                                                                                                                           |
| Packaged tests                      | three Electron `.spec.mjs` files, approximately 22.5 KB total; unnecessary but immaterial to this delay                                                                 |
| Documentation                       | built `user-guide.html`, approximately 19.4 KB, intentionally loaded by the Guide window; canonical docs and development docs are absent                                |
| Unused large application assets     | none found; app icons/favicon are small                                                                                                                                 |
| Packaged `node_modules`             | none; renderer dependencies are bundled into Angular output                                                                                                             |
| Compression                         | configuration leaves `compression` at Builder's `normal` default; pinned source creates a 7z payload with `-mx=9`, then a zlib NSIS wrapper; `portable.useZip` is unset |
| Signing                             | both actual executables return `NotSigned` from `Get-AuthenticodeSignature`; signing configuration was not edited                                                       |
| Splash                              | none configured, so pre-Electron launcher work has no application loading UI                                                                                            |
| Peak portable TEMP footprint        | approximately 875.79 MB / 835.22 MiB, including archive, staging app, and copied destination                                                                            |

This is a large-byte runtime extraction/copy path with a modest number of files, not thousands of app-native files being individually unpacked from ASAR.

Pinned implementation evidence:

- `node_modules/app-builder-lib/templates/nsis/portable.nsi` deletes `$INSTDIR`, extracts, executes the application with `ExecWait`, then deletes `$INSTDIR` on exit.
- `templates/nsis/include/extractAppPackage.nsh` extracts into `$PLUGINSDIR/7z-out`, then uses `CopyFiles` into the destination, with retry logic.
- `out/targets/nsis/NsisTarget.js` selects the embedded 7z path when `portable.useZip` is unset. Its `useZip` portable branch instead embeds directory files through NSIS; this detail should be verified in an A/B build before recommending a change based only on the option's name.

Builder documents ASAR as enabled by default, compression as `normal` by default, and portable unpack directories as temporary directories. The pinned local source determines the actual behavior above. [Builder build options](https://www.electron.build/v26/docs/api/electron-builder.interface.platformspecificbuildoptions/), [portable options](https://www.electron.build/docs/api/electron-builder.interface.portableoptions/), [Electron window paint readiness](https://www.electronjs.org/docs/latest/api/browser-window).

## 7. Renderer initialization findings

The current source supersedes older documentation paragraphs about duplicate reminder ownership: **only Scheduler starts the reminder, deadline, and automatic task loops**. Main and Sticky inject the same root services but do not start those scheduling loops. Ownership was not changed.

| Work                                            | Sticky                                   | Scheduler                      | Main, on demand          | Before useful paint?                                                             |
| ----------------------------------------------- | ---------------------------------------- | ------------------------------ | ------------------------ | -------------------------------------------------------------------------------- |
| Task repository reads / normalization / sorting | yes                                      | yes                            | yes                      | concrete tasks needed; repeated reconciliation/read strategy could be reviewed   |
| Settings read                                   | yes                                      | yes                            | yes                      | initial appearance/preferences needed                                            |
| Recurrence reconciliation                       | yes when templates exist                 | yes, plus first calendar check | yes when templates exist | allocation could finish after initial presentation, with behavior review         |
| TimerService 1 Hz loop                          | yes                                      | no                             | yes                      | needed for live visible timing                                                   |
| Reminder / Deadline / Automatic loops, 1 Hz     | no                                       | yes                            | no                       | reliability work in background owner                                             |
| History full read / sorting / cap pruning       | yes                                      | not at startup                 | yes                      | unnecessary for Sticky presentation; Main can potentially defer History/Insights |
| Four chart aggregations and canvas construction | no                                       | no                             | yes                      | not required for task actions                                                    |
| Chart.js / Papa Parse code loading              | eager bundle                             | eager bundle                   | eager bundle             | could be investigated for lazy loading; not proven to explain native delay       |
| CSV parsing / export                            | no startup invocation                    | no startup invocation          | no startup invocation    | no CSV initialization bottleneck found                                           |
| Task/settings BroadcastChannels                 | yes                                      | yes                            | yes                      | low-cost setup; messages invalidate local reads                                  |
| Break coordination channel                      | visible publisher                        | authoritative coordinator      | visible publisher        | preserve ownership and handshake                                                 |
| Windows startup-status read                     | yes                                      | no                             | yes                      | Settings needs it; Sticky first paint does not                                   |
| Persist `stickyNoteEnabled: true` / broadcast   | yes                                      | no                             | no                       | can be reviewed for deferral or unnecessary unchanged write                      |
| Sticky size/history geometry observers          | Sticky sizing; empty history measurement | none                           | history sizing           | measurements are small; no measured resize storm                                 |

Populated measurements:

| Service duration                                | Sticky, unpacked / portable | Scheduler, unpacked / portable | Main, unpacked / portable |
| ----------------------------------------------- | --------------------------- | ------------------------------ | ------------------------- |
| Task load                                       | 212 / 233 ms                | 80 / 226 ms                    | 164 / 164 ms              |
| History load, 10,000 events                     | 161 / 191 ms                | not loaded                     | 135 / 137 ms              |
| Settings load                                   | 147 / 179 ms                | 48 / 185 ms                    | 123 / 123 ms              |
| Recurrence reconciliation, no allocation needed | 39 / 33 ms                  | 21 / 32 ms                     | 21 / 18 ms                |
| Chart aggregation total                         | none                        | none                           | 9.2 / 7.6 ms              |

These are overlapping awaited spans, not independent CPU costs. Main and Sticky unnecessarily duplicate the full history read. The repository sorts tasks, then TaskService normalizes and sorts again. Recurrence scans each series against the task set and uses bounded local calendar calculations; it does not generate an unbounded backlog of missed dates. Scheduler's first calendar check still performs another reconciliation after startup reconciliation. Measurements found no expensive DST calculation on this Asia/Saigon run; another timezone or much larger series population remains a separate test.

Task changes cause other renderers to reload from IndexedDB. A load only rebroadcasts when it actually creates occurrences. Transactional deterministic IDs prevent another renderer from creating the same occurrence, so an incoming invalidation does not generate an unconditional echo. No continuous reload storm was observed in the captured runs.

## 8. First-five-seconds jank findings

Two windows are evaluated: the first five seconds after native visible state, and the first five seconds after contentful paint. This distinction matters: some native windows were reported visible **5–8 seconds before renderer script entry**. Zero JavaScript/frame samples in that native interval means the renderer was not executing yet; it does not establish smooth UI.

- Empty Sticky, after contentful paint: no long JavaScript tasks; typical maximum sampled frame gaps 17–33 ms. First fresh unpacked presentation included an approximately 400 ms gap before contentful paint and a long animation frame with **zero blocking JavaScript duration**.
- Populated Sticky, after contentful paint: no long JavaScript tasks or long animation frames in the unpacked/portable diagnostics; maximum gaps approximately 17 / 17.6 ms. History loading and recurrence waiting did not turn into a sustained UI freeze.
- Populated Main: initial workspace render tasks 121 / 114 ms; corresponding gaps 133 / 117 ms. Additional 67 / 83 ms gaps happened during scripted Settings open/close validation and are not attributed to passive startup.
- First Main initialization allocating 100 occurrences: 108 render callbacks, 200 history write/delete operations, 421 ms task initialization, and a 166 ms long task. This workload merits reducing pre-paint notifications/retention work if a later optimization phase is approved.
- Timer ticks approximately once per second. Scheduler's three checks run approximately once per second. The counters cover startup plus a 5.5-second tail, not precisely the clipped five-second interval. No excessive-frequency timer was found.
- History DOM rendering is paginated; Main's pending list is paginated; Sticky caps visible notes. The fixture did not render all 10,000 history rows. The current-task list in Main is unpaginated, so hundreds of simultaneous active tasks remain an untested scaling case.
- Geometry measurement spans were generally under 1 ms. No evidence of a repeated forced-layout/resize loop was found. CSS transitions are limited; Chart.js default animation remains enabled in Main. Its contribution to the initial combined render has not been separately quantified.

Long-task and long-animation-frame observations are buffered from renderer startup. The supplemental CDP traces attach later and cover part of Main's post-render/Settings activity; they are not treated as complete traces of the initial chart construction. The final passive run is reported in the final verification addendum.

## Diagnostic cases

**Case A — unpacked fast, portable extremely slow:** unpacked is not fast enough here, but the portable-specific difference is measurable. It adds wrapper launch, embedded archive extraction, a second full application copy, and launch of the extracted executable before any application checkpoint. Repeated portable launches still perform extraction; they do not reuse a retained installation. Exact antivirus share is unknown.

**Case B — both slow:** unpacked first main entry is 17.10 s on the first run and 5.55–5.80 s in repeats. Initial renderer loading then consumes 2.87–6.66 s before module entry. Main readiness/window construction takes approximately 0.2–0.3 s; Angular bootstrap takes tens of milliseconds; normal data initialization takes milliseconds to a few hundred milliseconds. The delay is mainly outside the application service work that would ordinarily be optimized first.

**Case C — window acceptable, later UI jank:** Main's first task/history/Insights workspace render and the history-per-occurrence initialization burst are the measured application workloads. Sticky's post-paint rendering is smooth in the tested data sets. Settings interaction creates separate layout gaps. No infinite broadcasts, multi-second post-paint JavaScript freeze, duplicate reminder loops, startup CSV parse, or rendering of the complete history list was demonstrated.

## 9–11. Ranked causes and recommendations

Distribution policy update (2026-10-07, amended ADR-012): the portable executable is now the sole
user-facing Windows artifact. `package:dir` remains only for development/debugging/profiling
diagnostics. The earlier recommendation to use an installed NSIS distribution is withdrawn.
Builder's internal NSIS portable implementation remains intact. No startup optimization was made
as part of this packaging cleanup.

| Rank | Root cause / observation                                                                                                                        | Confidence                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1    | Portable wrapper and child-launch path, including staged extraction and full copy, dominates startup                                            | verified phase and filesystem evidence; precise OS/security shares unresolved |
| 2    | Native/runtime/module loading before main entry and initial renderer script entry remains several seconds even unpacked                         | verified timing; underlying Windows wait/CPU attribution unresolved           |
| 3    | Main's initial workspace construction with four chart canvases blocks JavaScript 109–166 ms                                                     | verified combined task; Chart.js versus Angular layout not fully separated    |
| 4    | Recurrence allocation records history one occurrence at a time, causing repeated signal renders and retention writes                            | verified 100-allocation Main run                                              |
| 5    | Sticky full history loading, repeated per-renderer reconciliation, duplicate task sorting, and startup-only Settings work extend initialization | verified source and spans; smaller impact than native launch delays           |
| 6    | Three packaged Electron tests add approximately 22.5 KB                                                                                         | verified unnecessary packaging; negligible startup impact                     |

| Priority | Recommended review / experiment                                                                                                                                         | Impact                                                         | Risk                                                                        | Architecture change?                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1        | Obtain an elevated native ETW/WPR or process/file trace of both executable launch paths; identify the gap after portable file-copy completion and before child creation | highest diagnostic value; directs the large startup fix        | low runtime risk; requires appropriate Windows profiling permission         | no                                                                                                 |
| 2        | A/B-test the pinned Builder portable `useZip` branch or compression options without changing release policy; compare launch phases, peak TEMP bytes, and artifact size  | potentially high; could eliminate current staging/copy costs   | medium; larger artifacts/IO or changed launcher behavior may offset benefit | packaging configuration review; no new installer technology                                        |
| 3        | Defer Main History/Insights and initial chart construction until the task workspace has painted; measure Chart.js construction/animation separately                     | medium UI impact; addresses measured 109–166 ms stalls         | low–medium; preserve history/chart responsiveness                           | initialization/presentation sequencing; no reminder or storage ownership change                    |
| 4        | Batch or defer history signal publication/retention work during recurrence allocation while retaining atomic occurrence creation and history semantics                  | medium for many series; reduces the 108-render/200-write burst | medium; history ordering and failure behavior need tests                    | may require a reviewed history-service API change; no recurrence redesign                          |
| 5        | Remove Sticky's unused pre-paint history read; postpone startup-login query and unchanged sticky settings write where behavior allows                                   | modest; 0.1–0.2 s with the populated fixture                   | low–medium; preserve actual preferences/window behavior                     | no major architecture change                                                                       |
| 6        | Reduce duplicate reconciliation/reads and duplicate sorting, based on measured call counts                                                                              | modest at this size; may scale with series count               | medium; retain cross-renderer correctness                                   | changing recurrence ownership would require architecture review; simple local coalescing would not |
| 7        | Exclude Electron test files from packaging                                                                                                                              | negligible performance impact                                  | low                                                                         | no                                                                                                 |

Code signing might affect reputation/security handling, but this investigation did not prove a signing-related delay. **No certificate, signing configuration, security setting, installer technology, backend, state library, database, recurrence ownership, or reminder ownership was changed.** Any signing change requires explicit approval. No recommendation is to disable Defender or other Windows protections.

## 12. Files changed for instrumentation

New diagnostic files:

- `electron/startup-profile.cjs`: main/native-window checkpoints, console report collection, process metadata, diagnostic shutdown/report output.
- `src/app/core/utils/startup-profile.ts`: flag-gated renderer timing, spans/counters, buffered long-task/long-frame observers, continuous rAF sampling.
- `scripts/profile-startup.cjs`: actual executable launcher, isolated data/TEMP, extraction-size samples, optional CDP/fixtures, readiness derivation, interaction validation.

Existing files changed only for timing hooks and completion-aware diagnostic wrappers:

- `electron/main.cjs`
- `src/main.ts`
- `src/app/app.ts`
- `src/app/core/storage/indexed-db-storage.adapter.ts`
- `src/app/core/repositories/task.repository.ts`
- `src/app/core/services/task.service.ts`
- `src/app/core/services/settings.service.ts`
- `src/app/core/services/history.service.ts`
- `src/app/core/services/timer.service.ts`
- `src/app/core/services/reminder-scheduler.service.ts`
- `src/app/core/services/automatic-task-scheduler.service.ts`
- `src/app/core/services/deadline-scheduler.service.ts`
- `src/app/core/services/chart-summary.service.ts`

This report is `docs/startup-performance.md`. Raw JSON, machine/package/signature audits, build/test logs, screenshots, and supplemental traces are in ignored `artifacts/startup-profile/`. The user's pre-existing `test-results/.last-run.json` modification was preserved. No package manifest or packaging configuration was changed.

Instrumentation is activated by `TIME_ASSISTANT_STARTUP_PROFILE=1`; the main process appends the renderer query only when that flag is set. Normal launches emit no profiling reports and install no profiling observers or automatic shutdown timer. No preload capability or new dependency was added. Diagnostic summaries contain timings/counts rather than personal task/history contents.

## 13. Validation and reproduction

- Angular: **231 tests passed**, including recurrence/repository tests, after the final transaction-span correction.
- Electron: **38 tests passed** after final native diagnostic hooks.
- Production build: succeeded through both canonical packaging commands; existing initial-bundle and component-CSS warning budgets remain. Instrumented initial bundle is approximately 707 KB.
- `npm run package:dir`: succeeded. `npm run package:win`: succeeded, with original configuration. Final revalidation is captured in `package-dir-verified.log` / `package-win-verified.log`.
- Generated executables: normal packaged launches completed with exit 0; Sticky/Scheduler reports collected. Main reports, screenshots, and successful Settings open/close collected in populated runs.
- Changed-file Prettier and `git diff --check`: checked. Repository-wide formatting debt was not cleaned up.

Initial sandboxed Angular build failed with `spawn EPERM`; authorized builds/tests used execution outside the filesystem sandbox. Builder then failed extracting macOS symlinks in its legacy resource-tool archive. A workspace-local cache containing the already extracted **Windows** `rcedit` and signing-tool files solved that cache problem. `signAndEditExecutable=false` was **not** used; signing policy stayed unchanged. A resource-editor retry occurred during an earlier portable attempt; final logs and command exit codes are retained.

Example runs, from the repository root:

```powershell
$env:ELECTRON_BUILDER_CACHE = 'C:\AI Project\time-assistant\release\.electron-builder-cache'
npm run package:dir
npm run package:win

node scripts/profile-startup.cjs 'release/win-unpacked/Time Assistant.exe' dir-check 'artifacts/startup-profile/new-dir-profile' startup-only
node scripts/profile-startup.cjs 'release/Time Assistant.exe' portable-check 'artifacts/startup-profile/new-portable-profile' startup-only

# Synthetic data only, in a new isolated profile; then restart it for measurement.
node scripts/profile-startup.cjs 'release/win-unpacked/Time Assistant.exe' fixture 'artifacts/startup-profile/new-fixture-profile' seed
node scripts/profile-startup.cjs 'release/win-unpacked/Time Assistant.exe' populated-passive 'artifacts/startup-profile/new-fixture-profile' passive
node scripts/profile-startup.cjs 'release/Time Assistant.exe' populated-trace 'artifacts/startup-profile/new-fixture-profile' trace
```

The script sets the diagnostic environment, waits for complete renderer reports, quits the app, and saves one combined JSON report. Use `startup-only` for comparisons without DevTools or Main. Use `passive` to open Main without scripted Settings activity. `seed` intentionally injects fixture records and is not a valid Sticky jank baseline. `trace` saves a supplemental Chromium trace and validates Settings interaction. Browser debugging binds locally and is used only in these diagnostic launches.

## Final verification addendum

The final source passed the tests and both canonical packaging commands above. Final diagnostic launches then completed successfully with no load failures. Screenshots of the earlier populated runs were visually inspected: Main displayed its task workspace and paginated history, and Sticky displayed the expected synthetic pending occurrences. Settings open/close succeeded in those interaction runs.

| Final artifact checkpoint, since executable launch | Unpacked populated/passive | Portable empty/no CDP |
| -------------------------------------------------- | -------------------------: | --------------------: |
| Native Electron process creation                   |                    9.928 s |              55.271 s |
| First main JavaScript entry                        |                   16.515 s |              62.183 s |
| `whenReady()` resolved                             |                   16.627 s |              62.303 s |
| Sticky load starts                                 |                   16.819 s |              62.477 s |
| Native Sticky renderer process creation            |                   21.215 s |              66.576 s |
| Sticky renderer script entry                       |                   23.807 s |              69.097 s |
| Sticky `dom-ready`                                 |                   23.847 s |              69.136 s |
| Sticky `did-finish-load`                           |                   23.894 s |              69.151 s |
| Sticky `show` event                                |                   24.151 s |              69.167 s |
| Sticky application initialization complete         |                   24.154 s |              69.170 s |
| Sticky content/data/frame readiness proxy          |                   24.182 s |              69.194 s |

Cross-process wall-clock alignment is approximate; millisecond-scale differences between main-process event delivery and the renderer's clock mapping should not be overinterpreted.

Native renderer creation metadata now splits the several-second pre-script interval. Unpacked Sticky waited **4.396 s from load start until native renderer creation**, then **2.592 s until script entry**. Portable Sticky waited **4.098 s**, then **2.521 s**. Their cumulative renderer CPU time at `did-finish-load` was approximately **0.225 / 0.218 CPU-seconds**. These are wall-clock stalls dominated by work or waits outside the instrumented Angular startup; cumulative process CPU is supporting evidence, not a full OS attribution.

Main opened on demand in the final passive unpacked run. Its native renderer was created **13.8 ms after window construction**, yet script entry followed approximately **4.804 s later**. Angular bootstrap took **18.9 ms**; task/history/settings loads took **135 / 114 / 1.5 ms**; recurrence reconciliation took **14.8 ms**. Readiness was about **5.16 s after Main construction** (the explicitly named second post-render frame was approximately 11 ms later than the continuous-frame proxy).

Main's first five seconds after native visibility contain only nine sampled frames near the end, because script loading consumes most of that interval. In the five-second window after contentful paint, Main recorded **one 109 ms JavaScript long task**, **one 116.9 ms frame gap**, and a **126.7 ms long animation frame** with **71.9 ms blocking duration**. Four chart aggregations totaled **6.7 ms**, and there were **five root render callbacks**. No Settings actions were scripted in this run. Sticky recorded no post-paint JavaScript long tasks; maximum post-paint frame gaps were **17.2 ms unpacked** and **20.5 ms portable**. Portable's first five seconds after its early native visible flag contain no renderer frames because script entry had not occurred; this is a blank/loading coverage interval, not evidence of smooth UI.

Portable again reached approximately **835.22 MiB peak TEMP footprint**. The last sampled size change occurred at **24.376 s**, while native child creation occurred at **55.271 s**, leaving an approximately **30.90 s gap** that still requires native tracing.

The final IndexedDB transaction span awaits transaction completion. Earlier recordings timed dispatch for that one span, so those dispatch-only durations are excluded from the summary; their enclosing recurrence measurements remain valid. Final recurrence transaction durations were **38.8 ms Sticky**, **19.3 ms Scheduler**, and **14.7 ms Main**. These awaited times include database waiting and are not equivalent to blocking JavaScript time.

## Limits and next review

Native ETW attribution could not be collected with current Windows permissions. No reboot-cold sample, representative user database, very large active-task population, or independent Chart.js-only CPU profile was collected. ASAR module parsing and native renderer initialization are part of the measured load intervals, not independently attributed to antivirus or Angular. Broad recommendations remain experiments for review, and no optimization was implemented.

The next review should address the portable/native launch path first, then the measured Main first-render and recurrence/history publication bursts. Moving reminder ownership is outside this investigation and unnecessary for the current architecture.
