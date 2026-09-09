import { apiGet } from '@platform/web-kit/server';
import type { ContextView, FeatureView } from '@platform/web-kit';
import '../../../../components/catalog.css';
import { WhatsAppRetry } from '../../../../components/whatsapp-retry';

const labels: Record<string, string> = { PENDING: 'Na fila', PROCESSING: 'Enviando', SENT: 'Aceita pelo WhatsApp', FAILED: 'Não enviada', UNKNOWN: 'Envio sem confirmação', SKIPPED: 'Dispensada' };
const reasons: Record<string, string> = { NOT_CONFIGURED: 'Conexão com o WhatsApp ainda não configurada.', RATE_LIMITED: 'Limite temporário de envio.', PROVIDER_REJECTED: 'Envio recusado. Revise a conta e o modelo de mensagem.', INVALID_MESSAGE: 'Revise os dados do cliente.', RESPONSE_UNKNOWN: 'Não foi possível confirmar o envio. Verifique no WhatsApp antes de reenviar.', WORKER_INTERRUPTED: 'O envio foi interrompido e precisa de conferência.', NO_LONGER_ELIGIBLE: 'O atendimento ou a autorização mudou.' };
interface Item { id: string; appointmentId: string | null; status: string; attempts: number; createdAt: string; sentAt: string | null; lastError: string | null }
export default async function WhatsAppPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const base = `/v1/tenants/${encodeURIComponent(slug)}`;
  const context = await apiGet<ContextView>(`${base}/context`);
  const features = await apiGet<FeatureView[]>(`${base}/features`);
  const allowed = context.permissions.includes('appointments.read') && context.permissions.includes('appointments.manage_all') && ['booking', 'whatsapp_automation'].every(key => features.some(feature => feature.key === key && feature.enabled));
  const data = allowed ? await apiGet<{ items: Item[] }>(`${base}/whatsapp`) : null;
  return <main className="shell main catalog-shell"><a href={`/tenants/${encodeURIComponent(slug)}/agenda`}>← Voltar à agenda</a><div className="intro"><span className="eyebrow">{context.tenant.name}</span><h1>Confirmações por WhatsApp</h1><p>Novos agendamentos e reagendamentos feitos pela equipe entram na fila quando o cliente autorizou o contato.</p></div>
    {!data ? <section className="panel"><h2>Recurso indisponível</h2><p>Consulte o responsável para verificar os recursos e permissões da barbearia.</p></section> : <section className="panel"><h2>Últimas 50 confirmações</h2><p>A conta de envio e o modelo de confirmação precisam estar configurados. “Aceita pelo WhatsApp” indica aceite do serviço; a entrega ao celular ainda não é acompanhada aqui.</p><a className="button secondary" href={`/tenants/${encodeURIComponent(slug)}/whatsapp`}>Atualizar histórico</a>{!data.items.length ? <p>Nenhuma confirmação registrada. A autorização pode ser registrada no cadastro do cliente ao agendar.</p> : <ul>{data.items.map(item => <li key={item.id} style={{ overflowWrap: 'anywhere', marginTop: 24 }}><strong>{labels[item.status] ?? item.status}</strong> · UTC {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(item.createdAt))}<p>Agendamento: {item.appointmentId}</p>{item.lastError && <p>{reasons[item.lastError] ?? 'Consulte o responsável pela conexão.'}</p>}{item.status === 'FAILED' && context.permissions.includes('appointments.update') && <WhatsAppRetry slug={slug} id={item.id} />}</li>)}</ul>}</section>}
  </main>;
}



