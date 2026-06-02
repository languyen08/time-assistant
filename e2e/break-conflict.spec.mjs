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
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeVisible();

  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('button', { name: 'Start break' })).toBeVisible();

  await page.getByRole('button', { name: 'Start break' }).click();
  await expect(page.locator('.break-ribbon')).toContainText('Break time');

  await page
    .locator('.task-list li', { hasText: secondTask })
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(page.getByRole('heading', { name: 'Break time is still running' })).toBeVisible();

  await page.getByTestId('break-conflict-keep-break').click();
  await expect(page.locator('.break-ribbon')).toContainText('Break time');
  await expect(page.getByRole('heading', { name: 'Break time is still running' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Complete task' })).toHaveCount(0);
  await expect(
    page.locator('.task-list li', { hasText: secondTask }).getByRole('button', { name: 'Start' }),
  ).toBeVisible();

  await page
    .locator('.task-list li', { hasText: secondTask })
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(page.getByRole('heading', { name: 'Break time is still running' })).toBeVisible();

  await page.getByTestId('break-conflict-start-now').click();
  await expect(page.locator('.break-ribbon')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Complete task' })).toBeVisible();
  await expect(page.getByText(secondTask, { exact: true })).toBeVisible();
});
