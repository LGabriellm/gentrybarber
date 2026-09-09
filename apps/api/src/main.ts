import { createDatabase } from '@platform/database';
import { loadConfig } from '@platform/config';
import { createAuth } from '@platform/auth';
import { QueuedEmailProvider } from '@platform/notifications';
import { createApplication } from './app';
import { FoundationServices } from './services';

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const email = new QueuedEmailProvider(config.REDIS_URL);
const auth = createAuth(db, config, email);
const services = new FoundationServices(db, auth, config);
const app = await createApplication(config, services);
await app.listen(config.API_PORT, config.BIND_HOST);
let closing = false;
async function shutdown() { if (closing) return; closing = true; await app.close(); await email.close(); await db.$disconnect(); }
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
