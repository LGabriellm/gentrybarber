import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@platform/config';
import { registerAbuseProtection } from '../src/rate-limit';

const servers: ReturnType<typeof Fastify>[] = [];
afterAll(async () => { await Promise.all(servers.map(server => server.close())); });
describe('distributed abuse protection (real Redis)', () => {
  it('counts concurrent requests across replicas, isolates IPs and expires buckets', async () => {
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@localhost/platform_test', BETTER_AUTH_SECRET: 'fictitious-secret-long-enough-for-testing', BETTER_AUTH_URL: 'http://localhost', TRUSTED_ORIGINS: 'http://localhost', REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379', RATE_LIMIT_NAMESPACE: `test:${randomUUID()}:`, RATE_LIMIT_MAX: '4', RATE_LIMIT_WINDOW_MS: '1000' });
    const clients = [];
    for (let index = 0; index < 2; index++) {
      const server = Fastify(); servers.push(server);
      clients.push(await registerAbuseProtection(server, config));
      server.get('/resource', async () => ({ ok: true }));
      server.get('/health', async () => ({ ok: true }));
      server.get('/ready', async () => ({ ok: true }));
      await server.ready();
    }
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => servers[i % 2]!.inject({ url: '/resource', remoteAddress: '192.0.2.1', headers: { 'x-forwarded-for': `203.0.113.${i}` } })));
    expect(responses.filter(r => r.statusCode === 200)).toHaveLength(4);
    expect(responses.filter(r => r.statusCode === 429)).toHaveLength(6);
    expect(responses.find(r => r.statusCode === 429)?.headers['retry-after']).toBeDefined();
    expect((await servers[1]!.inject({ url: '/resource', remoteAddress: '192.0.2.2' })).statusCode).toBe(200);
    expect((await servers[1]!.inject({ url: '/health', remoteAddress: '192.0.2.1' })).statusCode).toBe(200);
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect((await servers[1]!.inject({ url: '/resource', remoteAddress: '192.0.2.1' })).statusCode).toBe(200);
    clients[1]!.disconnect();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect((await servers[1]!.inject('/resource')).statusCode).toBe(503);
    expect((await servers[1]!.inject('/ready')).statusCode).toBe(503);
    expect((await servers[1]!.inject('/health')).statusCode).toBe(200);
  });
});
