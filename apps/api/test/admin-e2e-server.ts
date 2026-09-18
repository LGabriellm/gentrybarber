import { randomBytes } from 'node:crypto';
import { createAuth } from '@platform/auth';
import { loadConfig } from '@platform/config';
import { createDatabase } from '@platform/database';
import { createApplication } from '../src/app';
import { FoundationServices } from '../src/services';
const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Isolated database required');
const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, PLATFORM_NAME: 'BarberHub', PLATFORM_DOMAIN: 'platform.test', BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), BETTER_AUTH_URL: 'http://127.0.0.1:4300', TRUSTED_ORIGINS: 'http://localhost:3302', REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_FROM: 'Fictitious <noreply@example.test>' });
const db = createDatabase(databaseUrl);
const auth = createAuth(db, config, { async send() { throw new Error('Unexpected email from administrative browser test'); } });
const app = await createApplication(config, new FoundationServices(db, auth, config), { testRateLimitMax: 1000 });
await app.listen(4300, '127.0.0.1');
console.info('Administrative browser API ready');
let closing = false;
async function close() { if (closing) return; closing = true; await app.close(); await db.$disconnect(); process.exit(0); }
process.on('SIGTERM', () => void close()); process.on('SIGINT', () => void close());
