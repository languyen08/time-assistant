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

  await expect(page.getByRole('button', { name: 'Complete task' })).toBeVisible();
  await expect(page.getByText(taskName, { exact: true })).toBeVisible();
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
