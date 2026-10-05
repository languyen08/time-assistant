// Run after packaging: node e2e/packaged-startup.cjs <executable> <portable|nsis>
// Uses the packaged preload/IPC and real Windows APIs. Restores the exact previous
// app-specific Run/StartupApproved values, even when an assertion fails.
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 15000 });
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const executablePath = path.resolve(process.argv[2]);
const packaging = process.argv[3];
const profile = path.resolve('artifacts', `startup-${packaging}-${Date.now()}-profile`);
fs.mkdirSync(profile, { recursive: true });
const registryName = 'local.assistant-time.time-assistant';
const snapshotScript = `
$name = '${registryName}'
$run = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
$approval = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
$runValue = Get-ItemPropertyValue -LiteralPath $run -Name $name -ErrorAction SilentlyContinue
$approvalValue = Get-ItemPropertyValue -LiteralPath $approval -Name $name -ErrorAction SilentlyContinue
@{ run = $runValue; approval = $(if ($null -ne $approvalValue) { [Convert]::ToBase64String($approvalValue) } else { $null }) } | ConvertTo-Json -Compress
`;
const restoreScript = `
$ErrorActionPreference = 'Stop'
$snapshot = [Console]::In.ReadToEnd() | ConvertFrom-Json
$name = '${registryName}'
$run = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
$approval = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
foreach ($entry in @(@{ path = $run; value = $snapshot.run; type = 'String' }, @{ path = $approval; value = $snapshot.approval; type = 'Binary' })) {
  if ($null -eq $entry.value) {
    if (Test-Path -LiteralPath $entry.path) { Remove-ItemProperty -LiteralPath $entry.path -Name $name -ErrorAction SilentlyContinue }
  } else {
    if (!(Test-Path -LiteralPath $entry.path)) { New-Item -Path $entry.path | Out-Null }
    $value = if ($entry.type -eq 'Binary') { [Convert]::FromBase64String($entry.value) } else { $entry.value }
    New-ItemProperty -LiteralPath $entry.path -Name $name -PropertyType $entry.type -Value $value -Force | Out-Null
  }
}
exit 0
`;
function powershell(script, input) {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { input, encoding: 'utf8', windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || `PowerShell exit ${result.status}`);
  return result.stdout.trim();
}
const baseline = powershell(snapshotScript);
fs.writeFileSync(path.join(profile, 'startup-baseline.json'), baseline);
let application;
let child;
let inspector;
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
      { timeout: 60_000 },
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
async function launch() {
  const inspectorPort = await freePort();
  const browserPort = await freePort();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  child = spawn(
    executablePath,
    [
      `--inspect=${inspectorPort}`,
      `--remote-debugging-port=${browserPort}`,
      `--user-data-dir=${profile}`,
    ],
    { env, windowsHide: true, stdio: 'ignore' },
  );
  child.on('error', (error) => console.error('Packaged process launch failed', error));
  // Portable's NSIS wrapper does not forward the child's debugger console output,
  // so attach to loopback endpoints instead of Playwright's stdout-based launcher.
  inspector = await connectInspector(inspectorPort);
  const browsers = [await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`)];
  application = {
    evaluate: (...args) => inspector.evaluate(...args),
    windows: () =>
      browsers.flatMap((browser) => browser.contexts().flatMap((context) => context.pages())),
    async close() {
      await inspector
        .evaluate(({ app }) => {
          app.quit();
          return true;
        })
        .catch(() => undefined);
      inspector.close();
      await Promise.all(browsers.map((browser) => browser.close()));
      await expect.poll(() => child.exitCode !== null, { timeout: 30_000 }).toBe(true);
    },
  };
  const runtime = await application.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    userData: app.getPath('userData'),
    exe: app.getPath('exe'),
    portable: process.env.PORTABLE_EXECUTABLE_FILE,
  }));
  console.log(packaging, 'runtime', runtime);
  expect(runtime.packaged).toBe(true);
  expect(path.resolve(runtime.userData)).toBe(profile);
  if (packaging === 'portable') {
    expect(runtime.portable).toBe(executablePath);
    expect(runtime.exe).not.toBe(executablePath);
  } else {
    expect(runtime.portable).toBeUndefined();
    expect(runtime.exe).toBe(executablePath);
  }
  await expect
    .poll(() => application.windows().find((page) => page.url().includes('window=sticky')))
    .toBeTruthy();
  const sticky = application.windows().find((page) => page.url().includes('window=sticky'));
  await sticky.waitForFunction(() => Boolean(window.assistantTime));
  await sticky.evaluate(() => window.assistantTime.focusMainWindow());
  console.log(
    'Native windows',
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => window.webContents.getURL()),
    ),
  );
  // Chromium's generic CDP connection does not discover later Electron windows
  // consistently. A fresh connection enumerates the newly created Main target.
  browsers.push(await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`));
  await expect
    .poll(() => application.windows().find((page) => page.url().includes('window=main')))
    .toBeTruthy();
  const main = application.windows().find((page) => page.url().includes('window=main'));
  await main.getByRole('button', { name: 'Settings', exact: true }).click();
  const checkbox = main.getByLabel('Start app with Windows');
  await expect(checkbox).toBeEnabled();
  return { main, sticky, checkbox };
}
async function close() {
  if (application) await application.close();
  application = undefined;
  inspector?.close();
  if (child && child.exitCode === null) child.kill();
}

async function validateSticky(main, sticky) {
  await main.getByRole('button', { name: 'Close settings', exact: true }).click();
  // Match the main-workspace viewport used by the browser regression; this test
  // verifies synchronization, not the existing compact-window layout.
  await main.setViewportSize({ width: 1440, height: 1200 });
  for (const name of ['Packaged A', 'Packaged B', 'Packaged C']) {
    await main.getByLabel('Task name').fill(name);
    await main.getByLabel('Allow concurrent start').check();
    await main.getByRole('button', { name: 'Create task', exact: true }).click();
    await main
      .locator('.task-list li', { hasText: name })
      .getByRole('button', { name: 'Start now' })
      .click();
  }
  const mainCards = main.locator('.current-task-active-note');
  const stickyCards = sticky.locator('.sticky-focus-card:not(.empty)');
  await expect(mainCards).toHaveCount(3);
  await main.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const [value, count] of [
    ['5', 3],
    ['2', 2],
    ['5', 3],
  ]) {
    await main.getByLabel('Sticky notes shown').fill(value);
    await main.getByLabel('Sticky notes shown').press('Tab');
    await expect(stickyCards).toHaveCount(count);
  }
  await main.getByRole('button', { name: 'Close settings', exact: true }).click();
  await sticky
    .locator('.sticky-focus-card', { hasText: 'Packaged B' })
    .getByRole('button', { name: 'Complete task' })
    .click();
  await expect(mainCards).toHaveCount(2);
  await expect(stickyCards).toHaveCount(2);
  await main
    .locator('.current-task-active-note', { hasText: 'Packaged A' })
    .getByRole('button', { name: 'Complete task' })
    .click();
  await expect(mainCards).toHaveCount(1);
  await expect(stickyCards).toHaveCount(1);
  await main.getByRole('button', { name: 'Settings', exact: true }).click();
  console.log(
    packaging,
    'PASS: packaged Sticky concurrent tasks, limits 5/2/5, completion from both windows',
  );
}
(async () => {
  try {
    let { main, sticky, checkbox } = await launch();
    await validateSticky(main, sticky);
    const initial = await main.evaluate(() => window.assistantTime.getStartAtLogin());
    expect(initial.ok).toBe(true);
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toBeEnabled();
    const enabled = await main.evaluate(() => window.assistantTime.getStartAtLogin());
    expect(enabled).toMatchObject({ ok: true, enabled: true });
    expect(JSON.parse(powershell(snapshotScript)).run).toBe(`"${executablePath}"`);
    const native = await application.evaluate(
      ({ app }, target) => ({
        unquoted: app.getLoginItemSettings({ path: target, args: [] }),
        quoted: app.getLoginItemSettings({ path: `"${target}"`, args: [] }),
      }),
      executablePath,
    );
    expect(native.quoted.executableWillLaunchAtLogin).toBe(true);
    expect(
      native.quoted.launchItems.some(
        (item) =>
          item.scope === 'user' &&
          item.enabled &&
          item.name === 'local.assistant-time.time-assistant',
      ),
    ).toBe(true);
    console.log(packaging, 'native read-back', {
      unquoted: native.unquoted.executableWillLaunchAtLogin,
      quoted: native.quoted.executableWillLaunchAtLogin,
    });
    await main.getByRole('button', { name: 'Close settings', exact: true }).click();
    await main.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(checkbox).toBeEnabled();
    await expect(checkbox).toBeChecked();
    await close();
    ({ main, sticky, checkbox } = await launch());
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toBeEnabled();
    expect(await main.evaluate(() => window.assistantTime.getStartAtLogin())).toMatchObject({
      ok: true,
      enabled: false,
    });
    expect(JSON.parse(powershell(snapshotScript)).run).toBeNull();
    await close();
    ({ checkbox } = await launch());
    await expect(checkbox).not.toBeChecked();
    console.log(
      packaging,
      'PASS: native enable, Settings reopen, packaged restart, native disable/removal, disabled restart',
    );
  } catch (error) {
    console.error('Packaged validation failed', error);
    throw error;
  } finally {
    try {
      await close();
    } finally {
      powershell(restoreScript, baseline);
      expect(JSON.parse(powershell(snapshotScript))).toEqual(JSON.parse(baseline));
      console.log('Original app startup state restored.');
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
