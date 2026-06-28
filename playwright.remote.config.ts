import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testMatch: /production-auth\.spec\.ts/,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://radio-show-builder.onrender.com',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
});
