import { expect, test } from '@playwright/test';

async function createTask(page, name) {
  await page.getByLabel('Task name').fill(name);
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.locator('.task-list li', { hasText: name })).toBeVisible();
}

test('keeps break running until the user explicitly stops it to start another task', async ({
  page,
}) => {
  const firstTask = 'Break flow task A';
  const secondTask = 'Break flow task B';

  await page.goto('/');
  await expect(page.locator('#app-title')).toContainText('Time Assistant');

  await createTask(page, firstTask);
  await createTask(page, secondTask);

  await page
    .locator('.task-list li', { hasText: firstTask })
    .getByRole('button', { name: 'Start now' })
    .click();
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeVisible();

  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('button', { name: 'Start break' })).toBeVisible();

  await page.getByRole('button', { name: 'Start break' }).click();
  await expect(page.locator('.break-ribbon')).toContainText('Break time');

  await page
    .locator('.task-list li', { hasText: secondTask })
    .getByRole('button', { name: 'Start now' })
    .click();
  await expect(page.getByRole('heading', { name: 'Break time is still running' })).toBeVisible();

  await page.getByTestId('break-conflict-keep-break').click();
  await expect(page.locator('.break-ribbon')).toContainText('Break time');
  await expect(page.getByRole('heading', { name: 'Break time is still running' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Complete task' })).toHaveCount(0);
  await expect(
    page
      .locator('.task-list li', { hasText: secondTask })
      .getByRole('button', { name: 'Start now' }),
  ).toBeVisible();

  await page
    .locator('.task-list li', { hasText: secondTask })
    .getByRole('button', { name: 'Start now' })
    .click();
  await expect(page.getByRole('heading', { name: 'Break time is still running' })).toBeVisible();

  await page.getByTestId('break-conflict-start-now').click();
  await expect(page.locator('.break-ribbon')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeVisible();
  await expect(page.getByText(secondTask, { exact: true })).toBeVisible();
});

test('starts a due persisted task through the dedicated Scheduler renderer', async ({
  context,
  page,
}) => {
  const taskName = 'Automatic scheduler task';
  const dueAt = new Date(Date.now() - 60_000).toISOString();

  await page.goto('/');
  await expect(page.locator('#app-title')).toContainText('Time Assistant');
  await page.evaluate(
    async ({ name, reminderAt }) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('friendly-task-reminder', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('tasks', 'readwrite');
        transaction.objectStore('tasks').put({
          id: 'e2e-automatic-task',
          name,
          note: '',
          category: '',
          reminderAt,
          reminderCount: 3,
          reminderIntervalMinutes: 5,
          allowConcurrentStart: false,
          order: 0,
          status: 'pending',
          createdAt: reminderAt,
          updatedAt: reminderAt,
          totalPausedSeconds: 0,
          reminderAttemptsShown: 0,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { name: taskName, reminderAt: dueAt },
  );

  await page.reload();
  await expect(page.locator('.task-list li', { hasText: taskName })).toBeVisible();

  const schedulerPage = await context.newPage();
  await schedulerPage.goto('/?window=scheduler');

  // A due task may also have its first reminder open; target the current card
  // explicitly rather than an ambiguous heading or an overlay-dependent role.
  await expect(page.locator('.current-task-active-note', { hasText: taskName })).toBeVisible({
    timeout: 15_000,
  });
  await schedulerPage.close();
});

test('starts a concurrent due task and keeps the other task active until final completion', async ({
  context,
  page,
}) => {
  const now = Date.now();
  const dueAt = new Date(now - 60_000).toISOString();
  const futureReminder = new Date(now + 60 * 60_000).toISOString();

  await page.goto('/');
  await expect(page.locator('#app-title')).toContainText('Time Assistant');
  await page.evaluate(
    async ({ dueAt: storedDueAt, futureReminder: storedFutureReminder }) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('friendly-task-reminder', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('tasks', 'readwrite');
        const store = transaction.objectStore('tasks');
        store.clear();
        store.put({
          id: 'e2e-current-a',
          name: 'Concurrent task A',
          note: '',
          category: '',
          reminderAt: storedFutureReminder,
          reminderCount: 0,
          reminderIntervalMinutes: 5,
          allowConcurrentStart: false,
          order: 0,
          status: 'active',
          createdAt: storedDueAt,
          updatedAt: storedDueAt,
          activeStartedAt: storedDueAt,
          nextReminderAt: storedFutureReminder,
          totalPausedSeconds: 0,
          reminderAttemptsShown: 0,
        });
        store.put({
          id: 'e2e-current-b',
          name: 'Concurrent task B',
          note: '',
          category: '',
          reminderAt: storedDueAt,
          reminderCount: 0,
          reminderIntervalMinutes: 5,
          allowConcurrentStart: true,
          order: 1,
          status: 'pending',
          createdAt: storedDueAt,
          updatedAt: storedDueAt,
          totalPausedSeconds: 0,
          reminderAttemptsShown: 0,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { dueAt, futureReminder },
  );

  await page.reload();
  const schedulerPage = await context.newPage();
  await schedulerPage.goto('/?window=scheduler');

  const taskACard = page.locator('.current-task-active-note', { hasText: 'Concurrent task A' });
  const taskBCard = page.locator('.current-task-active-note', { hasText: 'Concurrent task B' });
  await expect(taskACard).toBeVisible();
  await expect(taskBCard).toBeVisible();

  await taskACard.getByRole('button', { name: 'Complete task' }).click();
  await expect(taskACard).toHaveCount(0);
  await expect(taskBCard).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start break' })).toHaveCount(0);

  await taskBCard.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('button', { name: 'Start break' })).toBeVisible();
  await schedulerPage.close();
});

test('processes and acknowledges one persisted finish-by deadline', async ({ context, page }) => {
  const now = Date.now();
  const startAt = new Date(now - 2 * 60 * 60_000).toISOString();
  const deadlineAt = new Date(now - 60_000).toISOString();
  const nextReminderAt = new Date(now + 60 * 60_000).toISOString();

  await page.goto('/');
  await page.evaluate(
    async ({
      startAt: storedStartAt,
      deadlineAt: storedDeadlineAt,
      nextReminderAt: storedNextReminderAt,
    }) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('friendly-task-reminder', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('tasks', 'readwrite');
        transaction.objectStore('tasks').put({
          id: 'e2e-deadline-task',
          name: 'Deadline E2E task',
          note: '',
          category: '',
          reminderAt: storedStartAt,
          reminderCount: 0,
          reminderIntervalMinutes: 5,
          allowConcurrentStart: false,
          deadlineAt: storedDeadlineAt,
          deadlineMessage: 'This is the custom deadline message.',
          order: 0,
          status: 'active',
          activeStartedAt: storedStartAt,
          nextReminderAt: storedNextReminderAt,
          createdAt: storedDeadlineAt,
          updatedAt: storedDeadlineAt,
          totalPausedSeconds: 0,
          reminderAttemptsShown: 0,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { startAt, deadlineAt, nextReminderAt },
  );

  await page.reload();
  const schedulerPage = await context.newPage();
  await schedulerPage.goto('/?window=scheduler');

  const deadlineDialog = page.getByRole('dialog', { name: 'Deadline E2E task' });
  await expect(deadlineDialog.getByRole('heading', { name: 'Deadline E2E task' })).toBeVisible();
  await expect(page.getByText('This is the custom deadline message.')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open('friendly-task-reminder', 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const task = await new Promise((resolve, reject) => {
          const request = database
            .transaction('tasks', 'readonly')
            .objectStore('tasks')
            .get('e2e-deadline-task');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        return Boolean(task?.deadlineNotifiedAt);
      }),
    )
    .toBe(true);

  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByText('This is the custom deadline message.')).toHaveCount(0);
  const acknowledged = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('friendly-task-reminder', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const task = await new Promise((resolve, reject) => {
      const request = database
        .transaction('tasks', 'readonly')
        .objectStore('tasks')
        .get('e2e-deadline-task');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return task;
  });
  expect(acknowledged.deadlineAcknowledgedAt).toBeTruthy();
  expect(acknowledged.status).toBe('active');
  expect(acknowledged.reminderAt).toBe(startAt);
  await schedulerPage.close();
});

test('serializes Scheduler reminders and transfers one persisted occurrence from Main to Sticky', async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    window.__reminderPresenter = 'main';
    window.__notifyCount = 0;
    window.assistantTime = {
      platform: 'win32',
      closeMainWindow: async () => true,
      focusMainWindow: async () => true,
      getMainWindowMaximized: async () => false,
      getReminderPresenter: async () => window.__reminderPresenter,
      getStartAtLogin: async () => false,
      hideStickyWindow: async () => true,
      minimizeStickyWindow: async () => true,
      notify: async () => {
        window.__notifyCount += 1;
        return true;
      },
      onMainWindowMaximizedChanged: () => () => undefined,
      onReminderPresenterChanged: (callback) => {
        window.__setReminderPresenter = (presenter) => {
          window.__reminderPresenter = presenter;
          callback(presenter);
        };
        return () => {
          window.__setReminderPresenter = undefined;
        };
      },
      openTextFile: async () => ({ ok: false, canceled: true }),
      resizeStickyWindow: async () => true,
      saveTextFile: async () => ({ ok: false, canceled: true }),
      setReminderOverlayState: async () => true,
      setStartAtLogin: async () => false,
      setStickyWindow: async () => true,
      toggleMainWindowMaximized: async () => false,
    };
  });

  const dueAt = new Date(Date.now() - 60_000).toISOString();
  await page.goto('/?window=main');
  await page.evaluate(async (storedDueAt) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('friendly-task-reminder', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(['tasks', 'history'], 'readwrite');
      const tasks = transaction.objectStore('tasks');
      tasks.clear();
      transaction.objectStore('history').clear();
      for (const [id, order] of [
        ['e2e-reminder-a', 0],
        ['e2e-reminder-b', 1],
      ]) {
        tasks.put({
          id,
          name: `Reminder ${id.at(-1).toUpperCase()}`,
          note: '',
          category: '',
          reminderAt: storedDueAt,
          reminderCount: 2,
          reminderIntervalMinutes: 5,
          allowConcurrentStart: true,
          order,
          status: 'active',
          activeStartedAt: storedDueAt,
          nextReminderAt: storedDueAt,
          createdAt: storedDueAt,
          updatedAt: storedDueAt,
          totalPausedSeconds: 0,
          reminderAttemptsShown: 0,
        });
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, dueAt);

  await page.reload();
  const stickyPage = await context.newPage();
  await stickyPage.goto('/?window=sticky');
  const schedulerPage = await context.newPage();
  await schedulerPage.goto('/?window=scheduler');

  await expect(page.getByRole('dialog', { name: 'Reminder A' })).toBeVisible();
  await expect(stickyPage.locator('.friendly-reminder')).toHaveCount(0);

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open('friendly-task-reminder', 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const [tasks, history] = await Promise.all([
          new Promise((resolve, reject) => {
            const request = database.transaction('tasks', 'readonly').objectStore('tasks').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
          new Promise((resolve, reject) => {
            const request = database
              .transaction('history', 'readonly')
              .objectStore('history')
              .getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
        ]);
        database.close();
        return {
          pending: tasks.filter((task) => task.pendingReminder).length,
          attempts: tasks.map((task) => task.reminderAttemptsShown),
          reminderHistory: history.filter((event) => event.type === 'reminder_shown').length,
        };
      }),
    )
    .toEqual({ pending: 1, attempts: [1, 0], reminderHistory: 1 });
  await expect.poll(() => schedulerPage.evaluate(() => window.__notifyCount)).toBe(1);

  const mainReminder = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('friendly-task-reminder', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const task = await new Promise((resolve, reject) => {
      const request = database
        .transaction('tasks', 'readonly')
        .objectStore('tasks')
        .get('e2e-reminder-a');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return task.pendingReminder;
  });

  await page.close();
  await stickyPage.evaluate(() => window.__setReminderPresenter('sticky'));
  const stickyDialog = stickyPage.getByRole('dialog', { name: 'Reminder A' });
  await expect(stickyDialog).toBeVisible();
  await expect(stickyDialog).toContainText(mainReminder.message);
  await stickyDialog.getByRole('button', { name: 'Close reminder' }).click();

  await expect
    .poll(() =>
      stickyPage.evaluate(async () => {
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open('friendly-task-reminder', 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const task = await new Promise((resolve, reject) => {
          const request = database
            .transaction('tasks', 'readonly')
            .objectStore('tasks')
            .get('e2e-reminder-a');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        return task.pendingReminder;
      }),
    )
    .toBeUndefined();

  await schedulerPage.close();
  await stickyPage.close();
});
