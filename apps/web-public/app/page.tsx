import { platformName } from '@platform/config';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { resolvePublicTheme } from '@platform/themes';
import { getPublicSite } from '../lib/site';
export const dynamic = 'force-dynamic';
async function isLocalIndex() { const host = (await headers()).get('host'); return process.env.NODE_ENV !== 'production' && (host === 'localhost:3000' || host === '127.0.0.1:3000'); }
export async function generateMetadata(): Promise<Metadata> {
  if (await isLocalIndex()) return { title: 'Foundation · ' + (platformName()), robots: { index: false, follow: false } };
  const site = await getPublicSite();
  const canonical = (process.env.NODE_ENV === 'production' ? 'https://' : 'http://') + site.canonicalHost + (process.env.NODE_ENV === 'production' ? '' : ':3000');
  return { title: site.title, description: site.data.tenant.description, alternates: { canonical }, openGraph: { title: site.title, description: site.data.tenant.description, url: canonical, type: 'website', locale: 'pt_BR' } };
}
export default async function PublicPage() {
  if (await isLocalIndex()) return <div className="shell"><header className="topbar"><a className="brand" href="/"><span className="brand-mark">B</span>{platformName()}</a><span className="badge">Foundation</span></header><main className="main"><div className="intro"><span className="eyebrow">O Core é compartilhado. A experiência pode ser única.</span><h1>Uma base sólida.<br/>Identidades distintas.</h1><p>O primeiro passo de uma plataforma para transformar a presença digital, a operação e o relacionamento de uma barbearia.</p></div><div className="grid"><article className="card"><span className="eyebrow">Presença digital</span><h2>Imperial</h2><p>Um exemplo de apresentação bespoke, resolvida pela mesma API.</p><a className="button" href="http://imperial.localhost:3000">Abrir ambiente ↗</a></article><article className="card"><span className="eyebrow">Presença digital</span><h2>Studio</h2><p>Uma identidade urbana, com regras e infraestrutura compartilhadas.</p><a className="button" href="http://studio.localhost:3000">Abrir ambiente ↗</a></article><article className="card"><span className="eyebrow">Operação</span><h2>Seu espaço de gestão</h2><p>Acesse uma conta verificada e os ambientes aos quais ela está vinculada.</p><a className="button secondary" href="http://localhost:3001">Acessar painel ↗</a></article></div>{process.env.DEMO_MODE === 'true' && <section className="panel"><h2>Galeria de demonstração</h2><p>Conteúdo fictício para comparar os renderers. Não representa dados de uma barbearia em operação.</p><nav className="tenant-nav"><a href="/preview/classic">Classic</a><a href="/preview/urban">Urban</a><a href="/preview/imperial">Imperial bespoke</a></nav></section>}</main><footer className="footer"><span>Ambiente local de desenvolvimento</span><span>Fase 0 · Fundação da plataforma</span></footer></div>;
  const site = await getPublicSite();
  const { Renderer } = resolvePublicTheme(site.themeContext);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const structuredData = { '@context': 'https://schema.org', '@type': 'HairSalon', name: site.data.tenant.name, description: site.data.tenant.description, address: { '@type': 'PostalAddress', streetAddress: site.data.tenant.location.address, addressLocality: site.data.tenant.location.city, addressRegion: site.data.tenant.location.state, addressCountry: 'BR' } };
  return <><script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} /><Renderer data={site.data}/></>;
}


