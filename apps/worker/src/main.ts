import { Worker } from 'bullmq';
import { z } from 'zod';
import { createDatabase } from '@platform/database';
import { SmtpEmailProvider, emailJobSchema, emailQueueName, createRedisClient, MetaWhatsAppProvider, ConsoleWhatsAppProvider, whatsappRuntime, WhatsAppOutbox, ConsoleEmailProvider } from '@platform/notifications';

const env = z.object({ DATABASE_URL: z.string().min(1), REDIS_URL: z.url(), SMTP_HOST: z.string().min(1).optional(), SMTP_PORT: z.coerce.number().int().default(1025), SMTP_FROM: z.string().min(1).optional(), SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional() }).parse(process.env);
const runtime = whatsappRuntime();
const db = createDatabase(env.DATABASE_URL);
const outbox = new WhatsAppOutbox(db, Object.keys(runtime.accounts).length > 0 ? new MetaWhatsAppProvider(runtime) : new ConsoleWhatsAppProvider());
const provider = env.SMTP_HOST && env.SMTP_FROM ? new SmtpEmailProvider({ host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.SMTP_FROM, user: env.SMTP_USER, password: env.SMTP_PASSWORD }) : new ConsoleEmailProvider();
const connection = createRedisClient(env.REDIS_URL, null);
const worker = new Worker(emailQueueName, async job => provider.send(emailJobSchema.parse(job.data)), { connection, concurrency: 5 });
worker.on('failed', job => console.error(JSON.stringify({ event: 'notification.failed', jobId: job?.id })));
let lastConnectionError = 0;
worker.on('error', () => { if (Date.now() - lastConnectionError > 30000) { lastConnectionError = Date.now(); console.error(JSON.stringify({ event: 'notification.connection_error' })); } });
let closing = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<void> = Promise.resolve();
async function poll() {
  let processed = false;
  try { processed = await outbox.runOnce(); }
  catch { console.error(JSON.stringify({ event: 'notification.whatsapp_queue_error' })); }
  if (!closing) timer = setTimeout(() => { pending = poll(); }, processed ? 50 : 5000);
}
pending = poll();
async function shutdown() {
  if (closing) return;
  closing = true;
  clearTimeout(timer);
  await pending;
  await worker.close();
  connection.disconnect();
  provider.close();
  await db.$disconnect();
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
console.info('Notification workers started');
