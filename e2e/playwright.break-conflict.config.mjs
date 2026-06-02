import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'break-conflict.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:4201',
    browserName: 'chromium',
    channel: 'msedge',
    viewport: { width: 1440, height: 1200 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm.cmd run web -- --host 127.0.0.1 --port 4201',
    url: 'http://127.0.0.1:4201',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
