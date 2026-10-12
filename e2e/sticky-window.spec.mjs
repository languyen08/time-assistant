import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function launch(profile) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env,
  });
  try {
    let sticky;
    await expect
      .poll(
        async () => {
          for (const page of application.windows()) {
            if (await page.locator('.sticky-window').count()) {
              sticky = page;
              return true;
            }
          }
          return false;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(sticky.locator('.sticky-window')).toBeVisible();
    return { application, sticky };
  } catch (error) {
    await application.close();
    throw error;
  }
}

async function resize(application, width, height, userResize = false) {
  return application.evaluate(
    ({ BrowserWindow }, size) => {
      const stickyWindow = BrowserWindow.getAllWindows().find((windowInstance) =>
        windowInstance.isVisible(),
      );
      if (size.userResize)
        stickyWindow.emit('will-resize', {}, { width: size.width, height: size.height });
      stickyWindow.setContentSize(size.width, size.height);
      return {
        size: stickyWindow.getContentSize(),
        resizable: stickyWindow.isResizable(),
        minimum: stickyWindow.getMinimumSize(),
      };
    },
    { width, height, userResize },
  );
}

test('Sticky scrolling, responsive actions and restored native size with 1, 3 and 10 tasks', async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'sticky-window-test-'));
  let application;
  try {
    let launched = await launch(profile);
    application = launched.application;
    const sticky = launched.sticky;

    for (const count of [1, 3, 10]) {
      await sticky.evaluate(async (taskCount) => {
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open('friendly-task-reminder', 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(['tasks', 'settings'], 'readwrite');
          const tasks = transaction.objectStore('tasks');
          tasks.clear();
          const settings = transaction.objectStore('settings');
          const current = settings.get('app');
          current.onsuccess = () =>
            settings.put({
              ...current.result,
              id: 'app',
              stickyVisibleNotes: 5,
              stickyNoteEnabled: true,
            });
          for (let index = 0; index < taskCount; index++) {
            tasks.put({
              id: `sticky-${index}`,
              name: `Task ${index + 1} with a long title that wraps across the card`,
              note: '',
              category: '',
              order: index,
              status: 'active',
              reminderEnabled: true,
              reminderCount: 3,
              reminderIntervalMinutes: 5,
              reminderAt: '2099-01-01T10:00:00.000Z',
              nextReminderAt: '2099-01-01T10:00:00.000Z',
              startedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              totalPausedSeconds: 0,
              reminderAttemptsShown: 0,
              allowConcurrentStart: true,
            });
          }
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
        });
        database.close();
        const channel = new BroadcastChannel('friendly-task-reminder');
        channel.postMessage('tasks-changed');
        channel.postMessage('settings-changed');
        channel.close();
      }, count);
      // Existing renderer services reload through the real BroadcastChannel invalidation.
      const cards = sticky.locator('.sticky-focus-card:not(.empty)');
      await expect(cards).toHaveCount(Math.min(count, 5));
      const belowMinimum = await resize(application, 100, 100, true);
      expect(belowMinimum.size[0]).toBeGreaterThanOrEqual(360);
      expect(belowMinimum.size[1]).toBeGreaterThanOrEqual(240);
      for (const [width, height] of [
        [360, 240],
        [460, 360],
        [720, 600],
      ]) {
        const native = await resize(application, width, height, true);
        expect(native).toMatchObject({
          resizable: true,
          minimum: [360, 240],
        });
        // Windows display scaling can round requested DIP sizes to physical pixels.
        expect(Math.abs(native.size[0] - width)).toBeLessThanOrEqual(2);
        expect(Math.abs(native.size[1] - height)).toBeLessThanOrEqual(2);
        const viewport = sticky.locator('.sticky-notes-viewport');
        await viewport.evaluate((element) => {
          element.scrollTop = 0;
        });
        const toolbarBefore = await sticky.locator('.sticky-note-header').boundingBox();
        const overflow = await viewport.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        );
        if (overflow) {
          await viewport.hover();
          await sticky.mouse.wheel(0, 1500);
          await expect
            .poll(() => viewport.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
          // Small, fractional wheel deltas exercise the same path as precision trackpads.
          await viewport.evaluate((element) => {
            element.scrollTop = 0;
          });
          for (let step = 0; step < 6; step++) await sticky.mouse.wheel(0, 12.5);
          await expect
            .poll(() => viewport.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
        }
        await viewport.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        expect(await sticky.locator('.sticky-note-header').boundingBox()).toEqual(toolbarBefore);
        const lastCard = cards.last();
        const complete = lastCard.getByRole('button', { name: 'Complete task' });
        await expect(complete).toBeInViewport();
        const layout = await lastCard.evaluate((card) => {
          const rect = card.getBoundingClientRect();
          return {
            width: card.clientWidth,
            scrollWidth: card.scrollWidth,
            buttonsInside: [...card.querySelectorAll('button')].every((button) => {
              const bounds = button.getBoundingClientRect();
              return (
                button.scrollWidth <= button.clientWidth &&
                bounds.left >= rect.left &&
                bounds.right <= rect.right &&
                bounds.bottom <= rect.bottom
              );
            }),
            drag: getComputedStyle(card).getPropertyValue('-webkit-app-region'),
          };
        });
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
        expect(layout.buttonsInside).toBe(true);
        expect(layout.drag).toBe('no-drag');
        if (width === 360)
          await sticky.screenshot({ path: `artifacts/sticky-window-${count}-tasks-small.png` });
      }
      await cards.last().getByRole('button', { name: 'Pause', exact: true }).click();
      await expect(cards.last()).toHaveClass(/paused-note/);
      await cards.last().getByRole('button', { name: 'Resume', exact: true }).click();
      await expect(cards.last()).not.toHaveClass(/paused-note/);
    }

    const chosenSize = (await resize(application, 520, 280, true)).size;
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((windowInstance) => windowInstance.isVisible())
        .close(),
    );
    // Closing flushes the debounced geometry before a fresh process starts.
    await application.close();
    application = undefined;
    launched = await launch(profile);
    application = launched.application;
    expect(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((windowInstance) => windowInstance.isVisible())
          .getContentSize(),
      ),
    ).toEqual(chosenSize);
    await launched.sticky.getByRole('button', { name: 'Blue note', exact: true }).click();
    await expect(launched.sticky.locator('.sticky-shell')).toHaveAttribute(
      'data-note-color',
      'blue',
    );
    expect(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((windowInstance) => windowInstance.isVisible())
          .getContentSize(),
      ),
    ).toEqual(chosenSize);
  } finally {
    await application?.close();
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
