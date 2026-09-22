import { LocationMap } from './location-map';
import type { PublicSiteData } from '@platform/theme-engine';
import { ProfessionalCard, resolveDesignTokens, type DesignTokens } from '@platform/design-system';
import { SiteFooterRich, WhatsAppFloat, ThemeShell } from './shared';
import { PriceList } from './site-blocks';
import { BookingWidget } from '@platform/web-kit';
import { SectionLink } from './section-link';
import { BrandImage } from './brand-image';
import { studioStyles } from './studio-styles';
import { TestimonialsBlock, FAQBlock, HoursBlock, StatsBlockSection, CTABlock } from './site-blocks-extended';

/** Presentation choices never replace the catalog, availability or booking contracts. */
export function BrandSite({ data, defaults, variant }: { data: PublicSiteData; defaults: DesignTokens; variant: 'classic' | 'urban' | 'imperial' }) {
  const content = data.content!;
  const sections = content.sections.filter(section => section.visible);
  const destination = sections.find(item => item.type === 'booking') ?? sections[0];
  const appearance = content.appearance ?? {};
  const tokens = resolveDesignTokens(data.tokens ?? {}, defaults);
  const initials = data.tenant.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('');
  const layout = content.heroLayout ?? 'split';
  return <ThemeShell data={data} defaults={defaults} variant={variant}>
    <style>{studioStyles}</style>
    <div className="brand-studio" data-width={appearance.width ?? 'standard'} data-navigation={appearance.navigation ?? 'inline'} data-scale={appearance.headingScale ?? 'expressive'} data-case={appearance.headingCase ?? 'natural'} data-shape={appearance.imageShape ?? 'rectangle'} data-separators={appearance.separators ?? 'none'} data-buttons={tokens.buttonStyle} data-cards={tokens.cardStyle}>
      <header id="inicio" className="brand-nav brand-container">
        <SectionLink className="brand-identity" href="#inicio">{content.logo ? <BrandImage image={content.logo} eager logo /> : <span className="brand-name">{data.tenant.name}</span>}{content.tagline && <span className="brand-tagline">{content.tagline}</span>}</SectionLink>
        <nav aria-label="Navegação do site">{sections.map(section => <SectionLink key={section.id} href={`#section-${section.id}`}>{section.title}</SectionLink>)}</nav>
        {destination && <SectionLink className="brand-button brand-nav-cta" href={`#section-${destination.id}`}>{content.ctaLabel ?? 'Conheça a barbearia'} <span aria-hidden="true">↗</span></SectionLink>}
      </header>
      <main>
        <section className="brand-hero brand-container" data-layout={layout}>
          <div className="brand-hero-copy"><p className="brand-eyebrow">{content.heroEyebrow || data.tenant.name}</p><h1>{content.heroTitle}</h1>{content.heroSubtitle && <p className="brand-intro">{content.heroSubtitle}</p>}{destination && <SectionLink className="brand-button" href={`#section-${destination.id}`}>{content.ctaLabel ?? 'Conheça a barbearia'} <span aria-hidden="true">↗</span></SectionLink>}</div>
          {(content.heroImage || layout === 'split' || layout === 'editorial' || layout === 'poster') && <div className="brand-hero-art">{content.heroImage ? <BrandImage image={content.heroImage} eager /> : <div className="brand-monogram" aria-hidden="true"><span>{initials}</span><small>{content.tagline || data.tenant.name}</small></div>}</div>}
        </section>
        {sections.map(section => <section className="brand-section" key={section.id} id={`section-${section.id}`} data-tone={section.tone ?? 'default'} data-spacing={section.spacing ?? 'inherit'} data-align={section.align ?? 'left'}>
          <div className="brand-container brand-section-layout" data-composition={section.composition ?? 'stacked'}>
            <div className="brand-section-intro">{section.eyebrow && <p className="brand-eyebrow">{section.eyebrow}</p>}<h2>{section.title}</h2>{section.body && <div className="brand-prose">{section.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}</div>
            <div className="brand-section-content">
              {section.image && <figure className="brand-story-image"><BrandImage image={section.image} /></figure>}
              {section.type === 'services' && <PriceList data={data} layout={section.layout ?? 'table'} />}
              {section.type === 'booking' && <BookingWidget locationId={data.tenant.location.id} timezone={data.tenant.location.timezone} services={data.services ?? []} professionals={data.professionals ?? []} preview={data.preview} />}
              {section.type === 'team' && <div className="brand-team">{data.professionals?.map((person, index) => <ProfessionalCard key={person.id} {...person} index={index} />)}</div>}
              {section.type === 'gallery' && (section.gallery?.length ? <div className="brand-gallery">{section.gallery.map((photo, index) => <figure key={index}><BrandImage image={photo} /><figcaption>{photo.alt}</figcaption></figure>)}</div> : data.preview && <p className="brand-empty">Adicione fotos do espaço, dos cortes e dos detalhes da sua barbearia.</p>)}
              {section.type === 'contact' && <address>{data.tenant.location.address}<br />{[data.tenant.location.city, data.tenant.location.state].filter(Boolean).join(' · ')}{data.tenant.contact.phone && <p><a href={`tel:${data.tenant.contact.phone.replace(/[^\d+]/g, '')}`}>{data.tenant.contact.phone}</a></p>}{data.tenant.contact.email && <p><a href={`mailto:${encodeURIComponent(data.tenant.contact.email)}`}>{data.tenant.contact.email}</a></p>}</address>}
              {section.type === 'testimonials' && section.testimonials && <TestimonialsBlock testimonials={section.testimonials} />}
              {section.type === 'faq' && section.faqItems && <FAQBlock items={section.faqItems} />}
              {section.type === 'hours' && section.hours && <HoursBlock hours={section.hours} />}
              {section.type === 'stats' && section.stats && <StatsBlockSection stats={section.stats} />}
              {section.type === 'cta' && <CTABlock title={section.title} body={section.body} ctaUrl={section.ctaUrl} ctaLabel={data.content?.ctaLabel} />}
              {section.type === 'map' && <LocationMap tenant={data.tenant} mapUrl={section.mapUrl} />}
            </div>
          </div>
        </section>)}
      </main>
      {content.footerNote && <p className="brand-footer-note brand-container">{content.footerNote}</p>}
      <SiteFooterRich data={data} />
      <WhatsAppFloat phone={data.tenant.contact.phone} />
    </div>
  </ThemeShell>;
}
