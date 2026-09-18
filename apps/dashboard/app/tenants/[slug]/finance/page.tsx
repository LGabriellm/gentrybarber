import { TenantNavigation } from '../../../../components/tenant-navigation';
import { platformName } from '@platform/config';
import type { BookingOptions, FinanceSummaryView } from '@platform/types';
import type { ContextView, FeatureView } from '@platform/web-kit';
import { SignOutButton } from '@platform/web-kit/auth-form';
import { apiGet } from '@platform/web-kit/server';
import { FinanceManager } from '../../../../components/finance-manager';
import '../../../../components/catalog.css';
import '../../../../components/booking.css';

export default async function FinancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const context = await apiGet<ContextView>(`/v1/tenants/${encodeURIComponent(slug)}/context`);
  const base = `/v1/tenants/${encodeURIComponent(context.tenant.slug)}`;
  const features = await apiGet<FeatureView[]>(`${base}/features`);
  const hasFeature = (key: string) => features.some(feature => feature.key === key && feature.enabled);
  const permission = (key: string) => context.permissions.includes(key);

  const allowed = hasFeature('booking') && permission('reports.read');

  const options = allowed ? await apiGet<BookingOptions>(`${base}/booking/options`) : null;
  const first = options?.locations.find(location => location.active) ?? options?.locations[0];
  const timezone = first?.timezone || 'America/Sao_Paulo';

  const summary = allowed && first ? await apiGet<FinanceSummaryView>(`${base}/finance/summary?${new URLSearchParams({ locationId: first.id, timezone })}`) : null;

  const name = platformName();

  return (
    <div className="shell catalog-shell booking-shell finance-shell">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">{name[0]}</span>{name}</a>
        <SignOutButton />
      </header>
      <main className="main">
        <a className="catalog-back" href={`/?tenant=${encodeURIComponent(context.tenant.slug)}`}>← Voltar ao painel</a>
        <div className="intro">
          <span className="eyebrow">{context.tenant.name}</span>
          <h1>Gestão Financeira</h1>
          <p>Acompanhe o faturamento, os atendimentos realizados e o desempenho da equipe.</p>
        </div>
        <TenantNavigation context={context} features={features} />
        
        {!allowed ? (
          <section className="panel">
            <h2>Acesso indisponível</h2>
            <p>Seu acesso e os recursos habilitados nesta barbearia não permitem abrir esta área. Consulte o responsável pelo ambiente.</p>
          </section>
        ) : !summary ? (
          <section className="panel">
            <h2>Nenhuma unidade disponível</h2>
            <p>Uma unidade precisa estar cadastrada para consultar dados financeiros.</p>
          </section>
        ) : (
          <FinanceManager summary={summary} timezone={timezone} />
        )}
      </main>
      <footer className="footer">
        <span>{name} · Área da barbearia</span>
        <span>{context.tenant.name}</span>
      </footer>
    </div>
  );
}
