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
test('explicit email and whatsapp simulation redacts content', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const providers = notificationProviders({ NODE_ENV: 'test', NOTIFICATIONS_MODE: 'console' });
  await providers.email.send({ to: 'private@example.test', subject: 'Private subject', text: 'https://example.test/reset?token=private-token' });
  await providers.whatsapp.send({ tenantId: 'tenant-1', to: '+5511999999999', templateKey: 'booking.confirmation', parameters: ['Cliente', 'Barbearia', '10/09/2026', '10:00 GMT-3'] });
  expect(log.mock.calls).toEqual([
    [JSON.stringify({ event: 'notification.email_simulated', delivered: false })],
    [JSON.stringify({ event: 'notification.whatsapp_simulated', delivered: false, templateKey: 'booking.confirmation' })],
  ]);
});
test('live mode uses ZernioWhatsAppProvider and rejects unconfigured tenants instead of simulating delivery', async () => {
  const providers = notificationProviders({ NODE_ENV: 'production', SMTP_HOST: 'localhost', SMTP_FROM: 'noreply@example.test' });
  await expect(providers.whatsapp.send({ tenantId: 'unconfigured', to: '+5511999999999', parameters: ['Cliente', 'Barbearia', '10/09/2026', '10:00 GMT-3'] })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  providers.email.close();
});
