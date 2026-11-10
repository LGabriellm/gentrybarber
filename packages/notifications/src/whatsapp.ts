import { z } from 'zod';

export const whatsappTemplateKeys = [
  'booking.confirmation',
  'booking.customer_reminder',
  'booking.barber_reminder',
] as const;
export type WhatsAppTemplateKey = typeof whatsappTemplateKeys[number];

const templateNameSchema = z.string().regex(/^[a-z0-9_]{1,512}$/);
const accountSchema = z.object({
  apiKey: z.string().min(16),
  accountId: z.string().regex(/^[a-zA-Z0-9_-]{4,128}$/),
  template: templateNameSchema.default('booking_confirmation'),
  customerReminderTemplate: templateNameSchema.optional(),
  barberReminderTemplate: templateNameSchema.optional(),
  language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/).default('pt_BR'),
}).strict();

export type WhatsAppAccount = z.infer<typeof accountSchema>;
export interface WhatsAppRuntime {
  apiKey?: string | null;
  defaultTemplates?: {
    template: string;
    customerReminderTemplate: string;
    barberReminderTemplate: string;
    language: string;
  };
  defaultAccount?: WhatsAppAccount | null;
  accounts: Record<string, WhatsAppAccount>;
}

export function whatsappRuntime(env: Record<string, string | undefined> = process.env): WhatsAppRuntime {
  try {
    const rawApiKey = env.ZERNIO_API_KEY?.trim() || null;
    const rawAccountId = env.ZERNIO_ACCOUNT_ID?.trim() || null;
    const apiKey = rawApiKey ? z.string().min(16).parse(rawApiKey) : null;

    const defaultTemplates = {
      template: templateNameSchema.parse(env.ZERNIO_CONFIRMATION_TEMPLATE?.trim() || 'booking_confirmation'),
      customerReminderTemplate: templateNameSchema.parse(env.ZERNIO_CUSTOMER_REMINDER_TEMPLATE?.trim() || 'booking_customer_reminder'),
      barberReminderTemplate: templateNameSchema.parse(env.ZERNIO_BARBER_REMINDER_TEMPLATE?.trim() || 'booking_barber_reminder'),
      language: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/).parse(env.ZERNIO_TEMPLATE_LANGUAGE?.trim() || 'pt_BR'),
    };

    if (rawAccountId && !apiKey) {
      throw new Error('ZERNIO_API_KEY is required when ZERNIO_ACCOUNT_ID is set.');
    }

    const defaultAccount = apiKey && rawAccountId
      ? accountSchema.parse({
          apiKey,
          accountId: rawAccountId,
          ...defaultTemplates,
        })
      : null;

    const accounts = env.WHATSAPP_ACCOUNTS_JSON?.trim()
      ? z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), accountSchema).parse(JSON.parse(env.WHATSAPP_ACCOUNTS_JSON))
      : {};

    return { apiKey, defaultTemplates, defaultAccount, accounts };
  } catch {
    throw new Error('Invalid WhatsApp environment configuration; check ZERNIO_API_KEY and ZERNIO_ACCOUNT_ID.');
  }
}

export function resolveWhatsAppTemplateName(account: WhatsAppAccount, templateKey: WhatsAppTemplateKey = 'booking.confirmation'): string {
  if (templateKey === 'booking.customer_reminder') return account.customerReminderTemplate ?? account.template;
  if (templateKey === 'booking.barber_reminder') return account.barberReminderTemplate ?? account.template;
  return account.template;
}

export interface WhatsAppConfirmation {
  tenantId: string;
  accountId?: string | null;
  to: string;
  templateKey?: WhatsAppTemplateKey;
  parameters: string[];
}

export interface WhatsAppProvider {
  send(message: WhatsAppConfirmation): Promise<{ messageId: string }>;
}

export class WhatsAppSendError extends Error {
  constructor(readonly kind: 'rejected' | 'retryable' | 'unknown', readonly code: string) {
    super(code);
  }
}

function validateWhatsAppMessage(message: WhatsAppConfirmation): void {
  if (!/^\+[1-9]\d{7,14}$/.test(message.to) || message.parameters.length !== 4 || message.parameters.some(p => !p || p.length > 200)) {
    throw new WhatsAppSendError('rejected', 'INVALID_MESSAGE');
  }
}

const zernioResponseSchema = z.union([
  z.object({
    data: z.object({
      messageId: z.string().min(1).max(512),
    }),
  }).transform(val => val.data.messageId),
  z.object({
    messageId: z.string().min(1).max(512),
  }).transform(val => val.messageId),
  z.object({
    id: z.string().min(1).max(512),
  }).transform(val => val.id),
]);

export class ZernioWhatsAppProvider implements WhatsAppProvider {
  constructor(private readonly runtime: WhatsAppRuntime, private readonly request: typeof fetch = fetch) {}

  private resolveAccount(message: WhatsAppConfirmation): WhatsAppAccount | undefined {
    if (Object.hasOwn(this.runtime.accounts, message.tenantId)) {
      return this.runtime.accounts[message.tenantId];
    }
    if (message.accountId) {
      const apiKey = this.runtime.apiKey ?? this.runtime.defaultAccount?.apiKey;
      if (apiKey && /^[a-zA-Z0-9_-]{4,128}$/.test(message.accountId)) {
        const templates = this.runtime.defaultTemplates ?? {
          template: this.runtime.defaultAccount?.template ?? 'booking_confirmation',
          customerReminderTemplate: this.runtime.defaultAccount?.customerReminderTemplate ?? 'booking_customer_reminder',
          barberReminderTemplate: this.runtime.defaultAccount?.barberReminderTemplate ?? 'booking_barber_reminder',
          language: this.runtime.defaultAccount?.language ?? 'pt_BR',
        };
        return {
          apiKey,
          accountId: message.accountId,
          ...templates,
        };
      }
    }
    return this.runtime.defaultAccount ?? undefined;
  }

  async send(message: WhatsAppConfirmation): Promise<{ messageId: string }> {
    const account = this.resolveAccount(message);
    if (!account) throw new WhatsAppSendError('rejected', 'NOT_CONFIGURED');
    validateWhatsAppMessage(message);

    const templateName = resolveWhatsAppTemplateName(account, message.templateKey ?? 'booking.confirmation');
    let response: Response;
    try {
      response = await this.request('https://zernio.com/api/v1/inbox/conversations', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: {
          authorization: `Bearer ${account.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          accountId: account.accountId,
          participantId: message.to.slice(1),
          templateName,
          templateLanguage: account.language,
          templateParams: message.parameters,
        }),
      });
    } catch {
      throw new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN');
    }
    if (response.status === 429) throw new WhatsAppSendError('retryable', 'RATE_LIMITED');
    if (response.status >= 500 || response.status === 408) throw new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN');
    if (!response.ok) throw new WhatsAppSendError('rejected', 'PROVIDER_REJECTED');
    try {
      const messageId = zernioResponseSchema.parse(await response.json());
      return { messageId };
    } catch {
      throw new WhatsAppSendError('unknown', 'RESPONSE_UNKNOWN');
    }
  }
}

export interface ZernioTemplateDefinition {
  key: WhatsAppTemplateKey;
  name: string;
  text: string;
  example: string[];
}

export function defaultZernioTemplateDefinitions(account: WhatsAppAccount): ZernioTemplateDefinition[] {
  return [
    {
      key: 'booking.confirmation',
      name: resolveWhatsAppTemplateName(account, 'booking.confirmation'),
      text: 'Olá, {{1}}! Seu agendamento na {{2}} está confirmado para {{3}} às {{4}}.',
      example: ['Carlos Silva', 'Gentry Barber', '10/11/2026', '14:30 GMT-3'],
    },
    {
      key: 'booking.customer_reminder',
      name: resolveWhatsAppTemplateName(account, 'booking.customer_reminder'),
      text: 'Olá, {{1}}! Lembrete: seu horário na {{2}} começa em 1 hora ({{3}} às {{4}}).',
      example: ['Carlos Silva', 'Gentry Barber', '10/11/2026', '14:30 GMT-3'],
    },
    {
      key: 'booking.barber_reminder',
      name: resolveWhatsAppTemplateName(account, 'booking.barber_reminder'),
      text: 'Olá, {{1}}! Seu próximo cliente em 15 minutos é {{2}} ({{3}}) às {{4}}.',
      example: ['Rafael', 'Carlos Silva', 'Corte e barba', '14:30 GMT-3'],
    },
  ];
}

export async function provisionZernioWhatsAppTemplates(
  account: WhatsAppAccount,
  request: typeof fetch = fetch,
): Promise<{ name: string; status: string }[]> {
  const results: { name: string; status: string }[] = [];
  for (const def of defaultZernioTemplateDefinitions(account)) {
    const response = await request('https://zernio.com/api/v1/whatsapp/templates', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: {
        authorization: `Bearer ${account.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        accountId: account.accountId,
        name: def.name,
        category: 'UTILITY',
        language: account.language,
        components: [
          {
            type: 'body',
            text: def.text,
            example: {
              body_text: [def.example],
            },
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new WhatsAppSendError('rejected', 'TEMPLATE_PROVISION_FAILED');
    }
    const parsed = z.object({
      template: z.object({
        name: z.string(),
        status: z.string().default('PENDING'),
      }),
    }).parse(await response.json());
    results.push({ name: parsed.template.name, status: parsed.template.status });
  }
  return results;
}

export async function createZernioProfile(
  apiKey: string,
  tenant: { id: string; name: string; slug: string },
  request: typeof fetch = fetch,
): Promise<{ profileId: string }> {
  const response = await request('https://zernio.com/api/v1/profiles', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: tenant.name.slice(0, 120),
      description: `WhatsApp Business (${tenant.slug})`,
      externalId: tenant.id,
    }),
  });
  if (!response.ok) {
    throw new WhatsAppSendError('rejected', 'PROFILE_CREATION_FAILED');
  }
  const parsed = z.object({
    profile: z.object({
      _id: z.string().regex(/^[a-zA-Z0-9_-]{4,128}$/).optional(),
      id: z.string().regex(/^[a-zA-Z0-9_-]{4,128}$/).optional(),
    }),
  }).parse(await response.json());
  const profileId = parsed.profile._id ?? parsed.profile.id;
  if (!profileId) throw new WhatsAppSendError('rejected', 'PROFILE_CREATION_FAILED');
  return { profileId };
}

export async function getZernioWhatsAppConnectUrl(
  apiKey: string,
  params: { profileId: string; redirectUrl: string; mode?: 'coexistence' | 'api' },
  request: typeof fetch = fetch,
): Promise<{ authUrl: string }> {
  const query = new URLSearchParams({
    profileId: params.profileId,
    redirect_url: params.redirectUrl,
    ...(params.mode === 'api' ? { onboarding: 'api' } : {}),
  });
  const response = await request(`https://zernio.com/api/v1/connect/whatsapp?${query.toString()}`, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new WhatsAppSendError('rejected', 'CONNECT_URL_FAILED');
  }
  const parsed = z.object({
    authUrl: z.url(),
  }).parse(await response.json());
  return { authUrl: parsed.authUrl };
}

export async function listZernioProfileWhatsAppAccounts(
  apiKey: string,
  profileId: string,
  request: typeof fetch = fetch,
): Promise<{ accountId: string; phone: string | null; name: string | null; status: string }[]> {
  const query = new URLSearchParams({
    profileId,
    platform: 'whatsapp',
  });
  const response = await request(`https://zernio.com/api/v1/accounts?${query.toString()}`, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new WhatsAppSendError('rejected', 'ACCOUNTS_FETCH_FAILED');
  }
  const parsed = z.object({
    accounts: z.array(z.object({
      _id: z.string().regex(/^[a-zA-Z0-9_-]{4,128}$/).optional(),
      id: z.string().regex(/^[a-zA-Z0-9_-]{4,128}$/).optional(),
      username: z.string().max(64).nullish(),
      name: z.string().max(160).nullish(),
      status: z.string().max(64).default('connected'),
    })).default([]),
  }).parse(await response.json());

  return parsed.accounts
    .map(item => ({
      accountId: item._id ?? item.id ?? '',
      phone: item.username ?? null,
      name: item.name ?? null,
      status: item.status,
    }))
    .filter(item => Boolean(item.accountId));
}

export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  async send(message: WhatsAppConfirmation): Promise<{ messageId: string }> {
    validateWhatsAppMessage(message);
    console.info(JSON.stringify({
      event: 'notification.whatsapp_simulated',
      delivered: false,
      templateKey: message.templateKey ?? 'booking.confirmation',
    }));
    return { messageId: 'simulated-whatsapp' };
  }
}
