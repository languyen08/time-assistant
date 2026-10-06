import { expect, test } from '@playwright/test';

async function persisted(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('friendly-task-reminder', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (name) =>
      new Promise((resolve, reject) => {
        const request = database.transaction(name, 'readonly').objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [tasks, history] = await Promise.all([read('tasks'), read('history')]);
    database.close();
    return { tasks, history };
  });
}

test('weekday recurrence without reminders uses normal desktop lifecycle and skips the weekend', async ({
  context,
  page,
}) => {
  const fixedTime = new Date('2026-10-09T08:00:00'); // Friday, local time.
  await context.clock.setFixedTime(fixedTime);
  await page.goto('/');
  const sticky = await context.newPage();
  await sticky.setViewportSize({ width: 440, height: 640 });
  await sticky.goto('/?window=sticky');
  const scheduler = await context.newPage();
  await scheduler.goto('/?window=scheduler');

  await page.getByLabel('Task name').fill('Weekday reading');
  await page.getByLabel('Start time', { exact: true }).fill('2026-10-09T09:30');
  await page.getByLabel('Enable reminder').uncheck();
  await page.getByLabel('Enable repeat').check();
  await page.getByLabel('Repeat', { exact: true }).selectOption('weekdays');
  await page.getByLabel('Repeat start date').fill('2026-10-09');
  await page.getByLabel('Repeat end date (optional)').fill('2026-10-12');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  const pending = page.locator('.task-list li', { hasText: 'Weekday reading' });
  await expect(pending).toHaveCount(1);
  await pending.getByRole('button', { name: 'Start now' }).click();
  const mainCard = page.locator('.current-task-active-note', { hasText: 'Weekday reading' });
  const stickyCard = sticky.locator('.sticky-focus-card', { hasText: 'Weekday reading' });
  await expect(stickyCard).toBeVisible();
  await expect(stickyCard).toContainText('Elapsed');
  await expect(stickyCard).not.toContainText('Reminder');
  await expect(stickyCard.getByRole('button', { name: /\+10m|Add time/ })).toHaveCount(0);
  await stickyCard.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(mainCard).toContainText('Paused');
  await context.clock.setFixedTime(new Date(fixedTime.getTime() + 60_000));
  await mainCard.getByRole('button', { name: 'Resume task', exact: true }).click();
  await expect(stickyCard).not.toHaveClass(/paused-note/);
  await mainCard.getByRole('button', { name: 'Complete task', exact: true }).click();
  await expect(page.locator('.break-modal')).toBeVisible();
  await expect(pending).toHaveCount(1);
  let state = await persisted(page);
  const occurrences = state.tasks.filter((task) => !task.recurrenceTemplate);
  expect(occurrences.map((task) => task.occurrenceDate).sort()).toEqual([
    '2026-10-09',
    '2026-10-12',
  ]);
  expect(occurrences.find((task) => task.status === 'completed').totalPausedSeconds).toBe(60);
  expect(state.history.filter((event) => event.type === 'task_created')).toHaveLength(2);
  expect(state.history.map((event) => event.type)).not.toContain('reminder_shown');
  await sticky.screenshot({ path: 'artifacts/recurring-no-reminder-sticky.png' });
  // Main and Sticky reinitialize together against the same real IndexedDB.
  await Promise.all([page.reload(), sticky.reload()]);
  await expect(pending).toHaveCount(1);
  state = await persisted(page);
  expect(state.tasks.filter((task) => !task.recurrenceTemplate)).toHaveLength(2);
  expect(state.history.filter((event) => event.type === 'task_created')).toHaveLength(2);
  await pending.getByRole('button', { name: 'Start now' }).click();
  await mainCard.getByRole('button', { name: 'Complete task', exact: true }).click();
  await expect(pending).toHaveCount(0); // Inclusive Monday end stops the series.
  await scheduler.close();
  await sticky.close();
});

test('simultaneous renderer startup allocates one occurrence and one created event', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#app-title')).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('friendly-task-reminder', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('tasks', 'readwrite');
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    transaction.objectStore('tasks').put({
      id: 'race-series',
      recurrenceTemplate: true,
      recurrenceSeriesId: 'race-series',
      recurrence: { type: 'daily', rangeStart: date },
      name: 'Race-safe reading',
      note: '',
      category: '',
      reminderAt: now.toISOString(),
      reminderEnabled: false,
      reminderCount: 0,
      reminderIntervalMinutes: 0,
      allowConcurrentStart: false,
      order: 0,
      status: 'pending',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      totalPausedSeconds: 0,
      reminderAttemptsShown: 0,
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  const sticky = await context.newPage();
  const anotherMain = await context.newPage();
  await Promise.all([page.reload(), sticky.goto('/?window=sticky'), anotherMain.goto('/')]);
  await expect(page.locator('.task-list li', { hasText: 'Race-safe reading' })).toHaveCount(1);
  const state = await persisted(page);
  const occurrences = state.tasks.filter((task) => !task.recurrenceTemplate);
  expect(occurrences).toHaveLength(1);
  expect(occurrences[0].id).toBe(`recurring:race-series:${occurrences[0].occurrenceDate}`);
  expect(state.history.filter((event) => event.type === 'task_created')).toHaveLength(1);
  await sticky.close();
  await anotherMain.close();
});

test('deleting a recurring task removes its series across Main and Sticky without regeneration', async ({
  context,
  page,
}) => {
  const fixedTime = new Date('2026-10-12T08:00:00');
  await context.clock.setFixedTime(fixedTime);
  await page.goto('/');
  const sticky = await context.newPage();
  await sticky.goto('/?window=sticky');

  await page.getByLabel('Task name').fill('Delete daily series');
  await page.getByLabel('Start time', { exact: true }).fill('2026-10-12T09:30');
  await page.getByLabel('Enable reminder').uncheck();
  await page.getByLabel('Enable repeat').check();
  await page.getByLabel('Repeat', { exact: true }).selectOption('daily');
  await page.getByLabel('Repeat start date').fill('2026-10-12');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();

  const pending = page.locator('.task-list li', { hasText: 'Delete daily series' });
  await expect(pending).toHaveCount(1);
  await pending.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(pending).toHaveCount(0);
  await expect(
    sticky.locator('.sticky-focus-card', { hasText: 'Delete daily series' }),
  ).toHaveCount(0);

  await Promise.all([page.reload(), sticky.reload()]);
  await expect(page.locator('.task-list li', { hasText: 'Delete daily series' })).toHaveCount(0);
  await expect(
    sticky.locator('.sticky-focus-card', { hasText: 'Delete daily series' }),
  ).toHaveCount(0);

  const state = await persisted(page);
  expect(state.tasks.filter((task) => task.recurrenceTemplate)).toHaveLength(0);
  expect(state.tasks.filter((task) => task.name === 'Delete daily series')).toHaveLength(0);
  expect(state.history.filter((event) => event.type === 'task_deleted')).toHaveLength(1);
  await sticky.close();
});
