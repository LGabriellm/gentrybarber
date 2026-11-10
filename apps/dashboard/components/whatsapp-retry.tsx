'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { operation } from '../lib/booking-client';

export function WhatsAppRetry({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function retry() {
    setBusy(true);
    setMessage(null);
    setError(false);
    try {
      await operation(slug, `whatsapp/${encodeURIComponent(id)}/retry`, 'POST', {});
      setMessage('Mensagem recolocada na fila.');
      router.refresh();
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : 'Não foi possível recolocar a mensagem na fila.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="catalog-actions">
      <button className="button secondary" type="button" disabled={busy} onClick={() => void retry()}>
        {busy ? 'Recolocando…' : 'Tentar novamente'}
      </button>
      {message && (
        <span role={error ? 'alert' : 'status'} aria-live="polite">
          {message}
        </span>
      )}
    </div>
  );
}
