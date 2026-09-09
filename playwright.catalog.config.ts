import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Set DATABASE_TEST_URL to a migrated PostgreSQL database ending in _test.');
}

export default defineConfig({
  testDir: './tests/e2e-catalog',
  outputDir: './test-results/catalog',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/catalog', open: 'never' }]],
  use: { baseURL: 'http://localhost:3201', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    { command: 'node --import tsx test/catalog-e2e-server.ts', cwd: path.resolve('apps/api'), url: 'http://127.0.0.1:4200/ready', reuseExistingServer: false, timeout: 90_000, env: { DATABASE_TEST_URL: databaseUrl } },
    { command: 'pnpm dev --port 3201', cwd: path.resolve('apps/dashboard'), url: 'http://localhost:3201/login', reuseExistingServer: false, timeout: 180_000, env: { API_URL: 'http://127.0.0.1:4200', NEXT_TELEMETRY_DISABLED: '1', NEXT_E2E_MODE: '1' } },
  ],
});
