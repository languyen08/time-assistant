// Local only: node scripts/profile-startup.cjs <exe> <label> [profile-dir] [seed|trace]
// Uses actual generated executable; isolated data and TEMP; never smoke mode.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require('@playwright/test');
const executable = path.resolve(process.argv[2]);
const label = process.argv[3];
const startupOnly = process.argv[5] === 'startup-only';
if (!label || !fs.existsSync(executable)) throw new Error('Provide executable and label');
const root = path.resolve('artifacts/startup-profile');
const profile = path.resolve(process.argv[4] || path.join(root, `${label}-profile`));
const temp = path.join(
  root,
  executable.includes('win-unpacked') ? 'unpacked-temp' : 'portable-temp',
);
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(temp, { recursive: true });
const output = path.join(root, `${label}.json`);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function snapshot(directory) {
  const files = [];
  function walk(dir) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else {
          try {
            files.push({ path: path.relative(directory, file), bytes: fs.statSync(file).size });
          } catch {}
        }
      }
    } catch {}
  }
  walk(directory);
  return { count: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}
async function seed(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('friendly-task-reminder', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['tasks', 'history', 'settings'], 'readwrite');
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    const taskStore = tx.objectStore('tasks');
    const historyStore = tx.objectStore('history');
    taskStore.clear();
    historyStore.clear();
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const timestamp = now.toISOString();
    const future = new Date(new Date(date + 'T23:59:00').getTime()).toISOString();
    for (let index = 0; index < 1000; index++) {
      taskStore.put({
        id: `completed-${index}`,
        name: `Synthetic completed ${index}`,
        category: `Category ${index % 8}`,
        status: 'completed',
        order: index,
        reminderAt: timestamp,
        reminderEnabled: false,
        reminderCount: 3,
        reminderIntervalMinutes: 10,
        allowConcurrentStart: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        activeStartedAt: new Date(now.getTime() - 3600000).toISOString(),
        completedAt: timestamp,
        totalPausedSeconds: 0,
        reminderAttemptsShown: 0,
      });
    }
    for (let index = 0; index < 100; index++) {
      taskStore.put({
        id: `series-${index}`,
        recurrenceSeriesId: `series-${index}`,
        recurrenceTemplate: true,
        recurrence: { type: 'daily', rangeStart: date },
        name: `Synthetic series ${index}`,
        status: 'pending',
        order: 1000 + index,
        reminderAt: future,
        reminderEnabled: false,
        reminderCount: 3,
        reminderIntervalMinutes: 10,
        allowConcurrentStart: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        totalPausedSeconds: 0,
        reminderAttemptsShown: 0,
      });
    }
    for (let index = 0; index < 10000; index++) {
      historyStore.put({
        id: `history-${index}`,
        type: index % 2 ? 'task_completed' : 'reminder_shown',
        taskId: `completed-${index % 1000}`,
        occurredAt: new Date(now.getTime() - index * 1000).toISOString(),
        summary: `Synthetic event ${index}`,
      });
    }
    await done;
    db.close();
  });
}
(async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const env = {
    ...process.env,
    TIME_ASSISTANT_STARTUP_PROFILE: '1',
    TIME_ASSISTANT_PROFILE_OUTPUT: output,
    TIME_ASSISTANT_PROFILE_EXIT: '1',
    TIME_ASSISTANT_PROFILE_MAIN: startupOnly ? '0' : '1',
    TEMP: temp,
    TMP: temp,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const launchNs = process.hrtime.bigint();
  const launchEpochMs = Date.now();
  env.TIME_ASSISTANT_LAUNCH_NS = String(launchNs);
  const child = spawn(
    executable,
    [...(startupOnly ? [] : [`--remote-debugging-port=${port}`]), `--user-data-dir=${profile}`],
    { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let childError;
  let stderr = '';
  child.on('error', (error) => {
    childError = error;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.resume();
  const extraction = [];
  const sampler = setInterval(() => {
    const result = snapshot(temp);
    if (
      !extraction.length ||
      extraction.at(-1).count !== result.count ||
      extraction.at(-1).bytes !== result.bytes
    ) {
      extraction.push({ ms: Number(process.hrtime.bigint() - launchNs) / 1e6, ...result });
    }
  }, 200);
  const browsers = [];
  const interactions = [];
  try {
    if (!startupOnly) {
      let connected = false;
      for (let attempt = 0; attempt < 900; attempt++) {
        if (childError) throw childError;
        try {
          const response = await fetch(`http://127.0.0.1:${port}/json/version`);
          if (response.ok) {
            connected = true;
            break;
          }
        } catch {}
        await delay(200);
      }
      if (!connected) throw new Error('No renderer debugging endpoint after 180s');
      browsers.push(await chromium.connectOverCDP(`http://127.0.0.1:${port}`));
      let sticky;
      for (let attempt = 0; attempt < 100; attempt++) {
        sticky = browsers[0]
          .contexts()
          .flatMap((context) => context.pages())
          .find((page) => page.url().includes('window=sticky'));
        if (sticky) break;
        await delay(50);
      }
      if (!sticky) throw new Error('Sticky renderer not found');
      await sticky.waitForFunction(() => Boolean(window.assistantTime), { timeout: 15000 });
      if (process.argv[5] === 'seed') {
        await seed(sticky);
        interactions.push({ seeded: { completedTasks: 1000, series: 100, history: 10000 } });
      }
      // Preserve the entire first five seconds before opening Main; Main is on demand.
      await delay(5600);
      const clickStart = process.hrtime.bigint();
      await sticky
        .getByRole('button', { name: 'Open full app', exact: true })
        .click({ timeout: 3000 })
        .catch(async () => {
          await sticky.evaluate(() => window.assistantTime.focusMainWindow());
        });
      interactions.push({
        name: 'open-main',
        ms: Number(process.hrtime.bigint() - launchNs) / 1e6,
        roundTripMs: Number(process.hrtime.bigint() - clickStart) / 1e6,
      });
      browsers.push(await chromium.connectOverCDP(`http://127.0.0.1:${port}`));
      const main = browsers
        .at(-1)
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().includes('window=main'));
      if (!main) throw new Error('Main renderer not found');
      let traceSession;
      const trace = [];
      if (process.argv[5] === 'trace') {
        traceSession = await main.context().newCDPSession(main);
        traceSession.on('Tracing.dataCollected', ({ value }) => trace.push(...value));
        await traceSession.send('Tracing.start', {
          categories: 'devtools.timeline,blink.user_timing,v8',
          transferMode: 'ReportEvents',
        });
      }
      const readyStart = process.hrtime.bigint();
      if (process.argv[5] !== 'passive') {
        await main.getByRole('button', { name: 'Settings', exact: true }).click({ timeout: 30000 });
        await main
          .getByRole('button', { name: 'Close settings', exact: true })
          .click({ timeout: 15000 });
        interactions.push({
          name: 'main-settings-interaction',
          ms: Number(process.hrtime.bigint() - launchNs) / 1e6,
          roundTripMs: Number(process.hrtime.bigint() - readyStart) / 1e6,
        });
        await main.screenshot({ path: path.join(root, `${label}-main.png`) });
        await sticky.screenshot({ path: path.join(root, `${label}-sticky.png`) });
      }
      if (traceSession) {
        await delay(3500);
        const completed = new Promise((resolve) =>
          traceSession.once('Tracing.tracingComplete', resolve),
        );
        await traceSession.send('Tracing.end');
        await completed;
        fs.writeFileSync(
          path.join(root, `${label}-trace.json`),
          JSON.stringify({ traceEvents: trace }),
        );
      }
    }
    await new Promise((resolve, reject) => {
      if (child.exitCode !== null) return resolve();
      const timer = setTimeout(() => reject(new Error('Profile process did not exit')), 135000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (child.exitCode !== 0) throw new Error(`Executable exited ${child.exitCode}`);
    const report = JSON.parse(fs.readFileSync(output, 'utf8'));
    report.launch = {
      label,
      executable,
      launchEpochMs,
      profile,
      isolatedTemp: temp,
      extraction,
      interactions,
      exitCode: child.exitCode,
    };
    for (const [mode, renderer] of Object.entries(report.renderers)) {
      const dataReady = renderer.checkpoints.find(
        (event) => event.name === 'application-startup-complete',
      );
      renderer.derivedDataReadyFrames = renderer.jank.frames
        .filter((frame) => dataReady && frame.ms >= dataReady.ms)
        .slice(0, 2)
        .map((frame, index) => ({ name: `${index + 1}:rAF-after-data`, ms: frame.ms }));
      const paint = renderer.paints.find((event) => event.name === 'first-contentful-paint');
      if (paint) {
        const inPaintWindow = (event) =>
          event.ms < paint.ms + 5000 && event.ms + (event.durationMs || 0) >= paint.ms;
        const paintFrames = renderer.jank.frames.filter(inPaintWindow);
        renderer.firstFiveSecondsAfterPaint = {
          startRendererMs: paint.ms,
          longTasks: renderer.jank.longTasks.filter(inPaintWindow),
          longFrames: renderer.jank.longFrames.filter(inPaintWindow),
          frameCount: paintFrames.length,
          maxFrameGapMs: Math.max(0, ...paintFrames.map((frame) => frame.gapMs)),
          gapsOver50Ms: paintFrames.filter((frame) => frame.gapMs > 50),
          recordingUntilMs: renderer.jank.frames.at(-1)?.ms,
        };
      }
      const shown = report.main.find(
        (event) =>
          event.name === `${mode}:visible-at-constructor-return` || event.name === `${mode}:show`,
      );
      if (!shown) continue;
      const start =
        report.runtime.entryEpochMs +
        shown.ms -
        report.runtime.entryFromLaunchMs -
        renderer.timeOrigin;
      const overlaps = (event) =>
        event.ms < start + 5000 && event.ms + (event.durationMs || 0) >= start;
      const frames = renderer.jank.frames.filter(overlaps);
      renderer.firstFiveSeconds = {
        nativeShownMs: shown.ms,
        startRendererMs: start,
        observedFromMs: renderer.checkpoints[0]?.ms,
        longTasks: renderer.jank.longTasks.filter(overlaps),
        longFrames: renderer.jank.longFrames.filter(overlaps),
        frameCount: frames.length,
        gapsOver50Ms: frames.filter((frame) => frame.gapMs > 50),
        maxFrameGapMs: Math.max(0, ...frames.map((frame) => frame.gapMs)),
      };
    }
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    const entry = report.runtime.entryFromLaunchMs;
    const shown = report.main.find(
      (event) =>
        event.name === 'sticky:visible-at-constructor-return' || event.name === 'sticky:show',
    )?.ms;
    console.log(
      JSON.stringify({
        label,
        mainEntryMs: entry,
        visibleMs: shown,
        renderers: Object.keys(report.renderers),
        output,
      }),
    );
  } finally {
    clearInterval(sampler);
    for (const browser of browsers) await browser.close().catch(() => {});
    if (child.exitCode === null) child.kill();
    fs.writeFileSync(path.join(root, `${label}-stderr.log`), stderr);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
