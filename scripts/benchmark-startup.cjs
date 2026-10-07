// Sequential actual-executable comparisons. Fresh data is not an OS cold cache.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');
const [label, kind = 'portable'] = process.argv.slice(2);
if (!label || !['portable', 'dir'].includes(kind)) {
  throw new Error('Usage: node scripts/benchmark-startup.cjs <experiment> [portable|dir]');
}
const root = path.resolve('artifacts/startup-optimization');
fs.mkdirSync(root, { recursive: true });
const executable = path.resolve(
  kind === 'dir' ? 'release/win-unpacked/Time Assistant.exe' : 'release/Time Assistant.exe',
);
function inventory(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? inventory(file) : [{ path: file, bytes: fs.statSync(file).size }];
  });
}
const files = inventory(path.resolve('release/win-unpacked'));
const archive = path.resolve('release/win-unpacked/resources/app.asar');
const contents = asar
  .listPackage(archive)
  .map((file) => file.replace(/^[/\\]+/, ''))
  .filter((file) => !asar.statFile(archive, file).files);
const audit = {
  artifactBytes: fs.statSync(executable).size,
  runtimeBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  fileCount: files.length,
  asarBytes: fs.statSync(archive).size,
  asarUnpackedBytes: inventory(`${archive}.unpacked`).reduce((sum, file) => sum + file.bytes, 0),
  asarFiles: contents.map((file) => ({ path: file, bytes: asar.statFile(archive, file).size })),
  largestFiles: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 15),
};
const profile = path.join(root, `${label}-${kind}-profile`);
if (fs.existsSync(profile)) throw new Error(`Fresh profile already exists: ${profile}`);
const runs = [];
for (let index = 0; index < 4; index++) {
  const runLabel = `${label}-${kind}-${index}`;
  const child = spawnSync(
    process.execPath,
    ['scripts/profile-startup.cjs', executable, runLabel, profile, 'startup-only'],
    { stdio: 'inherit', windowsHide: true, env: process.env },
  );
  if (child.status !== 0) throw new Error(`Profiling failed: ${runLabel}`);
  const report = JSON.parse(fs.readFileSync(`artifacts/startup-profile/${runLabel}.json`));
  if (report.errors.length) throw new Error(JSON.stringify(report.errors));
  const renderer = report.renderers.sticky;
  const offset = renderer.timeOrigin - report.launch.launchEpochMs;
  const checkpoint = (name) =>
    offset + renderer.checkpoints.find((event) => event.name === name).ms;
  const native = (name) => report.main.find((event) => event.name === name)?.ms;
  const ready = Math.max(
    checkpoint('application-startup-complete'),
    offset + renderer.paints.find((event) => event.name === 'first-contentful-paint').ms,
    offset + renderer.derivedDataReadyFrames.at(-1).ms,
  );
  runs.push({
    label: runLabel,
    freshProfile: index === 0,
    nativeMs: report.runtime.processCreatedEpochMs - report.launch.launchEpochMs,
    mainEntryMs: report.runtime.entryFromLaunchMs,
    readyToShowMs: native('sticky:ready-to-show'),
    showMs: native('sticky:show'),
    angularReadyMs: checkpoint('application-startup-complete'),
    uiReadyMs: ready,
    tempPeakBytes: Math.max(...report.launch.extraction.map((sample) => sample.bytes)),
    tempPeakFiles: Math.max(...report.launch.extraction.map((sample) => sample.count)),
    tempAfterExit: inventory(report.launch.isolatedTemp).reduce((sum, file) => sum + file.bytes, 0),
  });
  fs.writeFileSync(
    path.join(root, `${label}-${kind}.json`),
    JSON.stringify({ label, kind, audit, runs }, null, 2),
  );
  console.log(JSON.stringify(runs.at(-1)));
}
