import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

async function state(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('friendly-task-reminder', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (store) =>
      new Promise((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [tasks, history] = await Promise.all([read('tasks'), read('history')]);
    database.close();
    return { tasks, history };
  });
}

async function createDaily(page) {
  await page.getByLabel('Task name').fill('Daily rollover');
  await page.getByLabel('Start time', { exact: true }).fill('2026-10-06T23:58');
  await page.getByLabel('Enable reminder').uncheck();
  await page.getByLabel('Enable repeat').check();
  await page.getByLabel('Repeat', { exact: true }).selectOption('daily');
  await page.getByLabel('Repeat start date').fill('2026-10-06');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.locator('.task-list li', { hasText: 'Daily rollover' })).toHaveCount(1);
  await page
    .locator('.task-list li', { hasText: 'Daily rollover' })
    .getByRole('button', { name: 'Start now' })
    .click();
  await expect(
    page.locator('.current-task-active-note', { hasText: 'Daily rollover' }),
  ).toBeVisible();
}

async function assertRollover(page, date) {
  await expect
    .poll(async () => {
      const snapshot = await state(page);
      return snapshot.tasks.find((task) => task.occurrenceDate === date)?.status;
    })
    .toBe('pending');
  const snapshot = await state(page);
  const old = snapshot.tasks.find((task) => task.occurrenceDate === '2026-10-06');
  expect(old.status).toBe('interrupted');
  expect(old.completedAt).toBeUndefined();
  const fresh = snapshot.tasks.filter((task) => task.occurrenceDate === date);
  expect(fresh).toHaveLength(1);
  expect(fresh[0].activeStartedAt).toBeUndefined();
  expect(fresh[0].pausedAt).toBeUndefined();
  expect(fresh[0].totalPausedSeconds).toBe(0);
  expect(fresh[0].reminderAttemptsShown).toBe(0);
  await expect
    .poll(
      async () =>
        (await state(page)).history.filter((event) => event.type === 'task_interrupted').length,
    )
    .toBe(1);
  expect(snapshot.history.some((event) => event.type === 'task_completed')).toBe(false);
  expect(snapshot.tasks.filter((task) => !task.recurrenceTemplate)).toHaveLength(2);
}

test('running Scheduler rolls at local midnight and synchronizes Main and Sticky', async ({
  context,
  page,
}) => {
  await context.clock.setFixedTime(new Date('2026-10-06T23:59:50+07:00'));
  await page.goto('/');
  await createDaily(page);
  const sticky = await context.newPage();
  const scheduler = await context.newPage();
  await Promise.all([sticky.goto('/?window=sticky'), scheduler.goto('/?window=scheduler')]);
  await expect(sticky.locator('.sticky-focus-card', { hasText: 'Daily rollover' })).toBeVisible();
  await context.clock.setFixedTime(new Date('2026-10-07T00:00:01+07:00'));
  await assertRollover(page, '2026-10-07');
  await expect(
    page.locator('.current-task-active-note', { hasText: 'Daily rollover' }),
  ).toHaveCount(0);
  await expect(sticky.locator('.sticky-focus-card', { hasText: 'Daily rollover' })).toHaveCount(0);
  await Promise.all([page.reload(), sticky.reload(), scheduler.reload()]);
  await assertRollover(page, '2026-10-07');
});

for (const date of ['2026-10-07', '2026-10-14']) {
  test(`restart on ${date} interrupts paused work without missed-day backlog or duplicate history`, async ({
    context,
    page,
  }) => {
    await context.clock.setFixedTime(new Date('2026-10-06T23:59:50+07:00'));
    await page.goto('/');
    await createDaily(page);
    await page
      .locator('.current-task-active-note', { hasText: 'Daily rollover' })
      .getByRole('button', { name: 'Pause task', exact: true })
      .click();
    await page.close();
    await context.clock.setFixedTime(new Date(`${date}T08:00:00+07:00`));
    const main = await context.newPage();
    const sticky = await context.newPage();
    const scheduler = await context.newPage();
    await Promise.all([
      main.goto('/'),
      sticky.goto('/?window=sticky'),
      scheduler.goto('/?window=scheduler'),
    ]);
    await assertRollover(main, date);
    await Promise.all([main.reload(), sticky.reload(), scheduler.reload()]);
    await assertRollover(main, date);
  });
}
