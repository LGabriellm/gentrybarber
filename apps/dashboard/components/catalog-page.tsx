import { TenantNavigation } from './tenant-navigation';
import { platformName } from '@platform/config';
import type { ProfessionalCatalog, ServiceCatalog } from '@platform/types';
import type { ContextView, FeatureView } from '@platform/web-kit';
import { SignOutButton } from '@platform/web-kit/auth-form';
import { apiGet } from '@platform/web-kit/server';
import { CatalogManager } from './catalog-manager';
import './catalog.css';

export async function CatalogPage({ slug, resource }: { slug: string; resource: 'services' | 'professionals' }) {
  const context = await apiGet<ContextView>(`/v1/tenants/${encodeURIComponent(slug)}/context`);
  const basePath = `/v1/tenants/${encodeURIComponent(context.tenant.slug)}`;
  const features = await apiGet<FeatureView[]>(`${basePath}/features`);
  const entitled = features.some(feature => feature.key === 'booking' && feature.enabled);
  const permitted = context.permissions.includes(`${resource}.manage`);
  const allowed = entitled && permitted;
  const data = allowed ? await apiGet<ServiceCatalog | ProfessionalCatalog>(`${basePath}/${resource}`) : null;
  const name = platformName();
  const services = resource === 'services';
  const title = services ? 'Serviços' : 'Profissionais';
  return <div className="shell catalog-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">{name[0]}</span>{name}</a><SignOutButton /></header>
    <main className="main">
      <a className="catalog-back" href={`/?tenant=${encodeURIComponent(context.tenant.slug)}`}>← Voltar ao painel</a>
      <div className="intro"><span className="eyebrow">{context.tenant.name}</span><h1>{title}</h1><p>{services ? 'Organize os serviços, a duração e os valores de cada unidade.' : 'Apresente sua equipe e defina os serviços de cada profissional.'}</p></div>
      <TenantNavigation context={context} features={features} />
      {data ? <CatalogManager key={`${context.tenant.id}-${resource}`} slug={context.tenant.slug} resource={resource} initialData={data} /> : <section className="panel"><h2>Acesso indisponível</h2><p>{!permitted ? 'Seu acesso nesta barbearia não permite gerenciar este catálogo. Entre em contato com o responsável pelo ambiente.' : 'O recurso de operação ainda não está habilitado para esta barbearia. Entre em contato com o responsável pelo ambiente.'}</p></section>}
      {!services && allowed && <p className="catalog-note">Cadastrar um profissional não cria uma conta de acesso. Defina sua escala em Horários e bloqueios para disponibilizar atendimentos na agenda.</p>}
    </main>
    <footer className="footer"><span>{name} · Área da barbearia</span><span>{context.tenant.name}</span></footer>
  </div>;
}
