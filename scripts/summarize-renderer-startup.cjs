const fs = require('node:fs');
for (const label of process.argv.slice(2)) {
  const report = JSON.parse(fs.readFileSync(`artifacts/startup-profile/${label}.json`));
  const main = report.renderers.main;
  console.log(
    JSON.stringify({
      label,
      errors: report.errors,
      counters: main.counters,
      tasksLoadMs: main.checkpoints
        .filter((event) => event.name === 'tasks-load')
        .map((event) => event.durationMs),
      historyWrites: main.checkpoints.filter((event) => event.name === 'idb-history-readwrite')
        .length,
      historyBatchTransactions: main.checkpoints.filter(
        (event) => event.name === 'idb-history-batch-transaction',
      ).length,
      longTasks: main.jank.longTasks,
      postPaint: main.firstFiveSecondsAfterPaint,
      rendererCpu: report.runtime.rendererProcesses?.main?.cpu,
    }),
  );
}
