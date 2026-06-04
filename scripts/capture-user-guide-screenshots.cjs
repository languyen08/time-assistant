const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = process.cwd();
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const APP_URL = 'http://127.0.0.1:4200';

function ensureArtifactsDir() {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (_error) {
    const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    return chromium.launch({ headless: true, executablePath: chromePath });
  }
}

function iso(minutesOffset = 0) {
  return new Date(Date.UTC(2026, 5, 4, 9, 0 + minutesOffset, 0)).toISOString();
}

function task(overrides = {}) {
  return {
    id: 'task_default',
    name: 'Write product summary',
    note: 'Keep the update concise and send it before the meeting.',
    category: 'Work',
    reminderAt: iso(30),
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    order: 0,
    status: 'pending',
    createdAt: iso(-20),
    updatedAt: iso(-20),
    totalPausedSeconds: 0,
    reminderAttemptsShown: 0,
    ...overrides,
  };
}

function historyEvent(index, summary, minutesOffset) {
  return {
    id: `event_${index}`,
    type: 'task_created',
    occurredAt: iso(minutesOffset),
    summary,
  };
}

async function setMainState(page, state) {
  await page.evaluate((input) => {
    const root = document.querySelector('app-root');
    const app = window.ng.getComponent(root);
    const currentSettings = app.settingsService.settings();

    app.loading.set(false);
    app.settingsOpen.set(false);
    app.csvOpen.set(false);
    app.historyOpen.set(true);
    app.editingTaskId.set(undefined);
    app.exportStatus.set('');
    app.importStatus.set('');
    app.importErrors.set([]);
    app.settingsStatus.set('');
    app.breakConflictTaskId.set(undefined);
    app.deferredBreakTaskId.set(undefined);
    app.extensionMinutes.set(10);
    app.breakMinutes.set(currentSettings.defaultBreakMinutes);
    app.pendingPage.set(0);
    app.historyPage.set(0);
    app.reminderScheduler.activeReminder.set(undefined);
    app.breakService.reset();
    app.taskService.tasks.set(input.tasks);
    app.historyService.events.set(input.history);
    app.settingsService.settings.set({ ...currentSettings, ...input.settings });
    app.taskForm.setValue(input.form);
    app.taskService.errorMessage.set('');
    app.historyService.errorMessage.set('');
    app.settingsService.errorMessage.set('');
    app.breakService.errorMessage.set('');
    app.reminderScheduler.errorMessage.set('');
  }, state);

  await page.waitForTimeout(250);
}

async function setStickyState(page, state) {
  await page.evaluate((input) => {
    const root = document.querySelector('app-root');
    const app = window.ng.getComponent(root);
    const currentSettings = app.settingsService.settings();

    app.loading.set(false);
    app.settingsOpen.set(false);
    app.csvOpen.set(false);
    app.historyOpen.set(false);
    app.editingTaskId.set(undefined);
    app.breakConflictTaskId.set(undefined);
    app.deferredBreakTaskId.set(undefined);
    app.extensionMinutes.set(10);
    app.breakMinutes.set(currentSettings.defaultBreakMinutes);
    app.pendingPage.set(0);
    app.historyPage.set(0);
    app.breakService.reset();
    app.taskService.tasks.set(input.tasks);
    app.historyService.events.set(input.history ?? []);
    app.settingsService.settings.set({ ...currentSettings, ...input.settings });
    app.reminderScheduler.activeReminder.set(input.reminder ?? undefined);
    app.taskService.errorMessage.set('');
    app.historyService.errorMessage.set('');
    app.settingsService.errorMessage.set('');
    app.breakService.errorMessage.set('');
    app.reminderScheduler.errorMessage.set('');
  }, state);

  await page.waitForTimeout(250);
}

async function captureMainMode(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(APP_URL, { waitUntil: 'networkidle' });

  const pendingTasks = [
    task({
      id: 'task_1',
      name: 'Draft onboarding checklist',
      note: '',
      category: 'Admin',
      reminderAt: iso(20),
      order: 0,
    }),
    task({
      id: 'task_2',
      name: 'Review customer notes',
      note: '',
      category: 'Support',
      reminderAt: iso(45),
      order: 1,
    }),
  ];

  const activeTask = task({
    id: 'task_active',
    name: 'Prepare weekly planning notes',
    category: 'Planning',
    status: 'active',
    activeStartedAt: iso(-12),
    nextReminderAt: iso(6),
    reminderAt: iso(6),
    updatedAt: iso(-1),
  });

  const history = [
    historyEvent(1, 'Completed "Inbox cleanup".', -2),
    historyEvent(2, 'Started "Prepare weekly planning notes".', -12),
    historyEvent(3, 'Created "Review customer notes".', -20),
    historyEvent(4, 'Completed the break.', -25),
    historyEvent(5, 'Started a 10 minute break.', -35),
    historyEvent(6, 'Paused "Roadmap review".', -45),
  ];

  const form = {
    name: '',
    reminderAt: '2026-06-04T16:20',
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    category: '',
    note: '',
  };

  await setMainState(page, {
    tasks: pendingTasks,
    history,
    settings: {
      stickyNoteEnabled: true,
      stickyVisibleNotes: 3,
      stickyNoteColor: 'yellow',
    },
    form,
  });
  await page.screenshot({
    path: path.join(ARTIFACTS_DIR, 'full-app-after-scroll-fixed.png'),
    fullPage: false,
  });

  await setMainState(page, {
    tasks: [activeTask, ...pendingTasks.map((item) => ({ ...item, order: item.order + 1 }))],
    history,
    settings: {
      stickyNoteEnabled: true,
      stickyVisibleNotes: 3,
      stickyNoteColor: 'yellow',
    },
    form,
  });
  await page.locator('#active').screenshot({
    path: path.join(ARTIFACTS_DIR, 'current-task-active-after.png'),
  });

  await page.evaluate(() => {
    const app = window.ng.getComponent(document.querySelector('app-root'));
    app.reminderScheduler.activeReminder.set({
      taskId: 'task_active',
      taskName: 'Prepare weekly planning notes',
      attemptNumber: 1,
      maxAttempts: 3,
      shownAt: new Date().toISOString(),
      message: 'Choose whether to continue, pause, or complete the task.',
    });
  });
  await page.waitForTimeout(300);
  await page.locator('.friendly-backdrop').screenshot({
    path: path.join(ARTIFACTS_DIR, 'reminder-modal-after.png'),
  });

  await page.evaluate(() => {
    const app = window.ng.getComponent(document.querySelector('app-root'));
    app.reminderScheduler.activeReminder.set(undefined);
    app.breakService.prompt(10);
  });
  await page.waitForTimeout(300);
  await page.locator('.break-prompt-modal').screenshot({
    path: path.join(ARTIFACTS_DIR, 'break-modal-after.png'),
  });

  await setMainState(page, {
    tasks: pendingTasks,
    history: Array.from({ length: 18 }, (_, index) =>
      historyEvent(index + 1, `Seeded history event ${index + 1}.`, -index),
    ),
    settings: {
      stickyNoteEnabled: true,
      stickyVisibleNotes: 3,
      stickyNoteColor: 'yellow',
    },
    form,
  });
  await page.locator('[data-history-panel]').screenshot({
    path: path.join(ARTIFACTS_DIR, 'history-real-browser-final.png'),
  });

  await page.evaluate(() => {
    const app = window.ng.getComponent(document.querySelector('app-root'));
    app.openSettings();
  });
  await page.waitForTimeout(300);
  await page.locator('.settings-modal-sheet').screenshot({
    path: path.join(ARTIFACTS_DIR, 'settings-modal-after.png'),
  });

  await page.close();
}

async function captureStickyMode(browser) {
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  await page.goto(`${APP_URL}?window=sticky`, { waitUntil: 'networkidle' });

  const activeTask = task({
    id: 'sticky_active',
    name: 'Finish release checklist',
    note: 'Confirm QA notes and final wording.',
    category: 'Release',
    status: 'active',
    activeStartedAt: iso(-18),
    nextReminderAt: iso(8),
    reminderAt: iso(8),
    updatedAt: iso(-1),
  });

  const pendingTasks = [
    task({
      id: 'sticky_pending_1',
      name: 'Reply to launch questions',
      category: 'Support',
      note: '',
      reminderAt: iso(22),
      order: 1,
    }),
    task({
      id: 'sticky_pending_2',
      name: 'Update changelog',
      category: 'Docs',
      note: '',
      reminderAt: iso(35),
      order: 2,
    }),
  ];

  await setStickyState(page, {
    tasks: [activeTask, ...pendingTasks],
    settings: {
      stickyNoteEnabled: true,
      stickyVisibleNotes: 3,
      stickyNoteColor: 'blue',
      stickyNoteAlwaysOnTop: true,
    },
  });
  await page.locator('.sticky-window').screenshot({
    path: path.join(ARTIFACTS_DIR, 'sticky-reminder-fit.png'),
  });

  await setStickyState(page, {
    tasks: [activeTask, ...pendingTasks],
    settings: {
      stickyNoteEnabled: true,
      stickyVisibleNotes: 3,
      stickyNoteColor: 'blue',
      stickyNoteAlwaysOnTop: true,
    },
    reminder: {
      taskId: 'sticky_active',
      taskName: 'Finish release checklist',
      attemptNumber: 2,
      maxAttempts: 3,
      shownAt: new Date().toISOString(),
      message: 'Add more time, pause, or complete the task.',
    },
  });
  await page.waitForTimeout(300);
  await page.locator('.friendly-backdrop').screenshot({
    path: path.join(ARTIFACTS_DIR, 'sticky-reminder-after-inline-compact.png'),
  });

  await page.close();
}

async function main() {
  ensureArtifactsDir();
  const browser = await launchBrowser();
  try {
    await captureMainMode(browser);
    await captureStickyMode(browser);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
