import { Suspense } from 'react';
import { TenantNavigation } from '../../../../components/tenant-navigation';
import { WhatsAppConnection, type WhatsAppConnectionInfo } from '../../../../components/whatsapp-connection';
import { WhatsAppRetry } from '../../../../components/whatsapp-retry';
import '../../../../components/catalog.css';
import { platformName } from '@platform/config';
import type { ContextView, FeatureView } from '@platform/web-kit';
import { SignOutButton } from '@platform/web-kit/auth-form';
import { apiGet } from '@platform/web-kit/server';

interface WhatsAppItem {
  id: string;
  appointmentId: string | null;
  templateKey: string;
  status: 'PENDING' | 'PROCESSING' | 'UNKNOWN' | 'SENT' | 'SKIPPED' | 'FAILED';
  attempts: number;
  scheduledAt: string;
  createdAt: string;
  sentAt: string | null;
  lastError: string | null;
}

const statusLabels: Record<WhatsAppItem['status'], string> = {
  PENDING: 'Na fila',
  PROCESSING: 'Enviando',
  UNKNOWN: 'Aguardando confirmação manual',
  SENT: 'Enviado',
  SKIPPED: 'Não elegível',
  FAILED: 'Falha no envio',
};

const templateLabels: Record<string, string> = {
  'booking.confirmation': 'Confirmação de agendamento (cliente)',
  'booking.customer_reminder': 'Lembrete de corte — 1h antes (cliente)',
  'booking.barber_reminder': 'Próximo cliente — 15 min antes (barbeiro)',
};

const errorLabels: Record<string, string> = {
  NOT_CONFIGURED: 'Nenhuma conta de WhatsApp (própria ou padrão da plataforma) está configurada.',
  INVALID_MESSAGE: 'Os dados da mensagem ou o telefone cadastrado não estão em formato válido.',
  PROVIDER_REJECTED: 'O provedor Zernio rejeitou o envio. Verifique a conta conectada e a aprovação dos templates.',
  RATE_LIMITED: 'O provedor limitou temporariamente o envio; a fila aguardará antes de tentar novamente.',
  RESPONSE_UNKNOWN: 'A resposta do provedor foi interrompida; confirme antes de reenviar.',
  WORKER_INTERRUPTED: 'O processamento foi interrompido após iniciar a chamada externa; confirme antes de reenviar.',
  NO_LONGER_ELIGIBLE: 'O agendamento ou o consentimento mudou antes do horário do envio.',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

async function WhatsAppPage({ slug }: { slug: string }) {
  const context = await apiGet<ContextView>(`/v1/tenants/${encodeURIComponent(slug)}/context`);
  const basePath = `/v1/tenants/${encodeURIComponent(context.tenant.slug)}`;
  const features = await apiGet<FeatureView[]>(`${basePath}/features`);
  const booking = features.some(feature => feature.key === 'booking' && feature.enabled);
  const whatsapp = features.some(feature => feature.key === 'whatsapp_automation' && feature.enabled);
  const permitted = context.permissions.includes('appointments.read') && context.permissions.includes('appointments.manage_all');
  const canRetry = context.permissions.includes('appointments.update');
  const allowed = booking && whatsapp && permitted;
  const data = allowed
    ? await apiGet<{ items: WhatsAppItem[]; connection?: WhatsAppConnectionInfo }>(`${basePath}/whatsapp`)
    : null;
  const name = platformName();

  const connection: WhatsAppConnectionInfo = data?.connection ?? {
    platformConfigured: false,
    globalFallbackConfigured: false,
    connected: false,
    profileId: null,
    accountId: null,
    phone: null,
  };

  return (
    <div className="shell catalog-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">{name[0]}</span>
          {name}
        </a>
        <SignOutButton />
      </header>
      <main className="main">
        <a className="catalog-back" href={`/?tenant=${encodeURIComponent(context.tenant.slug)}`}>
          ← Voltar ao painel
        </a>
        <div className="intro">
          <span className="eyebrow">{context.tenant.name}</span>
          <h1>Mensagens de WhatsApp (Zernio)</h1>
          <p>
            Conecte o WhatsApp Business da sua barbearia ou utilize o envio padrão da plataforma para confirmações imediatas, lembretes ao cliente (1 hora antes) e avisos ao barbeiro (15 minutos antes).
          </p>
        </div>
        <TenantNavigation context={context} features={features} />
        {!allowed ? (
          <section className="panel">
            <h2>Acesso indisponível</h2>
            <p>
              {!permitted
                ? 'Seu acesso nesta barbearia não permite consultar os envios de WhatsApp.'
                : 'O recurso de automação de WhatsApp ainda não está habilitado para esta barbearia.'}
            </p>
          </section>
        ) : (
          <>
            <Suspense fallback={null}>
              <WhatsAppConnection slug={context.tenant.slug} initialConnection={connection} canManage={canRetry} />
            </Suspense>
            {!data?.items.length ? (
              <section className="panel">
                <h2>Nenhuma mensagem registrada</h2>
                <p>
                  As confirmações e os lembretes aparecem aqui quando um agendamento é confirmado ou remarcado. Para o lembrete de próximo cliente ao barbeiro, cadastre o WhatsApp no perfil do profissional.
                </p>
              </section>
            ) : (
              <section className="catalog-list" aria-label="Histórico de mensagens por WhatsApp">
                {data.items.map(item => (
                  <article className="catalog-card" key={item.id}>
                    <div className="catalog-card-head">
                      <div>
                        <h3>{templateLabels[item.templateKey] ?? item.templateKey}</h3>
                        <p className="catalog-meta">
                          <span>Criada em {formatDateTime(item.createdAt)}</span>
                          <span>Programada para {formatDateTime(item.scheduledAt)}</span>
                          <span>Tentativas: {item.attempts}</span>
                          {item.sentAt && <span>Enviada em {formatDateTime(item.sentAt)}</span>}
                        </p>
                      </div>
                      <span className={`catalog-badge ${item.status === 'SENT' ? 'active' : 'inactive'}`}>
                        {statusLabels[item.status]}
                      </span>
                    </div>
                    {item.lastError && <p>{errorLabels[item.lastError] ?? `Motivo registrado: ${item.lastError}`}</p>}
                    {item.status === 'FAILED' && canRetry && <WhatsAppRetry slug={context.tenant.slug} id={item.id} />}
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </main>
      <footer className="footer">
        <span>{name} · Área da barbearia</span>
        <span>{context.tenant.name}</span>
      </footer>
    </div>
  );
}

export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <WhatsAppPage slug={slug} />;
}
