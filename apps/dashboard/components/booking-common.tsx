'use client';
import { useEffect, useRef } from 'react';
export interface BookingMessage { text: string; error?: boolean; signIn?: boolean }
export function BookingFeedback({ message }: { message: BookingMessage | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (message) ref.current?.focus(); }, [message]);
  return message ? <div ref={ref} tabIndex={-1} className={`catalog-feedback ${message.error ? 'catalog-feedback-error' : ''}`} role={message.error ? 'alert' : 'status'}><p>{message.text}</p>{message.signIn && <a href="/login">Entrar novamente</a>}</div> : null;
}
