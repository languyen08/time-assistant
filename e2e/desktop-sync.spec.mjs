import { expect, test } from '@playwright/test';

test('no-reminder focus task keeps elapsed, pause/resume and completion across desktop views', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#app-title')).toContainText('Time Assistant');
  const sticky = await context.newPage();
  await sticky.setViewportSize({ width: 440, height: 640 });
  await sticky.goto('/?window=sticky');
  const scheduler = await context.newPage();
  await scheduler.goto('/?window=scheduler');

  await page.getByLabel('Task name').fill('Quiet focus');
  await page.getByLabel('Enable reminder').uncheck();
  await page.getByLabel('Start time (optional)', { exact: true }).fill('');
  await expect(page.locator('[formControlName="reminderCount"]')).toHaveCount(0);
  await expect(page.locator('[formControlName="reminderIntervalMinutes"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  const mainCard = page.locator('.current-task-active-note', { hasText: 'Quiet focus' });
  const stickyCard = sticky.locator('.sticky-focus-card', { hasText: 'Quiet focus' });
  await expect(mainCard).toBeVisible(); // Scheduler automatically starts the ready-now task.
  await expect(stickyCard).toBeVisible();
  for (const card of [mainCard, stickyCard]) {
    await expect(card).toContainText('Elapsed');
    await expect(card).not.toContainText('Reminder');
    await expect(card.getByRole('button', { name: /Add time|\+10m/ })).toHaveCount(0);
  }
  await stickyCard.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(mainCard).toContainText('Paused');
  await expect(stickyCard).toHaveClass(/paused-note/);
  await mainCard.getByRole('button', { name: 'Resume task', exact: true }).click();
  await expect(stickyCard).not.toHaveClass(/paused-note/);
  await expect(sticky.locator('.friendly-reminder')).toHaveCount(0);
  await sticky.screenshot({ path: 'artifacts/no-reminder-sticky.png' });

  await mainCard.getByRole('button', { name: 'Complete task' }).click();
  await expect(mainCard).toHaveCount(0);
  await expect(page.locator('.break-modal')).toBeVisible();

  const persisted = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('friendly-task-reminder', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (store) =>
      new Promise((resolve, reject) => {
        const request = database.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [tasks, history] = await Promise.all([read('tasks'), read('history')]);
    database.close();
    return { tasks, history };
  });
  expect(persisted.tasks[0]).toMatchObject({
    reminderEnabled: false,
    status: 'completed',
    reminderAttemptsShown: 0,
  });
  expect(persisted.tasks[0].nextReminderAt).toBeUndefined();
  expect(persisted.tasks[0].pendingReminder).toBeUndefined();
  const eventTypes = persisted.history.map((event) => event.type);
  expect(eventTypes).toEqual(
    expect.arrayContaining([
      'task_created',
      'task_started',
      'task_paused',
      'task_resumed',
      'task_completed',
    ]),
  );
  expect(eventTypes).not.toContain('reminder_shown');
  expect(eventTypes).not.toContain('extra_time_added');
  await scheduler.close();
  await sticky.close();
});

// Same browser context shares IndexedDB and real BroadcastChannel between renderers.
test('Windows desktop views converge on concurrent tasks and live sticky settings', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#app-title')).toContainText('Time Assistant');
  const sticky = await context.newPage();
  await sticky.goto('/?window=sticky');
  await expect(sticky.locator('.sticky-focus-card.empty')).toBeVisible();

  for (const name of ['Concurrent A', 'Concurrent B', 'Concurrent C']) {
    await page.getByLabel('Task name').fill(name);
    await page.getByLabel('Allow concurrent start').check();
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await page
      .locator('.task-list li', { hasText: name })
      .getByRole('button', { name: 'Start now' })
      .click();
  }
  await expect(page.locator('.current-task-active-note')).toHaveCount(3);
  const currentCards = sticky.locator('.sticky-focus-card:not(.empty)');
  await expect(currentCards).toHaveCount(2); // Default limit is 2.

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const limit = page.getByLabel('Sticky notes shown');
  for (const [value, count] of [
    ['5', 3],
    ['2', 2],
    ['5', 3],
  ]) {
    await limit.fill(value);
    await limit.press('Tab');
    await expect(currentCards).toHaveCount(count);
  }
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();

  const second = sticky.locator('.sticky-focus-card', { hasText: 'Concurrent B' });
  await second.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(second).toHaveClass(/paused-note/);
  await expect(
    page.locator('.current-task-active-note', { hasText: 'Concurrent B' }),
  ).toContainText('Paused');
  await second.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(second).not.toHaveClass(/paused-note/);
  await second.getByRole('button', { name: 'Complete task' }).click();
  await expect(currentCards).toHaveCount(2);
  await expect(page.locator('.current-task-active-note')).toHaveCount(2);

  // A start after the Sticky renderer has already loaded must broadcast too.
  await page.getByLabel('Task name').fill('Concurrent D');
  await page.getByLabel('Allow concurrent start').check();
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await page
    .locator('.task-list li', { hasText: 'Concurrent D' })
    .getByRole('button', { name: 'Start now' })
    .click();
  await expect(currentCards).toHaveCount(3);
  await page
    .locator('.current-task-active-note', { hasText: 'Concurrent A' })
    .getByRole('button', { name: 'Complete task' })
    .click();
  await expect(currentCards).toHaveCount(2);
  await expect(page.locator('.current-task-active-note')).toHaveCount(2);
  await page
    .locator('.current-task-active-note', { hasText: 'Concurrent C' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(currentCards).toHaveCount(1);
  await expect(page.locator('.current-task-active-note')).toHaveCount(1);
  await sticky.close();
});
