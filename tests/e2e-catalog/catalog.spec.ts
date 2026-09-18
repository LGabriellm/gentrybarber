import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createDatabase } from '../../packages/database/src/index';
import { createAuth } from '../../packages/auth/src/index';
import { loadConfig } from '../../packages/config/src/index';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('An isolated test database is required.');
const db = createDatabase(databaseUrl);
const prefix = `catalog-e2e-${randomUUID()}`;
const password = `Test-${randomBytes(24).toString('hex')}`;
const email = `${prefix}@example.test`;
const tenantId = `${prefix}-tenant`;
const locationId = `${prefix}-location`;
let userId: string | undefined;
const ownedPermissionIds: string[] = [];
let sessionCookies: Awaited<ReturnType<ReturnType<Page['context']>['cookies']>> = [];

test.beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: 'test', DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), BETTER_AUTH_URL: 'http://127.0.0.1:4200',
    TRUSTED_ORIGINS: 'http://localhost:3201', REDIS_URL: 'redis://localhost:6379',
    SMTP_HOST: 'localhost', SMTP_FROM: 'Test <noreply@example.test>',
  });
  const auth = createAuth(db, config, { async send() { /* Verified fixture provisioning; no SMTP delivery in this suite. */ } });
  const account = await auth.api.signUpEmail({ body: { name: 'Pessoa de teste', email, password } });
  userId = account.user.id;
  await db.user.update({ where: { id: userId }, data: { emailVerified: true } });
  const features = await Promise.all(['booking', 'customers', 'whatsapp_automation', 'multi_location'].map(key => db.feature.upsert({ where: { key }, create: { key, name: key }, update: {} })));
  await db.plan.create({ data: { id: `${prefix}-plan`, key: `${prefix}-plan`, name: 'Plano de teste', features: { create: features.map(feature => ({ featureId: feature.id, enabled: true })) } } });
  await db.role.create({ data: { id: `${prefix}-role`, key: `${prefix}-role`, name: 'Gestão de teste' } });
  for (const key of ['team.manage', 'services.manage', 'professionals.manage', 'appointments.read', 'appointments.create', 'appointments.update', 'appointments.manage_all', 'schedules.manage', 'customers.read', 'customers.update']) {
    let permission = await db.permission.findUnique({ where: { key } });
    if (!permission) {
      permission = await db.permission.create({ data: { id: `${prefix}-${key}`, key, description: key } });
      ownedPermissionIds.push(permission.id);
    }
    await db.rolePermission.create({ data: { roleId: `${prefix}-role`, permissionId: permission.id } });
  }
  await db.tenant.create({ data: { id: tenantId, slug: prefix, name: 'Barbearia de teste', status: 'ACTIVE', planId: `${prefix}-plan` } });
  await db.location.create({ data: { id: locationId, tenantId, slug: 'centro', name: 'Unidade Centro' } });
  await db.membership.create({ data: { tenantId, userId, roleId: `${prefix}-role` } });
});

test.afterAll(async () => {
  await db.auditLog.deleteMany({ where: { tenantId } });
  await db.appointmentEvent.deleteMany({ where: { tenantId } });
  await db.appointmentService.deleteMany({ where: { tenantId } });
  await db.appointment.deleteMany({ where: { tenantId } });
  await db.professionalService.deleteMany({ where: { tenantId } });
  await db.professional.deleteMany({ where: { tenantId } });
  await db.service.deleteMany({ where: { tenantId } });
  await db.tenant.deleteMany({ where: { id: tenantId } });
  await db.role.deleteMany({ where: { id: `${prefix}-role` } });
  await db.permission.deleteMany({ where: { id: { in: ownedPermissionIds } } });
  await db.plan.deleteMany({ where: { id: `${prefix}-plan` } });
  if (userId) await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

async function login(page: Page) {
  if (sessionCookies.length) {
    await page.context().addCookies(sessionCookies);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Barbearia de teste', exact: true })).toBeVisible();
    return;
  }
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: false }).fill(password);
  await page.getByRole('button', { name: 'Entrar na plataforma' }).click();
  await expect(page.getByRole('heading', { name: 'Barbearia de teste', exact: true })).toBeVisible();
  sessionCookies = await page.context().cookies();
}


test('painel de uma barbearia e um profissional dispensa seleções e organiza as funções', async ({ page }, testInfo) => {
  const service = await db.service.create({ data: { tenantId, locationId, name: 'Corte individual', priceCents: 5000, durationMinutes: 30 } });
  const professional = await db.professional.create({ data: { tenantId, locationId, name: 'Profissional Solo' } });
  await db.professionalService.create({ data: { tenantId, locationId, professionalId: professional.id, serviceId: service.id } });
  try {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Seu dia a dia', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Configure sua barbearia', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dados da barbearia', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cadastro do profissional', exact: true })).toBeVisible();
    await page.getByLabel('O que você precisa fazer?').fill('servicos');
    await expect(page.getByRole('heading', { name: 'Serviços e preços', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dados da barbearia', exact: true })).toHaveCount(0);
    await page.getByLabel('O que você precisa fazer?').fill('inexistente123');
    await expect(page.getByRole('status')).toContainText('Nenhum atalho');
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();
    if (testInfo.project.name === 'mobile') {
      await expect(page.getByRole('navigation', { name: 'Navegação rápida' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Navegação rápida' }).getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('dashboard-solo.png'), fullPage: true });
    await page.getByRole('link', { name: /Abrir agenda/ }).click();
    await expect(page.getByLabel('Unidade da agenda')).toHaveCount(0);
    const initialDate = await page.getByLabel('Data da agenda').inputValue();
    await page.getByRole('button', { name: 'Próximo dia', exact: true }).click();
    await expect(page.getByLabel('Data da agenda')).not.toHaveValue(initialDate);
    await page.getByRole('button', { name: 'Hoje', exact: true }).click();
    await expect(page.getByLabel('Data da agenda')).toHaveValue(initialDate);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('agenda-mobile-refresh.png'), fullPage: true });
    await page.getByRole('button', { name: 'Novo agendamento', exact: true }).click();
    await page.getByRole('checkbox', { name: /Corte individual/ }).check();
    await expect(page.getByLabel('Profissional do agendamento')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Consultar horários', exact: true })).toBeEnabled();
    await page.goto(`/tenants/${prefix}/horarios`);
    await expect(page.getByRole('checkbox', { name: 'Usar o mesmo horário para a barbearia e Profissional Solo' })).toBeChecked();
    await expect(page.getByLabel('Unidade dos horários')).toHaveCount(0);
    await expect(page.getByLabel('Editar horários de')).toHaveCount(0);
    await expect(page.getByLabel('Bloquear para')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('schedule-solo.png'), fullPage: true });
  } finally {
    await db.professionalService.deleteMany({ where: { tenantId, professionalId: professional.id } });
    await db.professional.delete({ where: { id: professional.id } });
    await db.service.delete({ where: { id: service.id } });
  }
});

test('clientes: busca além dos primeiros 50, paginação, cadastro e edição persistidos', async ({ page }) => {
  await db.customer.createMany({ data: Array.from({ length: 51 }, (_, index) => ({ tenantId, name: `AAA Review ${String(index).padStart(3, '0')}`, phone: `+551198${String(index).padStart(6, '0')}` })) });
  await login(page); await page.goto(`/tenants/${prefix}/customers`);
  await expect(page.getByRole('heading', { name: 'AAA Review 050', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'AAA Review 050', exact: true })).toBeVisible();
  await page.getByLabel('Buscar cliente', { exact: true }).fill('AAA Review 050');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText('Página 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AAA Review 050', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Próxima', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Novo Cliente', exact: true }).click();
  await page.getByLabel('Nome do cliente', { exact: true }).fill('Cliente criado na revisão');
  await page.getByLabel('Celular', { exact: true }).fill('11998887766');
  await page.getByRole('button', { name: 'Salvar Cliente', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cliente cadastrado com sucesso.');
  await page.getByRole('button', { name: 'Editar Cliente criado na revisão', exact: true }).click();
  await page.getByLabel('Nome do cliente', { exact: true }).fill('Cliente editado na revisão');
  await page.getByRole('button', { name: 'Salvar Cliente', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cliente atualizado com sucesso.');
  await page.getByLabel('Buscar cliente', { exact: true }).fill('Cliente editado na revisão');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('button', { name: 'Recarregar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cliente editado na revisão', exact: true })).toBeVisible();
  expect(await db.customer.findFirst({ where: { tenantId, phone: '+5511998887766' } })).toMatchObject({ name: 'Cliente editado na revisão', version: 2 });
});

test('gestão de unidades pelo painel persiste alterações', async ({ page }, testInfo) => {
  await login(page);
  await page.goto(`/tenants/${prefix}/locations`);
  await page.getByRole('button', { name: 'Nova unidade', exact: true }).click();
  await page.getByLabel('Nome da Unidade', { exact: true }).fill('Unidade do navegador');
  await page.getByLabel('Cidade', { exact: true }).fill('Curitiba');
  await page.getByRole('checkbox', { name: 'Unidade ativa', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Salvar unidade', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Unidade cadastrada com sucesso');
  expect(await db.location.findFirst({ where: { tenantId, name: 'Unidade do navegador' } })).toMatchObject({ active: false, version: 1, address: { city: 'Curitiba', state: '' } });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unidade do navegador', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('locations.png'), fullPage: true });
});

test('login real, catálogo persistido e vínculo de profissional', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await page.goto(`/tenants/${prefix}/services`);
  await expect(page.getByRole('heading', { name: /Nenhum serviço cadastrado/ })).toBeVisible();
  await page.getByRole('button', { name: 'Novo serviço', exact: true }).click();
  await page.getByLabel('Nome do serviço', { exact: true }).fill('Corte de teste');
  await page.getByLabel('Preço (R$)').fill('49,90');
  await page.getByLabel('Duração (minutos)', { exact: true }).fill('30');
  await page.getByLabel('Descrição').fill('Descrição fictícia para validação');
  await page.getByRole('button', { name: 'Salvar serviço', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Serviço cadastrado com sucesso');
  const service = await db.service.findFirstOrThrow({ where: { tenantId, name: 'Corte de teste' } });
  expect(service.priceCents).toBe(4990);
  expect(service.locationId).toBe(locationId);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Corte de teste', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Desativar Corte de teste', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reativar Corte de teste', exact: true })).toBeVisible();
  expect((await db.service.findUniqueOrThrow({ where: { id: service.id } })).active).toBe(false);
  await page.getByRole('button', { name: 'Reativar Corte de teste', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Desativar Corte de teste', exact: true })).toBeVisible();
  await page.goto(`/tenants/${prefix}/professionals`);
  await page.getByRole('button', { name: 'Novo profissional', exact: true }).click();
  await page.getByLabel('Nome do profissional', { exact: true }).fill('Alex de teste');
  await page.getByLabel('Bio').fill('Apresentação fictícia da equipe');
  await page.getByRole('checkbox', { name: 'Corte de teste', exact: true }).check();
  await page.getByRole('button', { name: 'Salvar profissional', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Profissional cadastrado com sucesso');
  const professional = await db.professional.findFirstOrThrow({ where: { tenantId, name: 'Alex de teste' }, include: { services: true } });
  expect(professional.services.map(link => link.serviceId)).toEqual([service.id]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Alex de teste', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('catalog-professionals.png'), fullPage: true });
});

test('conflito de edição preserva a atualização concorrente', async ({ page }) => {
  const record = await db.service.create({ data: { tenantId, locationId, name: 'Serviço concorrente', durationMinutes: 20, priceCents: 2500 } });
  await login(page);
  await page.goto(`/tenants/${prefix}/services`);
  await page.getByRole('button', { name: 'Editar Serviço concorrente', exact: true }).click();
  await page.getByLabel('Preço (R$)').fill('29,90');
  await db.service.update({ where: { id: record.id }, data: { priceCents: 3500, version: { increment: 1 } } });
  await page.getByRole('button', { name: 'Salvar serviço', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'alterado por outra pessoa' })).toBeVisible();
  expect((await db.service.findUniqueOrThrow({ where: { id: record.id } })).priceCents).toBe(3500);
  await page.getByRole('button', { name: 'Recarregar e descartar formulário' }).click();
  await expect(page.getByRole('status')).toContainText('Dados atualizados');
  await page.getByRole('button', { name: 'Editar Serviço concorrente', exact: true }).click();
  await expect(page.getByLabel('Preço (R$)')).toHaveValue('35,00');
});

test('horários, cliente, confirmação recuperada, reagendamento e bloqueio', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const location = await db.location.create({ data: { tenantId, slug: 'agenda', name: 'Unidade Agenda', timezone: 'America/Sao_Paulo' } });
  const service = await db.service.create({ data: { tenantId, locationId: location.id, name: 'Corte da agenda', durationMinutes: 30, priceCents: 6200 } });
  const professional = await db.professional.create({ data: { tenantId, locationId: location.id, name: 'Sam da agenda' } });
  await db.professionalService.create({ data: { tenantId, locationId: location.id, professionalId: professional.id, serviceId: service.id } });
  const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  await login(page);
  await page.getByRole('link', { name: /Horários e pausas/ }).click();
  await page.getByLabel('Unidade dos horários').selectOption(location.id);
  await page.getByRole('button', { name: 'Recarregar horários', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Horários e bloqueios atualizados');
  await expect(page.getByLabel('Editar horários de')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /Usar o mesmo horário/ })).toBeChecked();
  {
    await page.getByRole('button', { name: 'Adicionar intervalo' }).click();
    await page.getByLabel('Dia do intervalo 1').selectOption(String(weekday));
    await page.getByLabel('Início do intervalo 1', { exact: true }).fill('09:00');
    await page.getByLabel('Fim do intervalo 1', { exact: true }).fill('12:00');
    await page.getByRole('button', { name: 'Salvar horários', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Horários semanais salvos');
  }
  expect(await db.businessHour.count({ where: { tenantId, locationId: location.id } })).toBe(1);
  expect(await db.professionalSchedule.count({ where: { tenantId, professionalId: professional.id } })).toBe(1);
  await page.goto(`/tenants/${prefix}/agenda`);
  await page.getByLabel('Unidade da agenda').selectOption(location.id);
  await page.getByLabel('Data da agenda', { exact: true }).fill(date);
  await page.getByRole('button', { name: 'Recarregar agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Novo agendamento', exact: true }).click();
  await page.getByRole('checkbox', { name: /Corte da agenda/ }).check();
  await expect(page.getByLabel('Profissional do agendamento')).toHaveCount(0);
  await page.getByRole('button', { name: 'Consultar horários', exact: true }).click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.getByLabel('Nome do cliente', { exact: true }).fill('Cliente da agenda');
  const phone = `+55119${String(BigInt(`0x${randomBytes(6).toString('hex')}`) % 100_000_000n).padStart(8, '0')}`;
  await page.getByLabel('Telefone do cliente').fill(phone.slice(3));
  await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
  await expect(page.getByText('Cliente selecionado: Cliente da agenda', { exact: true })).toBeVisible();
  // The server commits successfully, but the first response never reaches the UI.
  await page.route(`**/api/operations/${prefix}/appointments`, async route => {
    await route.fetch();
    await route.abort('failed');
  }, { times: 1 });
  await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'A resposta não chegou' })).toBeVisible();
  expect(await db.appointment.count({ where: { tenantId, locationId: location.id } })).toBe(1);
  await page.getByRole('button', { name: 'Tentar confirmar novamente', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Agendamento salvo e agenda atualizada');
  const booked = await db.appointment.findFirstOrThrow({ where: { tenantId, locationId: location.id }, include: { services: true } });
  expect(booked).toMatchObject({ status: 'CONFIRMED', totalCents: 6200 });
  await page.getByLabel('Buscar na agenda').fill('ninguem123');
  await expect(page.getByRole('heading', { name: 'Nenhum atendimento com estes filtros.' })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await page.getByLabel('Situação', { exact: true }).selectOption('COMPLETED');
  await expect(page.getByRole('heading', { name: 'Nenhum atendimento com estes filtros.' })).toBeVisible();
  await page.getByLabel('Situação', { exact: true }).selectOption('CONFIRMED');
  await expect(page.getByRole('article', { name: 'Atendimento de Cliente da agenda', exact: true })).toBeVisible();
  expect(booked.services).toEqual([expect.objectContaining({ serviceId: service.id, priceCents: 6200, durationMinutes: 30 })]);
  expect(await db.appointment.count({ where: { tenantId, locationId: location.id } })).toBe(1);
  await page.reload();
  await page.getByLabel('Data da agenda', { exact: true }).fill(date);
  await page.getByRole('button', { name: 'Recarregar agenda', exact: true }).click();
  await expect(page.getByRole('heading', { name: date.split('-').reverse().join('/'), exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reagendar Cliente da agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar novos horários' }).click();
  await page.getByRole('radio').nth(2).check();
  await page.getByRole('button', { name: 'Confirmar reagendamento', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Agendamento salvo e agenda atualizada');
  const moved = await db.appointment.findUniqueOrThrow({ where: { id: booked.id } });
  expect(moved.startsAt.toISOString()).not.toBe(booked.startsAt.toISOString());
  expect(moved.totalCents).toBe(6200);
  page.once('dialog', dialog => void dialog.accept('Cancelamento solicitado no teste'));
  await page.getByRole('button', { name: 'Cancelar para Cliente da agenda', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Atendimento atualizado: Cancelado');
  expect((await db.appointment.findUniqueOrThrow({ where: { id: booked.id } })).status).toBe('CANCELED');
  expect(await db.appointmentEvent.count({ where: { tenantId, appointmentId: booked.id } })).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('booking-agenda.png'), fullPage: true });
  await page.goto(`/tenants/${prefix}/horarios`);
  await page.getByLabel('Início do bloqueio').fill(`${date}T09:00`);
  await page.getByLabel('Fim do bloqueio').fill(`${date}T10:00`);
  await page.getByLabel('Motivo do bloqueio').fill('Pausa de teste');
  await page.getByRole('button', { name: 'Salvar bloqueio', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Bloqueio cadastrado');
  expect(await db.timeOff.count({ where: { tenantId, locationId: location.id } })).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('booking-schedule.png'), fullPage: true });
  await page.getByRole('button', { name: /Remover bloqueio de Sam da agenda/ }).click();
  await expect(page.getByRole('status')).toContainText('Bloqueio removido');
  expect(await db.timeOff.count({ where: { tenantId, locationId: location.id } })).toBe(0);
  expect(errors).toEqual([]);
});

test('menu mantém Dados da barbearia entre abas e não oferece edição do site', async ({ page }) => {
  await login(page);
  for (const route of ['agenda', 'customers', 'horarios', 'services', 'professionals', 'locations']) {
    await page.goto(`/tenants/${prefix}/${route}`);
    const nav = page.getByRole('navigation', { name: 'Gestão da barbearia', exact: true });
    await expect(nav.getByRole('link', { name: 'Dados da barbearia', exact: true })).toBeVisible();
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', `/tenants/${prefix}/${route}`);
    await expect(page.locator('a[href$="/website"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto(`/tenants/${prefix}/website`);
  await expect(page).toHaveURL(new RegExp(`tenant=${prefix}`));
  await expect(page.locator('a[href$="/website"]')).toHaveCount(0);
});

test('editar cidade preserva endereço completo da barbearia', async ({ page }) => {
  await db.location.update({ where: { id: locationId }, data: { address: { street: 'Rua de teste', address: 'Número 42', city: 'Curitiba', state: 'PR', country: 'BR' } } });
  await login(page);
  await page.goto(`/tenants/${prefix}/locations`);
  await page.getByRole('button', { name: 'Editar Unidade Centro', exact: true }).click();
  await page.getByLabel('Cidade', { exact: true }).fill('Londrina');
  await page.getByRole('button', { name: 'Salvar unidade', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Unidade atualizada com sucesso');
  expect(await db.location.findUnique({ where: { id: locationId } })).toMatchObject({ address: { street: 'Rua de teste', address: 'Número 42', city: 'Londrina', state: 'PR', country: 'BR' } });
});
