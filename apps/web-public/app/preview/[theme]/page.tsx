import { notFound } from 'next/navigation';
import { demoSites, resolvePublicTheme } from '@platform/themes';
import type { Metadata } from 'next';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Demonstração de apresentação', robots: { index: false, follow: false, noarchive: true } };
export default async function Preview({ params }: { params: Promise<{ theme: string }> }) {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_MODE !== 'true') notFound();
  const { theme } = await params;
  if (!['classic', 'urban', 'minimal', 'imperial'].includes(theme)) notFound();
  const data = demoSites[theme as keyof typeof demoSites];
  const themeId = theme === 'imperial' ? 'bespoke-imperial' : theme;
  const { Renderer } = resolvePublicTheme({ tenantId: data.tenant.id, themeId, allowedThemeIds: [themeId], features: theme === 'imperial' ? ['custom_design'] : [] });
  return <><nav className="demo-nav" aria-label="Temas de demonstração"><strong>Demonstração · conteúdo fictício</strong><a href="/preview/classic">Classic</a><a href="/preview/urban">Urban</a><a href="/preview/minimal">Minimal</a><a href="/preview/imperial">Imperial</a><a href="/">Voltar</a></nav><Renderer data={{ ...data, preview: true }}/></>;
}

