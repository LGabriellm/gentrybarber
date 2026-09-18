'use client';
import { useCallback, useRef } from 'react';
import type { PublicSiteData } from "@platform/theme-engine";

export function MobileNav({ data, sections }: { data: PublicSiteData; sections?: readonly { id: string; title: string }[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = useCallback(() => dialogRef.current?.showModal(), []);
  const close = useCallback(() => dialogRef.current?.close(), []);
  
  return <>
    <button className="mobile-menu-btn" onClick={open} aria-label="Abrir menu">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
    </button>
    <dialog ref={dialogRef} className="mobile-menu-dialog" onClick={(e) => { if (e.target === dialogRef.current) close(); }}>
      <div className="mobile-menu-content">
        <button className="mobile-menu-close" onClick={close} aria-label="Fechar menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        <nav className="mobile-menu-links">
          {!!data.services?.length && <a href="#servicos" onClick={close}>Serviços</a>}
          {!!data.professionals?.length && <a href="#equipe" onClick={close}>Equipe</a>}
          {sections?.map(s => <a key={s.id} href={`#section-${s.id}`} onClick={close}>{s.title}</a>)}
          <a href="#contato" onClick={close}>Contato</a>
        </nav>
        <p className="mobile-menu-brand">{data.tenant.name}</p>
      </div>
    </dialog>
  </>;
}
