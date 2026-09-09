import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  outputDir: './test-results/foundation',
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
  webServer: [
    { command: 'pnpm dev --port 3100', cwd: path.resolve('apps/web-public'), url: 'http://localhost:3100/preview/classic', reuseExistingServer: false, timeout: 180000, env: { DEMO_MODE: 'true', NEXT_TELEMETRY_DISABLED: '1', NEXT_E2E_MODE: '1' } },
    { command: 'pnpm dev --port 3101', cwd: path.resolve('apps/dashboard'), url: 'http://localhost:3101/login', reuseExistingServer: false, timeout: 180000, env: { NEXT_TELEMETRY_DISABLED: '1', NEXT_E2E_MODE: '1' } },
  ],
});
