// Opt-in local diagnostics. No IPC capability or packaging policy changes.
const entryNs = process.hrtime.bigint();
const entryEpochMs = Date.now();
const enabled = process.env.TIME_ASSISTANT_STARTUP_PROFILE === '1';
const launchNs =
  enabled && process.env.TIME_ASSISTANT_LAUNCH_NS
    ? BigInt(process.env.TIME_ASSISTANT_LAUNCH_NS)
    : entryNs;
const report = { main: [], renderers: {}, runtime: {}, errors: [] };
let finishRun;
let electronApp;
function mark(name) {
  if (!enabled) return;
  report.main.push({ name, ms: Number(process.hrtime.bigint() - launchNs) / 1e6 });
}
mark('main:process-entry');
function watchWindow(windowInstance, mode) {
  if (!enabled) return {};
  mark(`${mode}:window-created`);
  const shownEpochMs = Date.now();
  // BrowserWindow defaults to show:true; its initial show precedes this subscription.
  if (windowInstance.isVisible()) mark(`${mode}:visible-at-constructor-return`);
  windowInstance.on('show', () => mark(`${mode}:show`));
  windowInstance.once('ready-to-show', () => mark(`${mode}:ready-to-show`));
  for (const event of ['dom-ready', 'did-finish-load']) {
    windowInstance.webContents.once(event, () => {
      mark(`${mode}:${event}`);
      if (event === 'did-finish-load') {
        const pid = windowInstance.webContents.getOSProcessId();
        report.runtime.rendererProcesses ??= {};
        report.runtime.rendererProcesses[mode] = electronApp
          .getAppMetrics()
          .find((metric) => metric.pid === pid);
      }
    });
  }
  windowInstance.webContents.on('did-fail-load', (_event, code, description) => {
    report.errors.push({ mode, code, description });
  });
  windowInstance.webContents.on('console-message', (details) => {
    const prefix = '[startup-profile]';
    if (details.message?.startsWith(prefix)) {
      try {
        report.renderers[mode] = JSON.parse(details.message.slice(prefix.length));
        const expected =
          process.env.TIME_ASSISTANT_PROFILE_MAIN === '0'
            ? ['sticky', 'scheduler']
            : ['sticky', 'scheduler', 'main'];
        if (expected.every((key) => report.renderers[key])) finishRun?.();
      } catch {
        report.errors.push({ mode, description: 'Invalid diagnostic report' });
      }
    }
  });
  return { startupProfile: '1', shownEpochMs: String(shownEpochMs) };
}
function install(app, quit) {
  if (!enabled) return;
  electronApp = app;
  report.runtime = {
    entryEpochMs,
    processCreatedEpochMs: process.getCreationTime(),
    entryFromLaunchMs: Number(entryNs - launchNs) / 1e6,
    execPath: process.execPath,
    portableLauncher: process.env.PORTABLE_EXECUTABLE_FILE,
    versions: process.versions,
    userData: app.getPath('userData'),
    mainCreatedAtStartup: false,
  };
  const fs = require('node:fs');
  app.once('before-quit', () => {
    mark('main:before-quit');
    const output = process.env.TIME_ASSISTANT_PROFILE_OUTPUT;
    if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2));
  });
  if (process.env.TIME_ASSISTANT_PROFILE_EXIT === '1') {
    let scheduled = false;
    finishRun = () => {
      if (!scheduled) {
        scheduled = true;
        setTimeout(quit, 1000);
      }
    };
    setTimeout(quit, 120000).unref();
  }
}
module.exports = { enabled, mark, watchWindow, install };
