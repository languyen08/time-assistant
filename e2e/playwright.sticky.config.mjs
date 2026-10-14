import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['sticky-window.spec.mjs', 'electron-daily-rollover.spec.mjs'],
  outputDir: '../artifacts/sticky-window-tests',
  workers: 1,
  timeout: 90_000,
  use: { trace: 'retain-on-failure' },
});
