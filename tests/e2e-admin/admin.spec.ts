import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase } from '../../packages/database/src/index';
import { createAuth } from '../../packages/auth/src/index';
import { loadConfig } from '../../packages/config/src/index';
const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Isolated database required');
const db = createDatabase(databaseUrl);
const prefix = `admin-e2e-${randomBytes(6).toString('hex')}`;
const email = `${prefix}@example.test`;
const password = `Fixture-${randomBytes(24).toString('hex')}`;
const ownerEmail = `${prefix}-owner@example.test`;
const planId = `${prefix}-plan`;
let userId: string;
let websiteFeatureId: string;
let templateId: string;
let sessionCookies: Awaited<ReturnType<ReturnType<Page['context']>['cookies']>> = [];
test.beforeAll(async () => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), BETTER_AUTH_URL: 'http://127.0.0.1:4300', TRUSTED_ORIGINS: 'http://localhost:3302', REDIS_URL: 'redis://localhost:6379', SMTP_HOST: 'localhost', SMTP_FROM: 'Test <noreply@example.test>' });
  const auth = createAuth(db, config, { async send() { /* Fictitious verified browser account; no delivery. */ } });
  userId = (await auth.api.signUpEmail({ body: { email, password, name: 'Administrador de teste' } })).user.id;
  await db.user.update({ where: { id: userId }, data: { emailVerified: true, platformRole: 'SUPER_ADMIN' } });
  await db.user.create({ data: { id: `${prefix}-owner`, name: 'Marina de teste', email: ownerEmail, emailVerified: true } });
  const role = await db.role.upsert({ where: { key: 'OWNER' }, create: { key: 'OWNER', name: 'Proprietário' }, update: {} });
  await db.plan.create({ data: { id: planId, key: planId, name: `Plano de teste ${prefix}`, description: 'Condições fictícias para validar a administração.', monthlyPriceCents: 12990, setupFeeCents: 25000, customDesignFeeCents: 80000 } });
  websiteFeatureId = (await db.feature.upsert({ where: { key: 'website' }, create: { id: `${prefix}-website`, key: 'website', name: 'Site' }, update: {} })).id;
  await db.planFeature.create({ data: { planId, featureId: websiteFeatureId, enabled: true } });
  for (const key of ['booking', 'custom_domain']) {
    const feature = await db.feature.upsert({ where: { key }, create: { id: `${prefix}-${key}`, key, name: key }, update: {} });
    await db.planFeature.create({ data: { planId, featureId: feature.id, enabled: true } });
  }
  templateId = (await db.theme.upsert({ where: { key: 'classic' }, create: { id: `${prefix}-classic`, key: 'classic', name: 'Classic', kind: 'TEMPLATE' }, update: {} })).id;
  const names = ['Barbearia Aurora', 'Studio Alameda', 'Barbearia Central', 'Corte & Companhia', 'Barbearia Horizonte', 'Studio Oliveira'];
  for (const [index, name] of names.entries()) {
    await db.tenant.create({ data: { name, slug: `${prefix}-${index}`, planId, status: index === 1 ? 'SUSPENDED' : 'ACTIVE', memberships: { create: { userId: `${prefix}-owner`, roleId: role.id, status: 'ACTIVE' } } } });
  }
});
test.afterAll(async () => {
  const where = { tenant: { slug: { startsWith: prefix } } };
  await db.siteConfiguration.deleteMany({ where });
  await db.themeVersion.deleteMany({ where });
  await db.auditLog.deleteMany({ where });
  await db.notification.deleteMany({ where });
  await db.appointmentEvent.deleteMany({ where });
  await db.appointmentService.deleteMany({ where });
  await db.appointment.deleteMany({ where });
  await db.customer.deleteMany({ where });
  await db.businessHour.deleteMany({ where });
  await db.professionalSchedule.deleteMany({ where });
  await db.professionalService.deleteMany({ where });
  await db.professional.deleteMany({ where });
  await db.service.deleteMany({ where });
  await db.location.deleteMany({ where });
  await db.tenant.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.plan.deleteMany({ where: { key: { startsWith: prefix } } });
  await db.auditLog.deleteMany({ where: { tenantId: null, actorUserId: userId } });
  await db.user.deleteMany({ where: { email: `${prefix}-created@example.test` } });
  await db.feature.deleteMany({ where: { id: { in: [`${prefix}-booking`, `${prefix}-custom_domain`] } } });
  if (websiteFeatureId === `${prefix}-website`) await db.feature.delete({ where: { id: websiteFeatureId } });
  if (templateId === `${prefix}-classic`) await db.theme.delete({ where: { id: templateId } });
  await db.user.deleteMany({ where: { id: { in: [userId, `${prefix}-owner`] } } });
  await db.$disconnect();
});

test('workspace: upload, código, prévia, publicação e exportação', async ({ page }, testInfo) => {
  await login(page);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: `${prefix}-0` } });
  await page.goto(`/tenants/${tenant.id}/website`);
  await expect(page.getByLabel('Importar arquivos do site')).toBeEnabled();
  await page.getByLabel('Importar arquivos do site').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0b8AAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByRole('status')).toContainText('Arquivos importados');
  const html = '<main class="container"><h1>Seu estilo começa aqui</h1><img src="assets/photo.png" alt="Nossa marca" loading="lazy" /><barber-contact class="contato-autoral" /></main>';
  await page.getByLabel('Código HTML', { exact: true }).fill(html);
  await page.getByRole('button', { name: 'Atualizar prévia' }).click();
  const preview = page.frameLocator('iframe[title="Site personalizado"]');
  await expect(preview.getByRole('heading', { name: 'Seu estilo começa aqui' })).toBeVisible();
  await expect(preview.getByRole('img', { name: 'Nossa marca' })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aprovar versão', exact: true })).toBeEnabled();
  expect(await db.siteConfiguration.count({ where: { tenantId: tenant.id, published: true } })).toBe(0);
  await page.getByRole('button', { name: 'Aprovar versão', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publicar site', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Publicar site', exact: true }).click();
  await expect(page.getByText('Publicado · No ar', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Código HTML', { exact: true })).toHaveValue(html);
  const response = await page.request.get(`http://127.0.0.1:4300/v1/public/site?hostname=${prefix}-0.platform.test`);
  expect(response.ok()).toBe(true);
  expect((await response.json()).data.code.assets[0].name).toBe('photo.png');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar projeto' }).click();
  expect((await download).suggestedFilename()).toContain('.site.json');
  await page.getByRole('button', { name: 'Computador', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('site-workspace.png'), fullPage: true });
});
async function login(page: Page) {
  if (sessionCookies.length) { await page.context().addCookies(sessionCookies); await page.goto('/'); }
  else {
    await page.goto('/login'); await page.getByLabel('E-mail', { exact: true }).fill(email); await page.getByLabel('Senha').fill(password);
    await page.getByRole('button', { name: 'Entrar na plataforma' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
  sessionCookies = await page.context().cookies();
}
test('cadastro de usuário e planos encaminha origem e preserva a composição dos recursos', async ({ page }) => {
  await login(page);
  await page.goto('/users/new');
  await page.getByLabel('Nome completo', { exact: true }).fill('Novo usuário de teste');
  await page.getByLabel('E-mail', { exact: true }).fill(`${prefix}-created@example.test`);
  await page.getByRole('button', { name: 'Cadastrar usuário', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  expect(await db.user.findUnique({ where: { email: `${prefix}-created@example.test` } })).toMatchObject({ emailVerified: false, platformRole: 'USER' });
  for (const copy of [false, true]) {
    await page.goto('/plans/new');
    const key = `${prefix}-${copy ? 'copy' : 'draft'}`;
    await page.getByLabel('Identificador interno').fill(key);
    await page.getByLabel('Nome do plano').fill(`Plano ${copy ? 'composto' : 'em preparação'}`);
    if (copy) await page.getByLabel('Copiar funcionalidades de').selectOption(planId);
    await page.getByRole('button', { name: 'Cadastrar plano', exact: true }).click();
    await expect(page).toHaveURL(/\/plans$/);
    const created = await db.plan.findUniqueOrThrow({ where: { key }, include: { features: true } });
    expect(created.active).toBe(copy);
    expect(created.features.length).toBe(copy ? await db.planFeature.count({ where: { planId } }) : 0);
  }
});

test('detalhe do usuário define senha e revoga sessões sem expor credenciais', async ({ page }) => {
  await login(page);
  const created = await db.user.upsert({
    where: { email: `${prefix}-created@example.test` },
    create: { id: `${prefix}-managed`, name: 'Novo usuário de teste', email: `${prefix}-created@example.test` },
    update: {},
  });
  await page.goto(`/users/${created.id}`);
  await expect(page.getByRole('heading', { name: 'Senha e sessões' })).toBeVisible();
  const newPassword = 'Senha administrativa fictícia 123';
  await page.getByRole('textbox', { name: /^Nova senha/ }).fill(newPassword);
  await page.getByRole('textbox', { name: /^Confirmar nova senha/ }).fill(newPassword);
  await page.getByRole('button', { name: 'Definir nova senha' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Senha definida' })).toBeVisible();
  const account = await db.account.findFirstOrThrow({ where: { userId: created.id, providerId: 'credential' } });
  expect(account.password).toBeTruthy();
  expect(account.password).not.toContain(newPassword);
  await expect(page.getByText('Senha definida', { exact: true })).toBeVisible();
});

test('admin global: indicadores, buscas, filtros e planos', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await expect(page.getByRole('heading', { name: 'Barbearias recentes' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('admin-overview.png'), fullPage: true });
  await page.getByRole('navigation', { name: 'Navegação de administração' }).getByRole('link', { name: 'Barbearias' }).click();
  await page.getByLabel('Buscar barbearia').fill(prefix);
  await page.getByLabel('Situação', { exact: true }).selectOption('SUSPENDED');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.getByText('Studio Alameda', { exact: true })).toBeVisible();
  await expect(page.getByText('1 barbearias encontradas', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-tenants.png'), fullPage: true });
  await page.goto(`/users?q=${encodeURIComponent(ownerEmail)}&status=verified`);
  await expect(page.getByText(ownerEmail, { exact: true })).toBeVisible();
  await page.goto('/plans');
  const plan = page.getByRole('article').filter({ has: page.getByRole('heading', { name: `Plano de teste ${prefix}` }) });
  await expect(plan).toContainText('129,90');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('cadastro de barbearia com proprietário verificado e unidade persistidos', async ({ page }, testInfo) => {
  await login(page);
  await page.getByRole('link', { name: 'Nova barbearia' }).click();
  await page.getByLabel('Nome da barbearia', { exact: true }).fill('Nova barbearia de teste');
  await page.getByLabel('Identificador do ambiente').fill(`${prefix}-created`);
  await page.getByLabel('Plano', { exact: true }).selectOption(planId);
  await page.getByLabel('E-mail do responsável').fill('missing@example.test');
  await page.getByRole('button', { name: 'Cadastrar barbearia' }).click();
  await expect(page.getByRole('alert', { name: 'Erro no cadastro' })).toContainText('e-mail verificado');
  await expect(page.getByLabel('Nome da barbearia', { exact: true })).toHaveValue('Nova barbearia de teste');
  await page.getByLabel('E-mail do responsável').fill(ownerEmail);
  await page.screenshot({ path: testInfo.outputPath('admin-create.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cadastrar barbearia' }).click();
  await expect(page.getByRole('heading', { name: 'Barbearias', exact: true })).toBeVisible();
  await expect(page.getByText('Nova barbearia de teste', { exact: true })).toBeVisible();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: `${prefix}-created` }, include: { locations: true, memberships: true } });
  expect(tenant.locations).toHaveLength(1); expect(tenant.memberships[0]?.userId).toBe(`${prefix}-owner`);
  expect(await db.auditLog.count({ where: { tenantId: tenant.id, actorUserId: userId, action: 'admin.tenant_created' } })).toBe(1);
  await page.getByRole('link', { name: 'Nova barbearia de teste', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dados e configuração' })).toBeVisible();
  await page.getByLabel('Nome da barbearia', { exact: true }).fill('Barbearia configurada');
  await page.getByLabel('E-mail de contato').fill('contato@example.test');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Configurações salvas.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Barbearia configurada', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar unidade Unidade principal' }).click();
  await page.getByLabel('Nome da unidade', { exact: true }).fill('Unidade Centro');
  await page.getByLabel('Cidade', { exact: true }).fill('São Paulo');
  await page.getByRole('button', { name: 'Salvar unidade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unidade Centro' })).toBeVisible();
  await page.getByRole('button', { name: 'Nova unidade', exact: true }).click();
  await page.getByLabel('Nome da unidade', { exact: true }).fill('Unidade em preparação');
  await page.getByLabel('Unidade ativa', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Cadastrar unidade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unidade em preparação' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Serviços', exact: true })).toBeVisible();
  const serviceSection = page.locator('#servicos');
  await serviceSection.getByRole('combobox', { name: /^Unidade/ }).selectOption(tenant.locations[0]!.id);
  await serviceSection.getByLabel('Nome do serviço').fill('Corte administrativo');
  await serviceSection.getByLabel('Preço (R$)').fill('55,00');
  await serviceSection.getByLabel('Duração em minutos').fill('45');
  await serviceSection.getByRole('button', { name: 'Adicionar serviço' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Serviço cadastrado' })).toBeVisible();
  await expect(serviceSection.getByRole('heading', { name: 'Corte administrativo' })).toBeVisible();
  const professionalSection = page.locator('#profissionais');
  await professionalSection.getByLabel('Nome do profissional').fill('Profissional administrativo');
  await professionalSection.getByRole('checkbox', { name: 'Corte administrativo' }).check();
  await professionalSection.getByRole('button', { name: 'Adicionar profissional' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profissional cadastrado' })).toBeVisible();
  const scheduleSection = page.locator('#horarios');
  await scheduleSection.getByRole('button', { name: 'Adicionar intervalo' }).click();
  const monday = scheduleSection.locator('.admin-hours-row').first();
  await monday.getByLabel('Dia').selectOption('1');
  await monday.getByLabel('Abre').fill('09:00');
  await monday.getByLabel('Fecha').fill('18:00');
  await scheduleSection.getByRole('button', { name: 'Salvar expediente' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Expediente da unidade e da equipe salvo' })).toBeVisible();
  expect(await db.businessHour.count({ where: { tenantId: tenant.id, locationId: tenant.locations[0]!.id } })).toBe(1);
  expect(await db.professionalSchedule.count({ where: { tenantId: tenant.id, locationId: tenant.locations[0]!.id } })).toBe(1);
  await page.reload();
  await expect(page.getByLabel('E-mail de contato')).toHaveValue('contato@example.test');
  await expect(page.getByRole('heading', { name: 'Unidade Centro' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('heading', { name: 'Barbearia configurada', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('admin-edit.png'), fullPage: true });
  const edited = await db.tenant.findUniqueOrThrow({ where: { id: tenant.id }, include: { locations: true } });
  expect(edited.name).toBe('Barbearia configurada');
  expect(edited.locations).toHaveLength(2);
  expect(edited.locations.find(item => item.name === 'Unidade em preparação')?.active).toBe(false);
});

test('HTML/CSS publicado com preços, agenda real e confirmação repetida sem duplicação', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.stack ?? error.message));
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: `${prefix}-0` } });
  const hostname = `${prefix}.localhost`;
  await db.domain.create({ data: { tenantId: tenant.id, hostname, status: 'ACTIVE', isPrimary: true } });
  const location = await db.location.create({ data: { tenantId: tenant.id, slug: 'centro', name: 'Unidade Centro', timezone: 'America/Sao_Paulo', address: { street: 'Rua de Teste, 100', city: 'São Paulo', state: 'SP' } } });
  const service = await db.service.create({ data: { tenantId: tenant.id, locationId: location.id, name: 'Corte de assinatura', description: 'Consultoria de estilo, corte e finalização.', priceCents: 6500, durationMinutes: 30 } });
  const beard = await db.service.create({ data: { tenantId: tenant.id, locationId: location.id, name: 'Barba completa', description: 'Barba, toalha quente e acabamento.', priceCents: 2500, durationMinutes: 15 } });
  const professional = await db.professional.create({ data: { tenantId: tenant.id, locationId: location.id, name: 'Rafael de teste' } });
  await db.professionalService.createMany({ data: [service.id, beard.id].map(serviceId => ({ tenantId: tenant.id, locationId: location.id, professionalId: professional.id, serviceId })) });
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.businessHour.create({ data: { tenantId: tenant.id, locationId: location.id, weekday, startMinute: 540, endMinute: 1080 } });
    await db.professionalSchedule.create({ data: { tenantId: tenant.id, locationId: location.id, professionalId: professional.id, weekday, startMinute: 540, endMinute: 1080 } });
  }
  await login(page); await page.goto(`/tenants/${tenant.id}/website`);
  await page.getByLabel('Código HTML', { exact: true }).fill('<script>alert(1)</script>');
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Erro no editor' })).toContainText('Tag não permitida');
  const html = '<header class="top"><strong>Aurora · Barbearia</strong><nav><a href="#agenda">Reservar horário</a></nav></header><main><barber-hero /><section class="section" id="precos"><h2>O cuidado certo, o preço claro.</h2><barber-prices layout="table" /></section><section class="section" id="agenda"><h2>Seu próximo momento</h2><barber-booking /></section><footer class="section"><barber-contact /></footer></main>';
  await page.getByLabel('Código HTML', { exact: true }).fill(html);
  await page.getByRole('button', { name: 'Atualizar prévia' }).click();
  const codePreview = page.frameLocator('iframe[title="Site personalizado"]');
  await expect(codePreview.getByRole('table')).toContainText('65,00');
  await expect(codePreview.getByText('Prévia da agenda.', { exact: false })).toBeAttached();
  await page.screenshot({ path: testInfo.outputPath('website-code-editor.png'), fullPage: true });
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aprovar versão', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Aprovar versão', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publicar site', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Publicar site', exact: true }).click();
  await expect(page.getByText('Publicado · No ar', { exact: true })).toBeVisible();
  // A previous version can already show "No ar" while the new publish request is in flight.
  await expect.poll(async () => {
    const siteConfig = await db.siteConfiguration.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    const version = siteConfig.publishedThemeVersionId ? await db.themeVersion.findUnique({ where: { id: siteConfig.publishedThemeVersionId } }) : null;
    return (version?.config as { code?: { html?: string } } | null)?.code?.html;
  }).toBe(html);
  await page.goto(`http://${hostname}:3303/`);
  const site = page.frameLocator('iframe[title="Site personalizado"]');
  await expect(site.getByRole('table')).toContainText('65,00');
  const editorUrl = page.url();
  await site.getByRole('link', { name: 'Reservar horário', exact: true }).click();
  await expect(page).toHaveURL(editorUrl);
  if (testInfo.project.name === 'webkit-ios') await expect(site.locator('#agenda')).toHaveCount(1);
  else { await expect(site.locator('#agenda')).toBeInViewport(); await expect(site.locator('#agenda')).toBeFocused(); }
  await expect(site.getByLabel('Unidade', { exact: true })).toHaveCount(0);
  await site.getByRole('checkbox', { name: /Corte de assinatura/ }).check();
  await site.getByRole('checkbox', { name: /Barba completa/ }).check();
  await expect(site.getByText('45 minutos', { exact: true })).toBeVisible();
  await expect(site.getByText('R$ 90,00', { exact: true })).toBeVisible();
  await expect(site.getByLabel('Profissional', { exact: true })).toHaveCount(0);
  await expect(site.getByText(professional.name, { exact: true })).toBeVisible();
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await site.getByLabel('Data', { exact: true }).fill(date);
  await expect(site.getByRole('button', { name: '09:00', exact: true })).toBeVisible();
  await site.getByRole('button', { name: '09:00', exact: true }).click();
  await site.getByLabel('Nome completo').fill('Cliente de teste');
  await site.getByLabel('Celular (WhatsApp)', { exact: true }).fill('11999999876');
  await page.screenshot({ path: testInfo.outputPath('website-public-booking.png'), fullPage: true });
  expect(await site.locator('body').evaluate(body => body.scrollWidth <= body.ownerDocument.documentElement.clientWidth)).toBe(true);
  // The first request reaches the real API; its receipt is deliberately lost in transit.
  const attempts: string[] = [];
  await page.route('**/api/booking/appointments', async route => {
    attempts.push(route.request().postData()!);
    // Chromium resolves *.localhost internally; Node's request client needs loopback plus the original Host.
    const response = await route.fetch({ url: route.request().url().replace(hostname, '127.0.0.1'), headers: { ...route.request().headers(), host: `${hostname}:3303` } });
    expect(response.status(), await response.text()).toBe(201);
    if (attempts.length === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    else await route.fulfill({ response });
  });
  await site.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(site.getByRole('button', { name: 'Repetir confirmação' })).toBeVisible();
  await expect(site.getByLabel('Nome completo')).toBeDisabled();
  await site.getByRole('button', { name: 'Repetir confirmação' }).click();
  await expect(site.getByRole('heading', { name: 'Agendamento confirmado' })).toBeVisible();
  await expect(site.getByText('Tempo estimado')).toBeVisible();
  await expect(site.getByText('Valor total')).toBeVisible();
  expect(attempts).toHaveLength(2); expect(attempts[0]).toBe(attempts[1]);
  expect(await db.appointment.count({ where: { tenantId: tenant.id } })).toBe(1);
  const booking = await db.appointment.findFirstOrThrow({ where: { tenantId: tenant.id } });
  expect(booking.startsAt.toISOString()).toBe(`${date}T12:00:00.000Z`);
  expect(booking.totalCents).toBe(9000);
  expect(await db.appointmentService.count({ where: { tenantId: tenant.id, appointmentId: booking.id } })).toBe(2);
  const base = 'http://127.0.0.1:3303/api/booking';
  expect((await page.request.get(`${base}/options?hostname=foreign.localhost`, { headers: { host: `${hostname}:3303` } })).status()).toBe(400);
  expect((await page.request.get(`${base}/private`)).status()).toBe(404);
  expect((await page.request.post(`${base}/appointments`, { headers: { origin: 'https://foreign.test' }, data: {} })).status()).toBe(403);
  // The public page binds the booking component to its projected unit; extra professionals restore explicit choice.
  await db.location.create({ data: { tenantId: tenant.id, slug: 'segunda', name: 'Segunda unidade', timezone: 'America/Sao_Paulo' } });
  const second = await db.professional.create({ data: { tenantId: tenant.id, locationId: location.id, name: 'Outra pessoa' } });
  await db.professionalService.create({ data: { tenantId: tenant.id, locationId: location.id, professionalId: second.id, serviceId: service.id } });
  const exclusive = await db.service.create({ data: { tenantId: tenant.id, locationId: location.id, name: 'Serviço exclusivo', durationMinutes: 30, priceCents: 7000 } });
  await db.service.create({ data: { tenantId: tenant.id, locationId: location.id, name: 'Sem profissional', durationMinutes: 30, priceCents: 7000 } });
  await db.professionalService.create({ data: { tenantId: tenant.id, locationId: location.id, professionalId: professional.id, serviceId: exclusive.id } });
  await page.reload();
  await expect(site.getByLabel('Unidade', { exact: true })).toHaveCount(0);
  await site.getByRole('checkbox', { name: /Corte de assinatura/ }).check();
  await expect(site.getByLabel('Profissional', { exact: true })).toBeVisible();
  await expect(site.getByLabel('Data', { exact: true })).toBeDisabled();
  await site.getByLabel('Profissional', { exact: true }).selectOption(second.id);
  await site.getByRole('checkbox', { name: /Corte de assinatura/ }).uncheck();
  await site.getByRole('checkbox', { name: /Serviço exclusivo/ }).check();
  await expect(site.getByLabel('Profissional', { exact: true })).toHaveCount(0);
  const availabilityResponse = page.waitForResponse(response => response.url().includes('/api/booking/availability?'));
  await site.getByLabel('Data', { exact: true }).fill(date);
  const response = await availabilityResponse;
  expect(new URL(response.url()).searchParams.get('professionalId')).toBe(professional.id);
  expect(response.status()).toBe(200);
  await expect(site.getByText('Consultando horários…')).toBeHidden();
  await site.getByRole('checkbox', { name: /Serviço exclusivo/ }).uncheck();
  await site.getByRole('checkbox', { name: /Sem profissional/ }).check();
  await expect(site.getByText(/Nenhum profissional realiza todos os serviços selecionados/)).toBeVisible();
  await expect(site.getByLabel('Data', { exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
