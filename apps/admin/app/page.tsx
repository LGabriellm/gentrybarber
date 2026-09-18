import { apiGet } from '@platform/web-kit/server';
import { AdminLayout } from '../components/admin-layout';
import { count, TenantTable, type AdminTenant, type AdminPage } from '../components/admin-data';
export const dynamic = 'force-dynamic';
interface AdminStats { tenants: number; users: number; subscriptions: number; totalTenants: number; suspendedTenants: number; verifiedUsers: number }
export default async function Admin() {
  const [stats, tenants] = await Promise.all([apiGet<AdminStats>('/v1/admin/stats'), apiGet<AdminPage<AdminTenant>>('/v1/admin/tenants')]);
  const metrics = [
    { label: 'Barbearias cadastradas', value: stats.totalTenants, note: `${count(stats.tenants)} com ambiente ativo`, icon: '⌂' },
    { label: 'Contas de usuários', value: stats.users, note: `${count(stats.verifiedUsers)} e-mails verificados`, icon: '◎' },
    { label: 'Assinaturas ativas', value: stats.subscriptions, note: 'Registros ativos na plataforma', icon: '▤' },
    { label: 'Ambientes suspensos', value: stats.suspendedTenants, note: 'Acompanhe a situação de acesso', icon: '◷' },
  ];
  const activePercent = stats.totalTenants ? Math.round(stats.tenants / stats.totalTenants * 100) : 0;
  return <AdminLayout activeTab="overview" title="Visão geral" description="Acompanhe sua plataforma e encontre o que precisa para o próximo passo." action={<a className="button" href="/tenants/new"><span aria-hidden="true">＋</span> Nova barbearia</a>}>
    <div className="admin-metrics">{metrics.map(metric => <article className="admin-metric" key={metric.label}><div className="admin-metric-label"><span>{metric.label}</span><span className="admin-metric-icon" aria-hidden="true">{metric.icon}</span></div><strong>{count(metric.value)}</strong><p>{metric.note}</p></article>)}</div>
    <div className="admin-overview-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><h2>Barbearias recentes</h2><p>Os últimos ambientes cadastrados na plataforma.</p></div><a href="/tenants">Ver todas →</a></div><TenantTable items={tenants.items.slice(0, 5)} compact /></section>
      <div><section className="admin-panel"><div className="admin-panel-heading"><div><h2>Situação dos ambientes</h2><p>Distribuição atual das barbearias.</p></div></div><div className="admin-panel-body"><div className="admin-status-row"><span>Ambientes ativos</span><strong>{count(stats.tenants)} de {count(stats.totalTenants)}</strong></div><div className="admin-meter" role="meter" aria-label="Percentual de ambientes ativos" aria-valuenow={activePercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${activePercent}%` }} /></div><div className="admin-status-row"><span>Suspensos</span><strong>{count(stats.suspendedTenants)}</strong></div><p className="admin-summary-note">Os indicadores refletem os cadastros atuais. Assinaturas ativas não representam recebimentos confirmados.</p></div></section>
      <section className="admin-panel" style={{ marginTop: 24 }}><div className="admin-panel-heading"><div><h2>Acesso rápido</h2><p>As próximas ações, em um só lugar.</p></div></div><div className="admin-quick-links"><a href="/users/new"><span>Nova conta<small>Cadastrar um usuário ou administrador</small></span><span aria-hidden="true">＋</span></a><a href="/plans/new"><span>Novo plano<small>Criar plano comercial</small></span><span aria-hidden="true">＋</span></a><a href="/users?status=pending"><span>Contas pendentes<small>E-mails não confirmados</small></span><span aria-hidden="true">↗</span></a></div></section></div>
    </div><aside className="admin-note"><span aria-hidden="true">◈</span><div><strong>Cada barbearia, um ambiente próprio.</strong><p>O cadastro associa um responsável verificado, um plano e a primeira unidade. A publicação do site é uma etapa separada.</p></div></aside>
  </AdminLayout>;
}
