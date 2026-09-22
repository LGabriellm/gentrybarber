import { LocationMap } from './location-map';
import type { PublicSiteData } from '@platform/theme-engine';
import { ProfessionalCard, ThemeSection, type DesignTokens } from '@platform/design-system';
import { Container } from '@platform/ui';
import { BarberChairArt, ScissorsArt, SiteFooterRich, WhatsAppFloat, ThemeShell } from './shared';
import { PriceList } from './site-blocks';
import { BookingWidget } from '@platform/web-kit';
import { CodeSite } from './code-site';
import { BrandSite } from './brand-site';
import { TestimonialsBlock, FAQBlock, HoursBlock, StatsBlockSection, CTABlock } from './site-blocks-extended';
import { SectionLink } from './section-link';

/** Only structured, validated content is rendered; operational data always comes from the Core. */
export function EditableSite({ data, defaults, variant }: { data: PublicSiteData; defaults: DesignTokens; variant: 'classic' | 'urban' | 'imperial' }) {
  const content = data.content!;
  
  if (data.code?.enabled) return <CodeSite data={data} defaults={defaults} />;
  
  if (content.appearance || content.heroImage || content.logo || content.sections.some(section => section.type === 'gallery')) {
    return <BrandSite data={data} defaults={defaults} variant={variant} />;
  }

  const sections = content.sections.filter(section => section.visible);

  return (
    <ThemeShell data={data} defaults={defaults} variant={variant}>
      <div id="inicio" />
      <Container>
        <header className="site-nav">
          <SectionLink className="site-brand" href="#inicio">
            {data.tenant.name}
          </SectionLink>
          <nav className="site-links site-links--wrap" aria-label="Navegação do site">
            {sections.map(section => (
              <SectionLink key={section.id} href={`#section-${section.id}`}>
                {section.title}
              </SectionLink>
            ))}
          </nav>
        </header>
      </Container>
      
      <main>
        <ThemeSection className={`hero-layout hero-layout--${content.heroLayout || 'standard'}`}>
          <Container>
            <div className="theme-grid">
              <div>
                <p className="eyebrow">{data.tenant.name}</p>
                <h1 className="hero-heading">{content.heroTitle}</h1>
                <p className="hero-copy">{content.heroSubtitle}</p>
                {sections[0] && (
                  <SectionLink className="hero-link" href={`#section-${(sections.find(item => item.type === 'booking') ?? sections[0]).id}`}>
                    {content.ctaLabel ?? 'Conheça a barbearia'} <span aria-hidden="true">↗</span>
                  </SectionLink>
                )}
              </div>
              {content.heroLayout !== 'centered' && (
                <div className="art-frame">
                  {variant === 'urban' ? <ScissorsArt /> : <BarberChairArt />}
                </div>
              )}
            </div>
          </Container>
        </ThemeSection>

        {sections.map(section => (
          <ThemeSection 
            key={section.id} 
            id={`section-${section.id}`} 
            className={`section section--tone-${section.tone || 'background'} section--align-${section.align || 'left'}`}
          >
            <Container>
              <h2 className="section-title">{section.title}</h2>
              {section.body && <p className="section-body">{section.body}</p>}
              
              {section.type === 'services' && <PriceList data={data} layout={section.layout ?? 'table'} />}
              
              {section.type === 'booking' && (
                <BookingWidget 
                  locationId={data.tenant.location.id} 
                  timezone={data.tenant.location.timezone}
                  services={data.services ?? []} 
                  professionals={data.professionals ?? []} 
                  preview={data.preview} 
                />
              )}
              
              {section.type === 'team' && (
                <div className="theme-grid-three">
                  {data.professionals?.map((person, index) => (
                    <ProfessionalCard key={person.id} {...person} index={index} />
                  ))}
                </div>
              )}
              
              {section.type === 'contact' && (
                <address>
                  {data.tenant.location.address}<br />
                  {[data.tenant.location.city, data.tenant.location.state].filter(Boolean).join(' · ')}
                  {data.tenant.contact.phone && (
                    <p>
                      <a href={`tel:${data.tenant.contact.phone.replace(/[^\d+]/g, '')}`}>
                        {data.tenant.contact.phone}
                      </a>
                    </p>
                  )}
                  {data.tenant.contact.email && (
                    <p>
                      <a href={`mailto:${encodeURIComponent(data.tenant.contact.email)}`}>
                        {data.tenant.contact.email}
                      </a>
                    </p>
                  )}
                </address>
              )}
              
              {section.type === 'testimonials' && section.testimonials && <TestimonialsBlock testimonials={section.testimonials} />}
              {section.type === 'faq' && section.faqItems && <FAQBlock items={section.faqItems} />}
              {section.type === 'hours' && section.hours && <HoursBlock hours={section.hours} />}
              {section.type === 'stats' && section.stats && <StatsBlockSection stats={section.stats} />}
              {section.type === 'cta' && <CTABlock title={section.title} body={section.body} ctaUrl={section.ctaUrl} ctaLabel={data.content?.ctaLabel} />}
              {section.type === 'map' && <LocationMap tenant={data.tenant} mapUrl={section.mapUrl} />}
            </Container>
          </ThemeSection>
        ))}
      </main>
      
      <SiteFooterRich data={data} />
      <WhatsAppFloat phone={data.tenant.contact.phone} />
    </ThemeShell>
  );
}
