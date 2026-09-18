import { Worker } from 'bullmq';
import { z } from 'zod';
import { emailJobSchema, emailQueueName, createRedisClient } from '@platform/notifications';
import { notificationProviders } from './providers';

const env = z.object({ REDIS_URL: z.url() }).parse(process.env);
const providers = notificationProviders();
const provider = providers.email;
const connection = createRedisClient(env.REDIS_URL, null);
const worker = new Worker(emailQueueName, async job => provider.send(emailJobSchema.parse(job.data)), { connection, concurrency: 5 });
worker.on('failed', job => console.error(JSON.stringify({ event: 'notification.failed', jobId: job?.id })));
let lastConnectionError = 0;
worker.on('error', () => { if (Date.now() - lastConnectionError > 30000) { lastConnectionError = Date.now(); console.error(JSON.stringify({ event: 'notification.connection_error' })); } });
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await worker.close();
  connection.disconnect();
  provider.close();
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
console.info('Notification workers started');
