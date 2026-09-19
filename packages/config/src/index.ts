import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PLATFORM_NAME: z.string().min(1).default('BarberHub'),
  PLATFORM_DOMAIN: z.string().min(1).default('localhost'),
  DATABASE_URL: z.url().startsWith('postgresql://'),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  TRUSTED_ORIGINS: z.string().min(1).transform(value => value.split(',').map(item => z.url().parse(item.trim()))),
  REDIS_URL: z.url(),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_NAMESPACE: z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/).default('platform:http:'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  BIND_HOST: z.string().default('127.0.0.1'),
  TRUST_PROXY_CIDRS: z.string().default('').transform(value => value.split(',').map(item => item.trim()).filter(Boolean).map(item => z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]).parse(item))),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_FROM: z.string().min(1).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});
export function loadConfig(source: Record<string, string | undefined> = process.env) {
  const config = envSchema.parse(source);
  if (config.NODE_ENV === 'production') {
    // Relaxed HTTPS requirement to allow testing with IP addresses
    if (config.PLATFORM_DOMAIN !== 'localhost' && !/^[0-9.]+$/.test(config.PLATFORM_DOMAIN)) {
      if (!config.BETTER_AUTH_URL.startsWith('https://') || config.TRUSTED_ORIGINS.some(origin => !origin.startsWith('https://'))) throw new Error('Production authentication requires HTTPS origins for domains');
    }
    if (/localhost|example|change[-_]?me/i.test(config.BETTER_AUTH_SECRET)) throw new Error('Replace the placeholder authentication secret');
    if (source.DEMO_MODE === 'true') throw new Error('Demo fixtures cannot run in production');
    if (!config.SMTP_HOST || !config.SMTP_FROM) throw new Error('SMTP_HOST and SMTP_FROM are required in production');
  }
  return config;
}
export type PlatformConfig = ReturnType<typeof loadConfig>;
export const platformName = () => process.env.PLATFORM_NAME || 'BarberHub';
export * from './logger';
