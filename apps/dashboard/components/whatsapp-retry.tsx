'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { operation } from '../lib/booking-client';

export function WhatsAppRetry({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function retry() {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await operation(slug, `whatsapp/${id}/retry`, 'POST', {}); setMessage('Nova tentativa solicitada.'); router.refresh(); }
    catch { setMessage('Não foi possível confirmar a tentativa. Atualize o histórico antes de tentar novamente.'); }
    finally { setBusy(false); }
  }
  return <div><button className="button secondary" type="button" disabled={busy} onClick={() => void retry()}>{busy ? 'Solicitando…' : 'Tentar envio novamente'}</button>{message && <p role="status">{message}</p>}</div>;
}
