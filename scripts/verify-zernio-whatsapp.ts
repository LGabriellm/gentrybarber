import { z } from 'zod';
import {
  ZernioWhatsAppProvider,
  provisionZernioWhatsAppTemplates,
  whatsappRuntime,
} from '../packages/notifications/src/whatsapp';

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Telefone deve estar em formato E.164 (ex: +5511999999999)');

async function listZernioAccounts(apiKey: string) {
  const response = await fetch('https://zernio.com/api/v1/accounts?platform=whatsapp', {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as {
    accounts?: { _id?: string; id?: string; name?: string; username?: string; status?: string }[];
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(`Falha ao consultar contas na Zernio (HTTP ${response.status}): ${body.message ?? body.error ?? 'verifique sua ZERNIO_API_KEY'}`);
  }
  return body.accounts ?? [];
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list-accounts')) {
    const keyArg = args.find(arg => arg !== '--list-accounts') ?? process.env.ZERNIO_API_KEY;
    const apiKey = z.string().min(16, 'Informe ZERNIO_API_KEY no .env ou como argumento').parse(keyArg);
    console.info('Consultando contas de WhatsApp conectadas na Zernio (GET /v1/accounts?platform=whatsapp)...');
    const accounts = await listZernioAccounts(apiKey);
    if (!accounts.length) {
      console.info('Nenhuma conta de WhatsApp conectada encontrada nesta chave Zernio.');
      return;
    }
    for (const acc of accounts) {
      console.info(`  • ID: ${acc._id ?? acc.id} | Nome: ${acc.name ?? '-'} | Número: ${acc.username ?? '-'} | Status: ${acc.status ?? '-'}`);
    }
    return;
  }

  if (args.includes('--provision-templates')) {
    const positional = args.filter(arg => arg !== '--provision-templates');
    const runtime = positional.length >= 2
      ? whatsappRuntime({ ZERNIO_API_KEY: positional[0], ZERNIO_ACCOUNT_ID: positional[1] })
      : whatsappRuntime(process.env);
    if (!runtime.defaultAccount) {
      throw new Error('Defina ZERNIO_API_KEY e ZERNIO_ACCOUNT_ID no .env ou passe: pnpm whatsapp:verify-zernio <API_KEY> <ACCOUNT_ID> --provision-templates');
    }
    console.info(`Criando os 3 templates de utilidade na Zernio para a conta ${runtime.defaultAccount.accountId}...`);
    const created = await provisionZernioWhatsAppTemplates(runtime.defaultAccount);
    for (const tpl of created) {
      console.info(`  ✔ Template "${tpl.name}" enviado (status: ${tpl.status})`);
    }
    return;
  }

  if (args.length === 1 && process.env.ZERNIO_API_KEY) {
    const [toRaw] = args;
    const runtime = whatsappRuntime(process.env);
    const account = runtime.defaultAccount;
    if (!account) {
      throw new Error('Defina ZERNIO_API_KEY e ZERNIO_ACCOUNT_ID no .env.');
    }
    const to = phoneSchema.parse(toRaw);
    console.info(`[1/2] Verificando conta Zernio (${account.accountId})...`);
    await listZernioAccounts(account.apiKey);
    console.info('  ✔ API Key Zernio autenticada');

    console.info(`[2/2] Enviando mensagem de teste via Zernio WhatsApp para ***${to.slice(-2)}...`);
    const provider = new ZernioWhatsAppProvider(runtime);
    const result = await provider.send({
      tenantId: 'platform-verify',
      to,
      templateKey: 'booking.confirmation',
      parameters: ['Cliente Teste', 'Gentry Barber', '10/11/2026', '15:00 GMT-3'],
    });
    console.info(`  ✔ Mensagem enviada com sucesso (Zernio messageId: ${result.messageId})`);
    return;
  }

  const [apiKeyArg, accountIdArg, toArg, templateArg, langArg] = args;
  if (!apiKeyArg || !accountIdArg || !toArg) {
    console.error(
      [
        'Comandos disponíveis (Zernio WhatsApp API):',
        '',
        '1. Listar contas de WhatsApp conectadas na Zernio:',
        '   pnpm whatsapp:verify-zernio --list-accounts [ZERNIO_API_KEY]',
        '',
        '2. Criar/provisionar automaticamente os 3 templates (confirmação, lembrete 1h e barbeiro 15min):',
        '   pnpm whatsapp:verify-zernio --provision-templates',
        '   (ou: pnpm whatsapp:verify-zernio <ZERNIO_API_KEY> <ZERNIO_ACCOUNT_ID> --provision-templates)',
        '',
        '3. Enviar mensagem de teste (usando ZERNIO_API_KEY e ZERNIO_ACCOUNT_ID do .env):',
        '   pnpm whatsapp:verify-zernio <SEU_CELULAR_DESTINO_E164>',
        '',
        '4. Enviar mensagem de teste passando credenciais direto no comando:',
        '   pnpm whatsapp:verify-zernio <ZERNIO_API_KEY> <ZERNIO_ACCOUNT_ID> <TO_NUMBER_E164> [TEMPLATE_NAME] [LANGUAGE]',
      ].join('\n'),
    );
    process.exit(1);
  }

  const runtime = whatsappRuntime({
    ZERNIO_API_KEY: apiKeyArg,
    ZERNIO_ACCOUNT_ID: accountIdArg,
    ...(templateArg ? { ZERNIO_CONFIRMATION_TEMPLATE: templateArg } : {}),
    ...(langArg ? { ZERNIO_TEMPLATE_LANGUAGE: langArg } : {}),
  });
  const to = phoneSchema.parse(toArg);

  console.info(`[1/2] Verificando chave e conta Zernio (${accountIdArg})...`);
  await listZernioAccounts(apiKeyArg);
  console.info('  ✔ Conta Zernio verificada');

  console.info(`[2/2] Enviando mensagem de confirmação de teste para ***${to.slice(-2)}...`);
  const provider = new ZernioWhatsAppProvider(runtime);
  const result = await provider.send({
    tenantId: 'test',
    to,
    templateKey: 'booking.confirmation',
    parameters: ['Cliente Teste', 'Gentry Barber', '10/11/2026', '15:00 GMT-3'],
  });
  console.info(`  ✔ Mensagem enviada com sucesso (Zernio messageId: ${result.messageId})`);
}

await main();
