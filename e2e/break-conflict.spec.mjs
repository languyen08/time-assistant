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
