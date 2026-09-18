'use client';
import { createElement, useCallback, useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { parseSiteHtml, validateSiteCss, studioUtilities, type SiteCodeNode, type PublicSiteData } from '@platform/theme-engine';
import { resolveDesignTokens, tokensToCssVariables, type DesignTokens } from '@platform/design-system';
import { BookingWidget } from '@platform/web-kit';
import { PriceList } from './site-blocks';
import { BrandImage } from './brand-image';
import { TestimonialsBlock, FAQBlock, HoursBlock, StatsBlockSection } from './site-blocks-extended';
import { LocationMap } from './location-map';
import { WhatsAppFloat } from './shared';
import { CTABanner, SocialLinks } from '@platform/design-system';

export function CodeSite({ data, defaults }: { data: PublicSiteData; defaults: DesignTokens }) {
  const [body, setBody] = useState<HTMLElement | null>(null); const frame = useRef<HTMLIFrameElement | null>(null); const [height, setHeight] = useState(900);
  const attach = useCallback((element: HTMLIFrameElement | null) => { frame.current = element; if (element?.contentDocument?.readyState === 'complete') setBody(element.contentDocument.body); }, []);
  useEffect(() => { if (!body) return; const observer = new ResizeObserver(() => setHeight(Math.min(16000, Math.max(300, body.scrollHeight)))); observer.observe(body); return () => observer.disconnect(); }, [body]);
  useEffect(() => { if (body) for (const [key, value] of Object.entries(tokensToCssVariables(resolveDesignTokens(data.tokens ?? {}, defaults)))) body.style.setProperty(key, value); }, [body, data.tokens, defaults]);
  const code = data.code!;
  let nodes: (SiteCodeNode | string)[];
  try { nodes = parseSiteHtml(code.html, code.assets); validateSiteCss(code.css); } catch (error) { return <p role="alert">{error instanceof Error ? error.message : 'Confira o HTML e o CSS no editor.'}</p>; }
  function render(node: SiteCodeNode | string, index: number): ReactNode {
    if (typeof node === 'string') return node;
    const props = Object.fromEntries(Object.entries(node.attrs).filter(([key]) => key !== 'layout').map(([key, value]) => [key === 'class' ? 'className' : key, value]));
    if (node.tag === 'img' && node.attrs.src?.startsWith('assets/')) props.src = code.assets?.find(asset => asset.name === node.attrs.src!.slice(7))?.src ?? '';
    let component: ReactNode;
    switch (node.tag) {
      case 'barber-logo': component = data.content?.logo ? <BrandImage image={data.content.logo} eager logo /> : <strong>{data.tenant.name}</strong>; break;
      case 'barber-cover': component = data.content?.heroImage ? <BrandImage image={data.content.heroImage} eager /> : null; break;
      case 'barber-gallery': component = <div className="code-gallery">{data.content?.sections.filter(section => section.type === 'gallery' && section.visible).flatMap(section => section.gallery ?? []).map((photo, index) => <figure key={index}><BrandImage image={photo} /><figcaption>{photo.alt}</figcaption></figure>)}</div>; break;
      case 'a': return createElement('a', { ...props, key: index, onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        const href = node.attrs.href;
        if (!href?.startsWith('#')) return;
        event.preventDefault();
        let id: string;
        try { id = decodeURIComponent(href.slice(1)); } catch { return; }
        const target = id ? body?.ownerDocument.getElementById(id) : body;
        if (!target) return;
        target.scrollIntoView({ block: 'start' });
        const hadTabIndex = target.hasAttribute('tabindex');
        if (!hadTabIndex) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        if (!hadTabIndex) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      } }, ...node.children.map(render));
      case 'barber-prices': component = <PriceList data={data} layout={node.attrs.layout as 'cards' | 'table' | 'list' | undefined} />; break;
      case 'barber-booking': component = <BookingWidget locationId={data.tenant.location.id} timezone={data.tenant.location.timezone} services={data.services ?? []} professionals={data.professionals ?? []} preview={data.preview} />; break;
      case 'barber-hero': component = <header className="code-hero"><small>{data.tenant.name}</small><h1>{data.content?.heroTitle || data.tenant.name}</h1><p>{data.content?.heroSubtitle || data.tenant.description}</p></header>; break;
      case 'barber-team': component = <div className="code-team">{data.professionals?.map(person => <article key={person.id}><h3>{person.name}</h3><p>{person.specialty}</p></article>)}</div>; break;
      case 'barber-contact': component = <address><h2>{data.tenant.name}</h2><p>{data.tenant.location.address} · {data.tenant.location.city}</p><p>{data.tenant.contact.phone}</p><p>{data.tenant.contact.email}</p></address>; break;
      case 'barber-hours': component = data.content?.sections.filter(s => s.type === 'hours' && s.visible).flatMap(s => s.hours ?? []).length ? <HoursBlock hours={data.content!.sections.filter(s => s.type === 'hours' && s.visible).flatMap(s => s.hours ?? [])} /> : null; break;
      case 'barber-faq': component = <FAQBlock items={data.content?.sections.filter(s => s.type === 'faq' && s.visible).flatMap(s => s.faqItems ?? []) ?? []} />; break;
      case 'barber-stats': component = <StatsBlockSection stats={data.content?.sections.filter(s => s.type === 'stats' && s.visible).flatMap(s => s.stats ?? []) ?? []} />; break;
      case 'barber-testimonials': component = <TestimonialsBlock testimonials={data.content?.sections.filter(s => s.type === 'testimonials' && s.visible).flatMap(s => s.testimonials ?? []) ?? []} />; break;
      case 'barber-cta': component = data.content?.ctaLabel ? <CTABanner title={data.content.heroTitle} buttonLabel={data.content.ctaLabel} buttonHref="#agenda" /> : null; break;
      case 'barber-map': { const mapSection = data.content?.sections.find(s => s.type === 'map' && s.visible); component = <LocationMap tenant={data.tenant} mapUrl={mapSection?.mapUrl} />; break; }
      case 'barber-social': component = <SocialLinks links={data.content?.socialLinks ?? []} />; break;
      case 'barber-whatsapp': component = <WhatsAppFloat phone={data.tenant.contact.whatsapp} />; break;
      default: return createElement(node.tag, { ...props, key: index }, ...node.children.map(render));
    }
    return <div {...props} key={index}>{component}</div>;
  }
  return <iframe ref={attach} title="Site personalizado" sandbox="allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" style={{ display: 'block', width: '100%', height, border: 0 }} srcDoc="<!doctype html><html lang='pt-BR'><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>html,body{margin:0;min-height:0}body{display:flow-root}*{box-sizing:border-box}</style></head><body></body></html>" onLoad={event => setBody(event.currentTarget.contentDocument?.body ?? null)}>{body && createPortal(<><style>{`body{font-family:var(--theme-body-font);color:var(--theme-text);background:var(--theme-background)}h1,h2,h3{font-family:var(--theme-heading-font)}.code-hero{padding:clamp(50px,8vw,120px) 24px;max-width:1180px;margin:auto}.code-hero h1{font-size:clamp(40px,7vw,85px);max-width:900px;line-height:1.05;overflow-wrap:anywhere}.code-hero p{font-size:20px;line-height:1.6;max-width:700px}.code-team{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:24px}address{font-style:normal}.brand-image{display:block;width:100%;height:auto;object-fit:cover}.brand-logo{width:auto;max-width:220px;height:64px;object-fit:contain}.code-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:24px}.code-gallery figure{margin:0}.code-gallery figcaption{margin-top:10px;font-size:13px}.brand-image-fallback{display:block;padding:24px;border:1px solid currentColor}`}</style><style>{studioUtilities}</style><style>{code.css}</style>{nodes.map(render)}{!data.whiteLabel && <div style={{ textAlign: 'center', padding: '16px', fontSize: '11px', opacity: 0.5, borderTop: '1px solid color-mix(in srgb, currentColor 10%, transparent)' }}>Desenvolvido por <strong>GentryHub</strong> - Soluções Digitais</div>}</>, body)}</iframe>;
}
