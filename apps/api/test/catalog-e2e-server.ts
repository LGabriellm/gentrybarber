import { randomBytes } from 'node:crypto';
import { createAuth } from '@platform/auth';
import { loadConfig } from '@platform/config';
import { createDatabase } from '@platform/database';
import { createApplication } from '../src/app';
import { FoundationServices } from '../src/services';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Catalog browser tests require DATABASE_TEST_URL ending in _test.');
}
const config = loadConfig({
  NODE_ENV: 'test', PLATFORM_NAME: 'Catálogo de teste', PLATFORM_DOMAIN: 'platform.test',
  DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
  BETTER_AUTH_URL: 'http://127.0.0.1:4200', TRUSTED_ORIGINS: 'http://localhost:3201',
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_PORT: '1025',
  SMTP_FROM: 'Test <noreply@example.test>',
});
const db = createDatabase(databaseUrl);
// Browser fixtures use verified accounts. These tests never dispatch e-mails.
const auth = createAuth(db, config, { async send() { throw new Error('Unexpected e-mail in catalog browser tests.'); } });
// All browser contexts share the same BFF IP and run much faster than human users.
const app = await createApplication(config, new FoundationServices(db, auth, config), { testRateLimitMax: 1000 });
await app.listen(4200, '127.0.0.1');
console.info('Catalog test API ready on loopback.');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => { void close(); });
process.on('SIGTERM', () => { void close(); });
