import { describe, expect, it, vi } from 'vitest';
import { MetaWhatsAppProvider, whatsappRuntime } from './whatsapp';

const account = { phoneNumberId: '1234567', accessToken: 'fictitious-token-for-tests', template: 'booking_confirmation', language: 'pt_BR' };
const runtime = { version: 'v99.0', accounts: { tenantA: account, tenantB: { ...account, phoneNumberId: '7654321', accessToken: 'another-fictitious-token' } } };
const message = { tenantId: 'tenantA', to: '+5511999999999', parameters: ['Cliente fictício', 'Barbearia teste', '10/09/2026', '10:00 GMT-3'] };
describe('Meta WhatsApp adapter', () => {
  it('selects the tenant account and sends an approved template', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ messages: [{ id: 'wamid.fake' }] }));
    expect(await new MetaWhatsAppProvider(runtime, request).send(message)).toEqual({ messageId: 'wamid.fake' });
    expect(request.mock.calls[0]?.[0]).toBe('https://graph.facebook.com/v99.0/1234567/messages');
    const options = request.mock.calls[0]![1]!;
    expect(options.redirect).toBe('error');
    expect(JSON.parse(String(options.body))).toMatchObject({ type: 'template', to: '5511999999999', template: { name: account.template, language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: message.parameters.map(text => ({ type: 'text', text })) }] } });
    await new MetaWhatsAppProvider(runtime, request).send({ ...message, tenantId: 'tenantB' });
    expect(request.mock.calls[1]?.[0]).toContain('/7654321/messages');
  });
  it('never falls back to another tenant account', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(new MetaWhatsAppProvider(runtime, request).send({ ...message, tenantId: 'foreign' })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([[429, 'retryable'], [400, 'rejected'], [401, 'rejected'], [500, 'unknown'], [408, 'unknown']])('classifies HTTP %i without returning provider details', async (status, kind) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider error', { status: Number(status) }));
    await expect(new MetaWhatsAppProvider(runtime, request).send(message)).rejects.toMatchObject({ kind });
  });
  it('treats lost responses and invalid success payloads as ambiguous', async () => {
    for (const request of [vi.fn<typeof fetch>().mockRejectedValue(new Error('network')), vi.fn<typeof fetch>().mockResolvedValue(Response.json({}))]) {
      await expect(new MetaWhatsAppProvider(runtime, request).send(message)).rejects.toMatchObject({ kind: 'unknown' });
    }
  });
  it('does not send invalid numbers or arbitrary parameter counts', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(new MetaWhatsAppProvider(runtime, request).send({ ...message, to: '11999999999' })).rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
    expect(request).not.toHaveBeenCalled();
  });
  it('requires explicit version and hides invalid configuration values', () => {
    expect(whatsappRuntime({})).toEqual({ version: '', accounts: {} });
    expect(() => whatsappRuntime({ WHATSAPP_ACCOUNTS_JSON: JSON.stringify(runtime.accounts) })).toThrow('Invalid WhatsApp environment');
    expect(whatsappRuntime({ WHATSAPP_GRAPH_VERSION: 'v99.0', WHATSAPP_ACCOUNTS_JSON: JSON.stringify(runtime.accounts) })).toEqual(runtime);
  });
});

