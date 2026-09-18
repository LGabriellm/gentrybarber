import { z } from 'zod';
import { SmtpEmailProvider, ConsoleEmailProvider } from '@platform/notifications';

export function notificationProviders(input: Record<string, string | undefined> = process.env) {
  const env = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
    NOTIFICATIONS_MODE: z.enum(['live', 'console']).default('live'),
    SMTP_HOST: z.string().min(1).optional(), SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_FROM: z.string().min(1).optional(), SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(),
  }).parse(input);
  if (env.NOTIFICATIONS_MODE === 'console') {
    if (env.NODE_ENV === 'production') throw new Error('Console notifications are forbidden in production.');
    return { email: new ConsoleEmailProvider() };
  }
  if (!env.SMTP_HOST || !env.SMTP_FROM) throw new Error('Configure SMTP_HOST and SMTP_FROM before starting the notification worker.');
  
  return {
    email: new SmtpEmailProvider({ host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.SMTP_FROM, user: env.SMTP_USER, password: env.SMTP_PASSWORD }),
  };
}
