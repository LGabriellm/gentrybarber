import { z } from 'zod';

const accountSchema = z.object({
  phoneNumberId: z.string().regex(/^\d{5,30}$/), accessToken: z.string().min(20),
  template: z.string().regex(/^[a-z0-9_]{1,512}$/), language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
}).strict();
export type WhatsAppAccount = z.infer<typeof accountSchema>;
export interface WhatsAppRuntime { version: string; accounts: Record<string, WhatsAppAccount> }
export function whatsappRuntime(env: Record<string, string | undefined> = process.env): WhatsAppRuntime {
  if (!env.WHATSAPP_ACCOUNTS_JSON) return { version: '', accounts: {} };
  try {
    return {
      version: z.string().regex(/^v\d+\.0$/).parse(env.WHATSAPP_GRAPH_VERSION),
      accounts: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), accountSchema).parse(JSON.parse(env.WHATSAPP_ACCOUNTS_JSON)),
    };
  } catch { throw new Error('Invalid WhatsApp environment configuration; check account mapping and Graph version.'); }
}
export interface WhatsAppConfirmation { tenantId: string; to: string; parameters: string[] }
export interface WhatsAppProvider { send(message: WhatsAppConfirmation): Promise<{ messageId: string }> }
export class WhatsAppSendError extends Error {
  constructor(readonly kind: 'rejected' | 'retryable' | 'unknown', readonly code: string) { super(code); }
}
export class MetaWhatsAppProvider implements WhatsAppProvider {
  constructor(private readonly runtime: WhatsAppRuntime, private readonly request: typeof fetch = fetch) {}
  async send(message: WhatsAppConfirmation): Promise<{ messageId: string }> {
    const account = Object.hasOwn(this.runtime.accounts, message.tenantId) ? this.runtime.accounts[message.tenantId] : undefined;
    if (!account) throw new WhatsAppSendError('rejected', 'NOT_CONFIGURED');
    if (!/^\+[1-9]\d{7,14}$/.test(message.to) || message.parameters.length !== 4 || message.parameters.some(p => !p || p.length > 200)) throw new WhatsAppSendError('rejected', 'INVALID_MESSAGE');
    let response: Response;
    try {
      response = await this.request(`https://graph.facebook.com/${this.runtime.version}/${account.phoneNumberId}/messages`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${account.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: message.to.slice(1), type: 'template', template: {
          name: account.template, language: { code: account.language },
          components: [{ type: 'body', parameters: message.parameters.map(text => ({ type: 'text', text })) }],
        } }),
      });
    } catch { throw new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN'); }
    if (response.status === 429) throw new WhatsAppSendError('retryable', 'RATE_LIMITED');
    if (response.status >= 500 || response.status === 408) throw new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN');
    if (!response.ok) throw new WhatsAppSendError('rejected', 'PROVIDER_REJECTED');
    try {
      const result = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(512) })).min(1) }).parse(await response.json());
      return { messageId: result.messages[0]!.id };
    } catch { throw new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN'); }
  }
}

export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  async send(message: WhatsAppConfirmation): Promise<{ messageId: string }> {
    console.log('\n================ MOCK WHATSAPP =================');
    console.log(`To: ${message.to}`);
    console.log('--------------------------------------------------');
    console.log(`Olá, ${message.parameters[0] || 'Cliente'}!`);
    console.log(`Seu agendamento em ${message.parameters[1]} está confirmado.`);
    console.log(`Data: ${message.parameters[2]}`);
    console.log(`Horário: ${message.parameters[3]}`);
    console.log('==================================================\n');
    return { messageId: `mock-wa-${Date.now()}` };
  }
}
