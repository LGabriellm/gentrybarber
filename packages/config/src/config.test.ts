import { describe, expect, it } from 'vitest';
import { loadConfig } from './index';

const base = {
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://user:pass@localhost:5432/barber',
  BETTER_AUTH_SECRET: 'test-only-secret-with-at-least-thirty-two-characters',
  BETTER_AUTH_URL: 'http://localhost:4000', TRUSTED_ORIGINS: 'http://localhost:3000, http://localhost:3001',
  REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_FROM: 'BarberHub <no-reply@barber.test>',
};
const production = { ...base, NODE_ENV: 'production', PLATFORM_DOMAIN: 'barber.test', BETTER_AUTH_URL: 'https://api.barber.test', TRUSTED_ORIGINS: 'https://dashboard.barber.test,https://admin.barber.test' };

describe('platform configuration boundary', () => {
  it('requires server secrets and database configuration', () => {
    expect(() => loadConfig({ ...base, BETTER_AUTH_SECRET: undefined })).toThrow();
    expect(() => loadConfig({ ...base, BETTER_AUTH_SECRET: 'short' })).toThrow();
    expect(() => loadConfig({ ...base, DATABASE_URL: 'https://example.test/db' })).toThrow();
  });

  it('parses explicit origins and uses bounded default API port', () => {
    const config = loadConfig(base);
    expect(config.TRUSTED_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:3001']);
    expect(config.API_PORT).toBe(4000);
    expect(config.BIND_HOST).toBe('127.0.0.1');
  });

  it.each(['0', '-1', '65536', '4000.5', 'wrong'])('rejects invalid API port %s', API_PORT => {
    expect(() => loadConfig({ ...base, API_PORT })).toThrow();
  });

  it('allows production only with HTTPS authentication and trusted origins', () => {
    expect(loadConfig(production).NODE_ENV).toBe('production');
    expect(() => loadConfig({ ...production, BETTER_AUTH_URL: 'http://api.barber.test' })).toThrow('Production authentication URLs must use the platform service hostnames over HTTPS');
    expect(() => loadConfig({ ...production, TRUSTED_ORIGINS: 'https://dashboard.barber.test,http://admin.barber.test' })).toThrow('Production authentication URLs must use the platform service hostnames over HTTPS');
    expect(() => loadConfig({ ...production, TRUSTED_ORIGINS: 'https://dashboard.barber.test,https://admin.barber.test,https://evil.test' })).toThrow('Production authentication URLs must use the platform service hostnames over HTTPS');
    expect(() => loadConfig({ ...production, BETTER_AUTH_URL: 'http://api.barber.test', BYPASS_HTTPS_CHECK: 'true' })).toThrow('Production authentication URLs must use the platform service hostnames over HTTPS');
    expect(() => loadConfig({ ...production, PLATFORM_DOMAIN: '127.0.0.1', BETTER_AUTH_URL: 'http://127.0.0.1' })).toThrow('Production requires a valid platform domain');
  });

  it('blocks fixture mode and placeholder secrets in production', () => {
    expect(() => loadConfig({ ...production, DEMO_MODE: 'true' })).toThrow('Demo fixtures cannot run in production');
    expect(() => loadConfig({ ...production, BETTER_AUTH_SECRET: 'change-me-this-is-a-long-placeholder-secret' })).toThrow('Replace the placeholder authentication secret');
  });
});
