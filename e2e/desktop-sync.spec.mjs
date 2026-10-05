import { expect, test } from '@playwright/test';

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
