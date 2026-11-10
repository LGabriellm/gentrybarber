import { createDatabase } from '../packages/database/src/index.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não configurada no ambiente.');
  process.exit(1);
}

const db = createDatabase(process.env.DATABASE_URL);
const targetSlugOrId = process.argv[2]?.trim();

async function run() {
  console.log('--- Ativação da Automação de WhatsApp (Zernio) ---');

  // 1. Garantir que a feature 'whatsapp_automation' existe no catálogo de features
  const feature = await db.feature.upsert({
    where: { key: 'whatsapp_automation' },
    create: {
      id: 'feature-whatsapp_automation',
      key: 'whatsapp_automation',
      name: 'whatsapp automation',
    },
    update: {},
  });
  console.log(`[✓] Feature cadastrada: ${feature.key} (${feature.id})`);

  // 2. Habilitar a feature em todos os planos existentes
  const plans = await db.plan.findMany();
  if (plans.length === 0) {
    console.log('[!] Nenhum plano cadastrado no banco. Execute "pnpm access:init" para criar os planos padrão.');
  } else {
    for (const plan of plans) {
      await db.planFeature.upsert({
        where: {
          planId_featureId: {
            planId: plan.id,
            featureId: feature.id,
          },
        },
        create: {
          planId: plan.id,
          featureId: feature.id,
          enabled: true,
        },
        update: {
          enabled: true,
        },
      });
      console.log(`[✓] Plano "${plan.name}" (${plan.key}): whatsapp_automation habilitado.`);
    }
  }

  // 3. Se um tenant específico foi informado, criar/atualizar override para ele
  if (targetSlugOrId) {
    const tenant = await db.tenant.findFirst({
      where: {
        OR: [
          { id: targetSlugOrId },
          { slug: targetSlugOrId },
        ],
      },
    });
    if (!tenant) {
      console.warn(`[!] Barbearia "${targetSlugOrId}" não encontrada.`);
    } else {
      await db.tenantFeatureOverride.upsert({
        where: {
          tenantId_featureId: {
            tenantId: tenant.id,
            featureId: feature.id,
          },
        },
        create: {
          tenantId: tenant.id,
          featureId: feature.id,
          enabled: true,
          reason: 'Habilitação da automação de WhatsApp via CLI',
        },
        update: {
          enabled: true,
          expiresAt: null,
          reason: 'Habilitação da automação de WhatsApp via CLI',
        },
      });
      console.log(`[✓] Override para a barbearia "${tenant.name}" (${tenant.slug}): whatsapp_automation ativado.`);
    }
  }

  // 4. Verificar status de variáveis de ambiente do Zernio
  const apiKey = process.env.ZERNIO_API_KEY?.trim();
  const accountId = process.env.ZERNIO_ACCOUNT_ID?.trim();
  console.log('\n--- Diagnóstico de Credenciais Zernio ---');
  if (apiKey) {
    console.log(`[✓] ZERNIO_API_KEY configurada no ambiente (${apiKey.slice(0, 6)}...${apiKey.slice(-4)})`);
  } else {
    console.log('[!] ZERNIO_API_KEY NÃO definida no arquivo de ambiente (.env ou .env.production).');
    console.log('    Para permitir a conexão e os disparos, configure ZERNIO_API_KEY no servidor.');
  }

  if (accountId) {
    console.log(`[✓] ZERNIO_ACCOUNT_ID padrão configurado (${accountId})`);
  } else {
    console.log('[-] ZERNIO_ACCOUNT_ID padrão não definido. Cada barbearia poderá conectar sua própria conta no painel.');
  }

  // 5. Listar barbearias cadastradas e status do WhatsApp
  const tenants = await db.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: { select: { name: true, key: true } },
      zernioAccountId: true,
      zernioPhone: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\nBarbearias cadastradas (${tenants.length}):`);
  for (const t of tenants) {
    const connected = Boolean(t.zernioAccountId);
    console.log(
      ` - ${t.name} (slug: ${t.slug}) | Plano: ${t.plan?.name ?? 'Sem plano'} | Status: ${t.status} | WhatsApp: ${
        connected ? `Conectado (${t.zernioPhone ?? t.zernioAccountId})` : 'Aguardando conexão'
      }`
    );
  }

  console.log('\nConcluído com sucesso.');
}

run()
  .catch((err) => {
    console.error('Erro ao habilitar automação de WhatsApp:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
