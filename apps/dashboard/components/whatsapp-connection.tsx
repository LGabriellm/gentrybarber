'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { operation } from '../lib/booking-client';

export interface WhatsAppConnectionInfo {
  platformConfigured: boolean;
  globalFallbackConfigured: boolean;
  connected: boolean;
  profileId: string | null;
  accountId: string | null;
  phone: string | null;
}

export function WhatsAppConnection({
  slug,
  initialConnection,
  canManage,
}: {
  slug: string;
  initialConnection: WhatsAppConnectionInfo;
  canManage: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState(initialConnection);
  const [mode, setMode] = useState<'coexistence' | 'api'>('coexistence');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const autoSynced = useRef(false);

  async function syncConnection(silent = false) {
    if (busy) return;
    setBusy(true);
    if (!silent) setFeedback(null);
    try {
      const result = await operation<{ connected: boolean; accountId: string | null; phone: string | null }>(
        slug,
        'whatsapp/sync',
        'POST',
        {},
      );
      setConnection(prev => ({
        ...prev,
        connected: result.connected,
        accountId: result.accountId,
        phone: result.phone,
      }));
      if (result.connected) {
        setFeedback({
          text: `WhatsApp Business conectado (${result.phone ?? result.accountId}) e templates sincronizados.`,
          error: false,
        });
      } else if (!silent) {
        setFeedback({
          text: 'Nenhuma conta de WhatsApp finalizada ainda neste perfil. Conclua a autorização na janela da Zernio/Meta e tente novamente.',
          error: true,
        });
      }
      router.refresh();
    } catch (err) {
      if (!silent) {
        setFeedback({
          text: err instanceof Error ? err.message : 'Não foi possível sincronizar a conexão do WhatsApp.',
          error: true,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoSynced.current || !canManage) return;
    if (searchParams.get('connected') === '1' && connection.profileId) {
      autoSynced.current = true;
      void syncConnection(false);
    }
  });

  async function startConnect() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const redirectUrl = `${window.location.origin}/tenants/${encodeURIComponent(slug)}/whatsapp?connected=1`;
      const result = await operation<{ authUrl: string; profileId: string }>(
        slug,
        'whatsapp/connect',
        'POST',
        { redirectUrl, mode },
      );
      setConnection(prev => ({ ...prev, profileId: result.profileId }));
      window.location.assign(result.authUrl);
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : 'Não foi possível iniciar a conexão com a Zernio.',
        error: true,
      });
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await operation(slug, 'whatsapp/disconnect', 'POST', {});
      setConnection(prev => ({ ...prev, connected: false, accountId: null, phone: null }));
      setFeedback({
        text: 'WhatsApp próprio desconectado. Os envios voltaram para a configuração padrão da plataforma.',
        error: false,
      });
      router.refresh();
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : 'Não foi possível desconectar o WhatsApp.',
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="Conexão do WhatsApp Business da barbearia">
      <div className="catalog-card-head">
        <div>
          <h2>WhatsApp Business da barbearia</h2>
          <p>
            {connection.connected
              ? `As confirmações e os lembretes desta barbearia estão saindo pelo seu próprio WhatsApp Business (${connection.phone ?? connection.accountId}).`
              : connection.globalFallbackConfigured
                ? 'Esta barbearia já envia mensagens automaticamente pelo número oficial da plataforma. Se preferir, conecte abaixo o próprio WhatsApp Business da sua barbearia.'
                : 'Conecte o WhatsApp Business da sua barbearia via Zernio para disparar confirmações imediatas e lembretes pelo seu próprio número.'}
          </p>
        </div>
        <span className={`catalog-badge ${connection.connected || connection.globalFallbackConfigured ? 'active' : 'inactive'}`}>
          {connection.connected
            ? 'WhatsApp próprio ativo'
            : connection.globalFallbackConfigured
              ? 'Número padrão da plataforma'
              : 'Aguardando conexão'}
        </span>
      </div>

      {feedback && (
        <p role={feedback.error ? 'alert' : 'status'} aria-live="polite">
          {feedback.text}
        </p>
      )}

      {canManage && connection.platformConfigured && (
        <div className="catalog-actions" style={{ marginTop: '12px', flexWrap: 'wrap', gap: '12px' }}>
          {!connection.connected ? (
            <>
              <label className="catalog-field" style={{ maxWidth: '380px' }}>
                Modo de conexão
                <select
                  name="whatsappConnectMode"
                  value={mode}
                  disabled={busy}
                  onChange={event => setMode(event.target.value === 'api' ? 'api' : 'coexistence')}
                >
                  <option value="coexistence">Coexistência (manter app WhatsApp Business no celular + QR Code)</option>
                  <option value="api">Cloud API exclusiva (número dedicado apenas à API)</option>
                </select>
              </label>
              <button className="button" type="button" disabled={busy} onClick={() => void startConnect()}>
                {busy ? 'Abrindo Zernio…' : 'Conectar meu WhatsApp Business'}
              </button>
              {connection.profileId && (
                <button className="button secondary" type="button" disabled={busy} onClick={() => void syncConnection(false)}>
                  {busy ? 'Sincronizando…' : 'Já conectei — Sincronizar conta'}
                </button>
              )}
            </>
          ) : (
            <>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void syncConnection(false)}>
                {busy ? 'Sincronizando…' : 'Sincronizar e atualizar templates'}
              </button>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void disconnect()}>
                Desconectar WhatsApp próprio
              </button>
            </>
          )}
        </div>
      )}

      {!connection.platformConfigured && (
        <p>
          Para habilitar a conexão direta por barbearia, defina a chave única <code>ZERNIO_API_KEY</code> no servidor.
        </p>
      )}
    </section>
  );
}
