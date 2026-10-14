import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Electron Scheduler rolls at midnight with both visible windows open', async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-rollover-test-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env,
  });
  try {
    let sticky;
    await expect
      .poll(async () => {
        for (const page of application.windows()) {
          if (await page.locator('.sticky-window').count()) {
            sticky = page;
            return true;
          }
        }
        return false;
      })
      .toBe(true);
    await expect(sticky.locator('.sticky-window')).toBeVisible();
    await application.context().clock.setFixedTime(new Date(2026, 9, 6, 23, 59, 50));
    await sticky.evaluate(() => window.assistantTime.focusMainWindow());
    let main;
    await expect
      .poll(async () => {
        for (const page of application.windows()) {
          if (await page.getByLabel('Task name').count()) {
            main = page;
            return true;
          }
        }
        return false;
      })
      .toBe(true);
    await main.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('friendly-task-reminder', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction('tasks', 'readwrite');
      const store = transaction.objectStore('tasks');
      const timestamp = new Date().toISOString();
      const template = {
        id: 'electron-daily',
        recurrenceSeriesId: 'electron-daily',
        recurrenceTemplate: true,
        recurrenceCursor: '2026-10-06',
        recurrence: { type: 'daily', rangeStart: '2026-10-06' },
        name: 'Electron daily rollover',
        note: '',
        category: '',
        reminderAt: new Date(2026, 9, 6, 23, 58).toISOString(),
        reminderEnabled: false,
        reminderCount: 0,
        reminderIntervalMinutes: 0,
        allowConcurrentStart: false,
        status: 'pending',
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        totalPausedSeconds: 0,
        reminderAttemptsShown: 0,
      };
      store.put(template);
      store.put({
        ...template,
        id: 'recurring:electron-daily:2026-10-06',
        recurrenceTemplate: undefined,
        recurrenceCursor: undefined,
        occurrenceDate: '2026-10-06',
        status: 'active',
        activeStartedAt: new Date(2026, 9, 6, 23, 58).toISOString(),
      });
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
      const channel = new BroadcastChannel('friendly-task-reminder');
      channel.postMessage('tasks-changed');
      channel.close();
    });
    await expect(
      main.locator('.current-task-active-note', { hasText: 'Electron daily rollover' }),
    ).toBeVisible();
    await expect(
      sticky.locator('.sticky-focus-card', { hasText: 'Electron daily rollover' }),
    ).toBeVisible();
    await application.context().clock.setFixedTime(new Date(2026, 9, 7, 0, 0, 1));
    await expect(
      main.locator('.current-task-active-note', { hasText: 'Electron daily rollover' }),
    ).toHaveCount(0);
    await expect(
      sticky.locator('.sticky-focus-card', { hasText: 'Electron daily rollover' }),
    ).toHaveCount(0);
    const persisted = await main.evaluate(async () => {
      const database = await new Promise((resolve) => {
        const request = indexedDB.open('friendly-task-reminder', 2);
        request.onsuccess = () => resolve(request.result);
      });
      const tasks = await new Promise((resolve) => {
        const request = database.transaction('tasks').objectStore('tasks').getAll();
        request.onsuccess = () => resolve(request.result);
      });
      database.close();
      return tasks;
    });
    expect(persisted.find((task) => task.occurrenceDate === '2026-10-06').status).toBe(
      'interrupted',
    );
    expect(persisted.filter((task) => task.occurrenceDate === '2026-10-07')).toHaveLength(1);
    expect(persisted.find((task) => task.occurrenceDate === '2026-10-07')).toMatchObject({
      status: 'pending',
      totalPausedSeconds: 0,
      reminderAttemptsShown: 0,
    });
  } finally {
    await application.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
});
