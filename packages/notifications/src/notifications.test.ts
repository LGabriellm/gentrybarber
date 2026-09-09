import { describe, expect, it } from 'vitest';
import { emailJobSchema, redisConnection } from './index';

describe('transactional email job input', () => {
  it('accepts a strictly scoped transactional message', () => {
    expect(emailJobSchema.parse({ to: 'member@example.test', subject: 'Confirme seu e-mail', text: 'Mensagem transacional.' })).toEqual({ to: 'member@example.test', subject: 'Confirme seu e-mail', text: 'Mensagem transacional.' });
  });

  it.each([
    { to: 'invalid', subject: 'Assunto', text: 'Texto' },
    { to: 'member@example.test', subject: '', text: 'Texto' },
    { to: 'member@example.test', subject: 'a'.repeat(201), text: 'Texto' },
    { to: 'member@example.test', subject: 'Assunto', text: 'a'.repeat(20001) },
    { to: 'member@example.test', subject: 'Assunto', text: 'Texto', html: '<script />' },
    { to: 'member@example.test', subject: 'Assunto', text: 'Texto', cc: 'unexpected@example.test' },
  ])('rejects invalid or unrecognized message fields %j', message => {
    expect(emailJobSchema.safeParse(message).success).toBe(false);
  });
});

describe('Redis connection settings', () => {
  it('enables TLS for rediss and decodes credentials without logging them', () => {
    const connection = redisConnection('rediss://worker:p%40ss@cache.internal:6380/2');
    expect(connection).toEqual({ host: 'cache.internal', port: 6380, username: 'worker', password: 'p@ss', db: 2, tls: {} });
  });

  it('uses the default Redis port and database when omitted', () => {
    expect(redisConnection('redis://localhost')).toEqual({ host: 'localhost', port: 6379, username: undefined, password: undefined, db: 0 });
  });

  it.each(['http://cache.internal', 'file:///cache', 'invalid-url'])('rejects an unsupported Redis URL %s', url => {
    expect(() => redisConnection(url)).toThrow();
  });
});
