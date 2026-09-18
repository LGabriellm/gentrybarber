'use client';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { PublicSiteData } from '@platform/theme-engine';
import { locationLinks, safeMapEmbed, shareLocation } from './location-links';

/** Keep the trusted provider outside the script-free HTML/CSS sandbox, without relaxing it.
 * The reserved viewport stays in the layout; only the provider iframe is portalled.
 * Scroll and resize clipping also covers the nested authenticated editor preview. */
function MapViewport({ src, title }: { src: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const [activated, setActivated] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const windows: Window[] = [];
    let current = element.ownerDocument.defaultView;
    while (current) {
      windows.push(current);
      if (current === window) break;
      current = current.frameElement?.ownerDocument.defaultView ?? null;
    }
    let pending = 0;
    function measure() {
      pending = 0;
      const rect = element!.getBoundingClientRect();
      let left = rect.left; let top = rect.top;
      let clipLeft = 0; let clipTop = 0; let clipRight = rect.width; let clipBottom = rect.height;
      for (const view of windows) {
        clipLeft = Math.max(clipLeft, -left); clipTop = Math.max(clipTop, -top);
        clipRight = Math.min(clipRight, view.innerWidth - left); clipBottom = Math.min(clipBottom, view.innerHeight - top);
        if (view === window) break;
        const frame = view.frameElement?.getBoundingClientRect();
        if (!frame) return;
        left += frame.left; top += frame.top;
      }
      const visible = clipRight > clipLeft && clipBottom > clipTop;
      if (visible) setActivated(true);
      setStyle({ position: 'fixed', left, top, width: rect.width, height: rect.height, border: 0, zIndex: 1,
        visibility: visible ? 'visible' : 'hidden', clipPath: `inset(${Math.max(0, clipTop)}px ${Math.max(0, rect.width - clipRight)}px ${Math.max(0, rect.height - clipBottom)}px ${Math.max(0, clipLeft)}px)` });
    }
    const schedule = () => { if (!pending) pending = window.requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    for (const view of windows) {
      view.addEventListener('scroll', schedule, true); view.addEventListener('resize', schedule);
      observer.observe(view.document.body);
    }
    measure();
    return () => { observer.disconnect(); window.cancelAnimationFrame(pending); for (const view of windows) { view.removeEventListener('scroll', schedule, true); view.removeEventListener('resize', schedule); } };
  }, []);
  return <div className="location-map-viewport" ref={host}>
    <p>Mapa da localização. Use o ícone de compartilhamento para abrir em outro aplicativo.</p>
    {style && activated && createPortal(<iframe src={src} title={title} referrerPolicy="strict-origin-when-cross-origin" style={style} tabIndex={-1} />, document.body)}
  </div>;
}

const styles = `.location-map{font-family:var(--theme-body-font,Arial,sans-serif);color:var(--theme-text,#06213b);min-width:0;width:100%}.location-map-viewport{height:320px;width:100%;background:#e6edf0;border:1px solid #b9cbd5;display:grid;place-items:center;overflow:hidden}.location-map-viewport p{padding:24px;font-size:14px;line-height:1.6}.location-map-address{font-style:normal;margin:18px 0;line-height:1.7;font-size:14px}.location-map-actions{display:flex;flex-wrap:wrap;gap:10px}.location-map .location-map-action{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:12px 16px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;font:inherit;font-size:13px;text-decoration:none;cursor:pointer}.location-map .location-map-share{background:var(--theme-primary,#06213b);color:var(--theme-background,#fff)}.location-map .location-map-action:focus-visible,.location-map input:focus-visible{outline:3px solid var(--theme-accent,#285a72);outline-offset:4px}.location-map-status{font-size:13px;line-height:1.6;margin-top:12px}.location-map-copy{display:grid;gap:8px;margin-top:12px;font-size:13px}.location-map-copy input{width:100%;min-width:0;box-sizing:border-box;padding:12px;font:inherit}.location-map-note{font-size:12px;line-height:1.6;margin-top:12px;opacity:.8}@media(max-width:480px){.location-map-viewport{height:260px}.location-map-actions{display:grid;grid-template-columns:1fr 1fr}}`;

export function LocationMap({ tenant, mapUrl }: { tenant: PublicSiteData['tenant']; mapUrl?: string }) {
  const links = locationLinks(tenant.location);
  const [status, setStatus] = useState('');
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const element = disclosure.current;
    if (!element) return;
    const closeOutside = (event: Event) => { if (!event.composedPath().includes(element)) element.open = false; };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && element.open) { element.open = false; element.querySelector('summary')?.focus(); }
    };
    const owner = element.ownerDocument;
    owner.addEventListener('pointerdown', closeOutside);
    owner.addEventListener('keydown', closeWithEscape);
    return () => { owner.removeEventListener('pointerdown', closeOutside); owner.removeEventListener('keydown', closeWithEscape); };
  }, [links?.address]);
  if (!links) return <p className="location-map-empty">A localização será exibida quando o endereço da unidade estiver completo.</p>;
  async function share() {
    setBusy(true); setStatus(''); setManual(false);
    const result = await shareLocation(navigator, { title: tenant.name, text: `${tenant.name} — ${links!.address}`, url: links!.google });
    setStatus(result === 'shared' ? 'Localização compartilhada.' : result === 'copied' ? 'Link da localização copiado.' : result === 'manual' ? 'Copie o link abaixo para compartilhar.' : '');
    setManual(result === 'manual'); setBusy(false);
  }
  async function copy() {
    const result = await shareLocation({ clipboard: navigator.clipboard }, { url: links!.google });
    setManual(result === 'manual');
    setStatus(result === 'copied' ? 'Link da localização copiado.' : 'Copie o link abaixo para compartilhar.');
  }
  function openMap(event: MouseEvent<HTMLAnchorElement>, url: string) {
    // Handler executes in the trusted application realm; the code iframe cannot open popups.
    if (event.currentTarget.ownerDocument !== document) { event.preventDefault(); window.open(url, '_blank', 'noopener,noreferrer'); }
    if (disclosure.current) disclosure.current.open = false;
  }
  return <section className="location-map" aria-label={`Localização de ${tenant.name}`}>
    <style>{styles}</style>
    <style>{`.location-map-footer{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:18px}.location-map-footer .location-map-address{margin:0;min-width:0;overflow-wrap:anywhere}.location-map-disclosure{position:relative;flex-shrink:0}.location-map-trigger{list-style:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:50%;cursor:pointer;background:transparent;color:inherit}.location-map-trigger::-webkit-details-marker{display:none}.location-map-trigger:hover,.location-map-disclosure[open] .location-map-trigger{background:color-mix(in srgb,currentColor 7%,transparent)}.location-map-trigger:focus-visible{outline:3px solid var(--theme-accent,#285a72);outline-offset:4px}.location-map .location-map-options{position:absolute;right:0;top:calc(100% + 10px);z-index:2;display:grid;gap:2px;width:250px;max-width:75vw;padding:10px;border:1px solid #ced5d8;border-radius:12px;background:var(--theme-background,#fff);box-shadow:0 12px 30px #06213b20}.location-map .location-map-options .location-map-action{border:0;justify-content:flex-start;background:transparent;color:inherit;text-align:left;border-radius:6px;min-height:44px}.location-map .location-map-options .location-map-action:hover{background:color-mix(in srgb,currentColor 7%,transparent)}.location-map-options-label{font-size:11px;letter-spacing:1px;padding:8px 16px;opacity:.7}.location-map-status:empty{display:none}`}</style>
    <MapViewport src={safeMapEmbed(mapUrl) ?? safeMapEmbed(tenant.location.mapUrl) ?? links.embed} title={`Mapa de ${tenant.name}: ${links.address}`} />
    <div className="location-map-footer">
    <address className="location-map-address">{links.address}</address>
    <details className="location-map-disclosure" ref={disclosure}>
      <summary className="location-map-trigger" aria-label="Compartilhar localização" title="Compartilhar localização">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
      </summary>
    <div className="location-map-options" aria-label="Opções de localização">
      <span className="location-map-options-label">ABRIR COM</span>
      <a className="location-map-action" href={links.google} target="_blank" rel="noopener noreferrer" onClick={event => openMap(event, links.google)}>Google Maps ↗</a>
      <a className="location-map-action" href={links.waze} target="_blank" rel="noopener noreferrer" onClick={event => openMap(event, links.waze)}>Waze ↗</a>
      <a className="location-map-action" href={links.apple} target="_blank" rel="noopener noreferrer" onClick={event => openMap(event, links.apple)}>Apple Maps ↗</a>
      <button className="location-map-action" type="button" disabled={busy} onClick={share}>{busy ? 'Compartilhando…' : 'Compartilhar…'}</button>
      <button className="location-map-action" type="button" onClick={copy}>Copiar link</button>
    </div>
    </details>
    </div>
    <p className="location-map-status" role="status" aria-live="polite">{status}</p>
    {manual && <label className="location-map-copy">Link para compartilhar<input readOnly value={links.google} onFocus={event => event.currentTarget.select()} /></label>}
  </section>;
}
