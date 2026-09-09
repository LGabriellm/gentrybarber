import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['**/*.integration.test.ts'], exclude: ['**/node_modules/**', '**/dist/**'], environment: 'node', fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 },
});
