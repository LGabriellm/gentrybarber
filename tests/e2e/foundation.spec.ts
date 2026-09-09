import { expect, test } from '@playwright/test';

test('a demonstração mostra três identidades diferentes e não permite indexação', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/preview/classic');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/O seu estilo/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.getByRole('navigation', { name: 'Temas de demonstração' }).getByRole('link', { name: 'Urban', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/O seu estilo/);
  await expect(page.locator('body')).toContainText('Studio Barber');
  await page.getByRole('navigation', { name: 'Temas de demonstração' }).getByRole('link', { name: 'Imperial', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/A elegância está/);
  await expect(page.locator('body')).toContainText('Imperial Barbearia');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('login acessível, recuperação e mensagens de falha reais', async ({ page }) => {
  await page.goto('http://localhost:3101/login');
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await page.getByLabel('E-mail').fill('owner@example.test');
  await page.getByLabel('Senha', { exact: false }).fill('password-for-ui-test');
  await page.route('**/api/auth/sign-in/email', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"UNAUTHENTICATED"}' }));
  await page.getByRole('button', { name: 'Entrar na plataforma' }).click();
  await expect(page.getByRole('status')).toContainText('Não foi possível entrar');
  await page.getByRole('link', { name: 'Esqueci a senha' }).click();
  await expect(page.getByRole('button', { name: 'Enviar instruções' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('temas desconhecidos não caem silenciosamente em outro tenant', async ({ page }) => {
  const response = await page.goto('/preview/unknown-tenant');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada.' })).toBeVisible();
});
