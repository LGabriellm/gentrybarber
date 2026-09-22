import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('A migrated isolated test database is required.');
export default defineConfig({
  testDir: './tests/e2e-admin', outputDir: './test-results/admin', workers: 1, fullyParallel: false, retries: 0, timeout: 60000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/admin', open: 'never' }]],
  use: { baseURL: 'http://localhost:3302', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'webkit-ios', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: [
    { command: 'node --import tsx test/admin-e2e-server.ts', cwd: path.resolve('apps/api'), url: 'http://127.0.0.1:4300/ready', timeout: 90000, env: { DATABASE_TEST_URL: databaseUrl } },
    { command: 'pnpm dev --port 3302', cwd: path.resolve('apps/admin'), url: 'http://localhost:3302/login', timeout: 180000, env: { API_URL: 'http://127.0.0.1:4300', NEXT_TELEMETRY_DISABLED: '1', NEXT_E2E_MODE: '1' } },
    { command: 'pnpm dev --port 3303', cwd: path.resolve('apps/web-public'), url: 'http://localhost:3303/preview/classic', timeout: 180000, env: { API_URL: 'http://127.0.0.1:4300', DEMO_MODE: 'true', NEXT_TELEMETRY_DISABLED: '1', NEXT_E2E_MODE: '1' } },
  ],
});
