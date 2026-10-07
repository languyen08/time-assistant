const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('artifacts/startup-optimization');
const labels = process.argv.slice(2);
const seconds = (ms) => (ms / 1000).toFixed(2);
const mib = (bytes) => (bytes / 1024 ** 2).toFixed(3);
console.log(
  '| Experiment | Artifact MiB | Runtime MiB | Fresh s | Repeat 1 s | Repeat 2 s | Repeat 3 s | Mean repeat s | TEMP peak MiB |',
);
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const label of labels) {
  const report = JSON.parse(fs.readFileSync(path.join(root, `${label}.json`)));
  const { audit, runs } = report;
  const mean = runs.slice(1).reduce((sum, run) => sum + run.uiReadyMs, 0) / (runs.length - 1);
  console.log(
    `| ${label} | ${mib(audit.artifactBytes)} | ${mib(audit.runtimeBytes)} | ${runs.map((run) => seconds(run.uiReadyMs)).join(' | ')} | ${seconds(mean)} | ${mib(Math.max(...runs.map((run) => run.tempPeakBytes)))} |`,
  );
  console.log(
    JSON.stringify({
      label,
      nativeSeconds: runs.map((run) => seconds(run.nativeMs)),
      mainEntrySeconds: runs.map((run) => seconds(run.mainEntryMs)),
      readyToShowSeconds: runs.map((run) => seconds(run.readyToShowMs)),
      showSeconds: runs.map((run) => seconds(run.showMs)),
      angularDataSeconds: runs.map((run) => seconds(run.angularReadyMs)),
    }),
  );
}
