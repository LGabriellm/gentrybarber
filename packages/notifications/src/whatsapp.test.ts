import { describe, expect, it, vi } from 'vitest';
import {
  ConsoleWhatsAppProvider,
  ZernioWhatsAppProvider,
  createZernioProfile,
  getZernioWhatsAppConnectUrl,
  listZernioProfileWhatsAppAccounts,
  provisionZernioWhatsAppTemplates,
  resolveWhatsAppTemplateName,
  whatsappRuntime,
} from './whatsapp';

const account = {
  apiKey: 'sk_live_fictitious_zernio_key_12345',
  accountId: '66b2e19d8c3f5a7e9d0b1c2d',
  template: 'booking_confirmation',
  customerReminderTemplate: 'booking_customer_reminder',
  barberReminderTemplate: 'booking_barber_next_client',
  language: 'pt_BR',
};
const secondaryAccount = {
  apiKey: 'sk_live_secondary_zernio_key_67890',
  accountId: '66c3d2ae7b4f6c8d0e1f2a3b',
  template: 'default_template',
  language: 'pt_BR',
};
const runtime = {
  apiKey: null,
  defaultTemplates: {
    template: 'booking_confirmation',
    customerReminderTemplate: 'booking_customer_reminder',
    barberReminderTemplate: 'booking_barber_reminder',
    language: 'pt_BR',
  },
  defaultAccount: null,
  accounts: {
    tenantA: account,
    tenantB: secondaryAccount,
  },
};
const message = {
  tenantId: 'tenantA',
  to: '+5511999999999',
  parameters: ['Cliente fictício', 'Barbearia teste', '10/09/2026', '10:00 GMT-3'],
};

describe('Zernio WhatsApp adapter', () => {
  it('automatically uses the single global Zernio account for any tenant when configured', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        success: true,
        data: { messageId: 'wamid.zernio_global_123', conversationId: 'conv_1', participantId: '5511999999999' },
      }, { status: 201 }),
    );
    const globalRuntime = whatsappRuntime({
      ZERNIO_API_KEY: account.apiKey,
      ZERNIO_ACCOUNT_ID: account.accountId,
    });
    const provider = new ZernioWhatsAppProvider(globalRuntime, request);

    expect(await provider.send({ ...message, tenantId: 'any-new-tenant-1' })).toEqual({ messageId: 'wamid.zernio_global_123' });
    expect(await provider.send({ ...message, tenantId: 'any-new-tenant-2', templateKey: 'booking.customer_reminder' })).toEqual({ messageId: 'wamid.zernio_global_123' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toBe('https://zernio.com/api/v1/inbox/conversations');
    expect(JSON.parse(String(request.mock.calls[0]![1]!.body))).toEqual({
      accountId: '66b2e19d8c3f5a7e9d0b1c2d',
      participantId: '5511999999999',
      templateName: 'booking_confirmation',
      templateLanguage: 'pt_BR',
      templateParams: message.parameters,
    });
  });

  it('uses tenant-connected Zernio accountId from database with platform ZERNIO_API_KEY', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({ success: true, data: { messageId: 'wamid.tenant_own_wa' } }, { status: 201 }),
    );
    const apiKeyOnlyRuntime = whatsappRuntime({
      ZERNIO_API_KEY: account.apiKey,
    });
    const provider = new ZernioWhatsAppProvider(apiKeyOnlyRuntime, request);

    expect(
      await provider.send({
        ...message,
        tenantId: 'tenant-with-own-whatsapp',
        accountId: '66f9a8b7c6d5e4f3a2b1c0d9',
      }),
    ).toEqual({ messageId: 'wamid.tenant_own_wa' });
    expect(JSON.parse(String(request.mock.calls[0]![1]!.body))).toMatchObject({
      accountId: '66f9a8b7c6d5e4f3a2b1c0d9',
      participantId: '5511999999999',
      templateName: 'booking_confirmation',
    });
  });

  it('selects tenant override when present and sends confirmation, customer reminder, and barber reminder via Zernio API', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({ success: true, data: { messageId: 'wamid.zernio_fake' } }, { status: 201 }),
    );
    const provider = new ZernioWhatsAppProvider(runtime, request);

    expect(await provider.send(message)).toEqual({ messageId: 'wamid.zernio_fake' });
    expect(request.mock.calls[0]?.[0]).toBe('https://zernio.com/api/v1/inbox/conversations');
    const options = request.mock.calls[0]![1]!;
    expect(options.redirect).toBe('error');
    expect(JSON.parse(String(options.body))).toEqual({
      accountId: '66b2e19d8c3f5a7e9d0b1c2d',
      participantId: '5511999999999',
      templateName: 'booking_confirmation',
      templateLanguage: 'pt_BR',
      templateParams: message.parameters,
    });

    await provider.send({ ...message, templateKey: 'booking.customer_reminder' });
    expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toMatchObject({
      templateName: 'booking_customer_reminder',
    });

    await provider.send({
      tenantId: 'tenantA',
      to: '+5511988888888',
      templateKey: 'booking.barber_reminder',
      parameters: ['Barbeiro Alex', 'Cliente fictício', 'Corte + Barba', '10:00 GMT-3'],
    });
    expect(JSON.parse(String(request.mock.calls[2]![1]!.body))).toEqual({
      accountId: '66b2e19d8c3f5a7e9d0b1c2d',
      participantId: '5511988888888',
      templateName: 'booking_barber_next_client',
      templateLanguage: 'pt_BR',
      templateParams: ['Barbeiro Alex', 'Cliente fictício', 'Corte + Barba', '10:00 GMT-3'],
    });

    await provider.send({ ...message, tenantId: 'tenantB', templateKey: 'booking.customer_reminder' });
    expect(JSON.parse(String(request.mock.calls[3]![1]!.body))).toMatchObject({
      accountId: '66c3d2ae7b4f6c8d0e1f2a3b',
      templateName: 'default_template',
    });
  });

  it('provisions Zernio profile, connect URL, accounts list, and utility templates', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ profile: { _id: 'prof_123456' } }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ authUrl: 'https://www.facebook.com/v18.0/dialog/oauth?state=123' }))
      .mockResolvedValueOnce(Response.json({
        accounts: [{ _id: 'acc_999888', username: '+5511977776666', name: 'Barbearia Imperial', status: 'connected' }],
      }))
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { name: string };
        return Response.json({
          success: true,
          template: { id: 'tpl_1', name: body.name, status: 'PENDING', category: 'UTILITY', language: 'pt_BR' },
        });
      });

    const profile = await createZernioProfile(account.apiKey, { id: 'tenant_1', name: 'Barbearia Imperial', slug: 'imperial' }, request);
    expect(profile).toEqual({ profileId: 'prof_123456' });

    const connect = await getZernioWhatsAppConnectUrl(
      account.apiKey,
      { profileId: 'prof_123456', redirectUrl: 'http://localhost:3001/tenants/imperial/whatsapp', mode: 'coexistence' },
      request,
    );
    expect(connect.authUrl).toContain('facebook.com');

    const accounts = await listZernioProfileWhatsAppAccounts(account.apiKey, 'prof_123456', request);
    expect(accounts).toEqual([
      { accountId: 'acc_999888', phone: '+5511977776666', name: 'Barbearia Imperial', status: 'connected' },
    ]);

    const created = await provisionZernioWhatsAppTemplates(account, request);
    expect(created).toEqual([
      { name: 'booking_confirmation', status: 'PENDING' },
      { name: 'booking_customer_reminder', status: 'PENDING' },
      { name: 'booking_barber_next_client', status: 'PENDING' },
    ]);
  });

  it('resolves template names with fallback to main template', () => {
    expect(resolveWhatsAppTemplateName(account, 'booking.confirmation')).toBe('booking_confirmation');
    expect(resolveWhatsAppTemplateName(account, 'booking.customer_reminder')).toBe('booking_customer_reminder');
    expect(resolveWhatsAppTemplateName(account, 'booking.barber_reminder')).toBe('booking_barber_next_client');
    expect(resolveWhatsAppTemplateName(secondaryAccount, 'booking.barber_reminder')).toBe('default_template');
  });

  it('never falls back to another tenant override when no global account is set', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(new ZernioWhatsAppProvider(runtime, request).send({ ...message, tenantId: 'foreign' })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'retryable'],
    [400, 'rejected'],
    [401, 'rejected'],
    [500, 'unknown'],
    [408, 'unknown'],
  ])('classifies HTTP %i without returning provider details', async (status, kind) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider error', { status: Number(status) }));
    await expect(new ZernioWhatsAppProvider(runtime, request).send(message)).rejects.toMatchObject({ kind });
  });

  it('treats lost responses and invalid success payloads as ambiguous', async () => {
    for (const request of [
      vi.fn<typeof fetch>().mockRejectedValue(new Error('network')),
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({})),
    ]) {
      await expect(new ZernioWhatsAppProvider(runtime, request).send(message)).rejects.toMatchObject({ kind: 'unknown' });
    }
  });

  it('does not send invalid numbers or arbitrary parameter counts', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(new ZernioWhatsAppProvider(runtime, request).send({ ...message, to: '11999999999' })).rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
    await expect(new ZernioWhatsAppProvider(runtime, request).send({ ...message, parameters: ['A', 'B'] })).rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
    expect(request).not.toHaveBeenCalled();
  });

  it('validates global Zernio settings and optional tenant overrides', () => {
    expect(whatsappRuntime({})).toMatchObject({ apiKey: null, defaultAccount: null, accounts: {} });
    expect(() => whatsappRuntime({ ZERNIO_API_KEY: 'short' })).toThrow('Invalid WhatsApp environment');
    expect(() => whatsappRuntime({ WHATSAPP_ACCOUNTS_JSON: '{"tenantA":{"apiKey":"short"}}' })).toThrow('Invalid WhatsApp environment');
    expect(whatsappRuntime({ WHATSAPP_ACCOUNTS_JSON: JSON.stringify(runtime.accounts) })).toEqual(runtime);
  });

  it('redacts personal content in ConsoleWhatsAppProvider', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const provider = new ConsoleWhatsAppProvider();
    const res = await provider.send({ ...message, templateKey: 'booking.barber_reminder' });
    expect(res).toEqual({ messageId: 'simulated-whatsapp' });
    expect(spy.mock.calls).toEqual([[JSON.stringify({ event: 'notification.whatsapp_simulated', delivered: false, templateKey: 'booking.barber_reminder' })]]);
    spy.mockRestore();
  });
});
