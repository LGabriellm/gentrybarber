import { afterEach, expect, test, vi } from 'vitest';
import { notificationProviders } from './providers';

afterEach(() => vi.restoreAllMocks());
test('refuses missing SMTP instead of silently completing email jobs', () => {
  expect(() => notificationProviders({ NODE_ENV: 'production' })).toThrow('Configure SMTP');
  expect(() => notificationProviders({ NODE_ENV: 'development' })).toThrow('Configure SMTP');
});
test('forbids console providers in production or an unspecified environment', () => {
  for (const NODE_ENV of ['production', undefined]) expect(() => notificationProviders({ NODE_ENV, NOTIFICATIONS_MODE: 'console' })).toThrow('forbidden');
});
test('explicit email simulation redacts content', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const providers = notificationProviders({ NODE_ENV: 'test', NOTIFICATIONS_MODE: 'console' });
  await providers.email.send({ to: 'private@example.test', subject: 'Private subject', text: 'https://example.test/reset?token=private-token' });
  expect(log.mock.calls).toEqual([[JSON.stringify({ event: 'notification.email_simulated', delivered: false })]]);
});
