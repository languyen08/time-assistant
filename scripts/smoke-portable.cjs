const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 20000 });
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
async function freePort() {
  const server = require('node:net').createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function connectInspector(port) {
  let targets;
  await expect
    .poll(
      async () => {
        try {
          targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
          return targets.length > 0;
        } catch {
          return false;
        }
      },
      { timeout: 180_000 },
    )
    .toBe(true);
  const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  });
  function send(method, params) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Inspector ${method} timed out`));
      }, 10_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  await send('Runtime.enable');
  return {
    async evaluate(callback, argument) {
      const expression = `(${callback.toString()})(require('electron'), ${JSON.stringify(argument) ?? 'undefined'})`;
      const result = await send('Runtime.evaluate', {
        expression,
        includeCommandLineAPI: true,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    close() {
      socket.close();
    },
  };
}
const executablePath = path.resolve('release/Time Assistant.exe');
const smokeLabel = process.argv[2];
if (!smokeLabel) throw new Error('Provide an isolated smoke label');
const smokeRoot = path.resolve('artifacts/startup-optimization', smokeLabel);
fs.mkdirSync(smokeRoot, { recursive: true });
const profile = path.join(smokeRoot, 'profile');
if (fs.existsSync(profile))
  throw new Error('Use a new smoke label; existing profiles are preserved.');
const temporaryDirectory = path.join(smokeRoot, 'temp');
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(temporaryDirectory, { recursive: true });
const results = [];
const taskName = 'Portable-only persistence smoke';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());
async function databaseState(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('friendly-task-reminder', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = { version: db.version, stores: [...db.objectStoreNames] };
    for (const store of result.stores) {
      result[store] = await new Promise((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    db.close();
    return result;
  });
}
async function run(restart) {
  const inspectorPort = await freePort();
  const browserPort = await freePort();
  const env = { ...process.env, TEMP: temporaryDirectory, TMP: temporaryDirectory };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'TIME_ASSISTANT_STARTUP_PROFILE'])
    delete env[key];
  const child = spawn(
    executablePath,
    [
      `--inspect=${inspectorPort}`,
      `--remote-debugging-port=${browserPort}`,
      `--user-data-dir=${profile}`,
    ],
    { env, windowsHide: true, stdio: 'ignore' },
  );
  fs.writeFileSync(
    path.join(smokeRoot, 'process.json'),
    JSON.stringify({ inspectorPort, browserPort, pid: child.pid, profile }),
  );
  const exited = new Promise((resolve, reject) => {
    child.once('exit', (code) => resolve(code));
    child.once('error', reject);
  });
  let inspector;
  const browsers = [];
  const rendererErrors = [];
  const windows = async () =>
    inspector.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed() && !w.webContents.isDestroyed())
        .map((w) => ({
          id: w.id,
          url: w.webContents.getURL(),
          visible: w.isVisible(),
          mode: !w.isFocusable() ? 'scheduler' : w.isResizable() ? 'main' : 'sticky',
        })),
    );
  try {
    inspector = await connectInspector(inspectorPort);
    const runtime = await inspector.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      userData: app.getPath('userData'),
      exe: process.execPath,
      launcher: process.env.PORTABLE_EXECUTABLE_FILE,
    }));
    expect(runtime.packaged).toBe(true);
    expect(runtime.userData).toBe(profile);
    expect(runtime.launcher).toBe(executablePath);
    expect(runtime.exe).not.toBe(executablePath);
    await expect
      .poll(
        async () => {
          const state = await inspector.evaluate(({ app, BrowserWindow }) => ({
            ready: app.isReady(),
            windows: BrowserWindow.getAllWindows().map((w) => ({
              id: w.id,
              url: w.webContents.getURL(),
              loading: w.webContents.isLoading(),
              visible: w.isVisible(),
            })),
          }));
          fs.writeFileSync(path.join(smokeRoot, 'windows.json'), JSON.stringify(state, null, 2));
          return state.ready && state.windows.length === 2;
        },
        { timeout: 120000 },
      )
      .toBe(true);
    browsers.push(await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`));
    let sticky;
    await expect
      .poll(
        async () => {
          for (const page of browsers[0].contexts().flatMap((c) => c.pages())) {
            if (await page.locator('.sticky-shell').count()) {
              sticky = page;
              return true;
            }
          }
          return false;
        },
        { timeout: 60000 },
      )
      .toBe(true);
    sticky.on('pageerror', (e) => rendererErrors.push(e.message));
    await expect(sticky.locator('.sticky-focus-card')).toBeVisible({ timeout: 30000 });
    await sticky.waitForFunction(() => Boolean(window.assistantTime));
    if (restart) await expect(sticky.locator('.sticky-shell')).toContainText(taskName);
    await expect
      .poll(async () => (await windows()).find((w) => w.mode === 'sticky')?.visible)
      .toBe(true);
    expect((await windows()).filter((w) => w.mode === 'scheduler')).toHaveLength(1);
    expect((await windows()).find((w) => w.mode === 'scheduler').visible).toBe(false);
    await sticky.getByRole('button', { name: 'Open full app', exact: true }).click();
    browsers.push(await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`));
    let main;
    await expect
      .poll(
        async () => {
          for (const page of browsers
            .at(-1)
            .contexts()
            .flatMap((c) => c.pages())) {
            if (await page.getByLabel('Task name').count()) {
              main = page;
              return true;
            }
          }
          return false;
        },
        { timeout: 60000 },
      )
      .toBe(true);
    main.on('pageerror', (e) => rendererErrors.push(e.message));
    await main.setViewportSize({ width: 1440, height: 1200 });
    await expect(main.getByLabel('Task name')).toBeVisible({ timeout: 30000 });
    const existingData = await databaseState(main);
    if (!restart && !existingData.tasks.some((task) => task.name === taskName)) {
      await main.getByLabel('Task name').fill(taskName);
      await main.getByLabel('Enable reminder').uncheck();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const startTime = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T23:59`;
      await main.getByLabel('Start time (optional)', { exact: true }).fill(startTime);
      await main.getByRole('button', { name: 'Create task', exact: true }).click();
    }
    await expect(main.locator('.task-list li', { hasText: taskName })).toBeVisible();
    await expect(sticky.locator('.sticky-shell')).toContainText(taskName);
    const db = await databaseState(main);
    expect(db.version).toBe(2);
    expect(db.tasks).toHaveLength(restart ? 3 : 1);
    expect(db.tasks.find((task) => task.name === taskName)).toMatchObject({
      name: taskName,
      status: 'pending',
      reminderEnabled: false,
    });
    expect(db.settings).toHaveLength(1);
    expect(db.settings[0].stickyNoteEnabled).toBe(true);
    expect(db.history.some((event) => event.type === 'task_created')).toBe(true);
    if (!restart) {
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      await main.getByLabel('Task name').fill('Portable recurrence smoke');
      await main.getByLabel('Enable reminder').uncheck();
      await main.getByLabel('Start time (optional)', { exact: true }).fill(`${date}T23:59`);
      await main.getByLabel('Enable repeat').check();
      await main.getByLabel('Repeat', { exact: true }).selectOption('daily');
      await main.getByLabel('Repeat start date').fill(date);
      await main.getByRole('button', { name: 'Create task', exact: true }).click();
      const pending = main.locator('.task-list li', { hasText: 'Portable recurrence smoke' });
      await expect(pending).toHaveCount(1);
      await pending.getByRole('button', { name: 'Start now', exact: true }).click();
      const current = main.locator('.current-task-active-note', {
        hasText: 'Portable recurrence smoke',
      });
      await current.getByRole('button', { name: 'Pause task', exact: true }).click();
      await expect(current).toContainText('Paused');
      await current.getByRole('button', { name: 'Resume task', exact: true }).click();
      await current.getByRole('button', { name: 'Complete task', exact: true }).click();
      await expect(main.locator('.break-modal')).toBeVisible();
      await main.getByRole('button', { name: 'Skip break', exact: true }).click();
      await expect(pending).toHaveCount(1);
      await pending.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(pending).toHaveCount(0);
      const recurrenceState = await databaseState(main);
      expect(
        recurrenceState.tasks.filter((task) => task.name === 'Portable recurrence smoke'),
      ).toHaveLength(1);
      expect(
        recurrenceState.tasks.find((task) => task.name === 'Portable recurrence smoke').status,
      ).toBe('completed');
      expect(recurrenceState.history.filter((event) => event.type === 'task_created')).toHaveLength(
        3,
      );
      await expect(pending).toHaveCount(0);
      await main.getByLabel('Task name').fill('Portable reminder smoke');
      await main.getByLabel('Enable reminder').check();
      await main.getByLabel('Start time', { exact: true }).fill(`${date}T23:59`);
      await main.getByRole('button', { name: 'Create task', exact: true }).click();
      const reminder = main.locator('.task-list li', { hasText: 'Portable reminder smoke' });
      await reminder.getByRole('button', { name: 'Start now', exact: true }).click();
      const reminderCurrent = main.locator('.current-task-active-note', {
        hasText: 'Portable reminder smoke',
      });
      await expect(reminderCurrent).toContainText('Reminder');
      const reminderState = await databaseState(main);
      expect(
        reminderState.tasks.find((task) => task.name === 'Portable reminder smoke'),
      ).toMatchObject({ status: 'active', reminderEnabled: true });
      expect(
        reminderState.tasks.find((task) => task.name === 'Portable reminder smoke').nextReminderAt,
      ).toBeTruthy();
      await reminderCurrent.getByRole('button', { name: 'Pause task', exact: true }).click();
      await reminderCurrent.getByRole('button', { name: 'Resume task', exact: true }).click();
      await reminderCurrent.getByRole('button', { name: 'Complete task', exact: true }).click();
      await main.getByRole('button', { name: 'Skip break', exact: true }).click();
    }
    await sticky.getByRole('button', { name: 'Close sticky note', exact: true }).click();
    await expect
      .poll(async () => (await windows()).find((w) => w.mode === 'sticky')?.visible)
      .toBe(false);
    expect((await databaseState(main)).settings[0].stickyNoteEnabled).toBe(true);
    await main.evaluate(() =>
      window.assistantTime.setStickyWindow({ enabled: true, alwaysOnTop: true, color: 'yellow' }),
    );
    await expect
      .poll(async () => (await windows()).find((w) => w.mode === 'sticky')?.visible)
      .toBe(true);
    await main.getByRole('button', { name: 'Settings', exact: true }).click();
    if (!restart) {
      await main.getByLabel('Sticky notes shown').fill('3');
      await main.getByLabel('Sticky notes shown').press('Tab');
      await expect
        .poll(async () => (await databaseState(main)).settings[0].stickyVisibleNotes)
        .toBe(3);
    } else {
      await expect(main.getByLabel('Sticky notes shown')).toHaveValue('3');
      const persisted = await databaseState(main);
      expect(persisted.tasks.filter((task) => task.recurrenceTemplate)).toHaveLength(0);
      expect(persisted.tasks.filter((task) => task.status === 'completed')).toHaveLength(2);
    }
    await main.getByRole('button', { name: 'Close settings', exact: true }).click();
    await main.screenshot({ path: `${smokeRoot}/${restart ? 'restart' : 'first'}-main.png` });
    if (!restart) await sticky.screenshot({ path: path.join(smokeRoot, 'sticky.png') });
    const nativeWindows = await windows();
    expect(nativeWindows).toHaveLength(3);
    expect(nativeWindows.every((w) => w.url.startsWith('file:'))).toBe(true);
    expect(nativeWindows.map((w) => w.mode).sort()).toEqual(['main', 'scheduler', 'sticky']);
    await inspector.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.isFocusable() && w.isResizable())
        .close();
      return true;
    });
    await expect
      .poll(async () => (await windows()).filter((w) => w.mode === 'main').length)
      .toBe(0);
    expect((await windows()).find((w) => w.mode === 'sticky').visible).toBe(true);
    expect(rendererErrors).toEqual([]);
    results.push({
      restart,
      runtime,
      windows: nativeWindows,
      tasks: db.tasks.length,
      settings: db.settings.length,
      history: db.history.length,
      rendererErrors,
      checks: [
        'Angular UI',
        'portable launcher identity',
        'IndexedDB v2 persisted data',
        'Sticky hide/restore',
        'Main close preserves Sticky',
        'settings persisted across restart',
        'no-reminder recurrence generation/pause/resume/completion',
        'series delete preserves completed work and survives restart',
        'reminder-enabled lifecycle',
        'only expected application windows',
      ],
    });
    await inspector
      .evaluate(({ app }) => {
        app.quit();
        return true;
      })
      .catch(() => {});
    // Electron's Node inspector can hold shutdown until its client disconnects.
    inspector.close();
    for (const browser of browsers) await browser.close().catch(() => {});
    expect(
      await Promise.race([
        exited,
        sleep(30000).then(() => {
          throw new Error('Portable process did not quit');
        }),
      ]),
    ).toBe(0);
    console.log(`PASS ${restart ? 'persisted restart' : 'first launch'}`);
  } finally {
    if (child.exitCode === null && inspector) {
      await inspector
        .evaluate(({ app }) => {
          app.quit();
          return true;
        })
        .catch(() => {});
      inspector.close();
      await Promise.race([exited, sleep(10000)]);
    }
    inspector?.close();
    for (const browser of browsers) await browser.close().catch(() => {});
    if (child.exitCode === null) child.kill();
  }
}
(async () => {
  await run(false);
  await run(true);
  fs.writeFileSync(path.join(smokeRoot, 'result.json'), JSON.stringify({ runs: results }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
