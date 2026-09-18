import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { createRedisClient } from '@platform/notifications';
import type { PlatformConfig } from '@platform/config';

/** Every replica must use the same Redis database and namespace. No local fallback. */
export async function registerAbuseProtection(server: FastifyInstance, config: PlatformConfig, max = config.RATE_LIMIT_MAX) {
  const redis = createRedisClient(config.REDIS_URL);
  redis.options.commandTimeout = 2_000;
  redis.on('error', () => server.log.warn('Rate limit Redis unavailable'));
  server.addHook('onClose', async () => { redis.disconnect(); });
  try { await redis.ping(); } catch { redis.disconnect(); throw new Error('Rate limit Redis unavailable'); }
  redis.options.enableOfflineQueue = false;
  server.addHook('onRoute', route => {
    if (route.url === '/health' || route.url === '/ready') route.config = { ...route.config, rateLimit: false };
    if (route.method === 'POST' && route.url === '/v1/public/booking/appointments') {
      route.config = { ...route.config, rateLimit: { max: 6, timeWindow: 60_000 } };
    }
  });
  server.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.url !== '/health' && redis.status !== 'ready') return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE' });
    if (request.routeOptions.url === '/ready') {
      try { await redis.ping(); } catch { return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE' }); }
    }
  });
  await server.register(rateLimit, {
    redis, nameSpace: config.RATE_LIMIT_NAMESPACE, max, timeWindow: config.RATE_LIMIT_WINDOW_MS,
    skipOnError: false,
    keyGenerator: request => request.ip,
  });
  return redis;
}
