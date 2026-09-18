import { Queue } from 'bullmq';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { Redis } from 'ioredis';

export const emailJobSchema = z.object({ to: z.email(), subject: z.string().min(1).max(200), text: z.string().min(1).max(20000) }).strict();
export type EmailMessage = z.infer<typeof emailJobSchema>;
export interface NotificationProvider { send(message: EmailMessage): Promise<void> }
export const emailQueueName = 'transactional-email';
export function redisConnection(url: string) {
  const parsed = new URL(url);
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error('Invalid Redis URL');
  return { host: parsed.hostname, port: Number(parsed.port || 6379), username: parsed.username ? decodeURIComponent(parsed.username) : undefined, password: parsed.password ? decodeURIComponent(parsed.password) : undefined, db: Number(parsed.pathname.slice(1) || 0), ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}) };
}
export function createRedisClient(url: string, maxRetriesPerRequest: number | null = 1) {
  return new Redis({ ...redisConnection(url), maxRetriesPerRequest, connectTimeout: 5000, retryStrategy: attempts => Math.min(attempts * 500, 10000) });
}
export class QueuedEmailProvider implements NotificationProvider {
  private readonly queue: Queue;
  private readonly connection: Redis;
  constructor(redisUrl: string) {
    this.connection = createRedisClient(redisUrl);
    this.queue = new Queue(emailQueueName, { connection: this.connection });
    let lastError = 0;
    this.queue.on('error', () => { if (Date.now() - lastError > 30000) { lastError = Date.now(); console.error(JSON.stringify({ event: 'notification.queue_unavailable' })); } });
  }
  async send(message: EmailMessage): Promise<void> {
    await this.queue.add('send', emailJobSchema.parse(message), { attempts: 4, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: { age: 86400, count: 100 } });
  }
  async close(): Promise<void> { await this.queue.close(); this.connection.disconnect(); }
}
export class SmtpEmailProvider implements NotificationProvider {
  private readonly transport;
  constructor(private readonly config: { host: string; port: number; from: string; user?: string; password?: string }) {
    this.transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.port === 465, ...(config.user ? { auth: { user: config.user, pass: config.password } } : {}) });
  }
  async send(input: EmailMessage): Promise<void> { const message = emailJobSchema.parse(input); await this.transport.sendMail({ from: this.config.from, ...message }); }
  close(): void { this.transport.close(); }
}

export class ConsoleEmailProvider implements NotificationProvider {
  async send(input: EmailMessage): Promise<void> {
    emailJobSchema.parse(input);
    console.info(JSON.stringify({ event: 'notification.email_simulated', delivered: false }));
  }
  close(): void {}
}
